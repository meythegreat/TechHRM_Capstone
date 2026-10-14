<?php

namespace App\Http\Controllers;

use App\Models\DailyCleaningGroup;
use App\Models\RenderedHourEntry;
use App\Models\RenderedHourEvent;
use App\Models\User;
use App\Support\RenderedHours;
use App\Support\SuperAdminAudit;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class RenderedHourController extends Controller
{
    public function students()
    {
        $students = User::query()
            ->with('profile:id,user_id,student_id_number,year_level,course')
            ->where('role', 'Student')
            ->orderBy('name')
            ->get()
            ->map(fn (User $student) => [
                'id' => $student->id,
                'name' => $student->name,
                'student_id_number' => $student->profile?->student_id_number,
                'year_level' => $student->profile?->year_level,
                'year_label' => RenderedHours::yearLabel($student->profile?->year_level ? (int) $student->profile->year_level : null),
                'course' => $student->profile?->course,
            ]);

        return response()->json(['students' => $students]);
    }

    public function index(Request $request)
    {
        $request->validate([
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
        ]);

        $events = RenderedHourEvent::query()
            ->with(['entries.student:id,name', 'entries.student.profile:id,user_id,student_id_number,year_level'])
            ->whereDate('event_date', '>=', $request->period_start)
            ->whereDate('event_date', '<=', $request->period_end)
            ->orderBy('event_date')
            ->orderBy('title')
            ->get()
            ->map(fn (RenderedHourEvent $event) => $this->present($event));

        return response()->json(['events' => $events]);
    }

    public function mine(Request $request)
    {
        $request->validate([
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
        ]);

        $user = $request->user();
        if ($user->role !== 'Student') {
            return response()->json(['message' => 'Only working students can view this summary.'], 403);
        }

        $start = Carbon::parse($request->period_start)->startOfDay();
        $end = Carbon::parse($request->period_end)->endOfDay();
        $report = RenderedHours::report($start, $end);
        $row = collect($report['students'])->firstWhere('user_id', $user->id);

        $activities = RenderedHourEvent::query()
            ->with(['entries' => fn ($entries) => $entries->where('user_id', $user->id)])
            ->whereDate('event_date', '>=', $start->toDateString())
            ->whereDate('event_date', '<=', $end->toDateString())
            ->whereHas('entries', fn ($entries) => $entries->where('user_id', $user->id)->whereNotNull('status'))
            ->orderBy('event_date')
            ->orderBy('title')
            ->get()
            ->map(function (RenderedHourEvent $event) {
                $entry = $event->entries->first();

                return [
                    'id' => $event->id,
                    'title' => $event->title,
                    'kind_label' => RenderedHourEvent::KINDS[$event->kind]['label'] ?? $event->kind,
                    'event_date' => $event->event_date->toDateString(),
                    'status' => $entry?->status,
                    'hours_delta' => $entry ? round((float) $entry->hours_delta, 2) : 0,
                ];
            })
            ->values();

        return response()->json([
            'period_start' => $start->toDateString(),
            'period_end' => $end->toDateString(),
            'student' => $row ?: [
                'user_id' => $user->id,
                'name' => $user->name,
                'student_id_number' => $user->profile?->student_id_number,
                'course' => $user->profile?->course,
                'assigned_office' => $user->profile?->assigned_office,
                'year_level' => $user->profile?->year_level ? (int) $user->profile->year_level : null,
                'dtr_hours' => 0,
                'duty_deduction' => 0,
                'special_request' => 0,
                'daily_cleaning' => 0,
                'general_cleaning' => 0,
                'devotional' => 0,
                'meeting_assembly' => 0,
                'adjustments' => 0,
                'grand_total' => 0,
            ],
            'activities' => $activities,
        ]);
    }

    public function report(Request $request)
    {
        $request->validate([
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
        ]);

        $start = Carbon::parse($request->period_start)->startOfDay();
        $end = Carbon::parse($request->period_end)->endOfDay();
        $report = RenderedHours::report($start, $end);

        return response()->json([
            'period_start' => $start->toDateString(),
            'period_end' => $end->toDateString(),
            'breakdown' => $report['breakdown'],
            'summary' => $report['summary'],
            'grand' => $report['grand'],
            'signatories' => [
                'secretary' => $this->signatoryName('WSPO Secretary'),
                'coordinator' => $this->signatoryName('WSPO Coordinator'),
            ],
        ]);
    }

    private function signatoryName(string $position): string
    {
        $name = User::query()
            ->where('role', 'WSPO Staff')
            ->whereHas('profile', fn ($profile) => $profile->where('assigned_office', $position))
            ->orderBy('name')
            ->value('name');

        return trim((string) $name);
    }

    public function store(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $validated = $this->validateEvent($request);
        $studentIds = $this->rosterIds($request, $validated['kind']);

        $event = DB::transaction(function () use ($request, $validated, $studentIds) {
            $event = RenderedHourEvent::create([
                ...$this->attributes($validated),
                'created_by' => $request->user()->id,
            ]);
            $this->syncRoster($event, $studentIds);

            return $event;
        });

        return response()->json([
            'message' => 'Activity saved.',
            'event' => $this->present($event->load('entries.student.profile')),
        ], 201);
    }

    public function update(Request $request, RenderedHourEvent $event)
    {
        SuperAdminAudit::denyMutation($request);
        $validated = $this->validateEvent($request, $event);
        $studentIds = $this->rosterIds($request, $validated['kind'], $event);

        DB::transaction(function () use ($event, $validated, $studentIds) {
            $event->fill($this->attributes($validated));
            $event->save();
            if (in_array($event->kind, [RenderedHourEvent::SPECIAL, RenderedHourEvent::DAILY_CLEANING], true)) {
                $this->syncRoster($event, $studentIds, true);
            } else {
                $this->refreshDeltas($event);
            }
        });

        return response()->json([
            'message' => 'Activity updated.',
            'event' => $this->present($event->load('entries.student.profile')),
        ]);
    }

    public function destroy(Request $request, RenderedHourEvent $event)
    {
        SuperAdminAudit::denyMutation($request);
        $event->delete();

        return response()->json(['message' => 'Activity removed.']);
    }

    public function mark(Request $request, RenderedHourEvent $event)
    {
        SuperAdminAudit::denyMutation($request);
        if (!$event->usesAttendance()) {
            abort(422, 'Special requests use the hours entered for the event.');
        }

        $this->assertActivityIssuer($request);
        $validated = $request->validate([
            'marks' => 'required|array|min:1',
            'marks.*.user_id' => 'required|integer|exists:users,id',
            'marks.*.status' => 'required|in:absent',
        ]);

        $eligible = $this->eligibleIds($event);
        DB::transaction(function () use ($event, $validated, $eligible) {
            foreach ($validated['marks'] as $mark) {
                if (!in_array((int) $mark['user_id'], $eligible, true)) {
                    abort(422, 'That student is not assigned to this activity.');
                }
                $this->writeMark($event, (int) $mark['user_id'], $mark['status'], null);
            }
        });

        return response()->json([
            'message' => 'Attendance saved.',
            'event' => $this->present($event->load('entries.student.profile')),
        ]);
    }

    public function scan(Request $request, RenderedHourEvent $event)
    {
        SuperAdminAudit::denyMutation($request);
        abort(422, 'Students record this attendance by scanning the QR code.');
    }

    public function correctTime(Request $request, RenderedHourEvent $event)
    {
        SuperAdminAudit::denyMutation($request);
        $this->assertActivityIssuer($request);
        if (!$event->usesAttendance()) {
            abort(422, 'Special requests do not use attendance.');
        }

        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
            'time' => ['required', 'regex:/^\d{2}:\d{2}$/'],
        ]);

        if (!in_array((int) $validated['user_id'], $this->eligibleIds($event), true)) {
            abort(422, 'That student is not assigned to this activity.');
        }

        $clockIn = Carbon::parse($event->event_date->toDateString().' '.$validated['time']);
        if ($clockIn->greaterThan(now())) {
            abort(422, 'The corrected time cannot be in the future.');
        }

        $student = User::query()->findOrFail($validated['user_id']);
        $status = $event->statusAt($clockIn);
        $issuer = $request->user();

        DB::transaction(function () use ($event, $student, $status, $clockIn, $issuer) {
            $entry = RenderedHourEntry::firstOrNew([
                'event_id' => $event->id,
                'user_id' => $student->id,
            ]);
            $attendance = $entry->attendance_id
                ? \App\Models\Attendance::find($entry->attendance_id)
                : null;

            $delta = $event->deltaFor($status);
            $payload = [
                'user_id' => $student->id,
                'time_in' => $clockIn,
                'time_out' => $clockIn,
                'attendance_type' => RenderedHourEvent::KINDS[$event->kind]['label'] ?? $event->kind,
                'check_in_method' => 'qr',
                'code_owner_id' => $issuer->id,
                'work_type' => RenderedHourEvent::KINDS[$event->kind]['label'] ?? $event->kind,
                'rendered_hours' => 0,
                'computed_hours' => 0,
                'activity_hours' => $delta,
                'rendered_hour_event_id' => $event->id,
                'status' => 'accepted',
                'task_description' => 'Time corrected by WSPO staff.',
                'is_anomaly' => $status === 'late',
                'anomaly_reason' => $status === 'late'
                    ? 'Clocked in after the on-time window. No hours were added or deducted.'
                    : null,
            ];

            if ($attendance) {
                $attendance->update($payload);
            } else {
                $attendance = \App\Models\Attendance::create($payload);
            }

            $entry->status = $status;
            $entry->scanned_at = $clockIn;
            $entry->hours_delta = $delta;
            $entry->attendance_id = $attendance->id;
            $entry->save();
        });

        $hours = number_format((float) $event->hours, 2);
        $message = $status === 'late'
            ? "{$student->name} is late. No hours were added or deducted."
            : "{$student->name} is on time. {$hours} hours were added.";

        return response()->json([
            'message' => $message,
            'event' => $this->present($event->load('entries.student.profile')),
        ]);
    }

    public function markRemainingAbsent(Request $request, RenderedHourEvent $event)
    {
        SuperAdminAudit::denyMutation($request);
        if (!$event->usesAttendance()) {
            abort(422, 'Special requests do not use attendance.');
        }

        $this->assertActivityIssuer($request);
        $marked = $event->entries()->whereNotNull('status')->pluck('user_id')->all();
        $missing = array_values(array_diff($this->eligibleIds($event), $marked));

        DB::transaction(function () use ($event, $missing) {
            foreach ($missing as $userId) {
                $this->writeMark($event, (int) $userId, 'absent', null);
            }
        });

        return response()->json([
            'message' => count($missing) === 0
                ? 'Everyone assigned already has a mark.'
                : count($missing) . ' unmarked student' . (count($missing) === 1 ? '' : 's') . ' marked absent. Their hours will be deducted.',
            'event' => $this->present($event->load('entries.student.profile')),
        ]);
    }

    private function validateEvent(Request $request, ?RenderedHourEvent $existing = null): array
    {
        $kind = $request->input('kind', $existing?->kind);
        $validated = $request->validate([
            'kind' => ['required', Rule::in(array_keys(RenderedHourEvent::KINDS))],
            'title' => 'required|string|max:160',
            'event_date' => 'required|date',
            'hours' => 'nullable|numeric|min:0.5|max:200',
            'direction' => 'nullable|in:add,deduct',
            'year_level' => 'nullable|integer|min:1|max:4',
            'group_name' => 'nullable|string|max:80',
            'group_id' => 'nullable|integer|exists:daily_cleaning_groups,id',
            'starts_at' => 'nullable|date_format:H:i',
            'valid_until' => 'nullable|date_format:H:i',
            'notes' => 'nullable|string|max:1000',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'integer|exists:users,id',
        ]);

        $fixed = RenderedHourEvent::KINDS[$kind]['hours'];
        if ($kind === RenderedHourEvent::SPECIAL) {
            if (empty($validated['hours'])) {
                abort(422, 'Enter how many hours this event is worth.');
            }
            $validated['direction'] = $validated['direction'] ?? 'add';
            $validated['year_level'] = null;
            $validated['group_name'] = null;
            $validated['starts_at'] = null;
            $validated['valid_until'] = null;
        } else {
            $validated['hours'] = $fixed;
            $validated['direction'] = null;
            if ($kind === RenderedHourEvent::DAILY_CLEANING && empty($validated['starts_at'])) {
                $validated['starts_at'] = '05:00';
            }
            if (empty($validated['starts_at'])) {
                abort(422, 'Set the official time in. Hours are added only when a student clocks in inside the on-time window.');
            }
            $start = Carbon::createFromFormat('H:i', $validated['starts_at']);
            $window = (int) (RenderedHourEvent::KINDS[$kind]['window'] ?? 60);
            $validated['valid_until'] = $start->copy()->addMinutes($window)->format('H:i');
        }

        if ($kind === RenderedHourEvent::DAILY_CLEANING) {
            $group = $this->cleaningGroup($request);
            $validated['group_id'] = $group->id;
            $validated['group_name'] = $group->name;
        }

        if ($kind === RenderedHourEvent::GENERAL_CLEANING && empty($validated['year_level'])) {
            abort(422, 'Choose the year level for general cleaning.');
        }

        if ($kind !== RenderedHourEvent::GENERAL_CLEANING) {
            $validated['year_level'] = $kind === RenderedHourEvent::DAILY_CLEANING ? null : ($validated['year_level'] ?? null);
        }

        if ($kind === RenderedHourEvent::DEVOTIONAL) {
            $duplicate = RenderedHourEvent::query()
                ->where('kind', RenderedHourEvent::DEVOTIONAL)
                ->whereDate('event_date', $validated['event_date'])
                ->when($existing, fn ($query) => $query->where('id', '!=', $existing->id))
                ->exists();
            if ($duplicate) {
                abort(422, 'A devotional meeting is already recorded on that date.');
            }
        }

        if ($kind === RenderedHourEvent::GENERAL_CLEANING) {
            $duplicate = RenderedHourEvent::query()
                ->where('kind', RenderedHourEvent::GENERAL_CLEANING)
                ->where('year_level', $validated['year_level'])
                ->whereDate('event_date', $validated['event_date'])
                ->when($existing, fn ($query) => $query->where('id', '!=', $existing->id))
                ->exists();
            if ($duplicate) {
                abort(422, 'That year level already has general cleaning on that date.');
            }
        }

        return $validated;
    }

    private function cleaningGroup(Request $request): DailyCleaningGroup
    {
        $group = DailyCleaningGroup::query()->with('students')->find($request->input('group_id'));
        if (!$group) {
            abort(422, 'Choose a cleaning group.');
        }
        if ($group->students->isEmpty()) {
            abort(422, 'That cleaning group has no students.');
        }

        return $group;
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return list<int>
     */
    private function rosterIds(Request $request, string $kind, ?RenderedHourEvent $existing = null): array
    {
        if (!in_array($kind, [RenderedHourEvent::SPECIAL, RenderedHourEvent::DAILY_CLEANING], true)) {
            return [];
        }

        if ($kind === RenderedHourEvent::DAILY_CLEANING) {
            $ids = $this->cleaningGroup($request)->students->pluck('id')->map(fn ($id) => (int) $id)->unique()->values();
        } else {
            $ids = collect($request->input('user_ids', []))
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values();
        }

        if ($ids->isEmpty()) {
            abort(422, 'Choose at least one student.');
        }

        $students = User::query()->where('role', 'Student')->whereIn('id', $ids)->pluck('id');
        if ($students->count() !== $ids->count()) {
            abort(422, 'Every person on this activity must be a working student.');
        }

        if ($kind === RenderedHourEvent::DAILY_CLEANING) {
            $date = Carbon::parse($request->input('event_date'));
            $weekStart = $date->copy()->startOfWeek(Carbon::MONDAY)->toDateString();
            $weekEnd = $date->copy()->endOfWeek(Carbon::SUNDAY)->toDateString();
            $conflicts = RenderedHourEntry::query()
                ->whereIn('user_id', $ids)
                ->whereHas('event', function ($query) use ($weekStart, $weekEnd, $existing) {
                    $query->where('kind', RenderedHourEvent::DAILY_CLEANING)
                        ->whereDate('event_date', '>=', $weekStart)
                        ->whereDate('event_date', '<=', $weekEnd)
                        ->when($existing, fn ($events) => $events->where('id', '!=', $existing->id));
                })
                ->with('student:id,name')
                ->get();

            if ($conflicts->isNotEmpty()) {
                $names = $conflicts->map(fn ($entry) => $entry->student->name ?? 'A student')->unique()->implode(', ');
                abort(422, "Daily cleaning is once a week. Already assigned this week: {$names}.");
            }
        }

        return $ids->all();
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function attributes(array $validated): array
    {
        return [
            'kind' => $validated['kind'],
            'title' => $validated['title'],
            'event_date' => $validated['event_date'],
            'hours' => $validated['hours'],
            'direction' => $validated['direction'],
            'year_level' => $validated['kind'] === RenderedHourEvent::GENERAL_CLEANING ? ($validated['year_level'] ?? null) : null,
            'group_name' => $validated['kind'] === RenderedHourEvent::DAILY_CLEANING ? ($validated['group_name'] ?? null) : null,
            'group_id' => $validated['kind'] === RenderedHourEvent::DAILY_CLEANING ? ($validated['group_id'] ?? null) : null,
            'starts_at' => $validated['starts_at'] ?? null,
            'valid_until' => $validated['valid_until'] ?? null,
            'notes' => $validated['notes'] ?? null,
        ];
    }

    /**
     * @param  list<int>  $studentIds
     */
    private function syncRoster(RenderedHourEvent $event, array $studentIds, bool $keepMarks = false): void
    {
        if (!$keepMarks) {
            $event->entries()->whereNotIn('user_id', $studentIds)->delete();
        } else {
            $event->entries()->whereNotIn('user_id', $studentIds)->delete();
        }

        foreach ($studentIds as $userId) {
            $entry = RenderedHourEntry::firstOrNew([
                'event_id' => $event->id,
                'user_id' => $userId,
            ]);
            if ($event->kind === RenderedHourEvent::SPECIAL) {
                $entry->status = 'applied';
                $entry->scanned_at = null;
            }
            $entry->hours_delta = $event->deltaFor($entry->status);
            $entry->save();
        }
    }

    private function refreshDeltas(RenderedHourEvent $event): void
    {
        foreach ($event->entries as $entry) {
            $entry->hours_delta = $event->deltaFor($entry->status);
            $entry->save();
        }
    }

    private function writeMark(RenderedHourEvent $event, int $userId, string $status, $scannedAt): void
    {
        $entry = RenderedHourEntry::firstOrNew([
            'event_id' => $event->id,
            'user_id' => $userId,
        ]);
        $entry->status = $status;
        if ($scannedAt) {
            $entry->scanned_at = $scannedAt;
        }
        $entry->hours_delta = $event->deltaFor($status);
        $entry->save();

        if ($entry->attendance_id) {
            \App\Models\Attendance::whereKey($entry->attendance_id)->update([
                'activity_hours' => $entry->hours_delta,
                'is_anomaly' => $status !== 'on_time',
                'anomaly_reason' => $status === 'absent'
                    ? 'Marked absent. The activity hours were deducted.'
                    : ($status === 'late' ? 'Clocked in after the on-time window. No hours were added or deducted.' : null),
            ]);
        }
    }

    private function assertActivityIssuer(Request $request): void
    {
        $user = $request->user()->loadMissing('profile');
        if (!app(UserController::class)->canIssueActivityAttendance($user)) {
            abort(403, 'Only the WSPO coordinator, secretary, and president can change this attendance.');
        }
    }

    /**
     * @return list<int>
     */
    private function eligibleIds(RenderedHourEvent $event): array
    {
        if (in_array($event->kind, [RenderedHourEvent::SPECIAL, RenderedHourEvent::DAILY_CLEANING], true)) {
            return $event->entries()->pluck('user_id')->map(fn ($id) => (int) $id)->all();
        }

        $query = User::query()->where('role', 'Student');
        if ($event->kind === RenderedHourEvent::GENERAL_CLEANING) {
            $query->whereHas('profile', fn ($profile) => $profile->where('year_level', $event->year_level));
        }

        return $query->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    private function present(RenderedHourEvent $event): array
    {
        $event->loadMissing('entries.student.profile');
        $eligibleCount = count($this->eligibleIds($event));
        $marked = $event->entries->whereNotNull('status')->count();

        return [
            'id' => $event->id,
            'kind' => $event->kind,
            'kind_label' => RenderedHourEvent::KINDS[$event->kind]['label'] ?? $event->kind,
            'title' => $event->title,
            'event_date' => $event->event_date->toDateString(),
            'hours' => (float) $event->hours,
            'direction' => $event->direction,
            'year_level' => $event->year_level,
            'year_label' => $event->year_level ? RenderedHours::yearLabel((int) $event->year_level) : null,
            'group_name' => $event->group_name,
            'starts_at' => $event->starts_at ? substr((string) $event->starts_at, 0, 5) : null,
            'window_minutes' => $event->windowMinutes(),
            'valid_until' => $event->valid_until ? substr((string) $event->valid_until, 0, 5) : null,
            'notes' => $event->notes,
            'uses_attendance' => $event->usesAttendance(),
            'eligible_count' => $eligibleCount,
            'marked_count' => $event->usesAttendance() ? $marked : $event->entries->count(),
            'entries' => $this->roster($event),
        ];
    }

    private function roster(RenderedHourEvent $event): array
    {
        $event->loadMissing('entries.student.profile');
        $byUser = $event->entries->keyBy('user_id');
        $students = User::query()
            ->with('profile:id,user_id,student_id_number,year_level')
            ->whereIn('id', $this->eligibleIds($event))
            ->orderBy('name')
            ->get();

        return $students->map(function (User $student) use ($byUser) {
            $entry = $byUser->get($student->id);

            return [
                'user_id' => $student->id,
                'name' => $student->name,
                'student_id_number' => $student->profile?->student_id_number,
                'year_level' => $student->profile?->year_level,
                'status' => $entry?->status,
                'scanned_at' => optional($entry?->scanned_at)?->toIso8601String(),
                'hours_delta' => (float) ($entry->hours_delta ?? 0),
            ];
        })->values()->all();
    }
}
