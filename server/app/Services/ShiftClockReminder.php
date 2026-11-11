<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Notification;
use App\Models\Schedule;
use App\Models\ShiftReminder;
use App\Models\User;
use App\Support\WorkSchedule;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ShiftClockReminder
{
    /** Remind the student to clock in once clock-in is open, before the shift starts. */
    public const CLOCK_IN_LEAD_MINUTES = WorkSchedule::EARLY_MINUTES;

    /** Still clocked in this long after the scheduled end counts as overtime. */
    public const OVERTIME_AFTER_MINUTES = 15;

    /** Still clocked in this long after the scheduled end means the clock-out was likely forgotten. */
    public const MISSED_CLOCK_OUT_AFTER_MINUTES = 60;

    /** Stop chasing a forgotten clock-out after this long so old open rows are not replayed. */
    public const MISSED_CLOCK_OUT_FOR_HOURS = 72;

    public function dispatchIfDue(): void
    {
        if (! Schema::hasTable('schedules') || ! Schema::hasTable('shift_reminders') || ! Schema::hasTable('attendances') || ! Schema::hasTable('notifications')) {
            return;
        }

        if (! Cache::add('shift-clock-reminders:tick', true, 60)) {
            return;
        }

        try {
            $this->dispatch();
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    public function dispatch(?Carbon $moment = null): int
    {
        $now = ($moment ?? now())->copy()->timezone(config('app.timezone'));

        $schedules = Schedule::query()
            ->where('kind', 'work')
            ->whereHas('user', fn ($query) => $query->where('role', 'Student'))
            ->with('user:id,name,role')
            ->get()
            ->groupBy(fn (Schedule $shift) => (int) $shift->user_id);

        if ($schedules->isEmpty()) {
            return 0;
        }

        $attendances = Attendance::query()
            ->whereIn('user_id', $schedules->keys()->all())
            ->whereNull('rendered_hour_event_id')
            ->where('time_in', '>=', $now->copy()->subDays(14)->startOfDay())
            ->get()
            ->groupBy(fn (Attendance $record) => (int) $record->user_id);

        $sent = 0;
        foreach ($schedules as $userId => $shifts) {
            $records = $attendances->get($userId, collect());
            $sent += $this->remindStudent($shifts, $records, $now);
        }

        return $sent;
    }

    /**
     * @param  Collection<int, Schedule>  $shifts
     * @param  Collection<int, Attendance>  $records
     */
    private function remindStudent(Collection $shifts, Collection $records, Carbon $now): int
    {
        $sent = 0;
        $handled = [];

        foreach ([-1, 0, 1] as $offset) {
            $day = $now->copy()->startOfDay()->addDays($offset);
            $dayName = $day->format('l');

            foreach ($shifts as $shift) {
                if ($shift->day !== $dayName) {
                    continue;
                }

                $bounds = WorkSchedule::bounds($shift, $day);
                if (! $bounds) {
                    continue;
                }

                [$start, $end] = $bounds;
                $attendance = $this->matchAttendance($records, $shift, $start, $end);
                $sent += $this->remindOccurrence($shift, $records, $attendance, $start, $end, $now);
                if ($attendance) {
                    $handled[$attendance->id] = true;
                }
            }
        }

        foreach ($records as $record) {
            if (isset($handled[$record->id]) || $record->time_out !== null || ! $record->isNormalClockIn()) {
                continue;
            }

            $sent += $this->remindForgotten($shifts, $record, $now);
        }

        return $sent;
    }

    /**
     * @param  Collection<int, Attendance>  $records
     */
    private function remindOccurrence(Schedule $shift, Collection $records, ?Attendance $attendance, Carbon $start, Carbon $end, Carbon $now): int
    {
        $sent = 0;
        $clockedIn = $attendance !== null;
        $open = $attendance !== null && $attendance->time_out === null;
        $lead = $start->copy()->subMinutes(self::CLOCK_IN_LEAD_MINUTES);

        if (! $clockedIn && $now->greaterThanOrEqualTo($lead) && $now->lt($start)) {
            $otherOpen = $records->contains(fn (Attendance $record) => $record->time_out === null && $record->isNormalClockIn());
            $message = $otherOpen
                ? WorkSchedule::label($shift).' starts at '.$start->format('g:i A').'. Clock out of your open shift, then clock in for this one.'
                : WorkSchedule::label($shift).' starts at '.$start->format('g:i A').'. Clock in before it begins.';
            $sent += $this->notify($shift->user, $this->key($shift, $start, 'clock_in'), 'clock_in', 'Clock in before your shift', $message);
        }

        if (! $open) {
            return $sent;
        }

        $overtimeAt = $end->copy()->addMinutes(self::OVERTIME_AFTER_MINUTES);
        $missedAt = $end->copy()->addMinutes(self::MISSED_CLOCK_OUT_AFTER_MINUTES);
        $missedUntil = $end->copy()->addHours(self::MISSED_CLOCK_OUT_FOR_HOURS);
        $label = WorkSchedule::label($shift);

        if ($now->greaterThanOrEqualTo($missedAt) && $now->lessThanOrEqualTo($missedUntil)) {
            $sent += $this->notify(
                $shift->user,
                $this->key($shift, $start, 'missed_clock_out'),
                'missed_clock_out',
                'Forgot to clock out',
                'You are still clocked in for '.$label.', which ended at '.$end->format('g:i A').'. Clock out now if you forgot, so this shift is not left open.',
            );
        } elseif ($now->greaterThanOrEqualTo($overtimeAt)) {
            $sent += $this->notify(
                $shift->user,
                $this->key($shift, $start, 'overtime'),
                'overtime',
                'Overtime on your shift',
                $label.' was scheduled to end at '.$end->format('g:i A').'. You are still clocked in and now on overtime. Clock out when you finish.',
            );
        } elseif ($now->greaterThanOrEqualTo($end)) {
            $sent += $this->notify(
                $shift->user,
                $this->key($shift, $start, 'clock_out'),
                'clock_out',
                'Clock out after your shift',
                $label.' ended at '.$end->format('g:i A').'. Clock out so your hours are recorded.',
            );
        }

        return $sent;
    }

    /**
     * @param  Collection<int, Schedule>  $shifts
     */
    private function remindForgotten(Collection $shifts, Attendance $record, Carbon $now): int
    {
        $resolved = $this->resolveShift($shifts, $record);
        if (! $resolved) {
            return 0;
        }

        [$shift, $start, $end] = $resolved;
        $missedAt = $end->copy()->addMinutes(self::MISSED_CLOCK_OUT_AFTER_MINUTES);
        $missedUntil = $end->copy()->addHours(self::MISSED_CLOCK_OUT_FOR_HOURS);
        if ($now->lt($missedAt) || $now->gt($missedUntil)) {
            return 0;
        }

        return $this->notify(
            $shift->user,
            $this->key($shift, $start, 'missed_clock_out'),
            'missed_clock_out',
            'Forgot to clock out',
            'You are still clocked in for '.WorkSchedule::label($shift).', which ended at '.$end->format('g:i A').'. Clock out now if you forgot, so this shift is not left open.',
        );
    }

    /**
     * @param  Collection<int, Attendance>  $records
     */
    private function matchAttendance(Collection $records, Schedule $shift, Carbon $start, Carbon $end): ?Attendance
    {
        $opens = $start->copy()->subMinutes(WorkSchedule::EARLY_MINUTES);
        $latest = $end->copy()->addHours(self::MISSED_CLOCK_OUT_FOR_HOURS);

        return $records
            ->filter(function (Attendance $record) use ($shift, $opens, $end, $latest) {
                if (! $record->isNormalClockIn() || $record->time_in === null) {
                    return false;
                }

                $timeIn = $record->time_in->copy()->timezone(config('app.timezone'));
                if ((int) $record->schedule_id === (int) $shift->id) {
                    return $timeIn->betweenIncluded($opens, $latest);
                }

                return $record->schedule_id === null && $timeIn->betweenIncluded($opens, $end);
            })
            ->sortByDesc(fn (Attendance $record) => sprintf('%d-%010d', $record->time_out === null ? 1 : 0, $record->time_in?->getTimestamp() ?? 0))
            ->first();
    }

    /**
     * @param  Collection<int, Schedule>  $shifts
     * @return array{0: Schedule, 1: Carbon, 2: Carbon}|null
     */
    private function resolveShift(Collection $shifts, Attendance $record): ?array
    {
        if ($record->time_in === null) {
            return null;
        }

        $timeIn = $record->time_in->copy()->timezone(config('app.timezone'));
        $candidates = $shifts;
        if ($record->schedule_id) {
            $candidates = $shifts->where('id', $record->schedule_id)->values();
        }

        foreach ($candidates as $shift) {
            foreach ([0, 1] as $daysBack) {
                $day = $timeIn->copy()->startOfDay()->subDays($daysBack);
                if ($day->format('l') !== $shift->day) {
                    continue;
                }

                $bounds = WorkSchedule::bounds($shift, $day);
                if (! $bounds) {
                    continue;
                }

                [$start, $end] = $bounds;
                $opens = $start->copy()->subMinutes(WorkSchedule::EARLY_MINUTES);
                if ($timeIn->betweenIncluded($opens, $end->copy()->addHours(self::MISSED_CLOCK_OUT_FOR_HOURS))) {
                    return [$shift, $start, $end];
                }
            }
        }

        return null;
    }

    private function key(Schedule $shift, Carbon $start, string $kind): string
    {
        return $shift->user_id.':'.$shift->id.':'.$start->toDateString().':'.$kind;
    }

    private function notify(?User $user, string $key, string $kind, string $title, string $message): int
    {
        if (! $user) {
            return 0;
        }

        try {
            DB::transaction(function () use ($user, $key, $kind, $title, $message) {
                ShiftReminder::query()->create([
                    'user_id' => $user->id,
                    'dedupe_key' => $key,
                    'kind' => $kind,
                ]);

                Notification::create([
                    'user_id' => $user->id,
                    'title' => $title,
                    'message' => $message,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            return 0;
        }

        return 1;
    }
}
