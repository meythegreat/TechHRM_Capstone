<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Models\Office;
use App\Models\User;
use App\Models\UserProfile;
use App\Services\DepartmentAssignmentNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = \App\Models\User::with('profile');

        // Supervisors can oversee one or more departments.
        if ($user->role === 'Supervisor') {
            $departments = $this->supervisedDepartments($user);

            $query->whereHas('profile', function($q) use ($departments) {
                $q->whereIn('assigned_office', $departments);
            });
            $query->whereNotIn('role', ['Super Admin', 'WSPO Staff']);
        }

        // 2. DYNAMIC SEARCH FUNCTIONALITY
        if ($request->has('search') && $request->search != '') {
            $searchTerm = $request->search;

            $query->where(function($q) use ($searchTerm) {
                // Search main User table
                $q->where('name', 'LIKE', "%{$searchTerm}%")
                  ->orWhere('username', 'LIKE', "%{$searchTerm}%")
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
            if ($listedUser->role === 'Student') {
                $listedUser->setAttribute(
                    'department_supervisors',
                    $supervisorMap[$listedUser->profile?->assigned_office] ?? []
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
            if (isset($data['profile']) && is_array($data['profile'])) {
                $data['profile']['supervised_departments'] = $departments;
            }
        }

        return response()->json($data);
    }

    public function departmentSupervisors()
    {
        return response()->json($this->departmentSupervisorMap());
    }

    /** Students available to the current department. */
    public function personnel(Request $request)
    {
        $query = User::with('profile')->where('role', 'Student');
        if ($request->user()->role === 'Supervisor') {
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

            $query->whereHas('profile', function ($q) use ($areas) {
                $q->whereIn('assigned_office', $areas);
            });
        } elseif ($request->filled('department')) {
            $query->whereHas('profile', fn ($q) => $q->where('assigned_office', $request->department));
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
            ['WSPO', 'Working Students Program Office', 'WSPO Office'],
        ];

        $normalized = $this->normalizeDepartment($department);
        foreach ($groups as $group) {
            if (in_array($normalized, array_map([$this, 'normalizeDepartment'], $group), true)) {
                return $group;
            }
        }

        return array_values(array_unique([
            trim($department),
            trim((string) preg_replace('/\\s*\\([^)]*\\)/', '', $department)),
        ]));
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

    /** WSPO Coordinator supervises working students placed in the WSPO office. */
    public function isWspoDepartmentSupervisor(User $user): bool
    {
        if ($user->role !== 'WSPO Staff') {
            return false;
        }

        $position = trim((string) ($user->profile?->assigned_office ?? ''));

        return $position === ''
            || strcasecmp($position, 'WSPO Coordinator') === 0
            || strcasecmp($position, 'WSPO') === 0;
    }

    /** Office name used when this person issues an attendance code. */
    public function attendanceOffice(User $user): string
    {
        if ($this->isWspoDepartmentSupervisor($user)) {
            return 'WSPO';
        }

        return $this->supervisedDepartments($user)[0] ?? '';
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

    private function supervisedDepartments(User $user): array
    {
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

    public function supervisorCanAccessStudent(User $supervisor, User $student): bool
    {
        $departments = $this->supervisedDepartments($supervisor);
        if ($departments === []) {
            return false;
        }

        $areas = array_values(array_unique(array_merge(...array_map(
            fn (string $department) => $this->departmentAliases($department),
            $departments
        ))));

        $office = trim((string) $student->profile?->assigned_office);

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
        $student = User::where('role', 'Student')->findOrFail($id);
        $student->profile()->updateOrCreate(['user_id' => $student->id], [
            'assigned_office' => trim($validated['department']),
            'duty_type' => $validated['duty_type'],
            'duty_request' => $validated['duty_type'] === 'Request' ? trim($validated['duty_request']) : null,
        ]);

        $dutyLabel = $validated['duty_type'] === 'Request'
            ? trim((string) $validated['duty_request'])
            : $validated['duty_type'];
        $office = trim($validated['department']);

        \App\Models\Notification::create([
            'user_id' => $student->id,
            'title' => 'Office Assignment Confirmed',
            'message' => "You have been assigned to {$office} as a working student for {$dutyLabel}.",
        ]);

        app(DepartmentAssignmentNotifier::class)->notify($student, $office, $dutyLabel);

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
            'username' => ['required', 'string', 'max:255', Rule::unique('users', 'username')->whereNull('deleted_at')],
            'password' => 'required|string|min:6',
            'role' => 'required|string',
            'phone_number' => 'nullable|string',
            'duty_type' => 'nullable|in:Clerical,Janitorial,Request',
            'duty_request' => 'required_if:duty_type,Request|nullable|string|max:1000',
        ]);

        $this->abortUnlessWspoMayManageAccount($request, null, $request->input('role'));
        $this->abortIfUserAlreadyExists($request);
        $this->assertStudentAccountProfile($request);
        $request->validate(['gender' => 'nullable|in:Male,Female']);
        $validated['password'] = bcrypt($validated['password']);
        $this->ensureOfficeIsAllowed($request);
        $user = \App\Models\User::create($validated);

        if ($this->roleUsesProfile($user->role)) {
            $user->profile()->create($this->profileAttributesForRole($user->role, $request));
        }

        $this->notifySupervisorsIfStudentPlaced($user->load('profile'));

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
            'username' => ['sometimes', 'required', 'string', 'max:255', Rule::unique('users', 'username')->ignore($id)->whereNull('deleted_at')],
            'role' => 'required|string',
            'phone_number' => 'nullable|string',
            'duty_type' => 'nullable|in:Clerical,Janitorial,Request',
            'duty_request' => 'required_if:duty_type,Request|nullable|string|max:1000',
        ]);

        if ($request->filled('password')) {
            $validated['password'] = bcrypt($request->password);
        }

        $request->validate(['gender' => 'nullable|in:Male,Female']);
        $this->assertStudentAccountProfile($request, $user->id);
        $this->abortIfUserAlreadyExists($request, $user->id);
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

        if ($target && $target->role !== 'Student') {
            abort(403, 'WSPO staff can only modify student accounts.');
        }

        if ($requestedRole !== null && $requestedRole !== 'Student') {
            abort(403, 'WSPO staff can only manage student accounts.');
        }
    }

    private function roleUsesProfile(string $role): bool
    {
        return in_array($role, ['Student', 'Supervisor', 'WSPO Staff'], true);
    }

    private function ensureOfficeIsAllowed(Request $request): void
    {
        if ($request->input('role') === 'Supervisor') {
            $request->validate([
                'supervised_departments' => ['nullable', 'array'],
                'supervised_departments.*' => ['string', Rule::in(Office::names())],
            ]);
        }

        if ($request->input('role') === 'Student'
            && $request->filled('assigned_office')
            && !in_array($request->input('assigned_office'), Office::names(), true)) {
            abort(422, 'Assigned Office / Dept must be selected from the university office list.');
        }
    }

    private function profileAttributesForRole(string $role, Request $request): array
    {
        $nullableString = fn (?string $value) => ($value === null || trim($value) === '') ? null : trim($value);
        $nullableInt = fn ($value) => ($value === null || $value === '') ? null : (int) $value;

        return match ($role) {
            'Student' => [
                'student_id_number' => $nullableString($request->input('student_id_number')),
                'course' => $nullableString($request->input('course')),
                'year_level' => $nullableInt($request->input('year_level')),
                'assigned_office' => $nullableString($request->input('assigned_office')),
                'duty_type' => $nullableString($request->input('duty_type')),
                'duty_request' => $request->input('duty_type') === 'Request' ? $nullableString($request->input('duty_request')) : null,
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
    }

    private function supervisedDepartmentsFromRequest(Request $request): array
    {
        $departments = $request->input('supervised_departments', []);
        $departments = is_array($departments) ? $departments : [];

        // Accept the former single-select payload from older clients.
        if ($departments === [] && $request->filled('assigned_office')) {
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
}
