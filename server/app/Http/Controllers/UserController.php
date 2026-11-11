<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Models\Office;
use App\Models\User;
use App\Models\UserProfile;
use App\Services\DepartmentAssignmentNotifier;
use App\Services\StaffNotifier;
use App\Support\AccountLogin;
use App\Support\InfractionEscalation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = \App\Models\User::with('profile');

        // Supervisors can oversee one or more departments.
        if ($this->usesSupervisorScope($user)) {
            $departments = $this->supervisedOfficeAreas($user);

            // Department secretaries are school employees. They stay on the
            // staff list. Elected WSPO officers are students of a department.
            $query->where(function ($people) use ($departments) {
                $people->where(function ($regular) use ($departments) {
                    $regular->whereHas('profile', function ($q) use ($departments) {
                        $q->whereIn('assigned_office', $departments);
                    })->whereNotIn('role', ['Super Admin', 'WSPO Staff']);
                });
                $this->orWhereOfficersPlacedIn($people, $departments);
            });
        }

        $roles = ['Student', 'Supervisor', 'Department Secretary', 'WSPO Staff', 'Super Admin'];
        if ($request->filled('role') && in_array($request->role, $roles, true)) {
            if ($request->role === 'Student') {
                // Secretary and president are students who also hold office.
                // The coordinator is the only officer kept off the student list.
                $this->constrainSchedulableStudents($query);
            } else {
                $query->where('role', $request->role);
            }
        }

        if ($request->filled('department')) {
            $department = $request->string('department')->trim()->toString();
            $query->whereHas('profile', function ($profileQuery) use ($department) {
                $profileQuery->where('assigned_office', $department)
                    ->orWhereJsonContains('supervised_departments', $department);
            });
        }

        // 2. DYNAMIC SEARCH FUNCTIONALITY
        if ($request->has('search') && $request->search != '') {
            $searchTerm = $request->search;

            $query->where(function($q) use ($searchTerm) {
                // Search main User table
                $q->where('name', 'LIKE', "%{$searchTerm}%")
                  ->orWhere('username', 'LIKE', "%{$searchTerm}%")
                  ->orWhere('email', 'LIKE', "%{$searchTerm}%")
                  ->orWhere('role', 'LIKE', "%{$searchTerm}%")
                  // Search related Profile table
                  ->orWhereHas('profile', function($profileQuery) use ($searchTerm) {
                      $profileQuery->where('assigned_office', 'LIKE', "%{$searchTerm}%")
                                   ->orWhere('student_id_number', 'LIKE', "%{$searchTerm}%")
                                   ->orWhere('course', 'LIKE', "%{$searchTerm}%");
                  });
            });
        }

        // 3. RETURN PAGINATED RESULTS
        // Change from 10 to 15 or 20 if you want more users per page!
        $users = $query->paginate(10);
        $supervisorMap = $this->departmentSupervisorMap();
        $users->getCollection()->transform(function ($listedUser) use ($supervisorMap) {
            if ($listedUser->role === 'Student' || $this->isStudentOfficer($listedUser)) {
                $office = $this->placementOffice($listedUser);
                $listedUser->setAttribute(
                    'department_supervisors',
                    $supervisorMap[$office] ?? $this->supervisorNamesForDepartment($office)
                );
            }
            return $listedUser;
        });

        return response()->json($users);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load('profile');
        $data = $user->toArray();

        if ($user->role === 'Student') {
            $data['department_supervisors'] = $this->supervisorNamesForDepartment($user->profile?->assigned_office);
        }

        if ($user->role === 'Supervisor') {
            $departments = $this->supervisedDepartments($user);
            $data['supervised_departments'] = $departments;
            $data['supervisor_absent'] = $this->supervisorIsAbsentToday($user);
            if (isset($data['profile']) && is_array($data['profile'])) {
                $data['profile']['supervised_departments'] = $departments;
            }
        }

        if ($user->role === 'Department Secretary') {
            $data['secretary_departments'] = $this->secretaryDepartments($user);
            $data['acting_departments'] = $this->actingDepartments($user);
            $data['acting'] = $data['acting_departments'] !== [];
        }

        $data['required_hours'] = \App\Support\WorkRequirement::hoursFor($user);
        $data['special_hours_request'] = (bool) $user->profile?->special_hours_request;

        return response()->json($data);
    }

    public function departmentSupervisors()
    {
        return response()->json($this->departmentSupervisorMap());
    }

    /**
     * Working students who can receive a duty or class schedule.
     * WSPO secretary and president are students; the coordinator is not.
     */
    public function personnel(Request $request)
    {
        $query = User::with('profile');
        $this->constrainSchedulableStudents($query);
        if ($this->usesSupervisorScope($request->user())) {
            $departments = $this->supervisedDepartments($request->user());
            if ($departments === []) {
                return response()->json([
                    'message' => 'Your supervisor account has no assigned departments. Ask WSPO to set your departments first.',
                ], 422);
            }
            // Match office name variants (CCS, College of Computer Studies, and so on).
            // Academic course is not an assignment, so it does not grant access.
            $areas = array_values(array_unique(array_merge(...array_map(
                fn (string $department) => $this->departmentAliases($department),
                $departments
            ))));

            $this->constrainPlacedIn($query, $areas);
        } elseif ($request->filled('department')) {
            $department = $request->string('department')->trim()->toString();
            $query->where(function ($people) use ($department) {
                $people->whereHas('profile', fn ($q) => $q->where('assigned_office', $department));
                $this->orWhereOfficersPlacedIn($people, $this->departmentAliases($department));
            });
        }

        return response()->json($query->orderBy('name')->get());
    }

    /**
     * Canonical course/college aliases used by both old and new profile records.
     * Keep all placement values in this list so abbreviations and full names are
     * interchangeable when determining a supervisor's personnel list.
     */
    private function departmentAliases(string $department): array
    {
        $seed = $this->staticDepartmentAliases($department);
        $expanded = $this->mergeStoredOfficeLabels($seed);

        $withGroups = $expanded;
        foreach ($expanded as $label) {
            $withGroups = array_merge($withGroups, $this->staticDepartmentAliases($label));
        }

        return $this->mergeStoredOfficeLabels($withGroups);
    }

    /**
     * Older records and the WSPO coordinator still use these labels.
     * A renamed office is added from the offices table in departmentAliases().
     *
     * @return list<string>
     */
    private function staticDepartmentAliases(string $department): array
    {
        $groups = [
            ['CCS', 'College of Computer Studies', 'College of Computer Studies (CCS)', 'CCS Office'],
            ['CBA', 'College of Business and Accountancy', 'College of Business Administration', 'Business Office'],
            ['CHTM', 'College of Hotel and Tourism Management', 'College of Hospitality and Tourism Management'],
            ['CCJE', 'College of Criminal Justice Education'],
            ['COE', 'College of Engineering'],
            ['CON', 'College of Nursing'],
            ['CTE', 'College of Teacher Education'],
            ['CAS', 'College of Arts and Sciences'],
            ['GS', 'Graduate School'],
            ['SHS', 'Senior High School Department'],
            ['JHS', 'Junior High School Department'],
            ['ES', 'Elementary Department'],
            ['PS', 'Pre-School Department'],
            ['WSPO', 'Working Students Program Office', 'WSPO Office', 'Work-Student Program Organization'],
        ];

        $normalized = $this->normalizeDepartment($department);
        foreach ($groups as $group) {
            if (in_array($normalized, array_map([$this, 'normalizeDepartment'], $group), true)) {
                return $group;
            }
        }

        return array_values(array_unique(array_filter([
            trim($department),
            trim((string) preg_replace('/\\s*\\([^)]*\\)/', '', $department)),
        ])));
    }

    /**
     * @param  list<string>  $aliases
     * @return list<string>
     */
    private function mergeStoredOfficeLabels(array $aliases): array
    {
        $keys = [];
        foreach ($aliases as $alias) {
            $key = $this->normalizeDepartment($alias);
            if ($key !== '') {
                $keys[$key] = true;
            }
        }

        $labels = $aliases;
        if (!Schema::hasTable('offices')) {
            return array_values(array_unique(array_filter(array_map(
                fn ($label) => trim((string) $label),
                $labels
            ))));
        }

        foreach (Office::query()->get(['name', 'abbreviation']) as $office) {
            $abbreviation = trim((string) $office->abbreviation);
            $nameKey = $this->normalizeDepartment($office->name);
            $abbreviationKey = $this->normalizeDepartment($abbreviation);
            if (!isset($keys[$nameKey]) && ($abbreviationKey === '' || !isset($keys[$abbreviationKey]))) {
                continue;
            }

            $labels[] = $office->name;
            if ($abbreviation !== '') {
                $labels[] = $abbreviation;
            }
        }

        return array_values(array_unique(array_filter(array_map(
            fn ($label) => trim((string) $label),
            $labels
        ))));
    }

    private function normalizeDepartment(string $department): string
    {
        return strtolower((string) preg_replace('/[^a-z0-9]/i', '', $department));
    }

    private function departmentSupervisorMap(): array
    {
        $map = [];
        $supervisors = User::with('profile')
            ->whereIn('role', ['Supervisor', 'WSPO Staff'])
            ->orderBy('name')
            ->get();

        foreach ($supervisors as $supervisor) {
            if ($supervisor->role === 'WSPO Staff' && !$this->isWspoDepartmentSupervisor($supervisor)) {
                continue;
            }

            foreach ($this->supervisedDepartments($supervisor) as $department) {
                $map[$department][] = $supervisor->name;
            }
        }

        foreach ($map as $department => $names) {
            $map[$department] = array_values(array_unique($names));
        }

        return $map;
    }

    public function supervisorNamesForOffice(?string $department): array
    {
        return $this->supervisorNamesForDepartment($department);
    }

    /**
     * Officer titles held by working students. The coordinator is staff only.
     *
     * @return list<string>
     */
    public function studentOfficerPositions(): array
    {
        return ['WSPO Secretary', 'WSPO President'];
    }

    private function isOfficerTitle(?string $position): bool
    {
        $position = strtolower(trim((string) $position));
        foreach ($this->studentOfficerPositions() as $allowed) {
            if ($position === strtolower($allowed)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Elected organization officers are students in a department.
     * Older accounts still store the title on a WSPO Staff login.
     * A department secretary is a school employee and is not an officer.
     */
    public function isStudentOfficer(User $user): bool
    {
        $user->loadMissing('profile');

        if ($user->role === 'Student' && $this->isOfficerTitle($user->profile?->officer_position)) {
            return (bool) ($user->profile?->organization_officer ?? false);
        }

        if ($user->role !== 'WSPO Staff') {
            return false;
        }

        return $this->isOfficerTitle($user->profile?->assigned_office);
    }

    public function officerPosition(User $user): string
    {
        if (!$this->isStudentOfficer($user)) {
            return '';
        }

        $user->loadMissing('profile');
        if ($user->role === 'Student') {
            return trim((string) ($user->profile?->officer_position ?? ''));
        }

        return trim((string) ($user->profile?->assigned_office ?? ''));
    }

    /** Students, plus secretary and president, who can be given a duty schedule. */
    public function findSchedulableStudent(int|string $id): User
    {
        $student = User::with('profile')->find($id);
        if (!$student || ($student->role !== 'Student' && !$this->isStudentOfficer($student))) {
            abort(404);
        }

        return $student;
    }

    /**
     * Department where this person works as a student.
     * Elected officers keep their title in assigned_office.
     * A department secretary is an employee and is not placed this way.
     */
    public function placementOffice(User $student): string
    {
        $student->loadMissing('profile');
        if ($this->isStudentOfficer($student) && $student->role !== 'Student') {
            $placed = $this->workDepartment($student);

            return $placed !== '' ? $placed : 'WSPO';
        }

        return trim((string) ($student->profile?->assigned_office ?? ''));
    }

    public function workDepartment(User $user): string
    {
        if (!$this->isStudentOfficer($user) || !Schema::hasColumn('user_profiles', 'work_department')) {
            return '';
        }

        $user->loadMissing('profile');

        return trim((string) ($user->profile?->work_department ?? ''));
    }

    /**
     * Office stored on a work or class row.
     * An officer title is not a department. An officer without a placement stays on WSPO.
     */
    public function scheduleDepartment(User $student): string
    {
        if ($this->isStudentOfficer($student)) {
            return $this->placementOffice($student);
        }

        return trim((string) ($student->profile?->assigned_office ?? ''));
    }

    /**
     * Working students in these offices, including elected WSPO officers
     * whose student assignment is one of them.
     *
     * @param  \Illuminate\Database\Eloquent\Builder<\App\Models\User>  $query
     * @param  list<string>  $areas
     */
    public function constrainPlacedIn($query, array $areas)
    {
        return $query->where(function ($people) use ($areas) {
            $people->where(function ($students) use ($areas) {
                $students->where('role', 'Student')
                    ->whereHas('profile', fn ($profile) => $profile->whereIn('assigned_office', $areas));
            });
            $this->orWhereOfficersPlacedIn($people, $areas);
        });
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Builder<\App\Models\User>  $query
     * @param  list<string>  $areas
     */
    public function constrainOfficersPlacedIn($query, array $areas)
    {
        return $query->where('role', 'WSPO Staff')->whereHas('profile', function ($profile) use ($areas) {
            $profile->whereIn('work_department', $areas)
                ->where(function ($office) {
                    foreach ($this->studentOfficerPositions() as $position) {
                        $office->orWhereRaw('LOWER(TRIM(assigned_office)) = ?', [strtolower($position)]);
                    }
                });
        });
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Builder<\App\Models\User>  $query
     * @param  list<string>  $areas
     */
    private function orWhereOfficersPlacedIn($query, array $areas): void
    {
        if ($areas === [] || !Schema::hasColumn('user_profiles', 'work_department')) {
            return;
        }

        $query->orWhere(fn ($officers) => $this->constrainOfficersPlacedIn($officers, $areas));
    }

    /** @param  \Illuminate\Database\Eloquent\Builder<\App\Models\User>  $query */
    public function constrainSchedulableStudents($query)
    {
        return $query->where(function ($people) {
            $people->where('role', 'Student')
                ->orWhere(fn ($officers) => $this->constrainStudentOfficers($officers));
        });
    }

    /** @param  \Illuminate\Database\Eloquent\Builder<\App\Models\User>  $query */
    public function constrainStudentOfficers($query)
    {
        return $query->where(function ($people) {
            if (Schema::hasColumn('user_profiles', 'organization_officer') && Schema::hasColumn('user_profiles', 'officer_position')) {
                $people->where(function ($students) {
                    $students->where('role', 'Student')->whereHas('profile', function ($profile) {
                        $profile->where('organization_officer', true)
                            ->where(function ($office) {
                                foreach ($this->studentOfficerPositions() as $position) {
                                    $office->orWhereRaw('LOWER(TRIM(officer_position)) = ?', [strtolower($position)]);
                                }
                            });
                    });
                });
            }

            $people->orWhere(function ($legacy) {
                $legacy->where('role', 'WSPO Staff')->whereHas('profile', function ($profile) {
                    $profile->where(function ($office) {
                        foreach ($this->studentOfficerPositions() as $position) {
                            $office->orWhereRaw('LOWER(TRIM(assigned_office)) = ?', [strtolower($position)]);
                        }
                    });
                });
            });
        });
    }

    /** WSPO Coordinator supervises working students placed in the WSPO office. */
    public function isWspoDepartmentSupervisor(User $user): bool
    {
        if ($user->role !== 'WSPO Staff') {
            return false;
        }

        $position = trim((string) ($user->profile?->assigned_office ?? ''));

        return $position === ''
            || strcasecmp($position, 'WSPO Coordinator') === 0
            || strcasecmp($position, 'WSPO Secretary') === 0
            || strcasecmp($position, 'WSPO') === 0;
    }

    /** Department secretary covers a supervisor only while that supervisor is absent today. */
    public function isActingDepartmentSecretary(User $user): bool
    {
        return $user->role === 'Department Secretary' && $this->actingDepartments($user) !== [];
    }

    public function usesSupervisorScope(User $user): bool
    {
        return $user->role === 'Supervisor' || $this->isActingDepartmentSecretary($user);
    }

    /**
     * @return list<string>
     */
    public function secretaryDepartments(User $user): array
    {
        $configured = $user->profile?->secretary_departments;
        $departments = is_array($configured) ? $configured : [];
        if ($departments === [] && $user->profile?->assigned_office) {
            $departments[] = $user->profile->assigned_office;
        }

        return array_values(array_unique(array_filter(array_map(
            fn ($department) => is_string($department) ? trim($department) : '',
            $departments
        ))));
    }

    /**
     * Departments whose supervisors are all absent today, so the secretary may act.
     *
     * @return list<string>
     */
    public function actingDepartments(User $user): array
    {
        if ($user->role !== 'Department Secretary') {
            return [];
        }

        $user->loadMissing('profile');

        return array_values(array_filter(
            $this->secretaryDepartments($user),
            fn (string $department) => $this->departmentSupervisorsAreAbsent($department)
        ));
    }

    public function supervisorIsAbsentToday(User $user): bool
    {
        $user->loadMissing('profile');
        $absentOn = $user->profile?->supervisor_absent_on;
        if ($absentOn === null || $absentOn === '') {
            return false;
        }

        return \Carbon\Carbon::parse($absentOn)->isSameDay(\Carbon\Carbon::today());
    }

    private function departmentSupervisorsAreAbsent(string $department): bool
    {
        $targets = array_map(fn (string $name) => $this->normalizeDepartment($name), $this->departmentAliases($department));
        $supervisors = User::with('profile')
            ->where('role', 'Supervisor')
            ->get()
            ->filter(function (User $supervisor) use ($targets) {
                foreach ($this->supervisedDepartments($supervisor) as $assigned) {
                    if (in_array($this->normalizeDepartment($assigned), $targets, true)) {
                        return true;
                    }
                }

                return false;
            });

        if ($supervisors->isEmpty()) {
            return true;
        }

        return $supervisors->every(fn (User $supervisor) => $this->supervisorIsAbsentToday($supervisor));
    }

    /**
     * WSPO activity issuer roles (coordinator / secretary / president).
     * A blank position is the original coordinator account.
     * Group leaders may also correct times for their own group's activities.
     */
    public function canIssueActivityAttendance(User $user): bool
    {
        if ($user->role !== 'WSPO Staff') {
            return false;
        }

        $position = trim((string) ($user->profile?->assigned_office ?? ''));
        if ($position === '' || strcasecmp($position, 'WSPO') === 0) {
            return true;
        }

        foreach (['WSPO Coordinator', 'WSPO Secretary', 'WSPO President'] as $allowed) {
            if (strcasecmp($position, $allowed) === 0) {
                return true;
            }
        }

        return false;
    }

    /** Year-level leader or representative assigned by the WSPO coordinator. */
    public function leaderMembership(User $user): ?object
    {
        if ($user->role !== 'Student') {
            return null;
        }

        return DB::table('daily_cleaning_group_members')
            ->where('user_id', $user->id)
            ->where('is_leader', true)
            ->first();
    }

    /** Group leader may issue the activity QR/passcode for every year level in that group. */
    public function isYearLeaderFor(User $user, \App\Models\RenderedHourEvent $event): bool
    {
        if ($user->role !== 'Student' || !$event->group_id) {
            return false;
        }

        return DB::table('daily_cleaning_group_members')
            ->where('group_id', $event->group_id)
            ->where('user_id', $user->id)
            ->where('is_leader', true)
            ->exists();
    }

    /** Work and class schedules are assigned by Super Admin or the WSPO coordinator/secretary. */
    public function canManageWorkSchedules(User $user): bool
    {
        if ($user->role === 'Super Admin') {
            return true;
        }

        if ($user->role !== 'WSPO Staff') {
            return false;
        }

        $position = trim((string) ($user->profile?->assigned_office ?? ''));
        if ($position === '' || strcasecmp($position, 'WSPO') === 0 || strcasecmp($position, 'Unassigned') === 0) {
            return true;
        }

        foreach (['WSPO Coordinator', 'WSPO Secretary'] as $allowed) {
            if (strcasecmp($position, $allowed) === 0) {
                return true;
            }
        }

        return false;
    }

    /** First office, kept for callers that still expect a single name. */
    public function attendanceOffice(User $user): string
    {
        return $this->attendanceOffices($user)[0] ?? '';
    }

    /**
     * Every office whose students may use this person's attendance code.
     * One supervisor can cover several offices with the same passcode and QR.
     *
     * @return list<string>
     */
    public function attendanceOffices(User $user): array
    {
        if ($this->isWspoDepartmentSupervisor($user)) {
            return ['WSPO'];
        }

        return $this->supervisedDepartments($user);
    }

    public function attendanceScopeLabel(User $user): string
    {
        $offices = array_values($this->attendanceOffices($user));
        $count = count($offices);
        if ($count === 0) {
            return '';
        }
        if ($count === 1) {
            return $offices[0];
        }
        if ($count === 2) {
            return $offices[0].' and '.$offices[1];
        }

        $last = array_pop($offices);

        return implode(', ', $offices).', and '.$last;
    }

    /** Stable identity for the set of offices one live code covers. */
    public function attendanceScopeKey(User $user): string
    {
        $keys = [];
        foreach ($this->attendanceOffices($user) as $office) {
            $aliases = array_values(array_filter(array_map(
                [$this, 'normalizeDepartment'],
                $this->departmentAliases($office)
            )));
            sort($aliases);
            if ($aliases !== []) {
                $keys[] = $aliases[0];
            }
        }

        $keys = array_values(array_unique($keys));
        sort($keys);

        return implode('|', $keys);
    }

    public function codeCoversOffice(User $supervisor, string $studentOffice): bool
    {
        foreach ($this->attendanceOffices($supervisor) as $office) {
            if ($this->officesMatch($office, $studentOffice)) {
                return true;
            }
        }

        return false;
    }

    public function officesMatch(string $left, string $right): bool
    {
        $left = trim($left);
        $right = trim($right);
        if ($left === '' || $right === '') {
            return false;
        }

        $aliases = array_map([$this, 'normalizeDepartment'], $this->departmentAliases($left));

        return in_array($this->normalizeDepartment($right), $aliases, true);
    }

    public function officeNames(string $department): array
    {
        return $this->departmentAliases($department);
    }

    private function supervisorNamesForDepartment(?string $department): array
    {
        if (!$department) {
            return [];
        }

        $map = $this->departmentSupervisorMap();
        $names = [];
        foreach ($this->departmentAliases($department) as $alias) {
            foreach ($map[$alias] ?? [] as $name) {
                $names[] = $name;
            }
        }

        return array_values(array_unique($names));
    }

    private function notifySupervisorsIfStudentPlaced(User $student): void
    {
        if ($student->role !== 'Student') {
            return;
        }

        $office = trim((string) $student->profile?->assigned_office);
        if ($office === '') {
            return;
        }

        $dutyLabel = $student->profile?->duty_type === 'Request'
            ? trim((string) $student->profile?->duty_request)
            : trim((string) $student->profile?->duty_type);

        Notification::create([
            'user_id' => $student->id,
            'title' => 'Office Assignment Confirmed',
            'message' => $dutyLabel !== ''
                ? "You have been assigned to {$office} as a working student for {$dutyLabel}."
                : "You have been assigned to {$office} as a working student.",
        ]);

        app(DepartmentAssignmentNotifier::class)->notify($student, $office, $dutyLabel !== '' ? $dutyLabel : null);
    }

    public function supervisedDepartments(User $user): array
    {
        if ($user->role === 'Department Secretary') {
            return $this->actingDepartments($user);
        }

        if ($this->isWspoDepartmentSupervisor($user)) {
            return ['WSPO'];
        }

        $configured = $user->profile?->supervised_departments;
        $departments = is_array($configured) ? $configured : [];

        // Existing supervisor accounts continue to work after the migration.
        if ($departments === [] && $user->profile?->assigned_office) {
            $departments[] = $user->profile->assigned_office;
        }

        return array_values(array_unique(array_filter(array_map('trim', $departments))));
    }

    /** Office names (including aliases) whose students this supervisor may see. */
    public function supervisedOfficeAreas(User $supervisor): array
    {
        $departments = $this->supervisedDepartments($supervisor);
        if ($departments === []) {
            return [];
        }

        return array_values(array_unique(array_merge(...array_map(
            fn (string $department) => $this->departmentAliases($department),
            $departments
        ))));
    }

    public function supervisorCanAccessStudent(User $supervisor, User $student): bool
    {
        if ($student->role !== 'Student' && !$this->isStudentOfficer($student)) {
            return false;
        }

        $areas = $this->supervisedOfficeAreas($supervisor);
        $office = $this->placementOffice($student);

        return $office !== '' && in_array($office, $areas, true);
    }

    /** WSPO coordinator links an existing working student to a department. */
    public function assignDepartment(Request $request, string $id)
    {
        $validated = $request->validate([
            'department' => ['required', 'string', Rule::in(Office::names())],
            'duty_type' => 'required|in:Clerical,Janitorial,Request',
            'duty_request' => 'required_if:duty_type,Request|nullable|string|max:1000',
        ]);
        $studentQuery = User::with('profile');
        $this->constrainSchedulableStudents($studentQuery);
        $student = $studentQuery->findOrFail($id);
        $previousOffice = $this->placementOffice($student);
        $office = trim($validated['department']);
        $placement = [
            'duty_type' => $validated['duty_type'],
            'duty_request' => $validated['duty_type'] === 'Request' ? trim($validated['duty_request']) : null,
        ];
        if ($this->isStudentOfficer($student)) {
            $placement['work_department'] = $office;
        } else {
            $placement['assigned_office'] = $office;
        }
        $student->profile()->updateOrCreate(['user_id' => $student->id], $placement);

        $dutyLabel = $validated['duty_type'] === 'Request'
            ? trim((string) $validated['duty_request'])
            : $validated['duty_type'];

        \App\Models\Notification::create([
            'user_id' => $student->id,
            'title' => 'Office Assignment Confirmed',
            'message' => "You have been assigned to {$office} as a working student for {$dutyLabel}.",
        ]);

        app(DepartmentAssignmentNotifier::class)->notify($student, $office, $dutyLabel);
        app(InfractionEscalation::class)->recordDepartmentReplacement(
            $student->id,
            $previousOffice,
            $office,
            $request->user()?->id,
            'assign_department'
        );

        $coordinators = User::whereIn('role', ['WSPO Staff', 'Super Admin'])
            ->where('id', '!=', $request->user()->id)
            ->get(['id']);
        foreach ($coordinators as $coordinator) {
            \App\Models\Notification::create([
                'user_id' => $coordinator->id,
                'title' => 'Working Student Assigned',
                'message' => "{$student->name} will be sent to {$office} for {$dutyLabel}.",
            ]);
        }

        return response()->json(['message' => 'Student assigned to department successfully.']);
    }

    // --- 1. THE STORE METHOD (Creating a new user) ---
    public function store(Request $request)
    {
        $this->normalizeUserPayload($request);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'username' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => 'required|string|min:6',
            'role' => 'required|string',
            'phone_number' => 'nullable|string',
            'duty_type' => 'nullable|in:Clerical,Janitorial,Request',
            'duty_request' => 'required_if:duty_type,Request|nullable|string|max:1000',
        ]);

        $this->abortUnlessWspoMayManageAccount($request, null, $request->input('role'));
        $this->abortIfUserAlreadyExists($request);
        $this->assertLoginIdentityAvailable($validated['username'], $validated['email']);
        $validated['email'] = strtolower(trim($validated['email']));
        $this->assertStudentAccountProfile($request);
        $request->validate(['gender' => 'nullable|in:Male,Female']);
        // User model casts password to hashed — pass the plain value once.
        $this->ensureOfficeIsAllowed($request);
        $user = \App\Models\User::create($validated);

        if ($this->roleUsesProfile($user->role)) {
            $user->profile()->create($this->profileAttributesForRole($user->role, $request));
        }

        $this->notifySupervisorsIfStudentPlaced($user->load('profile'));

        app(StaffNotifier::class)->notify(
            'New Account',
            "{$user->name} was added as {$user->role}.",
            array_values(array_filter([(int) $request->user()->id, (int) $user->id]))
        );

        return response()->json(['message' => 'User created successfully', 'user' => $user]);
    }

    // --- 2. THE UPDATE METHOD (Editing an existing user) ---
    public function update(Request $request, string $id)
    {
        $this->normalizeUserPayload($request);

        $user = \App\Models\User::findOrFail($id);
        $this->abortUnlessWspoMayManageAccount($request, $user, $request->input('role'));

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            // The management edit form does not expose login IDs. Keep the
            // current username unless an API client explicitly sends a new one.
            'username' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'nullable', 'string', 'email', 'max:255'],
            'role' => 'required|string',
            'phone_number' => 'nullable|string',
            'duty_type' => 'nullable|in:Clerical,Janitorial,Request',
            'duty_request' => 'required_if:duty_type,Request|nullable|string|max:1000',
        ]);

        if ($request->filled('password')) {
            // User model casts password to hashed — pass the plain value once.
            $validated['password'] = $request->password;
        }

        $request->validate(['gender' => 'nullable|in:Male,Female']);
        $this->assertStudentAccountProfile($request, $user->id);
        $this->abortIfUserAlreadyExists($request, $user->id);
        $loginUsername = $validated['username'] ?? $user->username;
        $loginEmail = array_key_exists('email', $validated) ? $validated['email'] : $user->email;
        $this->assertLoginIdentityAvailable($loginUsername, $loginEmail, (int) $user->id);
        if (array_key_exists('email', $validated)) {
            $validated['email'] = $loginEmail ? strtolower(trim((string) $loginEmail)) : null;
        }
        $this->ensureOfficeIsAllowed($request);
        $previousOffice = trim((string) $user->profile?->assigned_office);
        $user->update($validated);

        if ($this->roleUsesProfile($user->role)) {
            $user->profile()->updateOrCreate(
                ['user_id' => $user->id],
                $this->profileAttributesForRole($user->role, $request)
            );
        } else {
            $user->profile()->delete();
        }

        $user->load('profile');
        $newOffice = trim((string) $user->profile?->assigned_office);
        if ($user->role === 'Student' && $newOffice !== '' && $newOffice !== $previousOffice) {
            $this->notifySupervisorsIfStudentPlaced($user);
        }

        return response()->json(['message' => 'User updated successfully', 'user' => $user->load('profile')]);
    }

    public function changeTemporaryPassword(Request $request)
    {
        /** @var \App\Models\User $user */
        $user = $request->user();

        if (!$user->must_change_password) {
            return response()->json(['message' => 'A password change is not required.'], 422);
        }

        $validated = $request->validate([
            'password' => 'required|string|min:6|confirmed',
        ]);

        if (Hash::check($validated['password'], $user->password)) {
            return response()->json([
                'message' => 'Choose a password that is different from the temporary password.',
            ], 422);
        }

        $user->password = $validated['password'];
        $user->must_change_password = false;
        $user->save();

        return response()->json(['message' => 'Password updated.']);
    }

    public function updateSelf(Request $request)
    {
        /** @var \App\Models\User $user */
        $user = $request->user();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'phone_number' => 'nullable|string|max:50',
            'password' => 'nullable|string|min:6|confirmed',
            'current_password' => 'required_with:password|string',
        ]);

        if ($request->filled('password')) {
            if (!Hash::check($request->current_password, $user->password)) {
                return response()->json(['message' => 'Current password is incorrect.'], 422);
            }
            $user->password = Hash::make($validated['password']);
            $user->must_change_password = false;
        }

        $user->name = $validated['name'];
        $user->phone_number = $validated['phone_number'] ?? null;
        $user->save();

        return response()->json([
            'message' => 'Profile updated successfully.',
            'user' => $user->load('profile'),
        ]);
    }

    private function assertStudentAccountProfile(Request $request, ?int $ignoreUserId = null): void
    {
        if ($request->input('role') !== 'Student') {
            return;
        }

        $request->validate([
            'phone_number' => 'required|string|max:50',
            'gender' => 'required|in:Male,Female',
            'student_id_number' => 'required|string|max:50',
            'course' => 'required|string|max:255',
            'year_level' => 'required|integer|min:1|max:4',
            'assigned_office' => 'required|string|max:255',
        ]);

        $studentId = trim((string) $request->input('student_id_number'));
        $taken = \App\Models\UserProfile::query()
            ->when($ignoreUserId, fn ($query) => $query->where('user_id', '!=', $ignoreUserId))
            ->where('student_id_number', $studentId)
            ->exists();

        if ($taken) {
            abort(422, 'This student ID number is already used.');
        }
    }

    private function abortIfUserAlreadyExists(Request $request, ?int $ignoreUserId = null): void
    {
        $name = trim((string) $request->input('name'));
        $nameQuery = User::query()->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($name)]);
        if ($ignoreUserId !== null) {
            $nameQuery->where('id', '!=', $ignoreUserId);
        }
        if ($nameQuery->exists()) {
            abort(422, 'A user with this name already exists.');
        }

        $phone = trim((string) $request->input('phone_number', ''));
        if ($phone !== '') {
            $phoneQuery = User::query()->where('phone_number', $phone);
            if ($ignoreUserId !== null) {
                $phoneQuery->where('id', '!=', $ignoreUserId);
            }
            if ($phoneQuery->exists()) {
                abort(422, 'A user with this contact number already exists.');
            }
        }

        $studentId = trim((string) $request->input('student_id_number', ''));
        if ($request->input('role') === 'Student' && $studentId !== '') {
            $idQuery = User::query()->whereHas('profile', function ($query) use ($studentId) {
                $query->where('student_id_number', $studentId);
            });
            if ($ignoreUserId !== null) {
                $idQuery->where('id', '!=', $ignoreUserId);
            }
            if ($idQuery->exists()) {
                abort(422, 'A user with this student ID already exists.');
            }
        }
    }

    private function assertLoginIdentityAvailable(string $username, ?string $email, ?int $ignoreUserId = null): void
    {
        if (AccountLogin::identifierTaken($username, $ignoreUserId)) {
            abort(422, 'This username is already used by another account.');
        }

        $email = strtolower(trim((string) $email));
        if ($email === '') {
            return;
        }

        if (AccountLogin::identifierTaken($email, $ignoreUserId)) {
            abort(422, 'This email is already used by another account.');
        }
    }

    private function normalizeUserPayload(Request $request): void
    {
        $normalized = [];

        if (!$request->filled('name') && $request->filled('fullname')) {
            $normalized['name'] = $request->input('fullname');
        }

        if ($request->input('role') === 'User') {
            $normalized['role'] = 'Student';
        }

        if ($normalized !== []) {
            $request->merge($normalized);
        }
    }

    /**
     * WSPO staff provision and maintain working-student accounts only.
     * Super Admin, Supervisor, and other staff accounts stay with Super Admin.
     */
    private function abortUnlessWspoMayManageAccount(Request $request, ?User $target = null, ?string $requestedRole = null): void
    {
        $actor = $request->user();
        if (!$actor || $actor->role !== 'WSPO Staff') {
            return;
        }

        $wspoMayManage = ['Student', 'Department Secretary'];
        if ($target && !in_array($target->role, $wspoMayManage, true)) {
            abort(403, 'WSPO staff can only modify student and department secretary accounts.');
        }

        if ($requestedRole !== null && !in_array($requestedRole, $wspoMayManage, true)) {
            abort(403, 'WSPO staff can only manage student and department secretary accounts.');
        }
    }

    private function roleUsesProfile(string $role): bool
    {
        return in_array($role, ['Student', 'Supervisor', 'Department Secretary', 'WSPO Staff'], true);
    }

    private function ensureOfficeIsAllowed(Request $request): void
    {
        if ($request->input('role') === 'Supervisor') {
            $request->validate([
                'supervised_departments' => ['nullable', 'array'],
                'supervised_departments.*' => ['string', Rule::in(Office::names())],
            ]);
        }

        if ($request->input('role') === 'Department Secretary') {
            $request->validate([
                'secretary_departments' => ['nullable', 'array'],
                'secretary_departments.*' => ['string', Rule::in(Office::names())],
            ]);
        }

        if ($request->input('role') === 'Student'
            && $request->filled('assigned_office')
            && !in_array($request->input('assigned_office'), Office::names(), true)) {
            abort(422, 'Assigned Office / Dept must be selected from the university office list.');
        }

        if ($request->filled('work_department')
            && !in_array($request->input('work_department'), Office::names(), true)) {
            abort(422, 'Assigned department must be selected from the university office list.');
        }
    }

    private function profileAttributesForRole(string $role, Request $request): array
    {
        $nullableString = fn (?string $value) => ($value === null || trim($value) === '') ? null : trim($value);
        $nullableInt = fn ($value) => ($value === null || $value === '') ? null : (int) $value;

        $attributes = match ($role) {
            'Student' => [
                'student_id_number' => $nullableString($request->input('student_id_number')),
                'course' => $nullableString($request->input('course')),
                'year_level' => $nullableInt($request->input('year_level')),
                'assigned_office' => $nullableString($request->input('assigned_office')),
                'assignment_area' => $nullableString($request->input('assignment_area')),
                'special_hours_request' => $request->boolean('special_hours_request'),
                'duty_type' => $nullableString($request->input('duty_type')),
                'duty_request' => $request->input('duty_type') === 'Request' ? $nullableString($request->input('duty_request')) : null,
                'gender' => in_array($request->input('gender'), ['Male', 'Female'], true) ? $request->input('gender') : null,
            ],
            'Department Secretary' => [
                'student_id_number' => null,
                'course' => null,
                'year_level' => null,
                'assigned_office' => $nullableString(($this->namedDepartmentsFromRequest($request, 'secretary_departments')[0] ?? null)),
                'secretary_departments' => $this->namedDepartmentsFromRequest($request, 'secretary_departments'),
                'supervised_departments' => null,
                'duty_type' => null,
                'duty_request' => null,
                'gender' => in_array($request->input('gender'), ['Male', 'Female'], true) ? $request->input('gender') : null,
            ],
            'Supervisor', 'WSPO Staff' => [
                'student_id_number' => null,
                'course' => null,
                'year_level' => null,
                // Keep the first selected department in the legacy field for
                // compatibility with integrations that expect one office.
                'assigned_office' => $role === 'Supervisor'
                    ? $nullableString(($this->supervisedDepartmentsFromRequest($request)[0] ?? null))
                    : $nullableString($request->input('assigned_office')),
                'supervised_departments' => $role === 'Supervisor'
                    ? $this->supervisedDepartmentsFromRequest($request)
                    : null,
                'duty_type' => null,
                'duty_request' => null,
                'gender' => in_array($request->input('gender'), ['Male', 'Female'], true) ? $request->input('gender') : null,
            ],
            default => [],
        };

        if (Schema::hasColumn('user_profiles', 'organization_officer') && Schema::hasColumn('user_profiles', 'officer_position')) {
            $elected = $role === 'Student'
                && $request->boolean('organization_officer')
                && $this->isOfficerTitle($request->input('officer_position'));
            $attributes['organization_officer'] = $elected;
            $attributes['officer_position'] = $elected ? trim((string) $request->input('officer_position')) : null;
        }

        if (Schema::hasColumn('user_profiles', 'work_department') && $request->exists('work_department')) {
            $attributes['work_department'] = $role === 'WSPO Staff' && $this->isOfficerTitle($request->input('assigned_office'))
                ? $nullableString($request->input('work_department'))
                : null;
        }

        return $attributes;
    }

    private function supervisedDepartmentsFromRequest(Request $request): array
    {
        return $this->namedDepartmentsFromRequest($request, 'supervised_departments');
    }

    private function namedDepartmentsFromRequest(Request $request, string $key): array
    {
        $departments = $request->input($key, []);
        $departments = is_array($departments) ? $departments : [];

        // Accept the former single-select payload from older clients.
        if ($key === 'supervised_departments' && $departments === [] && $request->filled('assigned_office')) {
            $departments[] = $request->input('assigned_office');
        }

        return array_values(array_unique(array_filter(array_map(
            fn ($department) => is_string($department) ? trim($department) : '',
            $departments
        ))));
    }

    public function destroy(Request $request, string $id)
    {
        $user = User::findOrFail($id);
        $this->abortUnlessWspoMayManageAccount($request, $user);
        $user->delete();

        return response()->json(['message' => 'User deleted successfully']);
    }

    public function markSupervisorAbsent(Request $request)
    {
        $actor = $request->user();
        $validated = $request->validate([
            'absent' => 'required|boolean',
            'user_id' => 'nullable|integer|exists:users,id',
        ]);

        $target = $actor;
        if (!empty($validated['user_id']) && (int) $validated['user_id'] !== (int) $actor->id) {
            if (!in_array($actor->role, ['WSPO Staff', 'Super Admin'], true)) {
                abort(403, 'Only WSPO staff can mark another supervisor absent.');
            }
            $target = User::with('profile')->where('role', 'Supervisor')->findOrFail($validated['user_id']);
        }

        if ($target->role !== 'Supervisor') {
            abort(403, 'Only a department supervisor can be marked absent.');
        }

        $absent = (bool) $validated['absent'];
        $target->profile()->updateOrCreate(
            ['user_id' => $target->id],
            ['supervisor_absent_on' => $absent ? \Carbon\Carbon::today()->toDateString() : null]
        );

        return response()->json([
            'message' => $absent
                ? $target->name.' is marked absent today. The department secretary can act on their behalf.'
                : $target->name.' is marked present. The department secretary no longer acts for them.',
            'supervisor_absent' => $absent,
            'user_id' => $target->id,
        ]);
    }

    public function uploadAvatar(Request $request)
    {
        $request->validate([
            'avatar' => 'required|image|mimes:jpeg,png,jpg,gif|max:2048',
        ]);

        $user = $request->user();

        if ($request->hasFile('avatar')) {
            if ($user->profile_picture) {
                Storage::disk('local')->delete($user->profile_picture);
            }

            $path = $request->file('avatar')->store('avatars', 'local');

            $user->profile_picture = $path;
            $user->save();

            return response()->json([
                'message' => 'Profile picture updated successfully!',
                'profile_picture' => $path,
            ]);
        }

        return response()->json(['message' => 'No image uploaded'], 400);
    }

    public function removeAvatar(Request $request)
    {
        $user = $request->user();

        if ($user->profile_picture) {
            Storage::disk('local')->delete($user->profile_picture);
            $user->profile_picture = null;
            $user->save();
        }

        return response()->json([
            'message' => 'Profile picture removed.',
            'profile_picture' => null,
        ]);
    }
}
