<?php

namespace App\Support;

use App\Models\Attendance;
use App\Models\Schedule;
use Carbon\Carbon;

class WorkSchedule
{
    public const EARLY_MINUTES = 30;

    public const LATE_OUT_MINUTES = 30;

    /**
     * @return array{0: Carbon, 1: Carbon, 2: Schedule}|null
     */
    public static function bounds(Schedule $shift, Carbon $day): ?array
    {
        $parts = preg_split('/\s*-\s*/', trim((string) $shift->time)) ?: [];
        if (count($parts) !== 2) {
            return null;
        }

        try {
            $start = Carbon::parse($day->toDateString().' '.trim($parts[0]));
            $end = Carbon::parse($day->toDateString().' '.trim($parts[1]));
        } catch (\Throwable) {
            return null;
        }

        if ($end->lte($start)) {
            $end->addDay();
        }

        return [$start, $end, $shift];
    }

    public static function allows(int $userId, Carbon $moment, string $action): bool
    {
        return self::matchingShift($userId, $moment, $action) !== null;
    }

    public static function denialMessage(int $userId, Carbon $moment, string $action): ?string
    {
        if (self::allows($userId, $moment, $action)) {
            return null;
        }

        $ranges = self::todayLabels($userId, $moment);
        $verb = $action === 'out' ? 'Clock-out' : 'Clock-in';
        if ($ranges === []) {
            return $verb.' follows your work schedule. You have no work shift assigned for '.$moment->format('l').'.';
        }

        $list = implode(', ', $ranges);

        return $action === 'out'
            ? "Clock-out is only accepted during your work schedule ({$list}), through ".self::LATE_OUT_MINUTES.' minutes after it ends.'
            : "Clock-in is only accepted during your work schedule ({$list}), starting ".self::EARLY_MINUTES.' minutes before the shift.';
    }

    public static function matchingShift(int $userId, Carbon $moment, string $action): ?Schedule
    {
        $matches = self::matchingShifts($userId, $moment, $action);
        if ($matches === []) {
            return null;
        }

        if ($action !== 'in') {
            return $matches[0];
        }

        foreach ($matches as $shift) {
            $alreadyRecorded = Attendance::query()
                ->where('user_id', $userId)
                ->where('schedule_id', $shift->id)
                ->whereNull('rendered_hour_event_id')
                ->whereDate('time_in', $moment->toDateString())
                ->exists();
            if (!$alreadyRecorded) {
                return $shift;
            }
        }

        return $matches[array_key_last($matches)];
    }

    /**
     * Every work shift whose clock window contains this moment.
     * A student can have more than one morning or afternoon shift.
     *
     * @return list<Schedule>
     */
    public static function matchingShifts(int $userId, Carbon $moment, string $action): array
    {
        $found = [];
        foreach ([$moment->copy(), $moment->copy()->subDay()] as $day) {
            $shifts = Schedule::query()
                ->where('user_id', $userId)
                ->where('kind', 'work')
                ->where('day', $day->format('l'))
                ->get();

            foreach ($shifts as $shift) {
                $bounds = self::bounds($shift, $day->copy()->startOfDay());
                if (!$bounds) {
                    continue;
                }

                [$start, $end] = $bounds;
                $opens = $action === 'out' ? $start->copy() : $start->copy()->subMinutes(self::EARLY_MINUTES);
                $closes = $action === 'out' ? $end->copy()->addMinutes(self::LATE_OUT_MINUTES) : $end->copy();
                if ($moment->betweenIncluded($opens, $closes)) {
                    $found[$shift->id] = [$start->getTimestamp(), $shift];
                }
            }
        }

        uasort($found, fn (array $left, array $right) => $left[0] <=> $right[0]);

        return array_values(array_map(fn (array $row) => $row[1], $found));
    }

    /**
     * @return list<string>
     */
    public static function todayLabels(int $userId, Carbon $moment): array
    {
        return Schedule::query()
            ->where('user_id', $userId)
            ->where('kind', 'work')
            ->where('day', $moment->format('l'))
            ->orderBy('time')
            ->get()
            ->map(fn (Schedule $shift) => self::label($shift))
            ->filter()
            ->values()
            ->all();
    }

    public static function label(Schedule $shift): string
    {
        $parts = preg_split('/\s*-\s*/', trim((string) $shift->time)) ?: [];
        if (count($parts) !== 2) {
            return trim($shift->day.' '.$shift->time);
        }

        try {
            $start = Carbon::parse(trim($parts[0]))->format('g:i A');
            $end = Carbon::parse(trim($parts[1]))->format('g:i A');
        } catch (\Throwable) {
            return trim($shift->day.' '.$shift->time);
        }

        return "{$shift->day} {$start} – {$end}";
    }
}
