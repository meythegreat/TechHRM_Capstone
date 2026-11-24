<?php

namespace App\Http\Controllers;

use App\Models\AssemblyYearRepresentative;
use App\Models\Attendance;
use App\Models\JanitorialGroup;
use App\Models\RenderedHourEntry;
use App\Models\RenderedHourEvent;
use App\Support\ClassHoursDuty;
use App\Support\CleaningProof;
use App\Support\DutyHours;
use App\Support\HourLimits;
use App\Support\JanitorialWindows;
use App\Support\RenderedHours;
use App\Support\WorkSchedule;
use App\Support\SuperAdminAudit;
use App\Models\DailyToken;
use App\Models\Notification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AdvancedAttendanceController extends Controller
{
    /** Passcodes and live QR codes rotate on this interval so a captured code cannot be reused. */
    public const ACCESS_TTL_SECONDS = 30;

    /** @var array<string, list<int>> */
    private array $scopeIssuerIds = [];

    public const JANITORIAL_TOKEN_TYPE = 'Janitorial';

    public function generateToken(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $validated = $request->validate([
            'type' => 'required|in:Daily Clock',
            'description' => 'nullable|string|max:255',
        ]);

        $issued = $this->issueRotatingToken($request, $validated['type'], 'passcode', $validated['description'] ?? null, true);
        if ($issued instanceof \Illuminate\Http\JsonResponse) {
            return $issued;
        }

        return response()->json([
            'message' => 'Secure authentication token generated!',
            'token' => $issued['token'],
            'department' => $issued['department'],
            'departments' => $issued['departments'],
            'seconds_remaining' => $issued['seconds_remaining'],
            'ttl_seconds' => self::ACCESS_TTL_SECONDS,
        ]);
    }

    public function currentPasscode(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $validated = $request->validate([
            'type' => 'required|in:Daily Clock',
            'description' => 'nullable|string|max:255',
        ]);

        $issued = $this->issueRotatingToken($request, $validated['type'], 'passcode', $validated['description'] ?? null, false);
        if ($issued instanceof \Illuminate\Http\JsonResponse) {
            return $issued;
        }

        $token = $issued['token'];

        return response()->json([
            'token_code' => $token->token_code,
            'expires_at' => $token->expires_at,
            'seconds_remaining' => $issued['seconds_remaining'],
            'ttl_seconds' => self::ACCESS_TTL_SECONDS,
            'type' => $token->type,
            'description' => $token->description,
            'department' => $issued['department'],
            'departments' => $issued['departments'],
        ]);
    }

    public function currentQr(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $validated = $request->validate([
            'type' => 'required|in:Daily Clock',
        ]);

        $issued = $this->issueRotatingToken($request, $validated['type'], 'qr', null, false);
        if ($issued instanceof \Illuminate\Http\JsonResponse) {
            return $issued;
        }

        $token = $issued['token'];

        return response()->json([
            'payload' => 'THRM1|'.$token->token_code,
            'expires_at' => $token->expires_at,
            'seconds_remaining' => $issued['seconds_remaining'],
            'ttl_seconds' => self::ACCESS_TTL_SECONDS,
            'type' => $token->type,
            'department' => $issued['department'],
            'departments' => $issued['departments'],
        ]);
    }

    public function getAnomalyLogs(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);

        $query = Attendance::query()
            ->visibleTo($user->role)
            ->where('is_anomaly', true);

        if ($accounts->usesSupervisorScope($user) || $accounts->isWspoDepartmentSupervisor($user)) {
            $areas = $accounts->supervisedOfficeAreas($user);
            if ($areas === []) {
                $query->whereRaw('0 = 1');
            } else {
                $query->whereHas('user', function ($owner) use ($areas, $accounts) {
                    $accounts->constrainPlacedIn($owner, $areas);
                });
            }
        }

        return $query->latest('time_in')->get();
    }

    public function activityQr(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $issuer = $request->user()->loadMissing('profile');
        $validated = $request->validate([
            'event_id' => 'required|integer|exists:rendered_hour_events,id',
        ]);

        $event = RenderedHourEvent::findOrFail($validated['event_id']);
        if (!$this->canIssueActivityCode($issuer, $event)) {
            $message = match ($event->kind) {
                RenderedHourEvent::ASSEMBLY => 'Only the assembly representative for this year level can issue these QR codes.',
                RenderedHourEvent::DEVOTIONAL => 'Only the WSPO coordinator, secretary, president, or an assembly representative for this year level can issue these QR codes.',
                default => 'Only the WSPO coordinator, secretary, president, or this group\'s leader can issue these QR codes.',
            };

            return response()->json(['message' => $message], 403);
        }
        if (!$event->usesAttendance()) {
            return response()->json(['message' => 'Special requests do not use a QR code.'], 422);
        }
        if (!$event->officialStart()) {
            return response()->json(['message' => 'Set the official time in before showing a QR code.'], 422);
        }

        $issued = $this->issueActivityToken($issuer, $event, 'qr');
        $token = $issued['token'];
        $label = RenderedHourEvent::KINDS[$event->kind]['label'] ?? $event->kind;

        return response()->json([
            'payload' => 'THRM1A|'.$token->token_code,
            'expires_at' => $token->expires_at,
            'seconds_remaining' => $issued['seconds_remaining'],
            'ttl_seconds' => self::ACCESS_TTL_SECONDS,
            'type' => $label,
            'event_id' => $event->id,
            'title' => $event->title,
            'hours' => (float) $event->hours,
            'starts_at' => substr((string) $event->starts_at, 0, 5),
            'valid_until' => $event->valid_until ? substr((string) $event->valid_until, 0, 5) : null,
            'window_minutes' => $event->windowMinutes(),
        ]);
    }

    public function activityPasscode(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $issuer = $request->user()->loadMissing('profile');
        $validated = $request->validate([
            'event_id' => 'required|integer|exists:rendered_hour_events,id',
        ]);

        $event = RenderedHourEvent::findOrFail($validated['event_id']);
        if (!$this->canIssueActivityCode($issuer, $event)) {
            $message = match ($event->kind) {
                RenderedHourEvent::ASSEMBLY => 'Only the assembly representative for this year level can issue this passcode.',
                RenderedHourEvent::DEVOTIONAL => 'Only the WSPO coordinator, secretary, president, or an assembly representative for this year level can issue this passcode.',
                default => 'Only the WSPO coordinator, secretary, president, or this group\'s leader can issue this passcode.',
            };

            return response()->json(['message' => $message], 403);
        }
        if (!$event->usesAttendance()) {
            return response()->json(['message' => 'Special requests do not use a passcode.'], 422);
        }
        if (!$event->officialStart()) {
            return response()->json(['message' => 'Set the official time in before showing a passcode.'], 422);
        }

        $issued = $this->issueActivityToken($issuer, $event, 'passcode');
        $token = $issued['token'];

        return response()->json([
            'token_code' => $token->token_code,
            'expires_at' => $token->expires_at,
            'seconds_remaining' => $issued['seconds_remaining'],
            'ttl_seconds' => self::ACCESS_TTL_SECONDS,
            'event_id' => $event->id,
            'title' => $event->title,
        ]);
    }

    /** Janitorial student supervisor: live passcode for group members. */
    public function janitorialPasscode(Request $request)
    {
        return $this->issueJanitorialTokenResponse($request, 'passcode');
    }

    /** Janitorial student supervisor: live QR for group members. */
    public function janitorialQr(Request $request)
    {
        return $this->issueJanitorialTokenResponse($request, 'qr');
    }

    public function secureClockIn(Request $request)
    {
        $request->validate([
            'token_code' => 'required|string|max:80',
            'method' => 'nullable|in:passcode,qr',
        ]);

        $activityToken = $this->matchedToken($request->token_code);
        if ($activityToken?->event_id) {
            return $this->clockInActivity($request, $activityToken);
        }

        $peek = DailyToken::query()->where('token_code', $this->normalizeCode((string) $request->token_code))->first();
        if ($peek && $peek->type === self::JANITORIAL_TOKEN_TYPE) {
            return $this->clockInJanitorial($request);
        }

        $user = $request->user()->load('profile');
        $accounts = app(UserController::class);

        $activeRecord = Attendance::where('user_id', $user->id)
            ->whereNull('time_out')
            ->whereNull('rendered_hour_event_id')
            ->first();

        $suspension = \App\Models\DisciplinaryRecord::activeSuspension($user->id);
        if ($suspension) {
            return response()->json([
                'message' => $suspension->suspensionNotice(),
            ], 403);
        }

        if ($activeRecord) {
            return response()->json(['message' => 'You are already clocked in. Clock out of this shift before starting the next one.'], 422);
        }

        $studentDepartment = $accounts->isStudentOfficer($user)
            ? $accounts->placementOffice($user)
            : trim((string) ($user->profile?->assigned_office ?? ''));
        if ($studentDepartment === '') {
            return response()->json([
                'message' => 'Your account has no assigned department. Contact your supervisor.',
            ], 422);
        }

        $validToken = $this->authenticateToken($request, null, $studentDepartment);
        if ($validToken instanceof \Illuminate\Http\JsonResponse) {
            return $validToken;
        }

        $attendanceType = $this->dutyFromToken($validToken);
        $method = $request->input('method', 'passcode');
        $now = Carbon::now();

        $classBlock = ClassHoursDuty::overlappingClass((int) $user->id, $now);
        if ($classBlock) {
            return response()->json([
                'message' => ClassHoursDuty::denialMessage($classBlock),
                'requires_class_hours_approval' => true,
                'class_block' => [
                    'id' => $classBlock->id,
                    'day' => $classBlock->day,
                    'time' => $classBlock->time,
                    'subject' => $classBlock->subject,
                ],
            ], 403);
        }

        $scheduleDenial = WorkSchedule::denialMessage($user->id, $now, 'in');
        if ($scheduleDenial) {
            return response()->json(['message' => $scheduleDenial], 403);
        }

        $limitDenial = HourLimits::jsonDenial($user->id, $now);
        if ($limitDenial) {
            return $limitDenial;
        }

        $isAnomaly = false;
        $anomalyReason = null;

        $shift = WorkSchedule::matchingShift($user->id, $now, 'in');

        try {
            $attendance = Cache::lock('attendance-open:'.$user->id, 10)->block(5, function () use ($user, $now, $shift, $attendanceType, $method, $validToken, $isAnomaly, $anomalyReason) {
                $stillOpen = Attendance::where('user_id', $user->id)
                    ->whereNull('time_out')
                    ->whereNull('rendered_hour_event_id')
                    ->first();

                if ($stillOpen) {
                    return null;
                }

                return Attendance::create([
                    'user_id' => $user->id,
                    'time_in' => $now,
                    'schedule_id' => $shift?->id,
                    'attendance_type' => $attendanceType,
                    'verification_code_used' => $method === 'qr' ? null : $validToken->token_code,
                    'check_in_method' => $method,
                    'code_owner_id' => $validToken->generated_by,
                    'work_type' => $attendanceType,
                    'status' => 'pending',
                    'is_anomaly' => $isAnomaly,
                    'anomaly_reason' => $anomalyReason,
                ]);
            });
        } catch (LockTimeoutException) {
            return response()->json(['message' => 'Clock-in is busy. Wait a moment and try again.'], 429);
        }

        if (! $attendance) {
            return response()->json(['message' => 'You are already clocked in. Clock out of this shift before starting the next one.'], 422);
        }

        $this->notifyCodeOwner($validToken->generated_by, $user->name, $attendanceType, $method, false);
        app(\App\Services\AccountEventMailer::class)->clock($user, 'in', $now, 'Your '.$attendanceType.' clock-in was recorded.');

        return response()->json([
            'message' => 'Verified entry approved!',
            'attendance' => $attendance,
            'hour_limits' => HourLimits::status($user->id, $now),
            'auto_clock_out_window_minutes' => DutyHours::AUTO_CLOCK_OUT_WINDOW_MINUTES,
        ]);
    }

    public function secureClockOut(Request $request, $id)
    {
        $request->validate([
            'token_code' => 'required|string|max:80',
            'method' => 'nullable|in:passcode,qr',
            'auto_clock_out' => 'nullable|boolean',
        ]);

        $user = $request->user()->load('profile');
        $attendance = Attendance::where('id', $id)
            ->where('user_id', $user->id)
            ->firstOrFail();

        if ($attendance->time_out) {
            return response()->json(['message' => 'Shift segment already terminated.'], 422);
        }

        if ($attendance->rendered_hour_event_id) {
            return $this->clockOutActivity($request, $attendance);
        }

        $dutyType = $attendance->attendance_type ?: ($attendance->work_type ?: 'Regular');
        $isJanitorial = CleaningProof::isJanitorialAttendance($attendance);

        if ($proofDenial = CleaningProof::denialMessage($attendance)) {
            return response()->json([
                'message' => $proofDenial,
                'cleaning_proof' => CleaningProof::status($attendance),
                'requires_cleaning_proof' => true,
            ], 422);
        }

        $accounts = app(UserController::class);
        $studentDepartment = $accounts->isStudentOfficer($user)
            ? $accounts->placementOffice($user)
            : trim((string) ($user->profile?->assigned_office ?? ''));

        if ($isJanitorial) {
            $janitorialAuth = $this->authenticateJanitorialToken($request, $user);
            if ($janitorialAuth instanceof \Illuminate\Http\JsonResponse) {
                return $janitorialAuth;
            }
            $validToken = $janitorialAuth['token'];
        } else {
            $validToken = $this->authenticateToken($request, $dutyType, $studentDepartment);
            if ($validToken instanceof \Illuminate\Http\JsonResponse) {
                return $validToken;
            }
        }

        $method = $request->input('method', 'passcode');
        $clockInTime = Carbon::parse($attendance->time_in);
        $now = Carbon::now();
        if ($now->lt($clockInTime)) {
            return response()->json(['message' => 'Clock out must be after you clock in.'], 422);
        }

        $shift = null;
        if ($attendance->schedule_id) {
            $shift = \App\Models\Schedule::query()->find($attendance->schedule_id);
        }
        if (! $shift && ! $isJanitorial) {
            $shift = WorkSchedule::matchingShift($user->id, $clockInTime, 'in')
                ?? WorkSchedule::matchingShift($user->id, $now, 'out');
        }

        $auto = (bool) $request->boolean('auto_clock_out');
        $notes = [];
        $clockOutTime = $now->copy();

        if ($isJanitorial) {
            // Janitorial: free clock-out whenever cleaning is done — fixed 4h overall shift credit.
        } elseif ($auto) {
            if (! $shift || ! DutyHours::withinAutoClockOutWindow($now, $shift)) {
                return response()->json([
                    'message' => 'Automatic clock-out is only available within '
                        .DutyHours::AUTO_CLOCK_OUT_WINDOW_MINUTES
                        .' minutes of your scheduled shift end.',
                    'auto_clock_out_window_minutes' => DutyHours::AUTO_CLOCK_OUT_WINDOW_MINUTES,
                ], 422);
            }
            $scheduledEnd = DutyHours::scheduledEndFor($clockInTime, $shift);
            if (! $scheduledEnd) {
                return response()->json(['message' => 'Could not resolve your scheduled shift end for auto clock-out.'], 422);
            }
            $clockOutTime = $scheduledEnd->copy();
            if ($clockOutTime->lt($clockInTime)) {
                return response()->json(['message' => 'Scheduled end is before your clock-in.'], 422);
            }
            $notes[] = 'Auto clock-out at scheduled end.';
        } else {
            $capped = DutyHours::cappedClockOut($clockInTime, $clockOutTime, $shift);
            if ($capped->lt($clockOutTime)) {
                $notes[] = 'Hours capped at scheduled shift end (overtime not credited).';
                $clockOutTime = $capped;
            }
        }

        $office = $studentDepartment;
        if ($isJanitorial) {
            // Hours stay at 0 until the janitorial leader accepts the photos.
            // Acceptance rewrites clock-out to exactly 4 hours after clock-in.
            $computedHours = 0.0;
            $notes[] = 'Clock-out recorded. Your janitorial supervisor reviews the photos first. The immediate supervisor has the final say before hours are recorded.';
        } else {
            $computedHours = DutyHours::creditedHours($clockInTime, $clockOutTime, $office);
            if (! DutyHours::isLibrary($office)) {
                $lunch = DutyHours::lunchOverlapMinutes($clockInTime, $clockOutTime);
                if ($lunch > 0) {
                    $notes[] = 'Unpaid lunch break deducted (Library has no lunch break).';
                }
            }
        }

        if ($isJanitorial && $computedHours <= 0) {
            $fit = ['allowed' => 0.0, 'capped' => false, 'message' => null];
            $credited = 0.0;
        } else {
            $fit = HourLimits::fitHours($user->id, $computedHours, $clockOutTime, (int) $attendance->id);
            if ($fit['allowed'] <= 0) {
                return response()->json([
                    'message' => $fit['denial'] ?? 'No hours remain under your weekly or monthly limit.',
                    'hour_limits' => HourLimits::status($user->id, $clockOutTime, (int) $attendance->id),
                ], 403);
            }
            $credited = $fit['allowed'];
        }
        $isAnomaly = $attendance->is_anomaly;
        $anomalyReason = $attendance->anomaly_reason;
        if (! $isJanitorial && $computedHours > 8.00) {
            $isAnomaly = true;
            $anomalyReason = ($anomalyReason ? $anomalyReason.' • ' : '').'Extended continuous shifts (Exceeded 8 hours).';
        }
        if ($fit['capped'] && $fit['message']) {
            $isAnomaly = true;
            $anomalyReason = ($anomalyReason ? $anomalyReason.' • ' : '').$fit['message'];
        }

        $task = trim((string) ($attendance->task_description ?? ''));
        if ($notes !== []) {
            $extra = implode(' ', $notes);
            $task = $task === '' ? $extra : ($task.' '.$extra);
        }

        $attendance->update([
            'time_out' => $clockOutTime,
            'computed_hours' => $credited,
            'rendered_hours' => $credited,
            // Keep a decision the janitorial supervisor already made from the photos.
            // Otherwise hours stay pending until they accept the before/after timestamps.
            'status' => $isJanitorial
                ? (in_array(strtolower((string) $attendance->status), ['accepted', 'approved', 'rejected', 'recommended', 'leader_declined', 'awaiting_final'], true)
                    ? $attendance->status
                    : 'pending')
                : 'approved',
            'task_description' => $task !== '' ? $task : null,
            'is_anomaly' => $isAnomaly,
            'anomaly_reason' => $anomalyReason,
        ]);

        $this->notifyCodeOwner($validToken->generated_by, $user->name, $dutyType, $method, true);

        $message = $isJanitorial
            ? 'Clock-out saved. Your janitorial supervisor reviews the surroundings photos first. The immediate supervisor has the final say. If accepted, this entry is recorded as up to '
                .DutyHours::JANITORIAL_FIXED_HOURS.' hours from your clock-in.'
            : 'Verified exit logging saved.';
        if ($notes !== []) {
            $message .= ' '.implode(' ', $notes);
        }
        if ($fit['capped'] && $fit['message']) {
            $message .= ' '.$fit['message'];
        }

        $mailer = app(\App\Services\AccountEventMailer::class);
        if ($isJanitorial) {
            $mailer->janitorialClockOut($user, $attendance->fresh(), $message);
        } else {
            $mailer->clock($user, 'out', $clockOutTime, $message);
        }

        $scheduledEnd = DutyHours::scheduledEndFor($clockInTime, $shift);

        return response()->json([
            'message' => $message,
            'hours_rendered' => $credited,
            'cleaning_proof' => CleaningProof::status($attendance->fresh()),
            'hour_limits' => HourLimits::status($user->id, $clockOutTime),
            'auto_clock_out_window_minutes' => DutyHours::AUTO_CLOCK_OUT_WINDOW_MINUTES,
            'within_auto_clock_out_window' => $shift ? DutyHours::withinAutoClockOutWindow($now, $shift) : false,
            'scheduled_end' => $scheduledEnd?->toIso8601String(),
        ]);
    }

    public function getWorkHourSummary(Request $request)
    {
        $userId = $request->user()->id;
        $records = Attendance::where('user_id', $userId)->latest('time_in')->get();

        $totalRendered = $records->sum(function ($record) {
            return $record->computed_hours > 0
                ? (float) $record->computed_hours
                : (float) ($record->rendered_hours ?? 0);
        });

        $targetHours = \App\Support\WorkRequirement::hoursFor($request->user());
        $dutyDeduction = \App\Models\DisciplinaryRecord::dutyDeductionHours($userId);
        $activityHours = RenderedHours::activityTotal(
            RenderedHours::deltasBetween(Carbon::create(2000, 1, 1), Carbon::now()->endOfDay())[$userId] ?? []
        );
        $credited = max(0, $totalRendered - $dutyDeduction + $activityHours);
        $remainingHours = max(0, $targetHours - $credited);
        $hourLimits = HourLimits::status($userId);
        $openActivity = $records->first(
            fn (Attendance $record) => $record->time_out === null && $record->rendered_hour_event_id
        );

        return response()->json([
            'total_rendered' => round($credited, 2),
            'logged_hours' => round($totalRendered, 2),
            'duty_deduction_hours' => round($dutyDeduction, 2),
            'activity_hours' => round($activityHours, 2),
            'remaining_hours' => round($remainingHours, 2),
            'target_hours' => $targetHours,
            'special_hours_request' => (bool) $request->user()->profile?->special_hours_request,
            'hour_limits' => $hourLimits,
            'open_activity' => $openActivity,
            'history' => $records->filter(fn (Attendance $record) => $this->belongsInRecentLogs($record))->values(),
        ]);
    }

    private function dutyFromToken(DailyToken $token): string
    {
        return $token->type === 'Daily Clock' ? 'Regular' : $token->type;
    }

    /** Regular shift logs, plus meeting activity clock-ins such as devotionals and assemblies. */
    private function belongsInRecentLogs(Attendance $record): bool
    {
        if ($record->rendered_hour_event_id === null || $record->time_out === null) {
            return true;
        }

        $label = strtolower(trim((string) ($record->attendance_type ?: $record->work_type)));

        return str_contains($label, 'meeting');
    }

    /**
     * @return DailyToken|\Illuminate\Http\JsonResponse
     */
    private function authenticateToken(Request $request, ?string $attendanceType, string $studentDepartment)
    {
        if ($studentDepartment === '') {
            return response()->json([
                'message' => 'Your account has no assigned department. Contact your supervisor.',
            ], 422);
        }

        $method = $request->input('method', 'passcode');
        $code = $this->normalizeCode((string) $request->token_code);

        $matched = DailyToken::with('creator.profile')
            ->where('token_code', $code)
            ->first();

        if (!$matched || !$this->tokenIsCurrent($matched)) {
            $expired = $matched && !$this->tokenIsCurrent($matched);
            $message = 'Authentication failed. Invalid or expired token.';
            if ($expired && $matched->channel === 'qr') {
                $message = 'This QR code has expired. Scan the code currently on your supervisor\'s screen.';
            } elseif ($expired && $matched->channel === 'passcode') {
                $message = 'This passcode has expired. Ask your supervisor for the current code.';
            }

            return response()->json([
                'message' => $message,
            ], 422);
        }

        if ($matched->channel !== $method) {
            return response()->json([
                'message' => $matched->channel === 'qr'
                    ? 'This is a QR code. Scan the live code instead of typing it.'
                    : 'This is a passcode. Enter it in the passcode field.',
            ], 422);
        }

        if ($attendanceType !== null) {
            $tokenType = $attendanceType === 'Regular' ? 'Daily Clock' : $attendanceType;
            if ($matched->type !== $tokenType) {
                $dutyLabel = $matched->type === 'Daily Clock' ? 'Regular Duty' : $matched->type;

                return response()->json([
                    'message' => "This code is for {$dutyLabel}. Use the current code for your open shift.",
                ], 422);
            }
        }

        $accounts = app(UserController::class);
        $creator = $matched->creator;
        $supervisorDepartments = $creator ? $accounts->attendanceScopeLabel($creator) : '';
        if ($supervisorDepartments === '') {
            return response()->json(['message' => 'This token is not linked to a valid department.'], 422);
        }

        if (!$accounts->codeCoversOffice($creator, $studentDepartment)) {
            return response()->json([
                'message' => "This code is only valid for {$supervisorDepartments} students. You are assigned to {$studentDepartment}.",
            ], 403);
        }

        return $matched;
    }

    private function notifyCodeOwner(
        ?int $ownerId,
        string $studentName,
        ?string $attendanceType,
        string $method,
        bool $clockedOut
    ): void {
        if (!$ownerId) {
            return;
        }

        $duty = $attendanceType === 'Regular' || $attendanceType === null || $attendanceType === ''
            ? 'regular duty'
            : strtolower($attendanceType);
        $via = $method === 'qr' ? 'QR code' : 'passcode';
        $message = $clockedOut
            ? "{$studentName} clocked out from {$duty} using your {$via}."
            : "{$studentName} clocked in for {$duty} using your {$via}.";

        Notification::create([
            'user_id' => $ownerId,
            'title' => $clockedOut ? 'Student Signed Out' : 'Student Signed In',
            'message' => $message,
        ]);
    }

    /**
     * @return array{token: DailyToken, department: string, departments: list<string>, seconds_remaining: int}|\Illuminate\Http\JsonResponse
     */
    private function issueRotatingToken(Request $request, string $type, string $channel, ?string $description, bool $forceNew)
    {
        $supervisor = $request->user()->load('profile');
        $accounts = app(UserController::class);
        $departments = $accounts->attendanceOffices($supervisor);
        $department = $accounts->attendanceScopeLabel($supervisor);
        $scopeKey = $accounts->attendanceScopeKey($supervisor);

        if ($department === '' || $scopeKey === '') {
            $action = $channel === 'qr' ? 'showing a QR code' : 'generating a passcode';

            return response()->json([
                'message' => "Your account has no assigned department. Contact an administrator before {$action}.",
            ], 422);
        }

        $issue = function () use ($type, $channel, $description, $forceNew, $supervisor, $accounts, $scopeKey) {
            if (!$forceNew) {
                $live = $this->liveScopeToken($type, $channel, $scopeKey, $accounts);
                if ($live && $this->tokenIsCurrent($live) && $live->expires_at->getTimestamp() - Carbon::now()->getTimestamp() > 2) {
                    return $live;
                }
            }

            $this->forgetScopeTokens($type, $channel, $scopeKey, $accounts);

            return DailyToken::create([
                'token_code' => $channel === 'qr'
                    ? strtoupper(bin2hex(random_bytes(16)))
                    : strtoupper(substr(bin2hex(random_bytes(4)), 0, 6)),
                'type' => $type,
                'channel' => $channel,
                'description' => $description,
                'generated_by' => $supervisor->id,
                'expires_at' => Carbon::now()->addSeconds(self::ACCESS_TTL_SECONDS),
            ]);
        };

        $lockName = 'attendance-'.$channel.':'.md5($scopeKey.'|'.$type);

        try {
            $token = Cache::lock($lockName, 8)->block(5, $issue);
        } catch (LockTimeoutException) {
            $token = $this->liveScopeToken($type, $channel, $scopeKey, $accounts) ?? $issue();
        }

        return [
            'token' => $token,
            'department' => $department,
            'departments' => $departments,
            'seconds_remaining' => max(1, $token->expires_at->getTimestamp() - Carbon::now()->getTimestamp()),
        ];
    }

    private function tokenIsCurrent(DailyToken $token): bool
    {
        $now = Carbon::now();
        if ($token->expires_at->lte($now)) {
            return false;
        }

        return !$token->created_at || $token->created_at->copy()->addSeconds(self::ACCESS_TTL_SECONDS)->gt($now);
    }

    private function forgetScopeTokens(string $type, string $channel, string $scopeKey, UserController $accounts): void
    {
        $ids = $this->scopeIssuerIds($accounts, $scopeKey);
        if ($ids === []) {
            return;
        }

        DailyToken::query()
            ->where('type', $type)
            ->where('channel', $channel)
            ->whereIn('generated_by', $ids)
            ->where('expires_at', '>', Carbon::now())
            ->update(['expires_at' => Carbon::now()]);
    }

    /**
     * Accounts that share one live passcode. Resolved from the small staff
     * list so a code refresh does not scan every historical token.
     *
     * @return list<int>
     */
    private function scopeIssuerIds(UserController $accounts, string $scopeKey): array
    {
        if ($scopeKey === '') {
            return [];
        }

        if (isset($this->scopeIssuerIds[$scopeKey])) {
            return $this->scopeIssuerIds[$scopeKey];
        }

        $ids = User::query()
            ->with('profile')
            ->whereIn('role', ['Supervisor', 'WSPO Staff', 'Super Admin'])
            ->get()
            ->filter(fn (User $user) => $accounts->attendanceScopeKey($user) === $scopeKey)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        return $this->scopeIssuerIds[$scopeKey] = $ids;
    }

    private function clockInActivity(Request $request, DailyToken $token)
    {
        $method = $request->input('method', 'passcode');
        if ($token->channel !== $method) {
            return response()->json([
                'message' => $token->channel === 'qr'
                    ? 'This is a QR code. Scan the live code instead of typing it.'
                    : 'This is a passcode. Enter it in the passcode field.',
            ], 422);
        }

        if (!$this->tokenIsCurrent($token)) {
            return response()->json(['message' => 'This QR code has expired. Scan the code currently on the WSPO screen.'], 422);
        }

        $user = $request->user()->load('profile');
        $accounts = app(UserController::class);
        if ($user->role !== 'Student' && !$accounts->isStudentOfficer($user)) {
            return response()->json(['message' => 'Only a working student can clock in for this activity.'], 403);
        }

        $suspension = \App\Models\DisciplinaryRecord::activeSuspension($user->id);
        if ($suspension) {
            return response()->json(['message' => $suspension->suspensionNotice()], 403);
        }

        $tokenEvent = RenderedHourEvent::find($token->event_id);
        if (!$tokenEvent || !$tokenEvent->usesAttendance()) {
            return response()->json(['message' => 'This QR code is no longer linked to an activity.'], 422);
        }

        if ($tokenEvent->kind === RenderedHourEvent::ASSEMBLY) {
            $studentYear = (int) ($user->profile?->year_level ?? 0);
            $rep = AssemblyYearRepresentative::forYear($studentYear);
            if (! $rep || (int) $token->generated_by !== (int) $rep->user_id) {
                return response()->json([
                    'message' => 'Scan the passcode or QR from your year-level assembly representative only.',
                    'requires_year_representative' => true,
                    'year_level' => $studentYear ?: null,
                ], 403);
            }
        }

        $now = Carbon::now();
        $event = $this->resolveActivityEventForStudent($tokenEvent, $user);
        if (!$event) {
            return response()->json(['message' => 'You are not assigned to this activity.'], 422);
        }

        if (!$now->isSameDay($tokenEvent->event_date)) {
            return response()->json([
                'message' => 'This QR code is for '.$tokenEvent->event_date->toFormattedDateString().'.',
            ], 422);
        }

        $label = RenderedHourEvent::KINDS[$event->kind]['label'] ?? $event->kind;
        if (in_array($event->kind, [RenderedHourEvent::DEVOTIONAL, RenderedHourEvent::ASSEMBLY], true)) {
            $start = $event->officialStart();
            if ($start) {
                $cutoff = $start->copy()->addMinutes($event->windowMinutes());
                if ($now->lt($start) || $now->gt($cutoff)) {
                    return response()->json([
                        'message' => $label.' attendance is only accepted from '.$start->format('g:i A').' to '.$cutoff->format('g:i A').'.',
                    ], 422);
                }
            }
        }

        $existing = RenderedHourEntry::query()
            ->where('event_id', $event->id)
            ->where('user_id', $user->id)
            ->whereNotNull('status')
            ->first();
        if ($existing && !in_array($existing->status, [RenderedHourEntry::TIMED_IN, RenderedHourEntry::SELECTED], true)) {
            return response()->json(['message' => 'You already clocked in for this activity.'], 422);
        }

        $provisional = $event->statusAt($now);
        $hours = number_format((float) $event->hours, 2);
        $message = $provisional === 'late'
            ? 'Clock-in saved as late. Time out when you leave. No hours will be added.'
            : "Clock-in accepted. Time out with this activity's passcode or QR code to receive {$hours} hours.";

        try {
            $attendance = Cache::lock('attendance-activity:'.$user->id, 10)->block(5, function () use ($user, $event, $token, $now, $label, $message, $method) {
                return DB::transaction(function () use ($user, $event, $token, $now, $label, $message, $method) {
                    $openActivity = Attendance::query()
                        ->where('user_id', $user->id)
                        ->whereNull('time_out')
                        ->whereNotNull('rendered_hour_event_id')
                        ->first();
                    if ($openActivity) {
                        $sameActivity = in_array((int) $openActivity->rendered_hour_event_id, $this->siblingActivityEventIds($event), true);
                        if ($sameActivity) {
                            return ['clock_out' => $openActivity];
                        }

                        return ['error' => response()->json([
                            'message' => 'Time out of '.($openActivity->attendance_type ?: 'this activity').' before clocking in for another activity.',
                        ], 422)];
                    }

                    $record = Attendance::create([
                        'user_id' => $user->id,
                        'time_in' => $now,
                        'attendance_type' => $label,
                        'check_in_method' => $method,
                        'code_owner_id' => $token->generated_by,
                        'work_type' => $label,
                        'rendered_hours' => 0,
                        'computed_hours' => 0,
                        'activity_hours' => 0,
                        'rendered_hour_event_id' => $event->id,
                        'status' => 'pending',
                        'task_description' => $message,
                    ]);

                    $entry = RenderedHourEntry::firstOrNew([
                        'event_id' => $event->id,
                        'user_id' => $user->id,
                    ]);
                    $entry->status = RenderedHourEntry::TIMED_IN;
                    $entry->scanned_at = $now;
                    $entry->hours_delta = 0;
                    $entry->attendance_id = $record->id;
                    $entry->save();

                    return ['attendance' => $record];
                });
            });
        } catch (LockTimeoutException) {
            return response()->json(['message' => 'Clock-in is busy. Wait a moment and try again.'], 429);
        }

        if (isset($attendance['error'])) {
            return $attendance['error'];
        }
        if (isset($attendance['clock_out'])) {
            return $this->clockOutActivity($request, $attendance['clock_out'], $token);
        }
        $attendance = $attendance['attendance'];

        $this->notifyCodeOwner($token->generated_by, $user->name, $label, $method, false);
        app(\App\Services\AccountEventMailer::class)->clock($user, 'in', $now, $message);

        return response()->json([
            'message' => $message,
            'activity' => true,
            'timed_in' => true,
            'status' => RenderedHourEntry::TIMED_IN,
            'hours_delta' => 0,
            'attendance' => $attendance,
            'hour_limits' => HourLimits::status($user->id, $now),
        ]);
    }

    /**
     * Close an open activity session. The fixed activity credit is applied here,
     * and only when the original clock-in was inside the on-time window.
     */
    private function clockOutActivity(Request $request, Attendance $attendance, ?DailyToken $token = null)
    {
        $method = $request->input('method', 'passcode');
        if (!$token) {
            $token = $this->matchedToken((string) $request->token_code);
            if (!$token?->event_id) {
                return response()->json([
                    'message' => "Use this activity's passcode or QR code to time out.",
                ], 422);
            }
            if ($token->channel !== $method) {
                return response()->json([
                    'message' => $token->channel === 'qr'
                        ? 'This is a QR code. Scan the live code instead of typing it.'
                        : 'This is a passcode. Enter it in the passcode field.',
                ], 422);
            }
            if (!$this->tokenIsCurrent($token)) {
                return response()->json([
                    'message' => 'This code has expired. Use the code currently on the activity screen.',
                ], 422);
            }
        }

        $event = RenderedHourEvent::find($attendance->rendered_hour_event_id);
        $tokenEvent = $token->event_id ? RenderedHourEvent::find($token->event_id) : null;
        $allowedIds = $tokenEvent ? $this->siblingActivityEventIds($tokenEvent) : [];
        if (!$event || !in_array((int) $event->id, $allowedIds, true)) {
            return response()->json([
                'message' => "Use this activity's passcode or QR code to time out.",
            ], 422);
        }

        // Attach event so CleaningProof::requiredFor can detect daily_cleaning without an extra query.
        $attendance->setRelation('renderedHourEvent', $event);
        if ($proofDenial = CleaningProof::denialMessage($attendance)) {
            return response()->json([
                'message' => $proofDenial,
                'cleaning_proof' => CleaningProof::status($attendance),
                'requires_cleaning_proof' => true,
            ], 422);
        }

        if ($event->kind === RenderedHourEvent::ASSEMBLY) {
            $student = $attendance->user()->with('profile')->first() ?? request()->user()?->loadMissing('profile');
            $studentYear = (int) ($student?->profile?->year_level ?? 0);
            $rep = AssemblyYearRepresentative::forYear($studentYear);
            if (! $rep || (int) $token->generated_by !== (int) $rep->user_id) {
                return response()->json([
                    'message' => 'Time out with the passcode or QR from your year-level assembly representative only.',
                    'requires_year_representative' => true,
                ], 403);
            }
        }

        $entry = RenderedHourEntry::query()
            ->where('event_id', $event->id)
            ->where('user_id', $attendance->user_id)
            ->first();
        if ($entry && $entry->status === 'absent') {
            return response()->json(['message' => 'This activity was marked absent, so it cannot be timed out.'], 422);
        }
        if ($entry && $entry->status && $entry->status !== RenderedHourEntry::TIMED_IN) {
            return response()->json(['message' => 'You already finished this activity.'], 422);
        }

        $clockIn = Carbon::parse($attendance->time_in);
        $status = $event->statusAt($clockIn);
        $delta = $event->deltaFor($status);
        $now = Carbon::now();
        if ($delta > 0) {
            $fit = HourLimits::fitHours((int) $attendance->user_id, (float) $delta, $clockIn);
            if ($fit['allowed'] < (float) $delta) {
                return response()->json([
                    'message' => $fit['denial']
                        ?? ('This activity would add '
                            . HourLimits::hoursLabel((float) $delta)
                            . ' hours, but only '
                            . HourLimits::hoursLabel($fit['allowed'])
                            . ' hours remain under your weekly or monthly limit.'),
                    'hour_limits' => HourLimits::status((int) $attendance->user_id, $clockIn),
                ], 403);
            }
        }

        $hours = number_format((float) $event->hours, 2);
        $label = RenderedHourEvent::KINDS[$event->kind]['label'] ?? $event->kind;
        if ($now->lt($clockIn)) {
            return response()->json(['message' => 'Clock out must be after you clock in.'], 422);
        }
        $clockOutTime = $now;
        $message = $status === 'late'
            ? 'Timed out. No hours were added or deducted.'
            : "Timed out. {$hours} hours were added to your hours rendered.";

        DB::transaction(function () use ($attendance, $event, $entry, $clockOutTime, $status, $delta, $message) {
            $attendance->update([
                'time_out' => $clockOutTime,
                'activity_hours' => $delta,
                'status' => 'approved',
                'task_description' => $message,
                'is_anomaly' => $status === 'late',
                'anomaly_reason' => $status === 'late'
                    ? 'Clocked in after the on-time window. No hours were added or deducted.'
                    : null,
            ]);

            $row = $entry ?: new RenderedHourEntry([
                'event_id' => $event->id,
                'user_id' => $attendance->user_id,
            ]);
            $row->status = $status;
            $row->scanned_at = $row->scanned_at ?: $attendance->time_in;
            $row->hours_delta = $delta;
            $row->attendance_id = $attendance->id;
            $row->save();
        });

        $user = $request->user();
        $this->notifyCodeOwner($token->generated_by, $user->name, $label, $method, true);
        app(\App\Services\AccountEventMailer::class)->clock($user, 'out', $clockOutTime, $message);

        return response()->json([
            'message' => $message,
            'activity' => true,
            'timed_out' => true,
            'status' => $status,
            'hours_delta' => $delta,
            'hours_rendered' => $delta,
            'attendance' => $attendance->fresh(),
            'hour_limits' => HourLimits::status((int) $attendance->user_id, $clockOutTime),
        ]);
    }

    /**
     * Students on this event, plus siblings for the same group/date/kind (legacy year-scoped rows).
     *
     * @return list<int>
     */
    private function activityEligibleIds(RenderedHourEvent $event): array
    {
        $ids = $event->assignedUserIds();
        foreach ($this->siblingActivityEvents($event) as $sibling) {
            if ((int) $sibling->id === (int) $event->id) {
                continue;
            }
            $ids = array_merge($ids, $sibling->assignedUserIds());
        }

        if ($event->usesAttendance() && $event->kind !== RenderedHourEvent::SPECIAL) {
            $ids = array_merge($ids, app(UserController::class)->wspoSecretaryUserIds());
        }

        return array_values(array_unique(array_map('intval', $ids)));
    }

    /**
     * Prefer the event that already lists the student. Fall back to any sibling or the
     * scanned event when the student belongs to the same cleaning group.
     */
    private function resolveActivityEventForStudent(RenderedHourEvent $event, \App\Models\User $user): ?RenderedHourEvent
    {
        if (in_array((int) $user->id, $event->assignedUserIds(), true)) {
            return $event;
        }

        foreach ($this->siblingActivityEvents($event) as $sibling) {
            if (in_array((int) $user->id, $sibling->assignedUserIds(), true)) {
                return $sibling;
            }
        }

        if ($event->group_id && $this->studentInGroup((int) $user->id, (int) $event->group_id)) {
            return $event;
        }

        // Elected WSPO Secretary may scan campus activities even when not on the group roster.
        if ($event->usesAttendance()
            && $event->kind !== RenderedHourEvent::SPECIAL
            && app(UserController::class)->isWspoSecretary($user)) {
            return $event;
        }

        return null;
    }

    /**
     * @return \Illuminate\Support\Collection<int, RenderedHourEvent>
     */
    private function siblingActivityEvents(RenderedHourEvent $event)
    {
        if (!$event->group_id) {
            return collect([$event]);
        }

        return RenderedHourEvent::query()
            ->where('kind', $event->kind)
            ->where('group_id', $event->group_id)
            ->whereDate('event_date', $event->event_date)
            ->get();
    }

    /**
     * @return list<int>
     */
    private function siblingActivityEventIds(RenderedHourEvent $event): array
    {
        return $this->siblingActivityEvents($event)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function studentInGroup(int $userId, int $groupId): bool
    {
        return DB::table('daily_cleaning_group_members')
            ->where('group_id', $groupId)
            ->where('user_id', $userId)
            ->exists();
    }

    private function canIssueActivityCode(\App\Models\User $issuer, RenderedHourEvent $event): bool
    {
        $accounts = app(UserController::class);
        if ($event->kind === RenderedHourEvent::ASSEMBLY) {
            // Assembly: year representatives issue codes (rep-only for student scanning).
            return $this->isAssemblyYearRepresentative($issuer, $event);
        }

        if ($event->kind === RenderedHourEvent::DEVOTIONAL) {
            return $accounts->canCheckActivityAttendance($issuer)
                || $this->isAssemblyYearRepresentative($issuer, $event);
        }

        return $accounts->canCheckActivityAttendance($issuer) || $accounts->isYearLeaderFor($issuer, $event);
    }

    private function isAssemblyYearRepresentative(\App\Models\User $issuer, ?RenderedHourEvent $event = null): bool
    {
        if ($issuer->role !== 'Student') {
            return false;
        }

        $rep = AssemblyYearRepresentative::forUser((int) $issuer->id);
        if (! $rep) {
            return false;
        }

        if (! $event) {
            return true;
        }

        if ($event->year_level) {
            return (int) $event->year_level === (int) $rep->year_level;
        }

        // Campus-wide assembly event: any year rep may issue a year-scoped code.
        return true;
    }

    /**
     * @return array{token: DailyToken, seconds_remaining: int}
     */
    private function issueActivityToken(\App\Models\User $issuer, RenderedHourEvent $event, string $channel): array
    {
        $siblingIds = $this->siblingActivityEventIds($event);
        $lockKey = 'activity-'.$channel.':'.md5((implode(',', $siblingIds) ?: (string) $event->id).'|'.$issuer->id);

        $issue = function () use ($issuer, $event, $channel, $siblingIds) {
            $live = DailyToken::query()
                ->whereIn('event_id', $siblingIds)
                ->where('channel', $channel)
                ->where('generated_by', $issuer->id)
                ->where('expires_at', '>', Carbon::now())
                ->where('created_at', '>', Carbon::now()->subSeconds(self::ACCESS_TTL_SECONDS))
                ->orderByDesc('id')
                ->first();

            if ($live && $this->tokenIsCurrent($live) && $live->expires_at->getTimestamp() - Carbon::now()->getTimestamp() > 2) {
                return $live;
            }

            DailyToken::query()
                ->whereIn('event_id', $siblingIds)
                ->where('channel', $channel)
                ->where('generated_by', $issuer->id)
                ->update(['expires_at' => Carbon::now()]);

            return DailyToken::create([
                'token_code' => $channel === 'qr'
                    ? strtoupper(bin2hex(random_bytes(16)))
                    : strtoupper(substr(bin2hex(random_bytes(4)), 0, 6)),
                'type' => RenderedHourEvent::KINDS[$event->kind]['label'] ?? 'Activity',
                'channel' => $channel,
                'description' => $event->title,
                'event_id' => $event->id,
                'generated_by' => $issuer->id,
                'expires_at' => Carbon::now()->addSeconds(self::ACCESS_TTL_SECONDS),
            ]);
        };

        try {
            $token = Cache::lock($lockKey, 8)->block(5, $issue);
        } catch (LockTimeoutException) {
            $token = $issue();
        }

        return [
            'token' => $token,
            'seconds_remaining' => max(1, $token->expires_at->getTimestamp() - Carbon::now()->getTimestamp()),
        ];
    }

    private function matchedToken(string $raw): ?DailyToken
    {
        return DailyToken::query()->where('token_code', $this->normalizeCode($raw))->first();
    }

    private function normalizeCode(string $raw): string
    {
        $code = strtoupper(trim($raw));
        if (str_starts_with($code, 'THRM1A|')) {
            return substr($code, 7);
        }
        if (str_starts_with($code, 'THRM1|')) {
            return substr($code, 6);
        }

        return $code;
    }

    private function liveScopeToken(string $type, string $channel, string $scopeKey, UserController $accounts): ?DailyToken
    {
        $ids = $this->scopeIssuerIds($accounts, $scopeKey);
        if ($ids === []) {
            return null;
        }

        return DailyToken::query()
            ->where('type', $type)
            ->where('channel', $channel)
            ->whereIn('generated_by', $ids)
            ->where('expires_at', '>', Carbon::now())
            ->where('created_at', '>', Carbon::now()->subSeconds(self::ACCESS_TTL_SECONDS))
            ->orderByDesc('id')
            ->first();
    }

    private function issueJanitorialTokenResponse(Request $request, string $channel)
    {
        $user = $request->user()->loadMissing('profile');
        if ($user->role !== 'Student') {
            return response()->json(['message' => 'Only a janitorial student supervisor can show this code.'], 403);
        }

        $groups = JanitorialGroup::query()
            ->where('supervisor_user_id', $user->id)
            ->orderBy('department')
            ->get();
        if ($groups->isEmpty()) {
            return response()->json(['message' => 'You are not assigned as a janitorial group supervisor.'], 403);
        }

        $groupId = (int) $request->query('group_id', $request->input('group_id', 0));
        if ($groupId <= 0 && $groups->count() === 1) {
            $groupId = (int) $groups->first()->id;
        }
        $group = $groups->firstWhere('id', $groupId);
        if (! $group) {
            return response()->json([
                'message' => 'Choose which group to show a code for (group_id).',
                'groups' => $groups->map(fn (JanitorialGroup $row) => [
                    'id' => $row->id,
                    'department' => $row->department,
                    'name' => $row->name,
                    'area' => $row->area,
                ])->values()->all(),
            ], 422);
        }

        $scopeKey = 'janitorial-group:'.$group->id;
        $issue = function () use ($channel, $user, $scopeKey) {
            $live = DailyToken::query()
                ->where('type', self::JANITORIAL_TOKEN_TYPE)
                ->where('channel', $channel)
                ->where('generated_by', $user->id)
                ->where('description', $scopeKey)
                ->where('expires_at', '>', Carbon::now())
                ->where('created_at', '>', Carbon::now()->subSeconds(self::ACCESS_TTL_SECONDS))
                ->orderByDesc('id')
                ->first();
            if ($live && $this->tokenIsCurrent($live) && $live->expires_at->getTimestamp() - Carbon::now()->getTimestamp() > 2) {
                return $live;
            }

            DailyToken::query()
                ->where('type', self::JANITORIAL_TOKEN_TYPE)
                ->where('channel', $channel)
                ->where('generated_by', $user->id)
                ->where('description', $scopeKey)
                ->update(['expires_at' => Carbon::now()]);

            return DailyToken::create([
                'token_code' => $channel === 'qr'
                    ? strtoupper(bin2hex(random_bytes(16)))
                    : strtoupper(substr(bin2hex(random_bytes(4)), 0, 6)),
                'type' => self::JANITORIAL_TOKEN_TYPE,
                'channel' => $channel,
                'description' => $scopeKey,
                'generated_by' => $user->id,
                'expires_at' => Carbon::now()->addSeconds(self::ACCESS_TTL_SECONDS),
            ]);
        };

        try {
            $token = Cache::lock('attendance-'.$channel.':'.md5($scopeKey), 8)->block(5, $issue);
        } catch (LockTimeoutException) {
            $token = $issue();
        }

        $seconds = max(1, $token->expires_at->getTimestamp() - Carbon::now()->getTimestamp());
        $payload = [
            'expires_at' => $token->expires_at,
            'seconds_remaining' => $seconds,
            'ttl_seconds' => self::ACCESS_TTL_SECONDS,
            'type' => self::JANITORIAL_TOKEN_TYPE,
            'department' => $group->department,
            'fixed_hours' => DutyHours::JANITORIAL_FIXED_HOURS,
            'group' => [
                'id' => $group->id,
                'name' => $group->name,
                'area' => $group->area,
                'department' => $group->department,
            ],
            'supervised_groups' => $groups->map(fn (JanitorialGroup $row) => [
                'id' => $row->id,
                'department' => $row->department,
                'name' => $row->name,
                'area' => $row->area,
            ])->values()->all(),
        ];

        if ($channel === 'qr') {
            $payload['payload'] = 'THRM1|'.$token->token_code;
        } else {
            $payload['token_code'] = $token->token_code;
        }

        return response()->json($payload);
    }

    private function clockInJanitorial(Request $request)
    {
        $user = $request->user()->load('profile');
        $suspension = \App\Models\DisciplinaryRecord::activeSuspension($user->id);
        if ($suspension) {
            return response()->json(['message' => $suspension->suspensionNotice()], 403);
        }

        $activeRecord = Attendance::where('user_id', $user->id)
            ->whereNull('time_out')
            ->whereNull('rendered_hour_event_id')
            ->first();
        if ($activeRecord) {
            return response()->json(['message' => 'You are already clocked in. Clock out of this shift before starting the next one.'], 422);
        }

        $auth = $this->authenticateJanitorialToken($request, $user);
        if ($auth instanceof \Illuminate\Http\JsonResponse) {
            return $auth;
        }
        /** @var array{token: DailyToken, group: JanitorialGroup} $auth */
        $validToken = $auth['token'];
        $group = $auth['group'];

        $now = Carbon::now();
        $limitDenial = HourLimits::jsonDenial($user->id, $now);
        if ($limitDenial) {
            return $limitDenial;
        }

        if ($windowMessage = JanitorialWindows::rejectionMessage((int) $user->id, $now)) {
            return response()->json(['message' => $windowMessage], 422);
        }

        $method = $request->input('method', 'passcode');
        try {
            $attendance = Cache::lock('attendance-open:'.$user->id, 10)->block(5, function () use ($user, $now, $group, $method, $validToken) {
                $stillOpen = Attendance::where('user_id', $user->id)
                    ->whereNull('time_out')
                    ->whereNull('rendered_hour_event_id')
                    ->first();
                if ($stillOpen) {
                    return null;
                }

                return Attendance::create([
                    'user_id' => $user->id,
                    'time_in' => $now,
                    'attendance_type' => 'Janitorial',
                    'work_type' => 'Janitorial',
                    'janitorial_group_id' => $group->id,
                    'janitorial_area' => $group->area,
                    'verification_code_used' => $method === 'qr' ? null : $validToken->token_code,
                    'check_in_method' => $method,
                    'code_owner_id' => $validToken->generated_by,
                    'task_description' => 'Janitorial duty — '.$group->area.' ('.$group->department.')',
                    'status' => 'pending',
                    'is_anomaly' => false,
                    'anomaly_reason' => null,
                ]);
            });
        } catch (LockTimeoutException) {
            return response()->json(['message' => 'Clock-in is busy. Wait a moment and try again.'], 429);
        }

        if (! $attendance) {
            return response()->json(['message' => 'You are already clocked in. Clock out of this shift before starting the next one.'], 422);
        }

        $this->notifyCodeOwner($validToken->generated_by, $user->name, 'Janitorial', $method, false);
        app(\App\Services\AccountEventMailer::class)->clock($user, 'in', $now, 'Your janitorial clock-in for '.$group->area.' was recorded.');

        return response()->json([
            'message' => 'Janitorial clock-in verified. Photograph your surroundings now, with the date and time on the photo. You can clock out anytime, and you must take one last photo before clock-out. Your janitorial supervisor reviews the entry first. The immediate supervisor has the final say. If accepted, it is recorded as up to '
                .DutyHours::JANITORIAL_FIXED_HOURS.' hours from this clock-in.',
            'attendance' => $attendance,
            'cleaning_proof' => CleaningProof::status($attendance),
            'hour_limits' => HourLimits::status($user->id, $now),
            'janitorial' => [
                'group_id' => $group->id,
                'group_name' => $group->name,
                'department' => $group->department,
                'area' => $group->area,
                'fixed_hours' => DutyHours::JANITORIAL_FIXED_HOURS,
            ],
        ]);
    }

    /**
     * @return array{token: DailyToken, group: JanitorialGroup}|\Illuminate\Http\JsonResponse
     */
    private function authenticateJanitorialToken(Request $request, \App\Models\User $student)
    {
        $method = $request->input('method', 'passcode');
        $code = $this->normalizeCode((string) $request->token_code);
        $matched = DailyToken::with('creator.profile')->where('token_code', $code)->first();

        if (! $matched || ! $this->tokenIsCurrent($matched) || $matched->type !== self::JANITORIAL_TOKEN_TYPE) {
            $expired = $matched && ! $this->tokenIsCurrent($matched);
            $message = 'Authentication failed. Invalid or expired janitorial token.';
            if ($expired && $matched->channel === 'qr') {
                $message = 'This QR code has expired. Scan the code currently on your janitorial supervisor\'s screen.';
            } elseif ($expired && $matched->channel === 'passcode') {
                $message = 'This passcode has expired. Ask your janitorial supervisor for the current code.';
            }

            return response()->json(['message' => $message], 422);
        }

        if ($matched->channel !== $method) {
            return response()->json([
                'message' => $matched->channel === 'qr'
                    ? 'This is a QR code. Scan the live code instead of typing it.'
                    : 'This is a passcode. Enter it in the passcode field.',
            ], 422);
        }

        $group = $this->janitorialGroupFromToken($matched);
        if (! $group || ! $group->isSupervisedBy((int) $matched->generated_by)) {
            return response()->json(['message' => 'This janitorial code is not linked to an active group.'], 422);
        }

        if (! \App\Models\JanitorialLeader::isOnDuty((int) $group->supervisor_user_id)) {
            return response()->json([
                'message' => 'Your janitorial leader is marked absent, so a code cannot be used. Submit offline attendance with your time in and before and after photos that show the date and time.',
            ], 422);
        }

        if (! $group->includesStudent((int) $student->id)) {
            return response()->json([
                'message' => 'This code is only for members of '.$group->name.' ('.$group->area.').',
            ], 403);
        }

        return ['token' => $matched, 'group' => $group];
    }

    private function janitorialGroupFromToken(DailyToken $token): ?JanitorialGroup
    {
        if (preg_match('/^janitorial-group:(\d+)$/', (string) $token->description, $matches)) {
            return JanitorialGroup::query()->find((int) $matches[1]);
        }

        return JanitorialGroup::query()->where('supervisor_user_id', $token->generated_by)->first();
    }
}
