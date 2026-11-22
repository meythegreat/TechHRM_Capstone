<?php

namespace App\Support;

use App\Http\Controllers\UserController;
use App\Models\Attendance;
use App\Models\RenderedHourEntry;
use App\Models\RenderedHourEvent;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StudentActivities
{
    /**
     * Ongoing ("happening now") and upcoming attendance activities for a student's dashboard.
     *
     * @return array{current_activities: list<array<string, mixed>>, upcoming_activities: list<array<string, mixed>>}
     */
    public static function dashboardFeed(User $user, ?Carbon $moment = null): array
    {
        $now = ($moment ?? Carbon::now())->copy();
        $from = $now->copy()->subDay()->startOfDay();
        $items = self::forStudent($user, $from, null, $now);

        $current = [];
        $upcoming = [];

        foreach ($items as $item) {
            if ($item['is_happening_now']) {
                $current[] = $item;
            } elseif (! $item['has_ended']) {
                $upcoming[] = $item;
            }
        }

        return [
            'current_activities' => array_values($current),
            'upcoming_activities' => array_values($upcoming),
        ];
    }

    /**
     * Attendance-based campus & group activities assigned to a working student.
     *
     * @return list<array<string, mixed>>
     */
    public static function forStudent(
        User $user,
        ?Carbon $from = null,
        ?Carbon $to = null,
        ?Carbon $moment = null
    ): array {
        if (! Schema::hasTable('rendered_hour_events')) {
            return [];
        }

        $now = ($moment ?? Carbon::now())->copy();
        $user->loadMissing('profile');
        $studentYear = (int) ($user->profile?->year_level ?? 0);

        $hasEntriesTable = Schema::hasTable('rendered_hour_entries');
        $hasGroupIdCol = Schema::hasColumn('rendered_hour_events', 'group_id');
        $hasMembersTable = $hasGroupIdCol && Schema::hasTable('daily_cleaning_group_members');

        $groupIds = $hasMembersTable
            ? DB::table('daily_cleaning_group_members')
                ->where('user_id', $user->id)
                ->pluck('group_id')
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values()
                ->all()
            : [];

        $isSecretary = app(UserController::class)->isWspoSecretary($user);

        $query = RenderedHourEvent::query()
            ->where('kind', '!=', RenderedHourEvent::SPECIAL);

        if ($from) {
            $query->whereDate('event_date', '>=', $from->toDateString());
        }
        if ($to) {
            $query->whereDate('event_date', '<=', $to->toDateString());
        }

        if (! $isSecretary) {
            $query->where(function ($scope) use ($user, $studentYear, $hasEntriesTable, $groupIds) {
                $scope->where(function ($campus) use ($studentYear) {
                    $campus->whereIn('kind', [RenderedHourEvent::DEVOTIONAL, RenderedHourEvent::ASSEMBLY])
                        ->where(function ($years) use ($studentYear) {
                            $years->whereNull('year_level')
                                ->orWhere('year_level', 0);
                            if ($studentYear >= 1 && $studentYear <= 4) {
                                $years->orWhere('year_level', $studentYear);
                            }
                        });
                });

                if ($hasEntriesTable) {
                    $scope->orWhereHas('entries', function ($entries) use ($user) {
                        $entries->where('user_id', $user->id);
                    });
                }

                if ($groupIds !== []) {
                    $scope->orWhere(function ($grouped) use ($groupIds, $studentYear) {
                        $grouped->whereIn('group_id', $groupIds)
                            ->where(function ($years) use ($studentYear) {
                                $years->whereNull('year_level')
                                    ->orWhere('year_level', 0);
                                if ($studentYear >= 1 && $studentYear <= 4) {
                                    $years->orWhere('year_level', $studentYear);
                                }
                            });
                    });
                }
            });
        }

        $events = $query
            ->orderBy('event_date')
            ->get();

        if ($events->isEmpty()) {
            return [];
        }

        $entriesByEvent = collect();
        $attendancesById = collect();

        if ($hasEntriesTable) {
            $entriesByEvent = RenderedHourEntry::query()
                ->where('user_id', $user->id)
                ->whereIn('event_id', $events->pluck('id')->all())
                ->get()
                ->keyBy('event_id');

            if (Schema::hasTable('attendances') && Schema::hasColumn('rendered_hour_entries', 'attendance_id')) {
                $attendanceIds = $entriesByEvent->pluck('attendance_id')->filter()->unique()->values()->all();
                if ($attendanceIds !== []) {
                    $attendancesById = Attendance::query()
                        ->whereIn('id', $attendanceIds)
                        ->get()
                        ->keyBy('id');
                }
            }
        }

        $openAttendancesByEvent = collect();
        if (Schema::hasTable('attendances') && Schema::hasColumn('attendances', 'rendered_hour_event_id')) {
            $openAttendancesByEvent = Attendance::query()
                ->where('user_id', $user->id)
                ->whereIn('rendered_hour_event_id', $events->pluck('id')->all())
                ->orderByDesc('id')
                ->get()
                ->groupBy('rendered_hour_event_id')
                ->map(fn ($rows) => $rows->first());
        }

        return $events
            ->map(function (RenderedHourEvent $event) use ($entriesByEvent, $attendancesById, $openAttendancesByEvent, $now) {
                /** @var RenderedHourEntry|null $entry */
                $entry = $entriesByEvent->get($event->id);
                /** @var Attendance|null $attendance */
                $attendance = ($entry && $entry->attendance_id)
                    ? $attendancesById->get($entry->attendance_id)
                    : $openAttendancesByEvent->get($event->id);

                return self::presentForStudent($event, $entry, $attendance, $now);
            })
            ->sort(function (array $left, array $right) {
                $dateCmp = strcmp($left['event_date'], $right['event_date']);
                if ($dateCmp !== 0) {
                    return $dateCmp;
                }
                $leftStart = $left['starts_at'] ?? '99:99';
                $rightStart = $right['starts_at'] ?? '99:99';
                $timeCmp = strcmp($leftStart, $rightStart);
                if ($timeCmp !== 0) {
                    return $timeCmp;
                }

                return strcasecmp($left['title'], $right['title']);
            })
            ->values()
            ->all();
    }

    /**
     * Campus & group activities visible on the organization schedule calendar.
     *
     * @return list<array<string, mixed>>
     */
    public static function forOrganization(
        ?Carbon $from = null,
        ?Carbon $to = null,
        ?Carbon $moment = null
    ): array {
        if (! Schema::hasTable('rendered_hour_events')) {
            return [];
        }

        $now = ($moment ?? Carbon::now())->copy();
        $query = RenderedHourEvent::query()
            ->where('kind', '!=', RenderedHourEvent::SPECIAL);

        if ($from) {
            $query->whereDate('event_date', '>=', $from->toDateString());
        }
        if ($to) {
            $query->whereDate('event_date', '<=', $to->toDateString());
        }

        return $query
            ->orderBy('event_date')
            ->get()
            ->map(fn (RenderedHourEvent $event) => self::presentForStudent($event, null, null, $now))
            ->sort(function (array $left, array $right) {
                $dateCmp = strcmp($left['event_date'], $right['event_date']);
                if ($dateCmp !== 0) {
                    return $dateCmp;
                }
                $leftStart = $left['starts_at'] ?? '99:99';
                $rightStart = $right['starts_at'] ?? '99:99';
                $timeCmp = strcmp($leftStart, $rightStart);
                if ($timeCmp !== 0) {
                    return $timeCmp;
                }

                return strcasecmp($left['title'], $right['title']);
            })
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    public static function presentForStudent(
        RenderedHourEvent $event,
        ?RenderedHourEntry $entry,
        ?Attendance $attendance,
        Carbon $now
    ): array {
        $dateString = $event->event_date->toDateString();
        $dayName = $event->event_date->format('l');

        $startsAt = $event->starts_at ? substr((string) $event->starts_at, 0, 5) : null;
        $endsAt = $event->ends_at ? substr((string) $event->ends_at, 0, 5) : null;
        $validUntil = $event->valid_until ? substr((string) $event->valid_until, 0, 5) : null;

        $start = $startsAt ? Carbon::parse($dateString.' '.$startsAt) : null;
        $end = $endsAt ? Carbon::parse($dateString.' '.$endsAt) : null;

        if ($start && ! $end) {
            $minutes = max(60, (int) round(((float) $event->hours) * 60));
            $end = $start->copy()->addMinutes($minutes);
            $endsAt = $end->format('H:i');
        }

        if ($start && ! $validUntil) {
            $validUntil = $start->copy()->addMinutes($event->windowMinutes())->format('H:i');
        }

        $rawStatus = $entry?->status;
        $hasOpenAttendance = $attendance !== null && $attendance->time_out === null;

        $attendanceStatus = match (true) {
            $rawStatus === 'absent' => 'absent',
            $hasOpenAttendance || $rawStatus === RenderedHourEntry::TIMED_IN => 'timed_in',
            $rawStatus === 'on_time' => 'on_time',
            $rawStatus === 'late' => 'late',
            default => 'pending',
        };

        $isToday = $event->event_date->isSameDay($now);
        $beforeToday = $event->event_date->lt($now->copy()->startOfDay());

        $openSessionRecent = $attendanceStatus === 'timed_in'
            && ($start ? $now->diffInHours($start) <= 24 : ($isToday || $event->event_date->isSameDay($now->copy()->subDay())));

        $inWindowNow = $isToday
            && $attendanceStatus !== 'absent'
            && ($start && $end ? $now->betweenIncluded($start, $end) : $start === null);

        $isHappeningNow = $openSessionRecent || $inWindowNow;

        $isStartingSoon = $isToday
            && ! $isHappeningNow
            && $attendanceStatus !== 'absent'
            && $start !== null
            && $now->lt($start)
            && $now->diffInMinutes($start) <= 60;

        $hasEnded = ! $isHappeningNow && (
            $beforeToday
            || ($isToday && $end !== null && $now->gt($end))
        );

        $timing = match (true) {
            $isHappeningNow => 'ongoing',
            $isStartingSoon => 'starting_soon',
            $isToday && ! $hasEnded => 'today',
            ! $hasEnded => 'upcoming',
            default => 'past',
        };

        $isCampusWide = RenderedHourEvent::coversEveryStudent($event->kind);
        $yearLevel = $event->year_level ? (int) $event->year_level : null;
        $yearLabel = ($yearLevel && $yearLevel >= 1 && $yearLevel <= 4)
            ? RenderedHours::yearLabel($yearLevel)
            : null;

        $audienceLabel = $isCampusWide
            ? ($yearLabel ? "{$yearLabel} Working Students" : 'All Working Students')
            : ($event->group_name ?: ($yearLabel ?: 'Assigned Group'));

        return [
            'id' => (int) $event->id,
            'kind' => $event->kind,
            'kind_label' => RenderedHourEvent::KINDS[$event->kind]['label'] ?? $event->kind,
            'title' => $event->title,
            'event_date' => $dateString,
            'day' => $dayName,
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'valid_until' => $validUntil,
            'hours' => round((float) $event->hours, 2),
            'is_campus_wide' => $isCampusWide,
            'group_name' => $event->group_name,
            'year_level' => $yearLevel,
            'year_label' => $yearLabel,
            'audience_label' => $audienceLabel,
            'notes' => $event->notes,
            'attendance_status' => $attendanceStatus,
            'time_in' => $attendance?->time_in ? Carbon::parse($attendance->time_in)->format('H:i') : null,
            'time_out' => $attendance?->time_out ? Carbon::parse($attendance->time_out)->format('H:i') : null,
            'is_today' => $isToday,
            'is_happening_now' => $isHappeningNow,
            'is_starting_soon' => $isStartingSoon,
            'has_ended' => $hasEnded,
            'timing' => $timing,
        ];
    }
}
