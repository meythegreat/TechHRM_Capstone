<?php

namespace App\Support;

use App\Models\Schedule;
use Carbon\Carbon;

/**
 * Shared hour math for regular / janitorial duty:
 * lunch break (except Library), schedule-end overtime cap, auto clock-out window.
 */
class DutyHours
{
    /** Minutes before/after scheduled end when auto clock-out is offered. */
    public const AUTO_CLOCK_OUT_WINDOW_MINUTES = 10;

    public const LUNCH_START = '12:00';

    public const LUNCH_END = '13:00';

    public static function isLibrary(?string $office): bool
    {
        $normalized = mb_strtolower(trim((string) $office));

        return $normalized !== '' && str_contains($normalized, 'library');
    }

    public static function rawHours(Carbon $timeIn, Carbon $timeOut): float
    {
        return round(max(0, $timeIn->diffInMinutes($timeOut)) / 60, 2);
    }

    /**
     * Non-Library departments lose unpaid lunch when the duty spans 12:00–13:00.
     * Library has no lunch break — full continuous hours are credited.
     */
    public static function creditedHours(Carbon $timeIn, Carbon $timeOut, ?string $office = null): float
    {
        $minutes = max(0, $timeIn->diffInMinutes($timeOut));
        if (! self::isLibrary($office)) {
            $minutes -= self::lunchOverlapMinutes($timeIn, $timeOut);
        }

        return round(max(0, $minutes) / 60, 2);
    }

    public static function lunchOverlapMinutes(Carbon $timeIn, Carbon $timeOut): int
    {
        $day = $timeIn->copy()->startOfDay();
        $lunchStart = Carbon::parse($day->toDateString().' '.self::LUNCH_START);
        $lunchEnd = Carbon::parse($day->toDateString().' '.self::LUNCH_END);
        if ($timeOut->lte($timeIn)) {
            return 0;
        }

        $overlapStart = $timeIn->greaterThan($lunchStart) ? $timeIn->copy() : $lunchStart;
        $overlapEnd = $timeOut->lessThan($lunchEnd) ? $timeOut->copy() : $lunchEnd;
        if ($overlapEnd->lte($overlapStart)) {
            // Overnight / multi-day: check next calendar lunch if the span crosses midnight.
            if ($timeOut->toDateString() !== $timeIn->toDateString()) {
                $nextDay = $timeIn->copy()->addDay()->startOfDay();
                $lunchStart = Carbon::parse($nextDay->toDateString().' '.self::LUNCH_START);
                $lunchEnd = Carbon::parse($nextDay->toDateString().' '.self::LUNCH_END);
                $overlapStart = $timeIn->greaterThan($lunchStart) ? $timeIn->copy() : $lunchStart;
                $overlapEnd = $timeOut->lessThan($lunchEnd) ? $timeOut->copy() : $lunchEnd;
                if ($overlapEnd->lte($overlapStart)) {
                    return 0;
                }
            } else {
                return 0;
            }
        }

        return max(0, $overlapStart->diffInMinutes($overlapEnd));
    }

    /**
     * If clock-out is after the matched work shift end, credit only until that end.
     */
    public static function cappedClockOut(Carbon $timeIn, Carbon $timeOut, ?Schedule $shift): Carbon
    {
        if (! $shift) {
            return $timeOut->copy();
        }

        $bounds = WorkSchedule::bounds($shift, $timeIn->copy()->startOfDay());
        if (! $bounds) {
            return $timeOut->copy();
        }

        [, $end] = $bounds;
        if ($timeOut->greaterThan($end)) {
            return $end->copy();
        }

        return $timeOut->copy();
    }

    public static function withinAutoClockOutWindow(Carbon $moment, Schedule $shift): bool
    {
        $bounds = WorkSchedule::bounds($shift, $moment->copy()->startOfDay());
        if (! $bounds) {
            // Overnight: try previous day as shift start day.
            $bounds = WorkSchedule::bounds($shift, $moment->copy()->subDay()->startOfDay());
        }
        if (! $bounds) {
            return false;
        }

        [, $end] = $bounds;
        $opens = $end->copy()->subMinutes(self::AUTO_CLOCK_OUT_WINDOW_MINUTES);
        $closes = $end->copy()->addMinutes(self::AUTO_CLOCK_OUT_WINDOW_MINUTES);

        return $moment->betweenIncluded($opens, $closes);
    }

    public static function scheduledEndFor(Carbon $timeIn, ?Schedule $shift): ?Carbon
    {
        if (! $shift) {
            return null;
        }

        $bounds = WorkSchedule::bounds($shift, $timeIn->copy()->startOfDay());
        if (! $bounds) {
            $bounds = WorkSchedule::bounds($shift, $timeIn->copy()->subDay()->startOfDay());
        }

        return $bounds ? $bounds[1]->copy() : null;
    }
}
