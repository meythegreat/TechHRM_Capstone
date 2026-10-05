<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\DailyToken;
use Carbon\Carbon;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class AdvancedAttendanceController extends Controller
{
    /** Live QR codes rotate on this interval so a photo cannot be reused for long. */
    public const QR_TTL_SECONDS = 90;

    public function generateToken(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|in:Daily Clock,Cleaning,Meeting',
            'description' => 'nullable|string|max:255',
        ]);

        $supervisor = $request->user()->load('profile');
        $accounts = app(UserController::class);
        $department = $accounts->attendanceOffice($supervisor);

        if ($department === '') {
            return response()->json([
                'message' => 'Your account has no assigned department. Contact an administrator before generating tokens.',
            ], 422);
        }

        $this->forgetDepartmentTokens($validated['type'], 'passcode', $department, $accounts);

        $code = strtoupper(substr(md5(uniqid((string) mt_rand(), true)), 0, 6));

        $token = DailyToken::create([
            'token_code' => $code,
            'type' => $validated['type'],
            'channel' => 'passcode',
            'description' => $validated['description'] ?? null,
            'generated_by' => $supervisor->id,
            'expires_at' => Carbon::now()->addHours(12),
        ]);

        return response()->json([
            'message' => 'Secure authentication token generated!',
            'token' => $token,
            'department' => $department,
        ]);
    }

    public function currentQr(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|in:Daily Clock,Cleaning,Meeting',
        ]);

        $supervisor = $request->user()->load('profile');
        $accounts = app(UserController::class);
        $department = $accounts->attendanceOffice($supervisor);

        if ($department === '') {
            return response()->json([
                'message' => 'Your account has no assigned department. Contact an administrator before showing a QR code.',
            ], 422);
        }

        $issue = function () use ($validated, $supervisor, $accounts, $department) {
            $live = $this->liveDepartmentToken($validated['type'], 'qr', $department, $accounts);

            if ($live && $live->expires_at->getTimestamp() - Carbon::now()->getTimestamp() > 2) {
                return $live;
            }

            $this->forgetDepartmentTokens($validated['type'], 'qr', $department, $accounts);

            return DailyToken::create([
                'token_code' => strtoupper(bin2hex(random_bytes(16))),
                'type' => $validated['type'],
                'channel' => 'qr',
                'description' => null,
                'generated_by' => $supervisor->id,
                'expires_at' => Carbon::now()->addSeconds(self::QR_TTL_SECONDS),
            ]);
        };

        try {
            $token = Cache::lock('attendance-qr:'.md5($department.'|'.$validated['type']), 8)
                ->block(5, $issue);
        } catch (LockTimeoutException) {
            $token = $this->liveDepartmentToken($validated['type'], 'qr', $department, $accounts) ?? $issue();
        }

        $secondsRemaining = max(1, $token->expires_at->getTimestamp() - Carbon::now()->getTimestamp());

        return response()->json([
            'payload' => 'THRM1|'.$token->token_code,
            'expires_at' => $token->expires_at,
            'seconds_remaining' => $secondsRemaining,
            'ttl_seconds' => self::QR_TTL_SECONDS,
            'type' => $token->type,
            'department' => $department,
        ]);
    }

    public function getAnomalyLogs(Request $request)
    {
        return Attendance::query()
            ->visibleTo($request->user()->role)
            ->where('is_anomaly', true)
            ->latest('time_in')
            ->get();
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

        $method = $request->input('method', 'passcode');
        $tokenType = $request->attendance_type === 'Regular' ? 'Daily Clock' : $request->attendance_type;
        $code = strtoupper(trim($request->token_code));
        if (str_starts_with($code, 'THRM1|')) {
            $code = substr($code, 6);
        }

        $matched = DailyToken::with('creator.profile')
            ->where('token_code', $code)
            ->first();

        if (!$matched || $matched->expires_at->lte(Carbon::now())) {
            $expiredQr = $matched && $matched->channel === 'qr';

            return response()->json([
                'message' => $expiredQr
                    ? 'This QR code has expired. Scan the code currently on your supervisor\'s screen.'
                    : 'Authentication failed. Invalid or expired token.',
            ], 422);
        }

        if ($matched->channel !== $method) {
            return response()->json([
                'message' => $matched->channel === 'qr'
                    ? 'This is a QR check-in. Scan the live code instead of typing it.'
                    : 'This is a passcode. Enter it in the passcode field.',
            ], 422);
        }

        if ($matched->type !== $tokenType) {
            $dutyLabel = $matched->type === 'Daily Clock' ? 'Regular Duty' : $matched->type;

            return response()->json([
                'message' => "This code is for {$dutyLabel}. Change your duty type to match.",
            ], 422);
        }

        $validToken = $matched;

        $accounts = app(UserController::class);
        $creator = $validToken->creator;
        $supervisorDepartment = $creator ? $accounts->attendanceOffice($creator) : '';
        if ($supervisorDepartment === '') {
            return response()->json(['message' => 'This token is not linked to a valid department.'], 422);
        }

        if (!$accounts->officesMatch($supervisorDepartment, $studentDepartment)) {
            return response()->json([
                'message' => "This code is only valid for {$supervisorDepartment} students. You are assigned to {$studentDepartment}.",
            ], 403);
        }

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
            'work_type' => $request->attendance_type,
            'status' => 'pending',
            'is_anomaly' => $isAnomaly,
            'anomaly_reason' => $anomalyReason,
        ]);

        return response()->json(['message' => 'Verified entry approved!', 'attendance' => $attendance]);
    }

    public function secureClockOut(Request $request, $id)
    {
        $attendance = Attendance::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        if ($attendance->time_out) {
            return response()->json(['message' => 'Shift segment already terminated.'], 422);
        }

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

    private function forgetDepartmentTokens(string $type, string $channel, string $department, UserController $accounts): void
    {
        DailyToken::with('creator.profile')
            ->where('type', $type)
            ->where('channel', $channel)
            ->get()
            ->each(function (DailyToken $token) use ($accounts, $department) {
                $creator = $token->creator;
                if ($creator && $accounts->officesMatch($department, $accounts->attendanceOffice($creator))) {
                    $token->delete();
                }
            });
    }

    private function liveDepartmentToken(string $type, string $channel, string $department, UserController $accounts): ?DailyToken
    {
        return DailyToken::with('creator.profile')
            ->where('type', $type)
            ->where('channel', $channel)
            ->where('expires_at', '>', Carbon::now())
            ->get()
            ->first(function (DailyToken $token) use ($accounts, $department) {
                $creator = $token->creator;

                return $creator && $accounts->officesMatch($department, $accounts->attendanceOffice($creator));
            });
    }
}
