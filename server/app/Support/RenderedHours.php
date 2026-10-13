<?php

namespace App\Support;

use App\Models\Attendance;
use App\Models\DisciplinaryRecord;
use App\Models\RenderedHourEvent;
use App\Models\User;
use Carbon\Carbon;

class RenderedHours
{
    private const VERIFIED_STATUSES = ['accepted', 'approved', 'Approved'];

    /**
     * Hour adjustments from special requests, cleaning, devotionals, and assemblies.
     *
     * @return array<int, array<string, float>>
     */
    public static function deltasBetween(Carbon $start, Carbon $end): array
    {
        $events = RenderedHourEvent::query()
            ->with('entries')
            ->whereDate('event_date', '>=', $start->toDateString())
            ->whereDate('event_date', '<=', $end->toDateString())
            ->get();

        $deltas = [];
        foreach ($events as $event) {
            foreach ($event->entries as $entry) {
                if ($entry->status === null && $event->usesAttendance()) {
                    continue;
                }
                $deltas[$entry->user_id][$event->kind] = round(
                    ($deltas[$entry->user_id][$event->kind] ?? 0) + (float) $entry->hours_delta,
                    2
                );
            }
        }

        return $deltas;
    }

    public static function activityTotal(array $kinds): float
    {
        return round(array_sum($kinds), 2);
    }

    /**
     * Official hours for one period: verified DTR, minus duty-hour deductions,
     * plus or minus activity hours.
     *
     * @return array{
     *     students: list<array<string, mixed>>,
     *     breakdown: list<array<string, mixed>>,
     *     summary: list<array<string, mixed>>,
     *     grand: array<string, float|int>
     * }
     */
    public static function report(Carbon $start, Carbon $end): array
    {
        $students = User::query()
            ->with('profile:id,user_id,student_id_number,year_level,course,assigned_office')
            ->where('role', 'Student')
            ->orderBy('name')
            ->get();

        $dtr = self::verifiedHoursByUser($start, $end);
        $duty = self::dutyHoursByUser($start->toDateString(), $end->toDateString());
        $deltas = self::deltasBetween($start, $end);

        $rows = [];
        foreach ($students as $student) {
            $dtrHours = round((float) ($dtr[$student->id] ?? 0), 2);
            $dutyHours = round(min($dtrHours, (float) ($duty[$student->id] ?? 0)), 2);
            $kinds = $deltas[$student->id] ?? [];
            $activity = self::activityTotal($kinds);
            $grand = round($dtrHours - $dutyHours + $activity, 2);
            $involved = $dtrHours > 0 || $dutyHours > 0 || $kinds !== [];
            if (!$involved) {
                continue;
            }

            $year = $student->profile?->year_level;
            $rows[] = [
                'user_id' => $student->id,
                'name' => $student->name,
                'student_id_number' => $student->profile?->student_id_number,
                'course' => $student->profile?->course,
                'assigned_office' => $student->profile?->assigned_office,
                'year_level' => $year ? (int) $year : null,
                'dtr_hours' => $dtrHours,
                'duty_deduction' => $dutyHours,
                'special_request' => round((float) ($kinds[RenderedHourEvent::SPECIAL] ?? 0), 2),
                'daily_cleaning' => round((float) ($kinds[RenderedHourEvent::DAILY_CLEANING] ?? 0), 2),
                'general_cleaning' => round((float) ($kinds[RenderedHourEvent::GENERAL_CLEANING] ?? 0), 2),
                'devotional' => round((float) ($kinds[RenderedHourEvent::DEVOTIONAL] ?? 0), 2),
                'meeting_assembly' => round((float) ($kinds[RenderedHourEvent::ASSEMBLY] ?? 0), 2),
                'adjustments' => $activity,
                'grand_total' => $grand,
            ];
        }

        usort($rows, function (array $a, array $b) {
            $yearA = $a['year_level'] ?? 99;
            $yearB = $b['year_level'] ?? 99;
            if ($yearA !== $yearB) {
                return $yearA <=> $yearB;
            }

            return strcasecmp($a['name'], $b['name']);
        });

        $breakdown = [];
        foreach ($rows as $row) {
            $key = $row['year_level'] ?? 0;
            if (!isset($breakdown[$key])) {
                $breakdown[$key] = [
                    'year_level' => $row['year_level'],
                    'label' => self::yearLabel($row['year_level']),
                    'students' => [],
                    'totals' => self::emptyTotals(),
                ];
            }
            $breakdown[$key]['students'][] = $row;
            self::addTotals($breakdown[$key]['totals'], $row);
        }

        $summary = [];
        $grand = self::emptyTotals();
        foreach ($breakdown as $group) {
            $summary[] = [
                'year_level' => $group['year_level'],
                'label' => $group['label'],
                'student_count' => count($group['students']),
                'dtr_hours' => $group['totals']['dtr_hours'],
                'adjustments' => $group['totals']['adjustments'],
                'grand_total' => $group['totals']['grand_total'],
            ];
            $grand['student_count'] += count($group['students']);
            $grand['dtr_hours'] = round($grand['dtr_hours'] + $group['totals']['dtr_hours'], 2);
            $grand['duty_deduction'] = round($grand['duty_deduction'] + $group['totals']['duty_deduction'], 2);
            $grand['adjustments'] = round($grand['adjustments'] + $group['totals']['adjustments'], 2);
            $grand['grand_total'] = round($grand['grand_total'] + $group['totals']['grand_total'], 2);
        }

        return [
            'students' => $rows,
            'breakdown' => array_values($breakdown),
            'summary' => $summary,
            'grand' => $grand,
        ];
    }

