<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Support\SuperAdminAudit;
use App\Models\DailyToken;
use App\Models\Notification;
use Carbon\Carbon;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class AdvancedAttendanceController extends Controller
{
    /** Passcodes and live QR codes rotate on this interval so a captured code cannot be reused. */
    public const ACCESS_TTL_SECONDS = 30;

    public function generateToken(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $validated = $request->validate([
            'type' => 'required|in:Daily Clock,Cleaning,Meeting',
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
            'type' => 'required|in:Daily Clock,Cleaning,Meeting',
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
            'type' => 'required|in:Daily Clock,Cleaning,Meeting',
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

    public function secureClockIn(Request $request)
    {
        $request->validate([
            'token_code' => 'required|string|max:80',
            'attendance_type' => 'required|in:Regular,Cleaning,Meeting',
            'method' => 'nullable|in:passcode,qr',
        ]);

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
            return response()->json(['message' => 'You already have an active session. Clock out first.'], 422);
        }

        $studentDepartment = trim((string) ($user->profile?->assigned_office ?? ''));
        if ($studentDepartment === '') {
            return response()->json([
                'message' => 'Your account has no assigned department. Contact your supervisor.',
            ], 422);
        }

        $validToken = $this->authenticateToken($request, $request->attendance_type, $studentDepartment);
        if ($validToken instanceof \Illuminate\Http\JsonResponse) {
            return $validToken;
        }

        $method = $request->input('method', 'passcode');

        $isAnomaly = false;
        $anomalyReason = null;
        if ($request->attendance_type === 'Regular' && Carbon::now()->hour >= 17) {
            $isAnomaly = true;
            $anomalyReason = 'Late standard shift entry (after 5:00 PM).';
        }

        $attendance = Attendance::create([
            'user_id' => $user->id,
            'time_in' => Carbon::now(),
            'attendance_type' => $request->attendance_type,
            'verification_code_used' => $method === 'qr' ? null : $validToken->token_code,
            'check_in_method' => $method,
            'code_owner_id' => $validToken->generated_by,
            'work_type' => $request->attendance_type,
            'status' => 'pending',
            'is_anomaly' => $isAnomaly,
            'anomaly_reason' => $anomalyReason,
        ]);

        $this->notifyCodeOwner($validToken->generated_by, $user->name, $request->attendance_type, $method, false);

        return response()->json(['message' => 'Verified entry approved!', 'attendance' => $attendance]);
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
        $validToken = $this->authenticateToken($request, $dutyType, $studentDepartment, true);
        if ($validToken instanceof \Illuminate\Http\JsonResponse) {
            return $validToken;
        }

        $method = $request->input('method', 'passcode');

        $clockOutTime = Carbon::now();
        $clockInTime = Carbon::parse($attendance->time_in);
        $totalMinutes = $clockInTime->diffInMinutes($clockOutTime);
        $computedHours = round($totalMinutes / 60, 2);

        $isAnomaly = $attendance->is_anomaly;
        $anomalyReason = $attendance->anomaly_reason;
        if ($computedHours > 8.00) {
            $isAnomaly = true;
            $anomalyReason = ($anomalyReason ? $anomalyReason . ' • ' : '') . 'Extended continuous shifts (Exceeded 8 hours).';
        }

        $attendance->update([
            'time_out' => $clockOutTime,
            'computed_hours' => $computedHours,
            'rendered_hours' => $computedHours,
            'is_anomaly' => $isAnomaly,
            'anomaly_reason' => $anomalyReason,
        ]);

        $this->notifyCodeOwner($validToken->generated_by, $user->name, $dutyType, $method, true);

        return response()->json(['message' => 'Verified exit logging saved.', 'hours_rendered' => $computedHours]);
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
        $credited = max(0, $totalRendered - $dutyDeduction);
        $remainingHours = max(0, $targetHours - $credited);

        return response()->json([
            'total_rendered' => round($credited, 2),
            'logged_hours' => round($totalRendered, 2),
            'duty_deduction_hours' => round($dutyDeduction, 2),
            'remaining_hours' => round($remainingHours, 2),
            'target_hours' => $targetHours,
            'history' => $records,
        ]);
    }

    /**
     * @return DailyToken|\Illuminate\Http\JsonResponse
     */
    private function authenticateToken(Request $request, string $attendanceType, string $studentDepartment, bool $clockingOut = false)
    {
        if ($studentDepartment === '') {
            return response()->json([
                'message' => 'Your account has no assigned department. Contact your supervisor.',
            ], 422);
        }

        $method = $request->input('method', 'passcode');
        $tokenType = $attendanceType === 'Regular' ? 'Daily Clock' : $attendanceType;
        $code = strtoupper(trim((string) $request->token_code));
        if (str_starts_with($code, 'THRM1|')) {
            $code = substr($code, 6);
        }

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

        if ($matched->type !== $tokenType) {
            $dutyLabel = $matched->type === 'Daily Clock' ? 'Regular Duty' : $matched->type;

            return response()->json([
                'message' => $clockingOut
                    ? "This code is for {$dutyLabel}. Use the current code for your open shift."
                    : "This code is for {$dutyLabel}. Change your duty type to match.",
            ], 422);
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
