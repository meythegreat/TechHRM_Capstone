<?php

namespace App\Support;

use App\Models\Attendance;
use App\Models\Schedule;
use App\Models\User;
use Carbon\Carbon;

/**
 * Shared create/correct path for supervisor Manual Timesheet Override
 * and student offline manual attendance requests that a supervisor approves.
 */
class ManualDtrEntry
{
    /**
     * @return array{0: ?Carbon, 1: ?Carbon, 2: ?string}
     */
    public static function resolveTimes(string $date, string $timeIn, string $timeOut): array
    {
        $start = Carbon::createFromFormat('Y-m-d H:i', $date.' '.$timeIn);
        $end = Carbon::createFromFormat('Y-m-d H:i', $date.' '.$timeOut);

        if (!$start || !$end) {
            return [null, null, 'Enter a valid time in and time out.'];
        }

        if ($end->lte($start)) {
            $end = $end->copy()->addDay();
        }

        if ($start->greaterThan(now())) {
            return [null, null, 'Time in cannot be in the future.'];
        }

        if ($end->greaterThan(now())) {
            return [null, null, 'Time out cannot be in the future.'];
        }

        $minutes = $start->diffInMinutes($end);
        if ($minutes < 1) {
            return [null, null, 'Time out must be after time in.'];
        }

        if ($minutes > 16 * 60) {
            return [null, null, 'A single duty entry cannot be longer than 16 hours.'];
        }

        return [$start, $end, null];
    }

    public static function overlaps(int $userId, Carbon $start, Carbon $end, ?int $ignoreId = null): bool
    {
        return Attendance::where('user_id', $userId)
            ->whereNull('rendered_hour_event_id')
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->where('time_in', '<', $end)
            ->where(function ($query) use ($start) {
                $query->whereNull('time_out')->orWhere('time_out', '>', $start);
            })
            ->exists();
    }

    public static function matchingShift(int $userId, Carbon $timeIn): ?Schedule
    {
        $shift = null;
        foreach (WorkSchedule::matchingShifts($userId, $timeIn, 'in') as $candidate) {
            $bounds = WorkSchedule::bounds($candidate, $timeIn->copy()->startOfDay());
            if ($bounds && $timeIn->greaterThanOrEqualTo($bounds[0]->copy()->subMinutes(WorkSchedule::EARLY_MINUTES))) {
                $shift = $candidate;
            }
        }

        return $shift;
    }

    /**
     * Create a closed DTR row for one shift, applying weekly/monthly caps.
     *
     * @param  array{attendance_type?: string, work_type?: string, janitorial_group_id?: int|null, janitorial_area?: string|null, skip_schedule_match?: bool, apply_lunch?: bool, cap_at_schedule_end?: bool}  $options
     * @return array{ok: true, attendance: Attendance, hour_limits: array}|array{ok: false, message: string, status: int, hour_limits?: array}
     */
    public static function createClosedShift(
        User $student,
        string $date,
        string $timeInHm,
        string $timeOutHm,
        string $note,
        string $status = 'pending',
        ?string $checkInMethod = null,
        array $options = [],
    ): array {
        [$timeIn, $timeOut, $error] = self::resolveTimes($date, $timeInHm, $timeOutHm);
        if ($error) {
            return ['ok' => false, 'message' => $error, 'status' => 422];
        }

        if (self::overlaps((int) $student->id, $timeIn, $timeOut)) {
            return [
                'ok' => false,
                'message' => 'These times overlap another DTR entry for this student.',
                'status' => 422,
            ];
        }

        $attendanceType = $options['attendance_type'] ?? 'Regular';
        $isJanitorial = strcasecmp($attendanceType, 'Janitorial') === 0;
        $skipSchedule = (bool) ($options['skip_schedule_match'] ?? $isJanitorial);
        $applyLunch = (bool) ($options['apply_lunch'] ?? ! $isJanitorial);
        $capAtEnd = (bool) ($options['cap_at_schedule_end'] ?? ! $isJanitorial);

        $shift = $skipSchedule ? null : self::matchingShift((int) $student->id, $timeIn);
        if ($capAtEnd && $shift) {
            $timeOut = DutyHours::cappedClockOut($timeIn, $timeOut, $shift);
        }

        $office = trim((string) ($student->profile?->assigned_office ?? ''));
        $hours = $applyLunch
            ? DutyHours::creditedHours($timeIn, $timeOut, $office)
            : DutyHours::rawHours($timeIn, $timeOut);

        $fit = HourLimits::fitHours((int) $student->id, $hours, $timeIn);
        if ($fit['allowed'] <= 0) {
            return [
                'ok' => false,
                'message' => $fit['denial'] ?? 'This entry would exceed the student\'s weekly or monthly hour limit.',
                'status' => 422,
                'hour_limits' => HourLimits::status((int) $student->id, $timeIn),
            ];
        }
        if ($fit['capped'] && $fit['allowed'] < $hours) {
            return [
                'ok' => false,
                'message' => 'This entry is '
                    .HourLimits::hoursLabel($hours)
                    .' hours, but only '
                    .HourLimits::hoursLabel($fit['allowed'])
                    .' hours remain under the weekly/monthly limits'
                    .(! $fit['denial'] && ! HourLimits::approvedForWeek((int) $student->id, $timeIn)
                        ? ' (approve an extension up to '.HourLimits::hoursLabel(HourLimits::status((int) $student->id, $timeIn)['weekly_extended']).' hours/week first)'
                        : '')
                    .'.',
                'status' => 422,
                'hour_limits' => HourLimits::status((int) $student->id, $timeIn),
            ];
        }

        $note = trim($note);
        $workType = $options['work_type']
            ?? ($isJanitorial ? 'Janitorial' : ($student->profile?->duty_type ?: 'Manual Entry'));
        $area = isset($options['janitorial_area']) ? trim((string) $options['janitorial_area']) : null;

        $attendance = Attendance::create([
            'user_id' => $student->id,
            'attendance_type' => $attendanceType,
            'time_in' => $timeIn,
            'time_out' => $timeOut,
            'schedule_id' => $shift?->id,
            'janitorial_group_id' => $options['janitorial_group_id'] ?? null,
            'janitorial_area' => $area !== '' ? $area : null,
            'rendered_hours' => $fit['allowed'],
            'computed_hours' => $fit['allowed'],
            'work_type' => $workType,
            'task_description' => $note !== ''
                ? $note
                : ($isJanitorial
                    ? ('Janitorial duty'.($area ? ' — '.$area : '').'.')
                    : 'Manually entered by supervisor.'),
            'status' => $status,
            'check_in_method' => $checkInMethod,
            'is_anomaly' => $fit['allowed'] > 8,
            'anomaly_reason' => $fit['allowed'] > 8 ? 'Extended continuous shifts (Exceeded 8 hours).' : null,
        ]);

        return [
            'ok' => true,
            'attendance' => $attendance,
            'hour_limits' => HourLimits::status((int) $student->id, $timeIn),
        ];
    }
}