    public static function yearLabel(?int $year): string
    {
        return match ($year) {
            1 => '1st Year',
            2 => '2nd Year',
            3 => '3rd Year',
            4 => '4th Year',
            default => 'Year not set',
        };
    }

    /**
     * @return array<int, float>
     */
    private static function verifiedHoursByUser(Carbon $start, Carbon $end): array
    {
        return Attendance::query()
            ->whereNull('rendered_hour_event_id')
            ->whereNotNull('time_out')
            ->whereIn('status', self::VERIFIED_STATUSES)
            ->whereBetween('time_in', [$start->copy()->startOfDay(), $end->copy()->endOfDay()])
            ->selectRaw('user_id, COALESCE(SUM(CASE WHEN computed_hours > 0 THEN computed_hours ELSE COALESCE(rendered_hours, 0) END), 0) as hours')
            ->groupBy('user_id')
            ->pluck('hours', 'user_id')
            ->map(fn ($hours) => (float) $hours)
            ->all();
    }

    /**
     * @return array<int, float>
     */
    private static function dutyHoursByUser(string $start, string $end): array
    {
        return DisciplinaryRecord::query()
            ->where('status', '!=', 'Dismissed')
            ->where('penalty', '!=', 'Pending')
            ->where('penalty_hours', '>', 0)
            ->whereDate('incident_date', '>=', $start)
            ->whereDate('incident_date', '<=', $end)
            ->selectRaw('student_id, COALESCE(SUM(penalty_hours), 0) as hours')
            ->groupBy('student_id')
            ->pluck('hours', 'student_id')
            ->map(fn ($hours) => (float) $hours)
            ->all();
    }

    /**
     * @return array{student_count: int, dtr_hours: float, duty_deduction: float, adjustments: float, grand_total: float}
     */
    private static function emptyTotals(): array
    {
        return [
            'student_count' => 0,
            'dtr_hours' => 0.0,
            'duty_deduction' => 0.0,
            'adjustments' => 0.0,
            'grand_total' => 0.0,
        ];
    }

    /**
     * @param  array{student_count: int, dtr_hours: float, duty_deduction: float, adjustments: float, grand_total: float}  $totals
     * @param  array<string, mixed>  $row
     */
    private static function addTotals(array &$totals, array $row): void
    {
        $totals['student_count']++;
        $totals['dtr_hours'] = round($totals['dtr_hours'] + $row['dtr_hours'], 2);
        $totals['duty_deduction'] = round($totals['duty_deduction'] + $row['duty_deduction'], 2);
        $totals['adjustments'] = round($totals['adjustments'] + $row['adjustments'], 2);
        $totals['grand_total'] = round($totals['grand_total'] + $row['grand_total'], 2);
    }
}
