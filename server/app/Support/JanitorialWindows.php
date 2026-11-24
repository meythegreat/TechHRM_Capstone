<?php

namespace App\Support;

use App\Models\Attendance;
use App\Models\ManualAttendanceRequest;
use App\Models\ManualAttendanceRequestShift;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * Janitorial attendance is allowed twice each day:
 * one entry from 5:00–7:00 AM and one from 5:00–9:00 PM.
 */
class JanitorialWindows
{
    public static function rejectionMessage(int $userId, Carbon $timeIn): ?string
    {
        $window = DutyHours::janitorialWindow($timeIn);
        if ($window === null) {
            return 'Janitorial attendance is only allowed from 5:00 to 7:00 AM and from 5:00 to 9:00 PM. You can record one morning attendance and one afternoon attendance each day.';
        }

        if (self::windowAlreadyUsed($userId, $timeIn, $window)) {
            $other = $window === 'morning' ? 'afternoon (5:00–9:00 PM)' : 'morning (5:00–7:00 AM)';

            return 'You already have a janitorial attendance for the '.DutyHours::janitorialWindowPhrase($window)
                .' window on this date. You can still record the '.$other.' window.';
        }

        return null;
    }

    public static function windowAlreadyUsed(int $userId, Carbon $timeIn, ?string $window = null): bool
    {
        $window = $window ?? DutyHours::janitorialWindow($timeIn);
        if ($window === null || $userId <= 0) {
            return false;
        }

        $day = $timeIn->copy()->timezone(config('app.timezone'))->toDateString();
        $rows = Attendance::query()
            ->where('user_id', $userId)
            ->whereDate('time_in', $day)
            ->where(function ($query) {
                $query->where('attendance_type', 'Janitorial')
                    ->orWhere('work_type', 'Janitorial');
            })
            ->when(Schema::hasColumn('attendances', 'janitorial_supervision'), function ($query) {
                $query->where(function ($inner) {
                    $inner->whereNull('janitorial_supervision')
                        ->orWhere('janitorial_supervision', false);
                });
            })
            ->get(['time_in', 'status']);

        foreach ($rows as $row) {
            if (in_array(strtolower((string) $row->status), ['rejected', 'declined'], true)) {
                continue;
            }
            if (DutyHours::janitorialWindow(Carbon::parse($row->time_in)) === $window) {
                return true;
            }
        }

        if (! Schema::hasTable('manual_attendance_request_shifts') || ! Schema::hasTable('manual_attendance_requests')) {
            return false;
        }

        $pending = ManualAttendanceRequestShift::query()
            ->whereDate('work_date', $day)
            ->whereNull('attendance_id')
            ->whereHas('request', function ($query) use ($userId) {
                $query->where('user_id', $userId)
                    ->where('request_type', ManualAttendanceRequest::TYPE_JANITORIAL)
                    ->whereIn('status', [
                        ManualAttendanceRequest::PENDING,
                        ManualAttendanceRequest::RECOMMENDED,
                    ]);
            })
            ->get(['work_date', 'time_in']);

        foreach ($pending as $shift) {
            $at = Carbon::parse($shift->work_date->toDateString().' '.$shift->time_in);
            if (DutyHours::janitorialWindow($at) === $window) {
                return true;
            }
        }

        return false;
    }
}
