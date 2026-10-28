<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\RenderedHourEntry;
use App\Models\RenderedHourEvent;
use App\Support\HourLimits;
use App\Support\RenderedHours;
use App\Support\WorkSchedule;
use App\Support\SuperAdminAudit;
use App\Models\DailyToken;
use App\Models\Notification;
use Carbon\Carbon;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AdvancedAttendanceController extends Controller
{
    /** Passcodes and live QR codes rotate on this interval so a captured code cannot be reused. */
    public const ACCESS_TTL_SECONDS = 30;

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
        ]);
    }

    public function getAnomalyLogs(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);

        $query = Attendance::query()
            ->visibleTo($user->role)
            ->where('is_anomaly', true);

        if ($user->role === 'Supervisor' || $accounts->isWspoDepartmentSupervisor($user)) {
            $areas = $accounts->supervisedOfficeAreas($user);
            if ($areas === []) {
                $query->whereRaw('0 = 1');
            } else {
                $query->whereHas('user.profile', function ($profile) use ($areas) {
                    $profile->whereIn('assigned_office', $areas);
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
            return response()->json([
                'message' => 'Only the WSPO coordinator, secretary, president, or this year level\'s leader can issue these QR codes.',
            ], 403);
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
            return response()->json([
                'message' => 'Only the WSPO coordinator, secretary, president, or this year level\'s leader can issue this passcode.',
            ], 403);
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

        $user = $request->user()->load('profile');

        $activeRecord = Attendance::where('user_id', $user->id)
            ->whereNull('time_out')
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

        $studentDepartment = trim((string) ($user->profile?->assigned_office ?? ''));
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

        $attendance = Attendance::create([
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

        $this->notifyCodeOwner($validToken->generated_by, $user->name, $attendanceType, $method, false);

        return response()->json([
            'message' => 'Verified entry approved!',
            'attendance' => $attendance,
            'hour_limits' => HourLimits::status($user->id, $now),
        ]);
    }

    public function secureClockOut(Request $request, $id)
    {
        $request->validate([
            'token_code' => 'required|string|max:80',
            'method' => 'nullable|in:passcode,qr',
        ]);

        $user = $request->user()->load('profile');
        $attendance = Attendance::where('id', $id)
            ->where('user_id', $user->id)
            ->firstOrFail();

        if ($attendance->time_out) {
            return response()->json(['message' => 'Shift segment already terminated.'], 422);
        }

        $studentDepartment = trim((string) ($user->profile?->assigned_office ?? ''));
        $dutyType = $attendance->attendance_type ?: ($attendance->work_type ?: 'Regular');
        $validToken = $this->authenticateToken($request, $dutyType, $studentDepartment);
        if ($validToken instanceof \Illuminate\Http\JsonResponse) {
            return $validToken;
        }

        $method = $request->input('method', 'passcode');
        $clockOutTime = Carbon::now();
        $scheduleDenial = WorkSchedule::denialMessage($user->id, $clockOutTime, 'out');
        if ($scheduleDenial) {
            return response()->json(['message' => $scheduleDenial], 403);
        }

        $clockInTime = Carbon::parse($attendance->time_in);
        $totalMinutes = $clockInTime->diffInMinutes($clockOutTime);
        $computedHours = round($totalMinutes / 60, 2);
        $fit = HourLimits::fitHours($user->id, $computedHours, $clockOutTime, (int) $attendance->id);
        if ($fit['allowed'] <= 0) {
            return response()->json([
                'message' => $fit['denial'] ?? 'No hours remain under your weekly or monthly limit.',
                'hour_limits' => HourLimits::status($user->id, $clockOutTime, (int) $attendance->id),
            ], 403);
        }

        $credited = $fit['allowed'];
        $isAnomaly = $attendance->is_anomaly;
        $anomalyReason = $attendance->anomaly_reason;
        if ($computedHours > 8.00) {
            $isAnomaly = true;
            $anomalyReason = ($anomalyReason ? $anomalyReason . ' • ' : '') . 'Extended continuous shifts (Exceeded 8 hours).';
        }
        if ($fit['capped'] && $fit['message']) {
            $isAnomaly = true;
            $anomalyReason = ($anomalyReason ? $anomalyReason . ' • ' : '') . $fit['message'];
        }

        $attendance->update([
            'time_out' => $clockOutTime,
            'computed_hours' => $credited,
            'rendered_hours' => $credited,
            'is_anomaly' => $isAnomaly,
            'anomaly_reason' => $anomalyReason,
        ]);

        $this->notifyCodeOwner($validToken->generated_by, $user->name, $dutyType, $method, true);

        $message = 'Verified exit logging saved.';
        if ($fit['capped'] && $fit['message']) {
            $message .= ' ' . $fit['message'];
        }

        return response()->json([
            'message' => $message,
            'hours_rendered' => $credited,
            'hour_limits' => HourLimits::status($user->id, $clockOutTime),
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

        $targetHours = 100.00;
        $dutyDeduction = \App\Models\DisciplinaryRecord::dutyDeductionHours($userId);
        $activityHours = RenderedHours::activityTotal(
            RenderedHours::deltasBetween(Carbon::create(2000, 1, 1), Carbon::now()->endOfDay())[$userId] ?? []
        );
        $credited = max(0, $totalRendered - $dutyDeduction + $activityHours);
        $remainingHours = max(0, $targetHours - $credited);
        $hourLimits = HourLimits::status($userId);

        return response()->json([
            'total_rendered' => round($credited, 2),
            'logged_hours' => round($totalRendered, 2),
            'duty_deduction_hours' => round($dutyDeduction, 2),
            'activity_hours' => round($activityHours, 2),
            'remaining_hours' => round($remainingHours, 2),
            'target_hours' => $targetHours,
            'hour_limits' => $hourLimits,
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
        if ($record->rendered_hour_event_id === null) {
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
        $supervisorDepartment = $creator ? $accounts->attendanceOffice($creator) : '';
        if ($supervisorDepartment === '') {
            return response()->json(['message' => 'This token is not linked to a valid department.'], 422);
        }

        if (!$accounts->officesMatch($supervisorDepartment, $studentDepartment)) {
            return response()->json([
                'message' => "This code is only valid for {$supervisorDepartment} students. You are assigned to {$studentDepartment}.",
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
     * @return array{token: DailyToken, department: string, seconds_remaining: int}|\Illuminate\Http\JsonResponse
     */
    private function issueRotatingToken(Request $request, string $type, string $channel, ?string $description, bool $forceNew)
    {
        $supervisor = $request->user()->load('profile');
        $accounts = app(UserController::class);
        $department = $accounts->attendanceOffice($supervisor);

        if ($department === '') {
            $action = $channel === 'qr' ? 'showing a QR code' : 'generating a passcode';

            return response()->json([
                'message' => "Your account has no assigned department. Contact an administrator before {$action}.",
            ], 422);
        }

        $issue = function () use ($type, $channel, $description, $forceNew, $supervisor, $accounts, $department) {
            if (!$forceNew) {
                $live = $this->liveDepartmentToken($type, $channel, $department, $accounts);
                if ($live && $this->tokenIsCurrent($live) && $live->expires_at->getTimestamp() - Carbon::now()->getTimestamp() > 2) {
                    return $live;
                }
            }

            $this->forgetDepartmentTokens($type, $channel, $department, $accounts);

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

        $lockName = 'attendance-'.$channel.':'.md5($department.'|'.$type);

        try {
            $token = Cache::lock($lockName, 8)->block(5, $issue);
        } catch (LockTimeoutException) {
            $token = $this->liveDepartmentToken($type, $channel, $department, $accounts) ?? $issue();
        }

        return [
            'token' => $token,
            'department' => $department,
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

    private function forgetDepartmentTokens(string $type, string $channel, string $department, UserController $accounts): void
    {
        DailyToken::with('creator.profile')
            ->where('type', $type)
            ->where('channel', $channel)
            ->get()
            ->each(function (DailyToken $token) use ($accounts, $department) {
                $creator = $token->creator;
                if ($creator && $accounts->officesMatch($department, $accounts->attendanceOffice($creator))) {
                    $token->update(['expires_at' => Carbon::now()]);
                }
            });
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
        if ($user->role !== 'Student') {
            return response()->json(['message' => 'Only a working student can clock in for this activity.'], 403);
        }

        $suspension = \App\Models\DisciplinaryRecord::activeSuspension($user->id);
        if ($suspension) {
            return response()->json(['message' => $suspension->suspensionNotice()], 403);
        }

        $event = RenderedHourEvent::find($token->event_id);
        if (!$event || !$event->usesAttendance()) {
            return response()->json(['message' => 'This QR code is no longer linked to an activity.'], 422);
        }

        $now = Carbon::now();
        if (!$now->isSameDay($event->event_date)) {
            return response()->json([
                'message' => 'This QR code is for '.$event->event_date->toFormattedDateString().'.',
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

        $allowed = $this->activityEligibleIds($event);
        if (!in_array($user->id, $allowed, true)) {
            return response()->json(['message' => 'You are not assigned to this activity.'], 422);
        }

        $existing = RenderedHourEntry::query()
            ->where('event_id', $event->id)
            ->where('user_id', $user->id)
            ->whereNotNull('status')
            ->first();
        if ($existing) {
            return response()->json(['message' => 'You already clocked in for this activity.'], 422);
        }

        $status = $event->statusAt($now);
        $delta = $event->deltaFor($status);
        if ($delta > 0) {
            $fit = HourLimits::fitHours($user->id, (float) $delta, $now);
            if ($fit['allowed'] < (float) $delta) {
                return response()->json([
                    'message' => $fit['denial']
                        ?? ('This activity would add '
                            . HourLimits::hoursLabel((float) $delta)
                            . ' hours, but only '
                            . HourLimits::hoursLabel($fit['allowed'])
                            . ' hours remain under your weekly or monthly limit.'),
                    'hour_limits' => HourLimits::status($user->id, $now),
                ], 403);
            }
        }
        $hours = number_format((float) $event->hours, 2);
        $message = $status === 'late'
            ? "Clock-in saved as late. No hours were added or deducted."
            : "Clock-in accepted. {$hours} hours were added to your hours rendered.";

        $attendance = DB::transaction(function () use ($user, $event, $token, $now, $status, $delta, $label, $message, $method) {
            $record = Attendance::create([
                'user_id' => $user->id,
                'time_in' => $now,
                'time_out' => $now,
                'attendance_type' => $label,
                'check_in_method' => $method,
                'code_owner_id' => $token->generated_by,
                'work_type' => $label,
                'rendered_hours' => 0,
                'computed_hours' => 0,
                'activity_hours' => $delta,
                'rendered_hour_event_id' => $event->id,
                'status' => 'accepted',
                'task_description' => $message,
                'is_anomaly' => $status === 'late',
                'anomaly_reason' => $status === 'late'
                    ? 'Clocked in after the on-time window. No hours were added or deducted.'
                    : null,
            ]);

            $entry = RenderedHourEntry::firstOrNew([
                'event_id' => $event->id,
                'user_id' => $user->id,
            ]);
            $entry->status = $status;
            $entry->scanned_at = $now;
            $entry->hours_delta = $delta;
            $entry->attendance_id = $record->id;
            $entry->save();

            return $record;
        });

        $this->notifyCodeOwner($token->generated_by, $user->name, $label, $method, false);

        return response()->json([
            'message' => $message,
            'activity' => true,
            'status' => $status,
            'hours_delta' => $delta,
            'attendance' => $attendance,
            'hour_limits' => HourLimits::status($user->id, $now),
        ]);
    }

    /**
     * @return list<int>
     */
    private function activityEligibleIds(RenderedHourEvent $event): array
    {
        return $event->assignedUserIds();
    }

    private function canIssueActivityCode(\App\Models\User $issuer, RenderedHourEvent $event): bool
    {
        $accounts = app(UserController::class);

        return $accounts->canIssueActivityAttendance($issuer) || $accounts->isYearLeaderFor($issuer, $event);
    }

    /**
     * @return array{token: DailyToken, seconds_remaining: int}
     */
    private function issueActivityToken(\App\Models\User $issuer, RenderedHourEvent $event, string $channel): array
    {
        $issue = function () use ($issuer, $event, $channel) {
            $live = DailyToken::query()
                ->where('event_id', $event->id)
                ->where('channel', $channel)
                ->where('expires_at', '>', Carbon::now())
                ->where('created_at', '>', Carbon::now()->subSeconds(self::ACCESS_TTL_SECONDS))
                ->first();

            if ($live && $this->tokenIsCurrent($live) && $live->expires_at->getTimestamp() - Carbon::now()->getTimestamp() > 2) {
                return $live;
            }

            DailyToken::query()
                ->where('event_id', $event->id)
                ->where('channel', $channel)
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
            $token = Cache::lock('activity-'.$channel.':'.$event->id, 8)->block(5, $issue);
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

    private function liveDepartmentToken(string $type, string $channel, string $department, UserController $accounts): ?DailyToken
    {
        return DailyToken::with('creator.profile')
            ->where('type', $type)
            ->where('channel', $channel)
            ->where('expires_at', '>', Carbon::now())
            ->where('created_at', '>', Carbon::now()->subSeconds(self::ACCESS_TTL_SECONDS))
            ->get()
            ->first(function (DailyToken $token) use ($accounts, $department) {
                $creator = $token->creator;

                return $creator && $accounts->officesMatch($department, $accounts->attendanceOffice($creator));
            });
    }
}
