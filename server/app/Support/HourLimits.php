<?php

namespace App\Support;

use App\Models\Attendance;
use App\Models\CampusSetting;
use App\Models\ExtraHoursRequest;
use App\Models\HourLimitApproval;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;

class HourLimits
{
    public static function weekStart(?Carbon $at = null): Carbon
    {
        return ($at ?? Carbon::now())->copy()->startOfWeek(Carbon::MONDAY)->startOfDay();
    }

    public static function weekEnd(?Carbon $at = null): Carbon
    {
        return self::weekStart($at)->copy()->endOfWeek(Carbon::SUNDAY)->endOfDay();
    }

    public static function monthStart(?Carbon $at = null): Carbon
    {
        return ($at ?? Carbon::now())->copy()->startOfMonth()->startOfDay();
    }

    public static function monthEnd(?Carbon $at = null): Carbon
    {
        return ($at ?? Carbon::now())->copy()->endOfMonth()->endOfDay();
    }

    /**
     * Hours that count toward weekly/monthly caps (pending + accepted DTR and activity deltas).
     */
    public static function countedHours(int $userId, Carbon $start, Carbon $end, ?int $excludeAttendanceId = null): float
    {
        $dtr = (float) Attendance::query()
            ->where('user_id', $userId)
            ->whereNotNull('time_out')
            ->whereNull('rendered_hour_event_id')
            ->where(function ($query) {
                $query->whereNull('status')
                    ->orWhereRaw("LOWER(status) NOT IN ('rejected')");
            })
            ->whereBetween('time_in', [$start, $end])
            ->when($excludeAttendanceId, fn ($query) => $query->where('id', '!=', $excludeAttendanceId))
            ->get()
            ->sum(function (Attendance $record) {
                return $record->computed_hours > 0
                    ? (float) $record->computed_hours
                    : (float) ($record->rendered_hours ?? 0);
            });

        $activity = RenderedHours::activityTotal(
            RenderedHours::deltasBetween($start->copy()->startOfDay(), $end->copy()->endOfDay())[$userId] ?? []
        );

        return round($dtr + $activity, 2);
    }

    public static function weeklyCap(int $userId, ?Carbon $at = null): float
    {
        $settings = CampusSetting::current();
        $standard = (float) $settings->weekly_standard_hours;
        $extended = (float) $settings->weekly_extended_hours;

        $extraHours = self::approvedExtraHours($userId, $at);
        if ($extraHours) {
            return min($extended, max($standard, (float) $extraHours->approved_hours));
        }

        $approval = self::approvedForWeek($userId, $at);
        if ($approval) {
            return min($extended, max($standard, (float) $approval->approved_hours));
        }

        return $standard;
    }

    /**
     * Semester Extra Hours letter approval covering the given date (20 → 25 hrs/week).
     */
    public static function approvedExtraHours(int $userId, ?Carbon $at = null): ?ExtraHoursRequest
    {
        $day = ($at ?? Carbon::now())->toDateString();

        return ExtraHoursRequest::query()
            ->where('status', ExtraHoursRequest::APPROVED)
            ->whereDate('period_start', '<=', $day)
            ->whereDate('period_end', '>=', $day)
            ->whereHas('students', fn ($query) => $query->where('users.id', $userId))
            ->orderByDesc('approved_hours')
            ->first();
    }

    public static function monthlyCap(): float
    {
        return (float) CampusSetting::current()->monthly_max_hours;
    }

    public static function approvedForWeek(int $userId, ?Carbon $at = null): ?HourLimitApproval
    {
        $weekStart = self::weekStart($at)->toDateString();

        return HourLimitApproval::query()
            ->where('user_id', $userId)
            ->whereDate('week_start', $weekStart)
            ->where('status', HourLimitApproval::APPROVED)
            ->first();
    }

    public static function pendingForWeek(int $userId, ?Carbon $at = null): ?HourLimitApproval
    {
        $weekStart = self::weekStart($at)->toDateString();

        return HourLimitApproval::query()
            ->where('user_id', $userId)
            ->whereDate('week_start', $weekStart)
            ->where('status', HourLimitApproval::PENDING)
            ->first();
    }

