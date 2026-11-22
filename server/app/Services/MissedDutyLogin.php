<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Holiday;
use App\Models\Schedule;
use App\Models\SemesterTerm;
use App\Models\User;
use App\Support\WorkSchedule;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * After a work shift ends, flag the student when they never signed in during that duty.
 */
class MissedDutyLogin
{
    /** How far back a finished shift can still be flagged, so a quiet weekend is not missed. */
    public const LOOKBACK_DAYS = 7;

    public function flagIfDue(): void
    {
        if (! Cache::add('missed-duty-login:tick', true, 60)) {
            return;
        }

        try {
            $this->flag();
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    public function flag(?Carbon $moment = null): int
    {
        if (
            ! Schema::hasTable('schedules')
            || ! Schema::hasTable('attendances')
            || ! Schema::hasColumn('attendances', 'is_anomaly')
            || ! Schema::hasColumn('attendances', 'check_in_method')
            || ! Schema::hasColumn('attendances', 'schedule_id')
        ) {
            return 0;
        }

        $now = ($moment ?? now())->copy()->timezone(config('app.timezone'));
        $shifts = Schedule::query()
            ->where('kind', 'work')
            ->whereHas('user', fn ($query) => $query->where('role', 'Student'))
            ->get();

        $flagged = 0;
        foreach ($shifts as $shift) {
            foreach ([0, -1] as $offset) {
                $day = $now->copy()->startOfDay()->addDays($offset);
                if ($day->format('l') !== $shift->day) {
                    continue;
                }

                $bounds = WorkSchedule::bounds($shift, $day);
                if (! $bounds) {
                    continue;
                }

                [$start, $end] = $bounds;
                if ($now->lt($end) || $end->lt($now->copy()->subDays(self::LOOKBACK_DAYS))) {
                    continue;
                }
                if (! $this->insideDutyTerm($start) || $this->dutySuspended($start, $end)) {
                    continue;
                }

                $flagged += $this->flagShift($shift, $start, $end);
            }
        }

        return $flagged;
    }

    private function flagShift(Schedule $shift, Carbon $start, Carbon $end): int
    {
        $opens = $start->copy()->subMinutes(WorkSchedule::EARLY_MINUTES);
        $lock = null;

        try {
            $lock = Cache::lock('missed-duty-login:'.$shift->id.':'.$start->toDateString(), 15);
            if (! $lock->get()) {
                return 0;
            }
        } catch (\Throwable) {
            $lock = null;
        }

        try {
            if (
                $this->alreadyFlagged($shift, $start)
                || $this->clockedDuring($shift, $opens, $end, $start)
                || $this->loggedInDuring((int) $shift->user_id, $opens, $end)
            ) {
                return 0;
            }

            $label = WorkSchedule::label($shift);
            Attendance::create([
                'user_id' => $shift->user_id,
                'schedule_id' => $shift->id,
                'attendance_type' => 'Missed login',
                'work_type' => 'Missed login',
                'check_in_method' => Attendance::MISSED_LOGIN,
                'time_in' => $start,
                'time_out' => $end,
                'rendered_hours' => 0,
                'computed_hours' => 0,
                'status' => 'anomaly',
                'is_anomaly' => true,
                'anomaly_reason' => 'Did not log in during the scheduled duty ('.$label.').',
                'task_description' => 'No login was recorded during this duty schedule.',
            ]);

            return 1;
        } finally {
            if ($lock) {
                $lock->release();
            }
        }
    }

    private function alreadyFlagged(Schedule $shift, Carbon $start): bool
    {
        return Attendance::query()
            ->where('user_id', $shift->user_id)
            ->where('schedule_id', $shift->id)
            ->where('check_in_method', Attendance::MISSED_LOGIN)
            ->whereDate('time_in', $start->toDateString())
            ->exists();
    }

    private function clockedDuring(Schedule $shift, Carbon $opens, Carbon $end, Carbon $start): bool
    {
        return Attendance::query()
            ->where('user_id', $shift->user_id)
            ->whereNull('rendered_hour_event_id')
            ->withoutMissedLogins()
            ->where(function ($query) use ($shift, $opens, $end, $start) {
                $query->where(function ($window) use ($opens, $end) {
                    $window->where('time_in', '>=', $opens)->where('time_in', '<=', $end);
                })->orWhere(function ($linked) use ($shift, $start) {
                    $linked->where('schedule_id', $shift->id)
                        ->whereDate('time_in', $start->toDateString());
                });
            })
            ->exists();
    }

    private function loggedInDuring(int $userId, Carbon $opens, Carbon $end): bool
    {
        if (Schema::hasTable('personal_access_tokens')) {
            $loggedIn = DB::table('personal_access_tokens')
                ->where('tokenable_id', $userId)
                ->whereIn('tokenable_type', [User::class, 'user'])
                ->where(function ($query) use ($opens, $end) {
                    $query->whereBetween('created_at', [$opens, $end])
                        ->orWhereBetween('last_used_at', [$opens, $end]);
                })
                ->exists();
            if ($loggedIn) {
                return true;
            }
        }

        if (! Schema::hasTable('activity_logs') || ! Schema::hasColumn('activity_logs', 'admin_id')) {
            return false;
        }

        return DB::table('activity_logs')
            ->where('admin_id', $userId)
            ->where('action', 'System Login')
            ->whereBetween('created_at', [$opens, $end])
            ->exists();
    }

    private function insideDutyTerm(Carbon $start): bool
    {
        if (! Schema::hasTable('semester_terms')) {
            return true;
        }

        $term = SemesterTerm::current();
        if (! $term) {
            return true;
        }

        $day = $start->toDateString();

        return $day >= $term->starts_on->toDateString() && $day <= $term->ends_on->toDateString();
    }

    private function dutySuspended(Carbon $start, Carbon $end): bool
    {
        if (! Schema::hasTable('holidays') || ! Schema::hasColumn('holidays', 'end_date')) {
            return false;
        }

        $dates = array_values(array_unique([
            $start->toDateString(),
            $end->copy()->subSecond()->toDateString(),
        ]));

        $holidays = Holiday::query()
            ->where(function ($query) use ($dates) {
                foreach ($dates as $date) {
                    $query->orWhere(function ($span) use ($date) {
                        $span->whereDate('date', '<=', $date)
                            ->where(function ($closing) use ($date) {
                                $closing->whereDate('end_date', '>=', $date)
                                    ->orWhere(function ($open) use ($date) {
                                        $open->whereNull('end_date')->whereDate('date', $date);
                                    });
                            });
                    });
                }
            })
            ->get();

        foreach ($holidays as $holiday) {
            $full = ($holiday->kind ?: 'holiday') === 'break' || ($holiday->portion ?: 'full') !== 'half';
            if ($full) {
                return true;
            }

            $startsAt = $holiday->starts_at ? substr((string) $holiday->starts_at, 0, 5) : null;
            $endsAt = $holiday->ends_at ? substr((string) $holiday->ends_at, 0, 5) : null;
            if (! $startsAt || ! $endsAt) {
                return true;
            }

            try {
                $blockStart = Carbon::parse($start->toDateString().' '.$startsAt, config('app.timezone'));
                $blockEnd = Carbon::parse($start->toDateString().' '.$endsAt, config('app.timezone'));
            } catch (\Throwable) {
                return true;
            }

            if ($start->lt($blockEnd) && $blockStart->lt($end)) {
                return true;
            }
        }

        return false;
    }
}
