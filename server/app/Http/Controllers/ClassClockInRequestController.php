<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\ClassClockInRequest;
use App\Services\AccountEventMailer;
use App\Models\DisciplinaryRecord;
use App\Models\Notification;
use App\Models\Schedule;
use App\Models\User;
use App\Support\ClassHoursDuty;
use App\Support\HourLimits;
use App\Support\SuperAdminAudit;
use App\Support\WorkSchedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ClassClockInRequestController extends Controller
{
    /** Student: class blocks for the request dropdown, with the one meeting now flagged. */
    public function classes(Request $request)
    {
        $user = $request->user();
        if ($denied = $this->ensureStudent($user)) {
            return $denied;
        }

        $now = now();
        $dayRank = [
            'Monday' => 1,
            'Tuesday' => 2,
            'Wednesday' => 3,
            'Thursday' => 4,
            'Friday' => 5,
            'Saturday' => 6,
            'Sunday' => 7,
        ];

        $classes = Schedule::query()
            ->where('user_id', $user->id)
            ->where('kind', 'class')
            ->get()
            ->map(function (Schedule $block) use ($now) {
                $payload = ClassHoursDuty::describe($block);
                $payload['in_session'] = ClassHoursDuty::contains($block, $now);

                return $payload;
            })
            ->sort(function (array $left, array $right) use ($dayRank) {
                return [
                    $left['in_session'] ? 0 : 1,
                    $dayRank[$left['day']] ?? 8,
                    (string) $left['time'],
                ] <=> [
                    $right['in_session'] ? 0 : 1,
                    $dayRank[$right['day']] ?? 8,
                    (string) $right['time'],
                ];
            })
            ->values();

        return response()->json(['classes' => $classes]);
    }

    /** Student: own class-hours clock-in requests. */
    public function mine(Request $request)
    {
        $user = $request->user();
        if ($denied = $this->ensureStudent($user)) {
            return $denied;
        }

        $rows = ClassClockInRequest::query()
            ->with('attendance:id,time_in,time_out,rendered_hours,computed_hours,status')
            ->where('user_id', $user->id)
            ->orderByRaw("CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END")
            ->orderByDesc('created_at')
            ->limit(30)
            ->get()
            ->map(fn (ClassClockInRequest $row) => $this->serialize($row));

        return response()->json(['requests' => $rows]);
    }

    /** Student: ask to start duty during a class that is meeting now. */
    public function store(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        if ($denied = $this->ensureStudent($user)) {
            return $denied;
        }

        $validated = $request->validate([
            'schedule_id' => 'required|integer',
            'reason' => 'required|string|max:1000',
        ]);

        $reason = trim($validated['reason']);
        if ($reason === '') {
            return response()->json(['message' => 'Enter a reason for the class-hours clock-in.'], 422);
        }

        if ($denied = $this->dutyBlock($user)) {
            return $denied;
        }

        $schedule = Schedule::query()
            ->where('id', $validated['schedule_id'])
            ->where('user_id', $user->id)
            ->where('kind', 'class')
            ->first();

        if (! $schedule) {
            return response()->json(['message' => 'Choose one of your class schedules.'], 422);
        }

        if (! ClassHoursDuty::contains($schedule, now())) {
            return response()->json([
                'message' => 'You can request this clock-in only while that class is meeting.',
            ], 422);
        }

        if ($this->openDuty((int) $user->id)) {
            return response()->json([
                'message' => 'You are already clocked in. Clock out of this shift before requesting another one.',
            ], 422);
        }

        $pending = ClassClockInRequest::query()
            ->where('user_id', $user->id)
            ->where('status', ClassClockInRequest::PENDING)
            ->exists();
        if ($pending) {
            return response()->json([
                'message' => 'You already have a class-hours clock-in waiting for your supervisor.',
            ], 422);
        }

        $row = ClassClockInRequest::create([
            'user_id' => $user->id,
            'schedule_id' => $schedule->id,
            'class_day' => $schedule->day,
            'class_time' => $schedule->time,
            'class_subject' => $schedule->subject,
            'class_room' => $schedule->room,
            'class_instructor' => $schedule->instructor,
            'reason' => $reason,
            'status' => ClassClockInRequest::PENDING,
        ]);

        $detail = ClassHoursDuty::detail($schedule);
        $this->notifyReviewers(
            $user,
            'Class-hours clock-in request',
            $user->name.' requested to clock in during '.$detail.'. Reason: '.$reason,
        );
        app(AccountEventMailer::class)->duty(
            $user,
            'Class-hours clock-in submitted',
            'Request submitted',
            'Your class-hours clock-in was submitted. You are clocked in only after your supervisor approves it.',
            [
                ['label' => 'Class', 'value' => $detail],
                ['label' => 'Reason', 'value' => $reason],
            ],
        );

        return response()->json([
            'message' => 'Class-hours clock-in submitted. Your supervisor still has to approve it. You are clocked in only after that approval.',
            'request' => $this->serialize($row->fresh('attendance')),
        ], 201);
    }

    /** Student: withdraw a request that is still pending. */
    public function destroy(Request $request, ClassClockInRequest $classClockInRequest)
    {
        $user = $request->user();
        if ((int) $classClockInRequest->user_id !== (int) $user->id) {
            return response()->json(['message' => 'You can only cancel your own request.'], 403);
        }

        if (! $classClockInRequest->isPending()) {
            return response()->json(['message' => 'This request was already decided.'], 422);
        }

        $classClockInRequest->delete();

        return response()->json(['message' => 'Class-hours clock-in request cancelled.']);
    }

    /** Supervisor / WSPO: requests from students in the reviewer's departments. */
    public function index(Request $request)
    {
        $actor = $request->user()->loadMissing('profile');
        if (! in_array($actor->role, ['Supervisor', 'Department Secretary', 'WSPO Staff', 'Super Admin'], true)) {
            return response()->json(['message' => 'Not allowed.'], 403);
        }

        $accounts = app(UserController::class);
        $query = ClassClockInRequest::query()
            ->with([
                'student:id,name',
                'student.profile:id,user_id,student_id_number,assigned_office,year_level',
                'attendance:id,time_in,time_out,rendered_hours,computed_hours,status',
                'reviewer:id,name',
            ])
            ->orderByRaw("CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END")
            ->orderByDesc('created_at');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($accounts->usesSupervisorScope($actor)) {
            $areas = $accounts->supervisedOfficeAreas($actor);
            if ($areas === []) {
                $query->whereRaw('0 = 1');
            } else {
                $query->whereHas('student', function ($owner) use ($areas, $accounts) {
                    $accounts->constrainPlacedIn($owner, $areas);
                });
            }
        }

        $rows = $query->limit(100)->get()->map(fn (ClassClockInRequest $row) => $this->serialize($row, true));

        return response()->json(['requests' => $rows]);
    }

    /** Supervisor / WSPO: approve starts a normal open clock-in. Reject leaves the DTR unchanged. */
    public function decide(Request $request, ClassClockInRequest $classClockInRequest)
    {
        SuperAdminAudit::denyMutation($request);

        $reviewer = $request->user()->loadMissing('profile');
        $classClockInRequest->load(['student.profile', 'attendance']);
        $student = $classClockInRequest->student;
        if (! $student) {
            return response()->json(['message' => 'Student account was not found.'], 404);
        }

        if (! in_array($reviewer->role, ['Supervisor', 'Department Secretary', 'WSPO Staff'], true)) {
            return response()->json(['message' => 'Only a supervisor or WSPO staff can decide this request.'], 403);
        }

        if (! $this->canReviewStudent($reviewer, $student)) {
            return response()->json(['message' => 'You can only review class-hours clock-ins for students in your departments.'], 403);
        }

        if (! $classClockInRequest->isPending()) {
            return response()->json(['message' => 'This request was already decided.'], 422);
        }

        $validated = $request->validate([
            'status' => 'required|in:Approved,Rejected',
            'decision_note' => 'nullable|string|max:1000',
        ]);

        $note = trim((string) ($validated['decision_note'] ?? ''));
        $detail = $this->storedDetail($classClockInRequest);

        if ($validated['status'] === ClassClockInRequest::REJECTED) {
            $classClockInRequest->update([
                'status' => ClassClockInRequest::REJECTED,
                'decision_note' => $note !== '' ? $note : null,
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
            ]);

            Notification::create([
                'user_id' => $student->id,
                'title' => 'Class-hours clock-in declined',
                'message' => 'Your supervisor declined the clock-in request for '.$detail.'.',
            ]);
            app(AccountEventMailer::class)->duty(
                $student,
                'Class-hours clock-in declined',
                'Request declined',
                'Your supervisor declined the clock-in request for '.$detail.'.',
                $note !== '' ? [['label' => 'Note', 'value' => $note]] : [],
            );

            return response()->json([
                'message' => 'Class-hours clock-in declined.',
                'request' => $this->serialize($classClockInRequest->fresh(['student.profile', 'attendance', 'reviewer:id,name']), true),
            ]);
        }

        if ($denied = $this->dutyBlock($student, true)) {
            return $denied;
        }

        if ($this->openDuty((int) $student->id)) {
            return response()->json([
                'message' => 'This student is already clocked in. They need to clock out before this request can start a shift.',
            ], 422);
        }

        $now = now();
        $shift = WorkSchedule::matchingShift((int) $student->id, $now, 'in');
        $task = 'Class-hours clock-in approved: '.$detail.'. '.$classClockInRequest->reason;

        try {
            $attendance = DB::transaction(function () use ($classClockInRequest, $student, $reviewer, $note, $now, $shift, $task) {
                $locked = ClassClockInRequest::query()->whereKey($classClockInRequest->id)->lockForUpdate()->first();
                if (! $locked || ! $locked->isPending()) {
                    return null;
                }

                if ($this->openDuty((int) $student->id)) {
                    return false;
                }

                $attendance = Attendance::create([
                    'user_id' => $student->id,
                    'time_in' => $now,
                    'schedule_id' => $shift?->id,
                    'attendance_type' => 'Regular',
                    'check_in_method' => 'class_hours',
                    'code_owner_id' => $reviewer->id,
                    'work_type' => 'Regular',
                    'task_description' => $task,
                    'status' => 'pending',
                    'is_anomaly' => false,
                ]);

                $locked->update([
                    'status' => ClassClockInRequest::APPROVED,
                    'decision_note' => $note !== '' ? $note : null,
                    'reviewed_by' => $reviewer->id,
                    'reviewed_at' => $now,
                    'attendance_id' => $attendance->id,
                ]);

                return $attendance;
            });
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json(['message' => 'Could not start the clock-in. Try again.'], 500);
        }

        if ($attendance === null) {
            return response()->json(['message' => 'This request was already decided.'], 422);
        }

        if ($attendance === false) {
            return response()->json([
                'message' => 'This student is already clocked in. They need to clock out before this request can start a shift.',
            ], 422);
        }

        $approvedMessage = 'Your clock-in for '.$detail.' was approved. You are clocked in. '
            .'Clock out with your supervisor\'s passcode or QR when the duty ends. '
            .'Hours are added to your DTR then, the same as a normal clock-in.';
        Notification::create([
            'user_id' => $student->id,
            'title' => 'Class-hours clock-in approved',
            'message' => $approvedMessage,
        ]);
        app(AccountEventMailer::class)->duty(
            $student,
            'Class-hours clock-in approved',
            'Request approved',
            $approvedMessage,
            $note !== '' ? [['label' => 'Note', 'value' => $note]] : [],
        );

        return response()->json([
            'message' => 'Request approved. The student is clocked in. Hours are added when they clock out.',
            'request' => $this->serialize($classClockInRequest->fresh(['student.profile', 'attendance', 'reviewer:id,name']), true),
            'attendance_id' => $attendance->id,
        ]);
    }

    private function ensureStudent(User $user)
    {
        if (! app(UserController::class)->mustClockAsStudent($user)) {
            return response()->json(['message' => 'Only working students can request a class-hours clock-in.'], 403);
        }

        return null;
    }

    /**
     * Same gates as a live clock-in, except the class-schedule overlap this request exists to allow.
     */
    private function dutyBlock(User $user, bool $forReviewer = false)
    {
        $user->loadMissing('profile');

        $suspension = DisciplinaryRecord::activeSuspension((int) $user->id);
        if ($suspension) {
            $message = $forReviewer
                ? $user->name.' is suspended from duty and cannot be clocked in.'
                : $suspension->suspensionNotice();

            return response()->json(['message' => $message], 403);
        }

        $accounts = app(UserController::class);
        $office = $accounts->isStudentOfficer($user)
            ? $accounts->placementOffice($user)
            : trim((string) ($user->profile?->assigned_office ?? ''));
        if ($office === '') {
            return response()->json([
                'message' => $forReviewer
                    ? 'This student has no assigned department, so the clock-in cannot start.'
                    : 'Your account has no assigned department. Contact your supervisor.',
            ], 422);
        }

        $limitDenial = HourLimits::jsonDenial((int) $user->id, now());
        if ($limitDenial) {
            return $limitDenial;
        }

        return null;
    }

    private function openDuty(int $userId): ?Attendance
    {
        return Attendance::query()
            ->where('user_id', $userId)
            ->whereNull('time_out')
            ->whereNull('rendered_hour_event_id')
            ->first();
    }

    private function canReviewStudent(User $actor, User $student): bool
    {
        if ($actor->role === 'WSPO Staff') {
            return true;
        }

        return app(UserController::class)->supervisorCanAccessStudent($actor, $student);
    }

    private function notifyReviewers(User $student, string $title, string $message): void
    {
        $accounts = app(UserController::class);
        $reviewers = User::query()
            ->whereIn('role', ['Supervisor', 'WSPO Staff'])
            ->with('profile')
            ->get()
            ->filter(function (User $reviewer) use ($accounts, $student) {
                if ($reviewer->role === 'WSPO Staff') {
                    return true;
                }

                return $accounts->supervisorCanAccessStudent($reviewer, $student);
            });

        foreach ($reviewers as $reviewer) {
            Notification::create([
                'user_id' => $reviewer->id,
                'title' => $title,
                'message' => $message,
            ]);
        }
    }

    private function storedDetail(ClassClockInRequest $row): string
    {
        $schedule = new Schedule([
            'day' => $row->class_day,
            'time' => $row->class_time,
            'subject' => $row->class_subject,
        ]);
        $label = WorkSchedule::label($schedule);
        $subject = trim((string) ($row->class_subject ?? ''));

        return $subject !== '' ? "{$subject} ({$label})" : $label;
    }

    private function serialize(ClassClockInRequest $row, bool $includeStudent = false): array
    {
        $schedule = new Schedule([
            'day' => $row->class_day,
            'time' => $row->class_time,
            'subject' => $row->class_subject,
            'room' => $row->class_room,
            'instructor' => $row->class_instructor,
        ]);

        $payload = [
            'id' => $row->id,
            'user_id' => $row->user_id,
            'reason' => $row->reason,
            'status' => $row->status,
            'decision_note' => $row->decision_note,
            'reviewed_by' => $row->reviewer?->name,
            'reviewed_at' => $row->reviewed_at,
            'created_at' => $row->created_at,
            'class' => [
                'schedule_id' => $row->schedule_id,
                'day' => $row->class_day,
                'time' => $row->class_time,
                'subject' => $row->class_subject,
                'room' => $row->class_room,
                'instructor' => $row->class_instructor,
                'label' => WorkSchedule::label($schedule),
            ],
            'attendance' => $row->attendance ? [
                'id' => $row->attendance->id,
                'time_in' => $row->attendance->time_in,
                'time_out' => $row->attendance->time_out,
                'rendered_hours' => $row->attendance->rendered_hours,
                'computed_hours' => $row->attendance->computed_hours,
                'status' => $row->attendance->status,
            ] : null,
        ];

        if ($includeStudent) {
            $payload['student_name'] = $row->student?->name;
            $payload['student_id_number'] = $row->student?->profile?->student_id_number;
            $payload['assigned_office'] = $row->student?->profile?->assigned_office;
            $payload['year_level'] = $row->student?->profile?->year_level;
        }

        return $payload;
    }
}
