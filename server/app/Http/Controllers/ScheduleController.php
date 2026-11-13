<?php

namespace App\Http\Controllers;

use App\Models\Office;
use App\Models\Schedule;
use Illuminate\Support\Facades\Schema;
use App\Models\SemesterTerm;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ScheduleController extends Controller
{
    // 1. For the STUDENT Dashboard (Shows only their own schedule)
    public function mySchedule(Request $request)
    {
        $schedules = Schedule::where('user_id', $request->user()->id)->get();
        $order = array_flip(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
        $schedules = $schedules->sortBy(fn (Schedule $shift) => sprintf('%02d-%s', $order[$shift->day] ?? 8, $shift->time))->values();

        return response()->json($schedules);
    }

    // 2. For the ADMIN Dashboard (Filtered by Role!)
    public function index(Request $request)
    {
        $user = $request->user();
        if ($user->role === 'Super Admin') {
            $query = Schedule::with(['user' => function ($relation) {
                $relation->withTrashed()->select('id', 'name', 'profile_picture', 'deleted_at')->with('profile');
            }]);
        } else {
            $query = Schedule::with(['user:id,name,profile_picture', 'user.profile'])->whereHas('user');
        }

        // IF THE USER IS A SUPERVISOR: Strict Department Filter
        $accounts = app(UserController::class);
        if ($accounts->usesSupervisorScope($user)) {
            $areas = $accounts->supervisedOfficeAreas($user);
            if ($areas === []) {
                $query->whereRaw('0 = 1');
            } else {
                $query->where(function ($rows) use ($areas) {
                    $rows->whereIn('department', $areas)
                        ->orWhereHas('user.profile', fn ($profile) => $profile->whereIn('assigned_office', $areas));
                });
            }
        }

        if (in_array($request->query('kind'), ['work', 'class'], true)) {
            $query->where('kind', $request->query('kind'));
        }

        $name = trim((string) $request->query('name', ''));
        if ($name !== '') {
            $like = '%'.addcslashes($name, '%_\\').'%';
            $query->whereHas('user', function ($relation) use ($like, $user) {
                if ($user->role === 'Super Admin') {
                    $relation->withTrashed();
                }
                $relation->where('name', 'like', $like);
            });
        }

        $day = trim((string) $request->query('day', ''));
        if (in_array($day, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], true)) {
            $query->where('day', $day);
        }

        $this->orderByWeekday($query);

        if ($request->boolean('audit') && $user->role === 'Super Admin') {
            return response()->json($query->get());
        }

        $schedules = $query->paginate(10);
        return response()->json($schedules);
    }

    /**
     * Recurring work and class schedules for the organization calendar.
     * Supervisors see students placed in their office. Super Admin and WSPO staff see every office.
     */
    public function organization(Request $request)
    {
        $user = $request->user();
        abort_unless(in_array($user->role, ['Student', 'Supervisor', 'Department Secretary', 'WSPO Staff', 'Super Admin'], true), 403);

        $profileColumns = 'id,user_id,assigned_office';
        if (Schema::hasColumn('user_profiles', 'assignment_area')) {
            $profileColumns .= ',assignment_area';
        }

        $query = Schedule::with(['user:id,name,profile_picture', 'user.profile:'.$profileColumns])
            ->whereHas('user');

        $accounts = app(UserController::class);
        $officeScoped = $user->role === 'Supervisor' || $user->role === 'Department Secretary';
        if ($officeScoped) {
            $user->loadMissing('profile');
            $areas = $accounts->supervisedOfficeAreas($user);
            if ($areas === []) {
                $query->whereRaw('0 = 1');
            } else {
                $query->whereHas('user.profile', function ($profile) use ($areas) {
                    $profile->whereIn('assigned_office', $areas);
                });
            }
        }

        $weekdayOrder = array_flip(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
        $schedules = $query->get()
            ->map(function (Schedule $shift) {
                $assignedOffice = trim((string) ($shift->user?->profile?->assigned_office ?? ''));

                return [
                    'id' => $shift->id,
                    'day' => $shift->day,
                    'time' => $shift->time,
                    'kind' => $shift->kind ?: 'work',
                    'duty_type' => $shift->duty_type,
                    'subject' => $shift->subject,
                    'room' => $shift->room,
                    'instructor' => $shift->instructor,
                    'department' => $shift->department,
                    'assigned_office' => $assignedOffice !== '' ? $assignedOffice : $shift->department,
                    'assignment_label' => $shift->user?->profile?->assignment_label
                        ?: ($assignedOffice !== '' ? $assignedOffice : $shift->department),
                    'student_name' => $shift->user?->name ?? 'Student',
                    'profile_picture' => $shift->user?->profile_picture,
                ];
            })
            ->sort(function (array $left, array $right) use ($weekdayOrder) {
                $day = ($weekdayOrder[$left['day']] ?? 7) <=> ($weekdayOrder[$right['day']] ?? 7);
                if ($day !== 0) {
                    return $day;
                }

                $time = $this->scheduleStartMinutes((string) $left['time']) <=> $this->scheduleStartMinutes((string) $right['time']);
                if ($time !== 0) {
                    return $time;
                }

                return strcasecmp((string) $left['student_name'], (string) $right['student_name']);
            })
            ->values();

        $offices = $officeScoped
            ? $schedules
                ->map(fn (array $shift) => trim((string) ($shift['assigned_office'] ?: $shift['department'])))
                ->filter()
                ->unique()
                ->sort()
                ->values()
            : Office::query()->orderBy('name')->pluck('name')->values();

        return response()->json([
            'scope' => $officeScoped ? 'office' : 'organization',
            'semester' => SemesterTerm::current()?->toPayload(),
            'offices' => $offices,
            'schedules' => $schedules,
        ]);
    }

    private function orderByWeekday($query): void
    {
        $query->orderByRaw("CASE day
            WHEN 'Monday' THEN 1
            WHEN 'Tuesday' THEN 2
            WHEN 'Wednesday' THEN 3
            WHEN 'Thursday' THEN 4
            WHEN 'Friday' THEN 5
            WHEN 'Saturday' THEN 6
            WHEN 'Sunday' THEN 7
            ELSE 8 END")
            ->orderBy('time')
            ->orderBy('id');
    }

    private function scheduleStartMinutes(string $time): int
    {
        if (! preg_match('/(\d{1,2}):(\d{2})\s*(am|pm)?/i', $time, $match)) {
            return 24 * 60;
        }

        $hour = (int) $match[1];
        $minute = (int) $match[2];
        $meridiem = isset($match[3]) ? strtolower((string) $match[3]) : null;
        if ($meridiem === 'pm' && $hour < 12) {
            $hour += 12;
        }
        if ($meridiem === 'am' && $hour === 12) {
            $hour = 0;
        }

        return ($hour * 60) + $minute;
    }

    // 3. For Assigning a New Shift (WITH SMART OVERLAP PREVENTION)
    public function store(Request $request)
    {
        [$userId, $kind, $entries] = $this->validatedScheduleEntries($request);

        if (! SemesterTerm::current()) {
            return response()->json([
                'message' => 'Set the semester length before creating a schedule. Weekly schedules repeat only inside that window.',
            ], 422);
        }

        foreach ($entries as $index => $entry) {
            $blockKind = $this->entryKind($entry, $kind);
            if ($blockKind !== 'class' && trim((string) ($entry['duty_type'] ?? '')) === '') {
                return response()->json([
                    'message' => $this->entryLabel($blockKind, $index, count($entries)).' needs a duty type.',
                ], 422);
            }
        }

        $accounts = app(UserController::class);
        $student = $accounts->findSchedulableStudent($userId);
        abort_unless(
            $accounts->canManageWorkSchedules($request->user()),
            403,
            $kind === 'class'
                ? 'Only a super admin or the WSPO coordinator/secretary can add a class schedule.'
                : 'Only a super admin or the WSPO coordinator/secretary can assign a work schedule.'
        );

        $department = $accounts->scheduleDepartment($student);
        $includesWork = collect($entries)->contains(fn (array $entry) => $this->entryKind($entry, $kind) === 'work');
        if ($includesWork && $department === '') {
            return response()->json([
                'message' => 'This student has no assigned office yet.',
            ], 422);
        }
        if ($department === '') {
            $department = 'Unassigned';
        }

        $batchConflict = $this->batchEntryConflict($entries, $kind);
        if ($batchConflict) {
            return response()->json(['message' => $batchConflict], 422);
        }

        $schedules = DB::transaction(function () use ($student, $entries, $department, $kind) {
            $created = collect();

            foreach ($entries as $index => $entry) {
                $blockKind = $this->entryKind($entry, $kind);
                $days = array_values(array_unique($entry['days']));
                $conflict = $this->scheduleConflict($student->id, $days, (string) $entry['time']);
                if ($conflict) {
                    $prefix = count($entries) > 1 ? $this->entryLabel($blockKind, $index, count($entries)).': ' : '';
                    throw new HttpResponseException(response()->json([
                        'message' => $prefix.$conflict,
                    ], 422));
                }

                $subject = trim((string) ($entry['subject'] ?? ''));
                $room = trim((string) ($entry['room'] ?? ''));
                $instructor = trim((string) ($entry['instructor'] ?? ''));

                foreach ($days as $day) {
                    $created->push(Schedule::create([
                        'user_id' => $student->id,
                        'kind' => $blockKind,
                        'day' => $day,
                        'time' => $entry['time'],
                        'duty_type' => $blockKind === 'class' ? ($subject !== '' ? $subject : 'Class') : $entry['duty_type'],
                        'subject' => $blockKind === 'class' && $subject !== '' ? $subject : null,
                        'room' => $blockKind === 'class' && $room !== '' ? $room : null,
                        'instructor' => $blockKind === 'class' && $instructor !== '' ? $instructor : null,
                        'department' => $department,
                        'supervisor' => $blockKind === 'class' ? $instructor : '',
                    ]));
                }
            }

            return $created->values();
        });

        $classBlocks = 0;
        $workBlocks = 0;
        $classDays = 0;
        $workDays = 0;
        foreach ($entries as $entry) {
            $dayCount = count(array_values(array_unique($entry['days'])));
            if ($this->entryKind($entry, $kind) === 'class') {
                $classBlocks++;
                $classDays += $dayCount;
            } else {
                $workBlocks++;
                $workDays += $dayCount;
            }
        }

        if ($classBlocks > 0 && $workBlocks > 0) {
            $message = $this->countPhrase($classBlocks, 'class', 'classes')
                .' and '.$this->countPhrase($workBlocks, 'work shift', 'work shifts').' saved.';
        } elseif ($classBlocks > 1) {
            $message = $classDays.' class days saved across '.$classBlocks.' classes.';
        } elseif ($workBlocks > 1) {
            $message = $workDays.' work days assigned across '.$workBlocks.' shifts.';
        } elseif ($classBlocks === 1) {
            $message = $classDays === 1 ? 'Class schedule saved.' : $classDays.' class days saved.';
        } else {
            $message = $workDays === 1 ? 'Schedule assigned successfully!' : $workDays.' work days assigned successfully!';
        }

        return response()->json([
            'message' => $message,
            'schedules' => $schedules,
        ]);
    }

    // 4. For editing one class or work row
    public function update(Request $request, int $id)
    {
        abort_unless(
            app(UserController::class)->canManageWorkSchedules($request->user()),
            403,
            'Only a super admin or the WSPO coordinator/secretary can edit a schedule.'
        );

        $schedule = Schedule::findOrFail($id);
        $kind = ($schedule->kind ?? 'work') === 'class' ? 'class' : 'work';

        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'day' => 'required|string|in:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
            'time' => 'required|string',
            'duty_type' => $kind === 'class' ? 'nullable|string|max:120' : 'required|string|max:120',
            'subject' => 'nullable|string|max:160',
            'room' => 'nullable|string|max:120',
            'instructor' => 'nullable|string|max:120',
        ]);

        $accounts = app(UserController::class);
        $student = $accounts->findSchedulableStudent($validated['user_id']);
        $department = $accounts->scheduleDepartment($student);
        if ($kind === 'work' && $department === '') {
            return response()->json([
                'message' => 'This student has no assigned office yet.',
            ], 422);
        }
        if ($department === '') {
            $department = 'Unassigned';
        }

        $conflict = $this->scheduleConflict($student->id, [$validated['day']], $validated['time'], $schedule->id);
        if ($conflict) {
            return response()->json(['message' => $conflict], 422);
        }

        $subject = trim((string) ($validated['subject'] ?? ''));
        $room = trim((string) ($validated['room'] ?? ''));
        $instructor = trim((string) ($validated['instructor'] ?? ''));

        $schedule->update([
            'user_id' => $student->id,
            'day' => $validated['day'],
            'time' => $validated['time'],
            'duty_type' => $kind === 'class' ? ($subject !== '' ? $subject : 'Class') : $validated['duty_type'],
            'subject' => $kind === 'class' && $subject !== '' ? $subject : null,
            'room' => $kind === 'class' && $room !== '' ? $room : null,
            'instructor' => $kind === 'class' && $instructor !== '' ? $instructor : null,
            'department' => $department,
            'supervisor' => $kind === 'class' ? $instructor : (string) $schedule->supervisor,
            'edit_request_status' => 'none',
            'edit_request_note' => null,
        ]);

        return response()->json([
            'message' => $kind === 'class' ? 'Class schedule updated.' : 'Work schedule updated.',
            'schedule' => $schedule->fresh(['user:id,name,profile_picture']),
        ]);
    }

    // 5. For Removing a Shift
    public function destroy(Request $request, int $id)
    {
        abort_unless(
            app(UserController::class)->canManageWorkSchedules($request->user()),
            403,
            'Only a super admin or the WSPO coordinator/secretary can remove a work schedule.'
        );
        $schedule = Schedule::findOrFail($id);
        $schedule->delete();

        return response()->json([
            'message' => 'Schedule removed successfully!'
        ]);
    }

    // Remove several schedules in one request (mass delete from Schedule Master).
    public function destroyMany(Request $request)
    {
        abort_unless(
            app(UserController::class)->canManageWorkSchedules($request->user()),
            403,
            'Only a super admin or the WSPO coordinator/secretary can remove a work schedule.'
        );

        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['integer', 'distinct'],
        ]);

        $deleted = Schedule::query()->whereIn('id', $validated['ids'])->delete();

        return response()->json([
            'message' => $deleted === 1
                ? '1 schedule removed.'
                : "{$deleted} schedules removed.",
            'deleted' => $deleted,
        ]);
    }

    // 5. For Students Requesting a Schedule Change
    public function requestEdit(Request $request, $id)
    {
        $validated = $request->validate([
            'note' => 'required|string|max:500'
        ]);

        // Ensure the student actually owns this shift before they can request an edit
        $schedule = Schedule::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        if ($schedule->kind === 'class') {
            return response()->json([
                'message' => 'Class schedules are updated by the WSPO coordinator or secretary.',
            ], 422);
        }

        $schedule->update([
            'edit_request_note' => $validated['note'],
            'edit_request_status' => 'pending'
        ]);

        $reviewers = \App\Models\User::whereIn('role', ['Super Admin', 'WSPO Staff', 'Supervisor'])->get();
        foreach ($reviewers as $reviewer) {
            \App\Models\Notification::create([
                'user_id' => $reviewer->id,
                'title' => 'Schedule Edit Requested',
                'message' => $request->user()->name . ' requested an edit for their ' . $schedule->day . ' shift.'
            ]);
        }

        return response()->json(['message' => 'Edit request sent. The WSPO office will review it.']);
    }

    // Approve or reject a student's work-schedule edit request.
    // A call with no action still clears the badge for older clients.
    public function resolveRequest(Request $request, $id)
    {
        abort_unless(
            app(UserController::class)->canManageWorkSchedules($request->user()),
            403,
            'Only a super admin or the WSPO coordinator/secretary can resolve a schedule request.'
        );

        $validated = $request->validate([
            'action' => 'nullable|string|in:approve,reject',
        ]);

        $schedule = Schedule::findOrFail($id);
        $action = $validated['action'] ?? null;

        if ($action === null) {
            $schedule->update([
                'edit_request_status' => 'none',
                'edit_request_note' => null,
            ]);

            return response()->json(['message' => 'Student request acknowledged and cleared.']);
        }

        $status = $action === 'approve' ? 'approved' : 'rejected';
        $schedule->update(['edit_request_status' => $status]);

        $decision = $status === 'approved' ? 'approved' : 'rejected';
        \App\Models\Notification::create([
            'user_id' => $schedule->user_id,
            'title' => 'Schedule edit '.$decision,
            'message' => 'Your request to change the '.$schedule->day.' shift was '.$decision.'.'
                .($status === 'approved' ? ' The office will update the shift if the day or time should change.' : ''),
        ]);

        return response()->json([
            'message' => $status === 'approved'
                ? 'Edit request approved. Update the shift if the day or time should change.'
                : 'Edit request rejected.',
            'edit_request_status' => $status,
        ]);
    }

    /**
     * One class or work block, or several blocks saved together.
     *
     * @return array{0: int, 1: string, 2: list<array<string, mixed>>}
     */
    private function validatedScheduleEntries(Request $request): array
    {
        $dayRule = 'required|string|in:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday';

        if ($request->exists('entries')) {
            $validated = $request->validate([
                'user_id' => 'required|exists:users,id',
                'kind' => 'nullable|in:work,class',
                'entries' => 'required|array|min:1|max:20',
                'entries.*.days' => 'required|array|min:1',
                'entries.*.days.*' => $dayRule,
                'entries.*.time' => 'required|string',
                'entries.*.kind' => 'nullable|in:work,class',
                'entries.*.duty_type' => 'nullable|string|max:120',
                'entries.*.subject' => 'nullable|string|max:160',
                'entries.*.room' => 'nullable|string|max:120',
                'entries.*.instructor' => 'nullable|string|max:120',
            ]);

            return [(int) $validated['user_id'], $validated['kind'] ?? 'work', array_values($validated['entries'])];
        }

        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'days' => 'required|array|min:1',
            'days.*' => $dayRule,
            'time' => 'required|string',
            'kind' => 'nullable|in:work,class',
            'duty_type' => 'required_unless:kind,class|nullable|string|max:120',
            'subject' => 'nullable|string|max:160',
            'room' => 'nullable|string|max:120',
            'instructor' => 'nullable|string|max:120',
        ]);

        return [(int) $validated['user_id'], $validated['kind'] ?? 'work', [[
            'kind' => $validated['kind'] ?? 'work',
            'days' => $validated['days'],
            'time' => $validated['time'],
            'duty_type' => $validated['duty_type'] ?? null,
            'subject' => $validated['subject'] ?? null,
            'room' => $validated['room'] ?? null,
            'instructor' => $validated['instructor'] ?? null,
        ]]];
    }

    /**
     * @param  list<array<string, mixed>>  $entries
     */
    private function batchEntryConflict(array $entries, string $kind): ?string
    {
        $rows = [];

        foreach ($entries as $index => $entry) {
            $blockKind = $this->entryKind($entry, $kind);
            $bounds = $this->timeBounds((string) ($entry['time'] ?? ''));
            if (! $bounds) {
                $prefix = count($entries) > 1 ? $this->entryLabel($blockKind, $index, count($entries)).': ' : '';

                return $prefix.'Enter a start and end time.';
            }

            foreach (array_values(array_unique($entry['days'] ?? [])) as $day) {
                $rows[] = [
                    'index' => $index,
                    'kind' => $blockKind,
                    'day' => $day,
                    'start' => $bounds[0]->copy(),
                    'end' => $bounds[1]->copy(),
                ];
            }
        }

        $count = count($rows);
        for ($left = 0; $left < $count; $left++) {
            for ($right = $left + 1; $right < $count; $right++) {
                if ($rows[$left]['day'] !== $rows[$right]['day']) {
                    continue;
                }
                if ($rows[$left]['start']->lt($rows[$right]['end']) && $rows[$left]['end']->gt($rows[$right]['start'])) {
                    return $this->entryLabel($rows[$left]['kind'], $rows[$left]['index'], count($entries))
                        .' overlaps '
                        .$this->entryLabel($rows[$right]['kind'], $rows[$right]['index'], count($entries))
                        .' on '.$rows[$left]['day'].'.';
                }
            }
        }

        return null;
    }

    private function entryLabel(string $kind, int $index, int $total): string
    {
        $noun = $kind === 'class' ? 'Class' : 'Shift';

        return $total > 1 ? $noun.' '.($index + 1) : $noun;
    }

    /**
     * @param  array<string, mixed>  $entry
     */
    private function entryKind(array $entry, string $fallback): string
    {
        $kind = $entry['kind'] ?? $fallback;

        return $kind === 'class' ? 'class' : 'work';
    }

    private function countPhrase(int $count, string $singular, string $plural): string
    {
        return $count.' '.($count === 1 ? $singular : $plural);
    }

    /**
     * @param  list<string>  $days
     */
    private function scheduleConflict(int $userId, array $days, string $time, ?int $ignoreId = null): ?string
    {
        $incoming = $this->timeBounds($time);
        if (! $incoming) {
            return 'Enter a start and end time.';
        }

        [$newStart, $newEnd] = $incoming;
        $existingShifts = Schedule::where('user_id', $userId)
            ->whereIn('day', $days)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->get();

        foreach ($existingShifts as $shift) {
            $existing = $this->timeBounds((string) $shift->time);
            if (! $existing) {
                continue;
            }

            [$existingStart, $existingEnd] = $existing;
            if ($newStart->lt($existingEnd) && $newEnd->gt($existingStart)) {
                $existingKind = ($shift->kind ?? 'work') === 'class' ? 'class' : 'work shift';
                $detail = $shift->kind === 'class' && $shift->subject ? " ({$shift->subject})" : '';

                return "Conflict! This student already has a {$existingKind}{$detail} on {$shift->day} from {$shift->time}.";
            }
        }

        return null;
    }

    /**
     * @return array{0: Carbon, 1: Carbon}|null
     */
    private function timeBounds(string $time): ?array
    {
        $parts = preg_split('/\s*-\s*/', trim($time)) ?: [];
        if (count($parts) !== 2) {
            return null;
        }

        try {
            $start = Carbon::parse(trim($parts[0]));
            $end = Carbon::parse(trim($parts[1]));
        } catch (\Throwable) {
            return null;
        }

        if ($end->lte($start)) {
            $end->addDay();
        }

        return [$start, $end];
    }
}
