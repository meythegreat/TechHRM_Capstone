<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Models\Schedule;
use App\Models\ScheduleSubmission;
use App\Models\ScheduleSubmissionEntry;
use App\Models\SemesterTerm;
use App\Models\User;
use App\Services\AccountEventMailer;
use App\Support\GoogleCalendarSync;
use App\Support\SuperAdminAudit;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ScheduleSubmissionController extends Controller
{
    private const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    /** Working student: own class and duty submissions. */
    public function mine(Request $request)
    {
        $user = $request->user();
        if ($denied = $this->ensureStudent($user)) {
            return $denied;
        }

        $rows = ScheduleSubmission::query()
            ->with(['entries', 'reviewer:id,name'])
            ->where('user_id', $user->id)
            ->orderByRaw("CASE status WHEN 'Pending' THEN 0 WHEN 'Rejected' THEN 1 ELSE 2 END")
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn (ScheduleSubmission $row) => $this->serialize($row));

        return response()->json(['submissions' => $rows]);
    }

    /** Working student: submit a class schedule or a duty schedule with proof. */
    public function store(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        if ($denied = $this->ensureStudent($user)) {
            return $denied;
        }

        $kindCheck = $request->validate([
            'kind' => 'required|in:class,work',
        ]);
        $kind = $kindCheck['kind'];
        $proofLabel = $kind === 'class' ? 'registration form' : 'duty schedule';

        $request->validate([
            'entries' => 'required|string',
            'proof' => 'required|file|mimes:jpg,jpeg,png,pdf|max:5120',
        ], [
            'proof.required' => "Attach a photo or PDF of your {$proofLabel}.",
            'proof.mimes' => 'The proof must be a JPG, PNG, or PDF.',
            'proof.max' => 'The proof must be 5 MB or smaller.',
            'entries.required' => 'Add at least one day and time.',
        ]);

        if (! SemesterTerm::current()) {
            return response()->json([
                'message' => 'The WSPO office has not set the semester yet. You can submit a schedule after that window is open.',
            ], 422);
        }

        $accounts = app(UserController::class);
        $office = $accounts->placementOffice($user);
        if ($office === '') {
            return response()->json([
                'message' => 'You need an assigned office before you can submit a schedule.',
            ], 422);
        }

        $decoded = json_decode((string) $request->input('entries'), true);
        if (! is_array($decoded) || $decoded === []) {
            return response()->json(['message' => 'Add at least one day and time.'], 422);
        }
        if (count($decoded) > 12) {
            return response()->json(['message' => 'Submit at most 12 blocks at a time.'], 422);
        }

        $built = $this->buildEntries($decoded, $kind);
        if (isset($built['message'])) {
            return response()->json(['message' => $built['message']], 422);
        }
        $rows = $built['rows'];

        $overlap = $this->rowsOverlap($rows);
        if ($overlap) {
            return response()->json(['message' => $overlap], 422);
        }

        $pending = ScheduleSubmission::query()
            ->where('user_id', $user->id)
            ->where('kind', $kind)
            ->where('status', ScheduleSubmission::PENDING)
            ->exists();
        if ($pending) {
            $label = $kind === 'class' ? 'class schedule' : 'duty schedule';

            return response()->json([
                'message' => "You already have a {$label} waiting for review. Withdraw it before sending another.",
            ], 422);
        }

        $against = $this->blockingRows($user->id, $kind);
        $conflict = $this->conflictWith($rows, $against);
        if ($conflict) {
            return response()->json(['message' => $conflict], 422);
        }

        $reviewers = $this->reviewersFor($user, $kind);
        if ($reviewers->isEmpty()) {
            $message = $kind === 'class'
                ? 'No office supervisor is assigned to review your class schedule. Ask the WSPO office to assign one.'
                : 'No WSPO coordinator is available to review duty schedules.';

            return response()->json(['message' => $message], 422);
        }

        $file = $request->file('proof');
        $path = $file->store('schedule-proofs', 'local');
        $proofName = $this->safeOriginalName($file->getClientOriginalName(), $path);

        try {
            $submission = DB::transaction(function () use ($user, $kind, $path, $proofName, $rows) {
                $submission = ScheduleSubmission::create([
                    'user_id' => $user->id,
                    'kind' => $kind,
                    'status' => ScheduleSubmission::PENDING,
                    'proof_path' => $path,
                    'proof_name' => $proofName,
                ]);

                foreach ($rows as $row) {
                    ScheduleSubmissionEntry::create([
                        'schedule_submission_id' => $submission->id,
                        'day' => $row['day'],
                        'time' => $row['time'],
                        'duty_type' => $row['duty_type'],
                        'subject' => $row['subject'],
                        'room' => $row['room'],
                        'instructor' => $row['instructor'],
                    ]);
                }

                return $submission;
            });
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($path);
            report($exception);

            return response()->json(['message' => 'Could not save this schedule. Try again.'], 500);
        }

        $summary = $this->summary($rows);
        $title = $kind === 'class' ? 'Class schedule submitted' : 'Duty schedule submitted';
        $reviewerLine = $kind === 'class'
            ? 'Your office supervisor will review it.'
            : 'The WSPO coordinator will review it.';
        foreach ($reviewers as $reviewer) {
            Notification::create([
                'user_id' => $reviewer->id,
                'title' => $title,
                'message' => $user->name.' submitted a '.($kind === 'class' ? 'class' : 'duty').' schedule for '.$office.'. '.$summary,
            ]);
        }
        app(AccountEventMailer::class)->duty(
            $user,
            $title,
            'Schedule submitted',
            'Your '.($kind === 'class' ? 'class' : 'duty').' schedule was submitted. '.$reviewerLine.' It is not active until it is approved.',
            [
                ['label' => $kind === 'class' ? 'Registration form' : 'Duty schedule', 'value' => $proofName],
                ['label' => 'Blocks', 'value' => $summary],
            ],
        );

        return response()->json([
            'message' => $kind === 'class'
                ? 'Class schedule submitted. Your office supervisor still has to approve it.'
                : 'Duty schedule submitted. The WSPO coordinator still has to approve it.',
            'submission' => $this->serialize($submission->fresh(['entries', 'reviewer:id,name'])),
        ], 201);
    }

    /** Working student: withdraw a submission that is still pending. */
    public function destroy(Request $request, ScheduleSubmission $scheduleSubmission)
    {
        $user = $request->user();
        if ((int) $scheduleSubmission->user_id !== (int) $user->id) {
            return response()->json(['message' => 'You can only withdraw your own submission.'], 403);
        }
        if (! $scheduleSubmission->isPending()) {
            return response()->json(['message' => 'This submission was already decided.'], 422);
        }

        $path = $scheduleSubmission->proof_path;
        $scheduleSubmission->delete();
        if ($path && Storage::disk('local')->exists($path)) {
            Storage::disk('local')->delete($path);
        }

        return response()->json(['message' => 'Submission withdrawn.']);
    }

    /** Office supervisors see class submissions. The WSPO coordinator sees duty submissions. */
    public function review(Request $request)
    {
        $actor = $request->user()->loadMissing('profile');
        if (! $this->canOpenQueue($actor)) {
            return response()->json(['message' => 'Not allowed.'], 403);
        }

        $accounts = app(UserController::class);
        $query = ScheduleSubmission::query()
            ->with([
                'entries',
                'student:id,name,profile_picture',
                'student.profile',
                'reviewer:id,name',
            ])
            ->orderByRaw("CASE status WHEN 'Pending' THEN 0 WHEN 'Rejected' THEN 1 ELSE 2 END")
            ->orderByDesc('id');

        if ($actor->role !== 'Super Admin') {
            $seesDuty = $accounts->canManageWorkSchedules($actor);
            $seesClass = $accounts->usesSupervisorScope($actor) || $accounts->isWspoDepartmentSupervisor($actor);
            $areas = $seesClass ? $accounts->supervisedOfficeAreas($actor) : [];

            $query->where(function ($outer) use ($seesDuty, $seesClass, $areas, $accounts) {
                $applied = false;
                if ($seesDuty) {
                    $outer->where('kind', 'work');
                    $applied = true;
                }
                if ($seesClass) {
                    $classScope = function ($classQuery) use ($areas, $accounts) {
                        $classQuery->where('kind', 'class');
                        if ($areas === []) {
                            $classQuery->whereRaw('0 = 1');

                            return;
                        }
                        $classQuery->whereHas('student', function ($owner) use ($areas, $accounts) {
                            $accounts->constrainPlacedIn($owner, $areas);
                        });
                    };
                    if ($applied) {
                        $outer->orWhere($classScope);
                    } else {
                        $outer->where($classScope);
                    }
                }
                if (! $seesDuty && ! $seesClass) {
                    $outer->whereRaw('0 = 1');
                }
            });
        }

        $rows = $query->limit(40)->get();
        $approved = $this->approvedSchedules($rows);

        return response()->json([
            'can_review' => true,
            'can_decide' => $actor->role !== 'Super Admin',
            'submissions' => $rows->map(function (ScheduleSubmission $row) use ($approved) {
                $payload = $this->serialize($row, true);
                $current = $approved[$row->user_id.'|'.$row->kind] ?? [];
                $payload['approved'] = $current;
                $payload['current_count'] = count($current);

                return $payload;
            })->values(),
        ]);
    }

    public function decide(Request $request, ScheduleSubmission $scheduleSubmission)
    {
        SuperAdminAudit::denyMutation($request);

        $reviewer = $request->user()->loadMissing('profile');
        $scheduleSubmission->load(['student.profile', 'entries']);
        $student = $scheduleSubmission->student;
        if (! $student) {
            return response()->json(['message' => 'Student account was not found.'], 404);
        }

        if (! $this->canDecide($reviewer, $scheduleSubmission, $student)) {
            $message = $scheduleSubmission->isClass()
                ? 'Only this student\'s office supervisor can decide a class schedule.'
                : 'Only the WSPO coordinator can decide a duty schedule.';

            return response()->json(['message' => $message], 403);
        }

        if (! $scheduleSubmission->isPending()) {
            return response()->json(['message' => 'This submission was already decided.'], 422);
        }

        $validated = $request->validate([
            'action' => 'required|in:approve,reject',
            'note' => 'nullable|string|max:500',
            'omit_entry_ids' => 'nullable|array|max:40',
            'omit_entry_ids.*' => 'integer',
        ]);
        $note = trim((string) ($validated['note'] ?? ''));
        if ($validated['action'] === 'reject' && $note === '') {
            return response()->json(['message' => 'Add a short note so the student knows what to fix.'], 422);
        }

        $ownedIds = $scheduleSubmission->entries->pluck('id')->map(fn ($id) => (int) $id)->all();
        $omitIds = array_values(array_unique(array_map('intval', $validated['omit_entry_ids'] ?? [])));
        $unknown = array_diff($omitIds, $ownedIds);
        if ($unknown !== []) {
            return response()->json(['message' => 'One of the selected blocks is not part of this submission.'], 422);
        }
        if ($validated['action'] === 'approve' && count($omitIds) >= count($ownedIds)) {
            return response()->json([
                'message' => 'Leave at least one block, or decline the whole submission.',
            ], 422);
        }
        if ($validated['action'] === 'approve' && $omitIds !== [] && $note === '') {
            return response()->json([
                'message' => 'Add a short note explaining the blocks you are leaving out.',
            ], 422);
        }

        $kind = $scheduleSubmission->isClass() ? 'class' : 'work';
        $label = $kind === 'class' ? 'class schedule' : 'duty schedule';

        if ($validated['action'] === 'reject') {
            $scheduleSubmission->update([
                'status' => ScheduleSubmission::REJECTED,
                'review_note' => $note,
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
            ]);

            $message = 'Your '.$label.' was declined. '.$note;
            Notification::create([
                'user_id' => $student->id,
                'title' => ($kind === 'class' ? 'Class' : 'Duty').' schedule declined',
                'message' => $message,
            ]);
            app(AccountEventMailer::class)->duty(
                $student,
                ($kind === 'class' ? 'Class' : 'Duty').' schedule declined',
                'Schedule declined',
                $message,
                [['label' => 'Note', 'value' => $note]],
            );

            return response()->json([
                'message' => ucfirst($label).' declined.',
                'submission' => $this->serialize($scheduleSubmission->fresh(['entries', 'student.profile', 'reviewer:id,name']), true),
            ]);
        }

        if (! SemesterTerm::current()) {
            return response()->json([
                'message' => 'Set the semester length before approving a schedule.',
            ], 422);
        }

        $rows = $this->entryPayloads($scheduleSubmission, $omitIds);
        $overlap = $this->rowsOverlap($rows);
        if ($overlap) {
            return response()->json(['message' => $overlap], 422);
        }
        $conflict = $this->conflictWith($rows, $this->blockingRows((int) $student->id, $kind, $scheduleSubmission->id));
        if ($conflict) {
            return response()->json(['message' => $conflict], 422);
        }

        $accounts = app(UserController::class);
        $department = $accounts->scheduleDepartment($student);
        if ($department === '') {
            $department = $accounts->placementOffice($student);
        }
        if ($department === '') {
            return response()->json(['message' => 'This student has no assigned office yet.'], 422);
        }

        $removedIds = [];
        try {
            $created = DB::transaction(function () use ($scheduleSubmission, $student, $reviewer, $note, $kind, $rows, $department, $omitIds, &$removedIds) {
                $locked = ScheduleSubmission::query()->whereKey($scheduleSubmission->id)->lockForUpdate()->first();
                if (! $locked || ! $locked->isPending()) {
                    return null;
                }

                $days = array_values(array_unique(array_column($rows, 'day')));
                $existing = Schedule::query()
                    ->where('user_id', $student->id)
                    ->whereIn('day', $days)
                    ->where(function ($query) use ($kind) {
                        if ($kind === 'work') {
                            $query->where('kind', 'work')->orWhereNull('kind');
                        } else {
                            $query->where('kind', 'class');
                        }
                    })
                    ->get();
                $removedIds = $existing->pluck('id')->all();
                if ($removedIds !== []) {
                    Schedule::query()->whereIn('id', $removedIds)->delete();
                }

                $saved = collect();
                foreach ($rows as $row) {
                    $subject = trim((string) ($row['subject'] ?? ''));
                    $room = trim((string) ($row['room'] ?? ''));
                    $instructor = trim((string) ($row['instructor'] ?? ''));
                    $saved->push(Schedule::create([
                        'user_id' => $student->id,
                        'kind' => $kind,
                        'day' => $row['day'],
                        'time' => $row['time'],
                        'duty_type' => $kind === 'class' ? ($subject !== '' ? $subject : 'Class') : $row['duty_type'],
                        'subject' => $kind === 'class' && $subject !== '' ? $subject : null,
                        'room' => $kind === 'class' && $room !== '' ? $room : null,
                        'instructor' => $kind === 'class' && $instructor !== '' ? $instructor : null,
                        'department' => $department,
                        'supervisor' => $kind === 'class' ? $instructor : $reviewer->name,
                        'edit_request_status' => 'none',
                        'edit_request_note' => null,
                    ]));
                }

                ScheduleSubmissionEntry::query()
                    ->where('schedule_submission_id', $locked->id)
                    ->update(['kept' => true]);
                if ($omitIds !== []) {
                    ScheduleSubmissionEntry::query()
                        ->where('schedule_submission_id', $locked->id)
                        ->whereIn('id', $omitIds)
                        ->update(['kept' => false]);
                }

                $locked->update([
                    'status' => ScheduleSubmission::APPROVED,
                    'review_note' => $note !== '' ? $note : null,
                    'reviewed_by' => $reviewer->id,
                    'reviewed_at' => now(),
                ]);

                return $saved;
            });
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json(['message' => 'Could not approve this schedule. Try again.'], 500);
        }

        if ($created === null) {
            return response()->json(['message' => 'This submission was already decided.'], 422);
        }

        $calendar = app(GoogleCalendarSync::class);
        foreach ($removedIds as $id) {
            $calendar->deleteScheduleEvent((int) $id);
        }
        foreach ($created as $schedule) {
            $calendar->pushSchedule($schedule);
        }

        $leftOut = $scheduleSubmission->entries
            ->whereIn('id', $omitIds)
            ->map(fn (ScheduleSubmissionEntry $entry) => $entry->day.' '.$entry->time)
            ->values()
            ->all();
        $dayList = collect($rows)->pluck('day')->unique()->implode(', ');
        $approved = 'Your '.$label.' for '.$dayList.' was approved. Other approved days stay on your schedule.';
        if ($leftOut !== []) {
            $approved .= ' These blocks were left out: '.implode('; ', $leftOut).'.';
        }
        Notification::create([
            'user_id' => $student->id,
            'title' => ($kind === 'class' ? 'Class' : 'Duty').' schedule approved',
            'message' => $approved,
        ]);
        app(AccountEventMailer::class)->duty(
            $student,
            ($kind === 'class' ? 'Class' : 'Duty').' schedule approved',
            'Schedule approved',
            $approved,
            $note !== '' ? [['label' => 'Note', 'value' => $note]] : [],
        );

        $message = ucfirst($label).' approved for '.$dayList.'. Other approved days stay on the schedule.';
        if ($leftOut !== []) {
            $message .= ' '.count($leftOut).' mistaken block'.(count($leftOut) === 1 ? ' was' : 's were').' left out.';
        }

        return response()->json([
            'message' => $message,
            'submission' => $this->serialize($scheduleSubmission->fresh(['entries', 'student.profile', 'reviewer:id,name']), true),
        ]);
    }

    private function ensureStudent(User $user)
    {
        if (! app(UserController::class)->mustClockAsStudent($user)) {
            return response()->json(['message' => 'Only a working student can submit a schedule.'], 403);
        }

        return null;
    }

    private function canOpenQueue(User $actor): bool
    {
        if ($actor->role === 'Super Admin') {
            return true;
        }

        $accounts = app(UserController::class);

        return $accounts->usesSupervisorScope($actor)
            || $accounts->isWspoDepartmentSupervisor($actor)
            || $accounts->canManageWorkSchedules($actor);
    }

    private function canDecide(User $reviewer, ScheduleSubmission $submission, User $student): bool
    {
        $accounts = app(UserController::class);
        if ($submission->isClass()) {
            return ($accounts->usesSupervisorScope($reviewer) || $accounts->isWspoDepartmentSupervisor($reviewer))
                && $accounts->supervisorCanAccessStudent($reviewer, $student);
        }

        return $accounts->canManageWorkSchedules($reviewer);
    }

    /**
     * @return Collection<int, User>
     */
    private function reviewersFor(User $student, string $kind): Collection
    {
        $accounts = app(UserController::class);
        if ($kind === 'work') {
            return User::query()
                ->where('role', 'WSPO Staff')
                ->with('profile')
                ->get()
                ->filter(fn (User $user) => $accounts->canManageWorkSchedules($user))
                ->values();
        }

        return User::query()
            ->whereIn('role', ['Supervisor', 'Department Secretary', 'WSPO Staff'])
            ->with('profile')
            ->get()
            ->filter(function (User $user) use ($accounts, $student) {
                if (! $accounts->usesSupervisorScope($user) && ! $accounts->isWspoDepartmentSupervisor($user)) {
                    return false;
                }

                return $accounts->supervisorCanAccessStudent($user, $student);
            })
            ->values();
    }

    /**
     * @param  list<array<string, mixed>>  $decoded
     * @return array{rows: list<array<string, mixed>>}|array{message: string}
     */
    private function buildEntries(array $decoded, string $kind): array
    {
        $rows = [];
        foreach (array_values($decoded) as $index => $entry) {
            if (! is_array($entry)) {
                return ['message' => 'Add at least one day and time.'];
            }
            $label = count($decoded) > 1 ? 'Block '.($index + 1) : 'This block';
            $days = array_values(array_unique(array_filter(array_map(
                fn ($day) => is_string($day) ? trim($day) : '',
                is_array($entry['days'] ?? null) ? $entry['days'] : []
            ))));
            if ($days === []) {
                return ['message' => $label.' needs at least one day.'];
            }
            foreach ($days as $day) {
                if (! in_array($day, self::WEEKDAYS, true)) {
                    return ['message' => $label.' has a day that is not a weekday name.'];
                }
            }

            $bounds = $this->timeBounds((string) ($entry['time'] ?? ''));
            if (! $bounds) {
                return ['message' => $label.' needs a start and end time.'];
            }
            if ($bounds['same']) {
                return ['message' => $label.' needs an end time after the start time.'];
            }

            $subject = trim((string) ($entry['subject'] ?? ''));
            $room = trim((string) ($entry['room'] ?? ''));
            $instructor = trim((string) ($entry['instructor'] ?? ''));
            $duty = trim((string) ($entry['duty_type'] ?? ''));
            if ($kind === 'work' && $duty === '') {
                return ['message' => $label.' needs a duty type.'];
            }
            if (strlen($subject) > 160 || strlen($room) > 120 || strlen($instructor) > 120 || strlen($duty) > 120) {
                return ['message' => $label.' has a field that is too long.'];
            }

            foreach ($days as $day) {
                $rows[] = [
                    'day' => $day,
                    'time' => $bounds['label'],
                    'start' => $bounds['start'],
                    'end' => $bounds['end'],
                    'duty_type' => $kind === 'work' ? $duty : null,
                    'subject' => $kind === 'class' && $subject !== '' ? $subject : null,
                    'room' => $kind === 'class' && $room !== '' ? $room : null,
                    'instructor' => $kind === 'class' && $instructor !== '' ? $instructor : null,
                ];
            }
        }

        if (count($rows) > 40) {
            return ['message' => 'Submit at most 40 day rows at a time.'];
        }

        return ['rows' => $rows];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function entryPayloads(ScheduleSubmission $submission, array $omitIds = []): array
    {
        $omit = array_flip($omitIds);
        $rows = [];
        foreach ($submission->entries as $entry) {
            if (isset($omit[(int) $entry->id])) {
                continue;
            }
            $bounds = $this->timeBounds((string) $entry->time);
            if (! $bounds || $bounds['same']) {
                continue;
            }
            $rows[] = [
                'id' => $entry->id,
                'day' => $entry->day,
                'time' => $bounds['label'],
                'start' => $bounds['start'],
                'end' => $bounds['end'],
                'duty_type' => $entry->duty_type,
                'subject' => $entry->subject,
                'room' => $entry->room,
                'instructor' => $entry->instructor,
            ];
        }

        return $rows;
    }

    /**
     * Official schedules of the other kind, plus a pending submission of the other kind.
     *
     * @return list<array<string, mixed>>
     */
    private function blockingRows(int $userId, string $kind, ?int $ignoreSubmissionId = null): array
    {
        $other = $kind === 'class' ? 'work' : 'class';
        $rows = [];

        $schedules = Schedule::query()
            ->where('user_id', $userId)
            ->where(function ($query) use ($other) {
                if ($other === 'work') {
                    $query->where('kind', 'work')->orWhereNull('kind');
                } else {
                    $query->where('kind', 'class');
                }
            })
            ->get();

        foreach ($schedules as $shift) {
            $bounds = $this->timeBounds((string) $shift->time);
            if (! $bounds || $bounds['same']) {
                continue;
            }
            $rows[] = [
                'day' => $shift->day,
                'time' => (string) $shift->time,
                'start' => $bounds['start'],
                'end' => $bounds['end'],
                'label' => ($shift->kind ?? 'work') === 'class'
                    ? 'class'.($shift->subject ? ' ('.$shift->subject.')' : '')
                    : 'duty shift'.($shift->duty_type ? ' ('.$shift->duty_type.')' : ''),
            ];
        }

        $pending = ScheduleSubmission::query()
            ->with('entries')
            ->where('user_id', $userId)
            ->where('kind', $other)
            ->where('status', ScheduleSubmission::PENDING)
            ->when($ignoreSubmissionId, fn ($query) => $query->where('id', '!=', $ignoreSubmissionId))
            ->first();

        if ($pending) {
            $pendingLabel = $other === 'class' ? 'pending class schedule' : 'pending duty schedule';
            foreach ($pending->entries as $entry) {
                $bounds = $this->timeBounds((string) $entry->time);
                if (! $bounds || $bounds['same']) {
                    continue;
                }
                $rows[] = [
                    'day' => $entry->day,
                    'time' => (string) $entry->time,
                    'start' => $bounds['start'],
                    'end' => $bounds['end'],
                    'label' => $pendingLabel,
                ];
            }
        }

        return $rows;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function rowsOverlap(array $rows): ?string
    {
        $count = count($rows);
        for ($left = 0; $left < $count; $left++) {
            for ($right = $left + 1; $right < $count; $right++) {
                if ($rows[$left]['day'] !== $rows[$right]['day']) {
                    continue;
                }
                if ($rows[$left]['start']->lt($rows[$right]['end']) && $rows[$left]['end']->gt($rows[$right]['start'])) {
                    return $rows[$left]['day'].' has two blocks that overlap.';
                }
            }
        }

        return null;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @param  list<array<string, mixed>>  $blocking
     */
    private function conflictWith(array $rows, array $blocking): ?string
    {
        foreach ($rows as $row) {
            foreach ($blocking as $other) {
                if ($row['day'] !== $other['day']) {
                    continue;
                }
                if ($row['start']->lt($other['end']) && $row['end']->gt($other['start'])) {
                    return $row['day'].' overlaps a '.$other['label'].' ('.$other['time'].').';
                }
            }
        }

        return null;
    }

    /**
     * @return array{start: Carbon, end: Carbon, label: string, same: bool}|null
     */
    private function timeBounds(string $time): ?array
    {
        $normalized = str_replace(['–', '—'], '-', trim($time));
        $parts = preg_split('/\s*-\s*/', $normalized) ?: [];
        if (count($parts) !== 2) {
            return null;
        }

        try {
            $start = Carbon::parse(trim($parts[0]));
            $end = Carbon::parse(trim($parts[1]));
        } catch (\Throwable) {
            return null;
        }

        $label = $start->format('g:i A').' - '.$end->format('g:i A');
        $same = $end->equalTo($start);
        if ($end->lte($start)) {
            $end = $end->copy()->addDay();
        }

        return [
            'start' => $start,
            'end' => $end,
            'label' => $label,
            'same' => $same,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function summary(array $rows): string
    {
        $order = array_flip(self::WEEKDAYS);
        $lines = collect($rows)
            ->sortBy(fn (array $row) => sprintf('%02d-%s', $order[$row['day']] ?? 8, $row['time']))
            ->map(function (array $row) {
                $name = $row['subject'] ?: $row['duty_type'];

                return $row['day'].' '.$row['time'].($name ? ' '.$name : '');
            })
            ->take(6)
            ->implode('; ');

        $extra = count($rows) - 6;

        return $extra > 0 ? $lines.'; +'.$extra.' more' : $lines;
    }

    /**
     * Approved blocks of the same kind, keyed by student and kind.
     *
     * @param  Collection<int, ScheduleSubmission>  $submissions
     * @return array<string, list<array<string, mixed>>>
     */
    private function approvedSchedules(Collection $submissions): array
    {
        $userIds = $submissions->pluck('user_id')->unique()->values();
        if ($userIds->isEmpty()) {
            return [];
        }

        $order = array_flip(self::WEEKDAYS);
        $grouped = [];
        Schedule::query()
            ->whereIn('user_id', $userIds)
            ->get(['user_id', 'kind', 'day', 'time', 'duty_type', 'subject', 'room'])
            ->each(function (Schedule $schedule) use (&$grouped) {
                $kind = ($schedule->kind ?? 'work') === 'class' ? 'class' : 'work';
                $grouped[$schedule->user_id.'|'.$kind][] = [
                    'day' => $schedule->day,
                    'time' => $schedule->time,
                    'duty_type' => $schedule->duty_type,
                    'subject' => $schedule->subject,
                    'room' => $schedule->room,
                ];
            });

        foreach ($grouped as &$blocks) {
            usort($blocks, function (array $left, array $right) use ($order) {
                $day = ($order[$left['day']] ?? 8) <=> ($order[$right['day']] ?? 8);
                if ($day !== 0) {
                    return $day;
                }

                return strcmp((string) $left['time'], (string) $right['time']);
            });
        }

        return $grouped;
    }

    private function serialize(ScheduleSubmission $submission, bool $withStudent = false): array
    {
        $order = array_flip(self::WEEKDAYS);
        $entries = $submission->entries
            ->sortBy(fn (ScheduleSubmissionEntry $entry) => sprintf('%02d-%s', $order[$entry->day] ?? 8, $entry->time))
            ->values()
            ->map(fn (ScheduleSubmissionEntry $entry) => [
                'id' => $entry->id,
                'day' => $entry->day,
                'time' => $entry->time,
                'duty_type' => $entry->duty_type,
                'subject' => $entry->subject,
                'room' => $entry->room,
                'instructor' => $entry->instructor,
                'kept' => $entry->kept,
            ])
            ->all();

        $payload = [
            'id' => $submission->id,
            'kind' => $submission->kind,
            'status' => $submission->status,
            'proof_path' => $submission->proof_path,
            'proof_name' => $submission->proof_name,
            'review_note' => $submission->review_note,
            'reviewed_at' => $submission->reviewed_at?->toIso8601String(),
            'reviewer_name' => $submission->reviewer?->name,
            'created_at' => $submission->created_at?->toIso8601String(),
            'entries' => $entries,
        ];

        if ($withStudent) {
            $office = trim((string) ($submission->student?->profile?->assigned_office ?? ''));
            $payload['student_name'] = $submission->student?->name ?? 'Student';
            $payload['profile_picture'] = $submission->student?->profile_picture;
            $payload['office'] = $office;
            $payload['student_id_number'] = $submission->student?->profile?->student_id_number;
        }

        return $payload;
    }

    private function safeOriginalName(?string $name, string $path): string
    {
        $candidate = trim((string) ($name ?: basename($path)));
        $candidate = str_replace(["\r", "\n", '"', '\\', '/'], '', $candidate);
        $candidate = preg_replace('/[^\x20-\x7E]+/', '_', $candidate) ?? '';
        $candidate = trim($candidate, ". \t");
        if ($candidate === '') {
            $candidate = basename($path);
        }

        return substr($candidate, 0, 180);
    }
}