    /**
     * @return array{
     *   weekly_hours: float,
     *   monthly_hours: float,
     *   weekly_standard: float,
     *   weekly_extended: float,
     *   weekly_cap: float,
     *   monthly_cap: float,
     *   weekly_remaining: float,
     *   monthly_remaining: float,
     *   remaining: float,
     *   extension_approved: bool,
     *   extension_pending: bool,
     *   extra_hours_approved: bool,
     *   extra_hours_period_label: ?string,
     *   week_start: string,
     *   week_end: string,
     *   month_start: string,
     *   month_end: string,
     *   can_request_extension: bool
     * }
     */
    public static function status(int $userId, ?Carbon $at = null, ?int $excludeAttendanceId = null): array
    {
        $at = $at ?? Carbon::now();
        $settings = CampusSetting::current();
        $weekStart = self::weekStart($at);
        $weekEnd = self::weekEnd($at);
        $monthStart = self::monthStart($at);
        $monthEnd = self::monthEnd($at);

        $weeklyHours = self::countedHours($userId, $weekStart, $weekEnd, $excludeAttendanceId);
        $monthlyHours = self::countedHours($userId, $monthStart, $monthEnd, $excludeAttendanceId);
        $weeklyCap = self::weeklyCap($userId, $at);
        $monthlyCap = self::monthlyCap();
        $weeklyRemaining = max(0, round($weeklyCap - $weeklyHours, 2));
        $monthlyRemaining = max(0, round($monthlyCap - $monthlyHours, 2));
        $remaining = min($weeklyRemaining, $monthlyRemaining);
        $extraHours = self::approvedExtraHours($userId, $at);
        $approved = self::approvedForWeek($userId, $at);
        $pending = self::pendingForWeek($userId, $at);
        $extensionApproved = (bool) $extraHours || (bool) $approved;

        return [
            'weekly_hours' => $weeklyHours,
            'monthly_hours' => $monthlyHours,
            'weekly_standard' => (float) $settings->weekly_standard_hours,
            'weekly_extended' => (float) $settings->weekly_extended_hours,
            'weekly_cap' => $weeklyCap,
            'monthly_cap' => $monthlyCap,
            'weekly_remaining' => $weeklyRemaining,
            'monthly_remaining' => $monthlyRemaining,
            'remaining' => $remaining,
            'extension_approved' => $extensionApproved,
            'extension_pending' => (bool) $pending,
            'extra_hours_approved' => (bool) $extraHours,
            'extra_hours_period_label' => $extraHours?->period_label,
            'week_start' => $weekStart->toDateString(),
            'week_end' => $weekEnd->toDateString(),
            'month_start' => $monthStart->toDateString(),
            'month_end' => $monthEnd->toDateString(),
            // Extra Hours letters are supervisor-initiated; students cannot self-request the wet-signed path.
            'can_request_extension' => false,
        ];
    }

    public static function denialForStart(int $userId, ?Carbon $at = null): ?string
    {
        $status = self::status($userId, $at);
        if ($status['remaining'] > 0) {
            return null;
        }

        if ($status['monthly_remaining'] <= 0) {
            return 'You have reached the monthly maximum of '
                . self::hoursLabel($status['monthly_cap'])
                . ' hours. You cannot clock in again this month.';
        }

        if ($status['extension_approved']) {
            return 'You have reached this week\'s approved maximum of '
                . self::hoursLabel($status['weekly_cap'])
                . ' hours.';
        }

        return 'You have reached the standard weekly limit of '
            . self::hoursLabel($status['weekly_standard'])
            . ' hours. Your supervisor must submit a signed Extra Hours letter so WSPO can approve up to '
            . self::hoursLabel($status['weekly_extended'])
            . ' hours per week.';
    }

    /**
     * Cap additional hours to remaining weekly/monthly room.
     *
     * @return array{allowed: float, capped: bool, message: ?string, denial: ?string}
     */
    public static function fitHours(int $userId, float $requested, ?Carbon $at = null, ?int $excludeAttendanceId = null): array
    {
        $requested = round(max(0, $requested), 2);
        $status = self::status($userId, $at, $excludeAttendanceId);
        $room = $status['remaining'];

        if ($room <= 0) {
            return [
                'allowed' => 0.0,
                'capped' => true,
                'message' => null,
                'denial' => self::denialForStart($userId, $at),
            ];
        }

        if ($requested <= $room) {
            return [
                'allowed' => $requested,
                'capped' => false,
                'message' => null,
                'denial' => null,
            ];
        }

        $reasons = [];
        if ($status['weekly_remaining'] < $requested) {
            $reasons[] = 'weekly limit of ' . self::hoursLabel($status['weekly_cap']) . ' hours';
        }
        if ($status['monthly_remaining'] < $requested) {
            $reasons[] = 'monthly maximum of ' . self::hoursLabel($status['monthly_cap']) . ' hours';
        }

        return [
            'allowed' => $room,
            'capped' => true,
            'message' => 'Hours were capped at '
                . self::hoursLabel($room)
                . ' to stay within the '
                . implode(' and ', $reasons)
                . '.',
            'denial' => null,
        ];
    }

    public static function jsonDenial(int $userId, ?Carbon $at = null): ?JsonResponse
    {
        $message = self::denialForStart($userId, $at);
        if (!$message) {
            return null;
        }

        return response()->json([
            'message' => $message,
            'hour_limits' => self::status($userId, $at),
        ], 403);
    }

    public static function hoursLabel(float $hours): string
    {
        $rounded = round($hours, 2);

        return fmod($rounded, 1.0) === 0.0
            ? (string) (int) $rounded
            : number_format($rounded, 2, '.', '');
    }
}
