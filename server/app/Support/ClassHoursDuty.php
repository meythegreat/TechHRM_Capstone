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

    public static function contains(Schedule $block, Carbon $moment): bool
    {
        if ($block->kind !== 'class') {
            return false;
        }

        foreach ([$moment->copy(), $moment->copy()->subDay()] as $day) {
            if ($block->day !== $day->format('l')) {
                continue;
            }

            $bounds = WorkSchedule::bounds($block, $day->copy()->startOfDay());
            if (! $bounds) {
                continue;
            }

            [$start, $end] = $bounds;
            if ($moment->betweenIncluded($start, $end)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array{id: int|null, day: ?string, time: ?string, subject: ?string, room: ?string, instructor: ?string, label: string}
     */
    public static function describe(Schedule $block): array
    {
        return [
            'id' => $block->id,
            'day' => $block->day,
            'time' => $block->time,
            'subject' => $block->subject,
            'room' => $block->room,
            'instructor' => $block->instructor,
            'label' => WorkSchedule::label($block),
        ];
    }

    public static function detail(Schedule $block): string
    {
        $label = WorkSchedule::label($block);
        $subject = trim((string) ($block->subject ?? ''));

        return $subject !== '' ? "{$subject} ({$label})" : $label;
    }

    public static function denialMessage(Schedule $block): string
    {
        return 'This duty time overlaps your class schedule ('.self::detail($block).'). '
            .'If your teacher is not meeting, request a class-hours clock-in on this page. '
            .'Your supervisor approves it before you are clocked in. Clock out when the duty ends so the hours are added to your DTR.';
    }
}
