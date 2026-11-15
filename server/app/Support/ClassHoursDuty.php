<?php

namespace App\Support;

use App\Models\Schedule;
use Carbon\Carbon;

/**
 * Detects when a student tries to duty during a class-schedule conflict (TEC-28).
 */
class ClassHoursDuty
{
    /**
     * First class block that contains this moment, if any.
     */
    public static function overlappingClass(int $userId, Carbon $moment): ?Schedule
    {
        foreach ([$moment->copy(), $moment->copy()->subDay()] as $day) {
            $classes = Schedule::query()
                ->where('user_id', $userId)
                ->where('kind', 'class')
                ->where('day', $day->format('l'))
                ->get();

            foreach ($classes as $block) {
                $bounds = WorkSchedule::bounds($block, $day->copy()->startOfDay());
                if (! $bounds) {
                    continue;
                }
                [$start, $end] = $bounds;
                if ($moment->betweenIncluded($start, $end)) {
                    return $block;
                }
            }
        }

        return null;
    }

    public static function denialMessage(Schedule $block): string
    {
        $label = WorkSchedule::label($block);
        $subject = trim((string) ($block->subject ?? ''));
        $detail = $subject !== '' ? "{$label} ({$subject})" : $label;

        return 'This duty time overlaps your class schedule ('.$detail.'). '
            .'Submit a class-hours duty request for supervisor approval before the hours can be credited.';
    }
}
