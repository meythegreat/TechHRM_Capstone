<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\DailyToken;
use Carbon\Carbon;
use Illuminate\Http\Request;

class AdvancedAttendanceController extends Controller
{
    public function generateToken(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|in:Daily Clock,Cleaning,Meeting',
            'description' => 'nullable|string|max:255',
        ]);

        $supervisor = $request->user()->load('profile');
        $department = trim((string) ($supervisor->profile?->assigned_office ?? ''));

        if ($department === '') {
            return response()->json([
                'message' => 'Your account has no assigned department. Contact an administrator before generating tokens.',
            ], 422);
        }

        DailyToken::where('type', $validated['type'])
            ->whereHas('creator.profile', fn ($query) => $query->where('assigned_office', $department))
            ->delete();

        $code = strtoupper(substr(md5(uniqid((string) mt_rand(), true)), 0, 6));

        $token = DailyToken::create([
            'token_code' => $code,
            'type' => $validated['type'],
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

    public function getAnomalyLogs()
    {
        return Attendance::with('user:id,name')
            ->where('is_anomaly', true)
            ->latest('time_in')
            ->get();
    }

    public function secureClockIn(Request $request)
    {
        $request->validate([
            'token_code' => 'required|string',
            'attendance_type' => 'required|in:Regular,Cleaning,Meeting',
        ]);

        $user = $request->user()->load('profile');

        $activeRecord = Attendance::where('user_id', $user->id)
            ->whereNull('time_out')
            ->first();

        if ($activeRecord) {
            return response()->json(['message' => 'You already have an active session. Clock out first.'], 422);
        }

        $studentDepartment = trim((string) ($user->profile?->assigned_office ?? ''));
        if ($studentDepartment === '') {
            return response()->json([
                'message' => 'Your account has no assigned department. Contact your supervisor.',
            ], 422);
        }

        $tokenType = $request->attendance_type === 'Regular' ? 'Daily Clock' : $request->attendance_type;

        $validToken = DailyToken::with('creator.profile')
            ->where('token_code', strtoupper(trim($request->token_code)))
            ->where('type', $tokenType)
            ->where('expires_at', '>', Carbon::now())
            ->first();

        if (!$validToken) {
            return response()->json(['message' => 'Authentication failed. Invalid or expired token.'], 422);
        }

        $supervisorDepartment = trim((string) ($validToken->creator?->profile?->assigned_office ?? ''));
        if ($supervisorDepartment === '') {
            return response()->json(['message' => 'This token is not linked to a valid department.'], 422);
        }

        if (strcasecmp($studentDepartment, $supervisorDepartment) !== 0) {
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
            'verification_code_used' => $validToken->token_code,
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
        $remainingHours = max(0, $targetHours - $totalRendered);

        return response()->json([
            'total_rendered' => round($totalRendered, 2),
            'remaining_hours' => round($remainingHours, 2),
            'target_hours' => $targetHours,
            'history' => $records,
        ]);
    }
}
