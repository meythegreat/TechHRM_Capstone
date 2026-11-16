<?php

namespace App\Support;

use App\Http\Controllers\UserController;
use App\Models\Attendance;
use App\Models\Notification;
use App\Models\RenderedHourEntry;
use App\Models\RenderedHourEvent;
use App\Models\Schedule;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Super Admin force clock-out for open regular-duty and activity sessions.
 *
 * Credits hours with the same math as student secure clock-out / activity timeout
 * where possible. Always closes the open row so a forgotten punch does not block
 * the student forever when weekly/monthly room is already exhausted (credits 0).
 */
class ForceClockOut
{
    public const FORCE_NOTE = 'Forced clock-out by Super Admin.';

    /**
     * @return list<Attendance>
     */
    public static function openSessions(?array $attendanceIds = null): array
    {
        $query = Attendance::query()
            ->visibleTo('Super Admin')
            ->whereNull('time_out')
            ->whereNotNull('time_in')
            ->orderByDesc('time_in');

        if ($attendanceIds !== null) {
            $ids = array_values(array_unique(array_map('intval', $attendanceIds)));
            if ($ids === []) {
                return [];
            }
            $query->whereIn('id', $ids);
        }

        return $query->get()->all();
    }

    /**
     * Present an open attendance row for the Super Admin open-sessions list.
     *
     * @return array<string, mixed>
     */
    public static function present(Attendance $attendance): array
    {
        $isActivity = (bool) $attendance->rendered_hour_event_id;
        $dutyType = $attendance->attendance_type ?: ($attendance->work_type ?: 'Regular');
        $isJanitorial = strcasecmp((string) $dutyType, 'Janitorial') === 0
            || (int) ($attendance->janitorial_group_id ?? 0) > 0;

        $kind = $isActivity ? 'activity' : ($isJanitorial ? 'janitorial' : 'regular');
        $activityLabel = null;
        if ($isActivity) {
            $event = RenderedHourEvent::query()->find($attendance->rendered_hour_event_id);
            $activityLabel = $event
                ? (RenderedHourEvent::KINDS[$event->kind]['label'] ?? $event->kind)
                : 'Activity';
            if ($event?->title) {
                $activityLabel = $event->title;
            }
        }

        $user = $attendance->user;

        return [
            'id' => (int) $attendance->id,
            'user_id' => (int) $attendance->user_id,
            'student_name' => $user?->name ?? 'Unknown',
            'student_id_number' => $user?->profile?->student_id_number,
            'office' => $user?->profile?->assignment_label
                ?? $user?->profile?->assigned_office
                ?? 'Unassigned',
            'time_in' => optional($attendance->time_in)->toIso8601String(),
            'session_kind' => $kind,
            'duty_type' => $dutyType,
            'activity_label' => $activityLabel,
            'rendered_hour_event_id' => $attendance->rendered_hour_event_id
                ? (int) $attendance->rendered_hour_event_id
                : null,
            'account_deleted' => (bool) ($attendance->account_deleted ?? false),
        ];
    }

    /**
     * Close one open session. Returns a result payload; never throws for business rules.
     *
     * @return array{ok: bool, attendance_id: int, session_kind: string, hours_rendered: float|null, message: string, attendance?: Attendance}
     */
    public static function closeOne(Attendance $attendance, User $actor, ?Carbon $at = null): array
    {
        $at = $at ?? Carbon::now();
        $attendance->loadMissing('user.profile');

        if ($attendance->time_out) {
            return [
                'ok' => false,
                'attendance_id' => (int) $attendance->id,
                'session_kind' => $attendance->rendered_hour_event_id ? 'activity' : 'regular',
                'hours_rendered' => null,
                'message' => 'Session is already closed.',
            ];
        }

        if (! $attendance->time_in) {
            return [
                'ok' => false,
                'attendance_id' => (int) $attendance->id,
                'session_kind' => 'regular',
                'hours_rendered' => null,
                'message' => 'Session has no clock-in time.',
            ];
        }

        if ($attendance->rendered_hour_event_id) {
            return self::closeActivity($attendance, $actor, $at);
        }

        return self::closeRegular($attendance, $actor, $at);
    }

    /**
     * @param  list<Attendance>  $sessions
     * @return array{closed: int, failed: int, results: list<array<string, mixed>>}
     */
    public static function closeMany(array $sessions, User $actor, ?Carbon $at = null): array
    {
        $results = [];
        $closed = 0;
        $failed = 0;

        foreach ($sessions as $session) {
            $result = self::closeOne($session, $actor, $at);
            $results[] = $result;
            if ($result['ok']) {
                $closed++;
            } else {
                $failed++;
            }
        }

        return [
            'closed' => $closed,
            'failed' => $failed,
            'results' => $results,
        ];
    }

    /**
     * @return array{ok: bool, attendance_id: int, session_kind: string, hours_rendered: float|null, message: string, attendance?: Attendance}
     */
    private static function closeRegular(Attendance $attendance, User $actor, Carbon $now): array
    {
        $user = $attendance->user;
        if (! $user) {
            return [
                'ok' => false,
                'attendance_id' => (int) $attendance->id,
                'session_kind' => 'regular',
                'hours_rendered' => null,
                'message' => 'Student account is missing for this session.',
            ];
        }

        $dutyType = $attendance->attendance_type ?: ($attendance->work_type ?: 'Regular');
        $isJanitorial = strcasecmp((string) $dutyType, 'Janitorial') === 0
            || (int) ($attendance->janitorial_group_id ?? 0) > 0;

        $accounts = app(UserController::class);
        $studentDepartment = $accounts->isStudentOfficer($user)
            ? $accounts->placementOffice($user)
            : trim((string) ($user->profile?->assigned_office ?? ''));

        $clockInTime = Carbon::parse($attendance->time_in);
        if ($now->lt($clockInTime)) {
            return [
                'ok' => false,
                'attendance_id' => (int) $attendance->id,
                'session_kind' => $isJanitorial ? 'janitorial' : 'regular',
                'hours_rendered' => null,
                'message' => 'Clock out must be after clock in.',
            ];
        }

        $shift = null;
        if ($attendance->schedule_id) {
            $shift = Schedule::query()->find($attendance->schedule_id);
        }
        if (! $shift && ! $isJanitorial) {
            $shift = WorkSchedule::matchingShift($user->id, $clockInTime, 'in')
                ?? WorkSchedule::matchingShift($user->id, $now, 'out');
        }

        $notes = [self::FORCE_NOTE];
        $clockOutTime = $now->copy();

        if ($isJanitorial) {
            // Close the open session. Hours stay pending until the janitorial leader accepts.
        } else {
            $capped = DutyHours::cappedClockOut($clockInTime, $clockOutTime, $shift);
            if ($capped->lt($clockOutTime)) {
                $notes[] = 'Hours capped at scheduled shift end (overtime not credited).';
                $clockOutTime = $capped;
            }
        }

        if ($isJanitorial) {
            $computedHours = 0.0;
            $notes[] = 'Janitorial session closed. The janitorial supervisor must accept the photos before '
                .DutyHours::JANITORIAL_FIXED_HOURS.' hours are recorded from clock-in.';
        } else {
            $computedHours = DutyHours::creditedHours($clockInTime, $clockOutTime, $studentDepartment);
            if (! DutyHours::isLibrary($studentDepartment)) {
                $lunch = DutyHours::lunchOverlapMinutes($clockInTime, $clockOutTime);
                if ($lunch > 0) {
                    $notes[] = 'Unpaid lunch break deducted (Library has no lunch break).';
                }
            }
        }

        if ($isJanitorial && $computedHours <= 0) {
            $fit = ['allowed' => 0.0, 'capped' => false, 'message' => null, 'denial' => null];
            $credited = 0.0;
        } else {
            $fit = HourLimits::fitHours($user->id, $computedHours, $clockOutTime, (int) $attendance->id);
            // Force-close always completes; exhausted limits credit 0 instead of leaving the row open.
            $credited = (float) $fit['allowed'];
            if ($computedHours > 0 && $credited <= 0 && ($fit['denial'] ?? null)) {
                $notes[] = $fit['denial'];
            }
            if ($fit['capped'] && $fit['message']) {
                $notes[] = $fit['message'];
            }
        }

        $isAnomaly = (bool) $attendance->is_anomaly;
        $anomalyReason = $attendance->anomaly_reason;
        if (! $isJanitorial && $computedHours > 8.00) {
            $isAnomaly = true;
            $anomalyReason = ($anomalyReason ? $anomalyReason.' • ' : '').'Extended continuous shifts (Exceeded 8 hours).';
        }
        if (($fit['capped'] ?? false) && ($fit['message'] ?? null)) {
            $isAnomaly = true;
            $anomalyReason = ($anomalyReason ? $anomalyReason.' • ' : '').$fit['message'];
        }

        $task = trim((string) ($attendance->task_description ?? ''));
        $extra = implode(' ', $notes);
        $task = $task === '' ? $extra : ($task.' '.$extra);

        $attendance->update([
            'time_out' => $clockOutTime,
            'computed_hours' => $isJanitorial ? 0 : $credited,
            'rendered_hours' => $isJanitorial ? 0 : $credited,
            'status' => $isJanitorial ? 'pending' : 'approved',
            'task_description' => $task !== '' ? $task : null,
            'is_anomaly' => $isAnomaly,
            'anomaly_reason' => $anomalyReason,
        ]);

        Notification::create([
            'user_id' => $user->id,
            'title' => 'Forced clock-out',
            'message' => 'A Super Admin closed your open '
                .($isJanitorial ? 'janitorial' : 'duty')
                .' session from '
                .$clockInTime->format('M j, g:i A')
                .' and credited '
                .HourLimits::hoursLabel($credited)
                .' hours.',
        ]);

        return [
            'ok' => true,
            'attendance_id' => (int) $attendance->id,
            'session_kind' => $isJanitorial ? 'janitorial' : 'regular',
            'hours_rendered' => $credited,
            'message' => 'Closed regular session. Credited '.HourLimits::hoursLabel($credited).' hours.',
            'attendance' => $attendance->fresh(['user.profile']),
            'forced_by' => $actor->id,
        ];
    }

    /**
     * @return array{ok: bool, attendance_id: int, session_kind: string, hours_rendered: float|null, message: string, attendance?: Attendance}
     */
    private static function closeActivity(Attendance $attendance, User $actor, Carbon $now): array
    {
        $event = RenderedHourEvent::query()->find($attendance->rendered_hour_event_id);
        if (! $event || ! $event->usesAttendance()) {
            return [
                'ok' => false,
                'attendance_id' => (int) $attendance->id,
                'session_kind' => 'activity',
                'hours_rendered' => null,
                'message' => 'Activity event is missing or does not use attendance.',
            ];
        }

        $entry = RenderedHourEntry::query()
            ->where('event_id', $event->id)
            ->where('user_id', $attendance->user_id)
            ->first();

        if ($entry && $entry->status === 'absent') {
            return [
                'ok' => false,
                'attendance_id' => (int) $attendance->id,
                'session_kind' => 'activity',
                'hours_rendered' => null,
                'message' => 'This activity was marked absent, so it cannot be timed out.',
            ];
        }

        if ($entry && $entry->status && $entry->status !== RenderedHourEntry::TIMED_IN) {
            return [
                'ok' => false,
                'attendance_id' => (int) $attendance->id,
                'session_kind' => 'activity',
                'hours_rendered' => null,
                'message' => 'This activity session is already finished.',
            ];
        }

        $clockIn = Carbon::parse($attendance->time_in);
        if ($now->lt($clockIn)) {
            return [
                'ok' => false,
                'attendance_id' => (int) $attendance->id,
                'session_kind' => 'activity',
                'hours_rendered' => null,
                'message' => 'Clock out must be after clock in.',
            ];
        }

        $status = $event->statusAt($clockIn);
        $delta = $event->deltaFor($status);
        $limitNote = null;

        if ($delta > 0) {
            $fit = HourLimits::fitHours((int) $attendance->user_id, (float) $delta, $clockIn, (int) $attendance->id);
            if ($fit['allowed'] < (float) $delta) {
                // Activities are all-or-nothing; force-close with 0 when limits block full credit.
                $limitNote = $fit['denial']
                    ?? ('Activity hours could not be credited under weekly/monthly limits (need '
                        .HourLimits::hoursLabel((float) $delta)
                        .', '
                        .HourLimits::hoursLabel($fit['allowed'])
                        .' remain).');
                $delta = 0.0;
            }
        }

        $hours = number_format((float) $event->hours, 2);
        $label = RenderedHourEvent::KINDS[$event->kind]['label'] ?? $event->kind;
        $message = $status === 'late'
            ? 'Timed out late. No hours were added or deducted.'
            : ($delta > 0
                ? "Timed out. {$hours} hours were added to hours rendered."
                : 'Timed out. No activity hours were credited.');
        $message .= ' '.self::FORCE_NOTE;
        if ($limitNote) {
            $message .= ' '.$limitNote;
        }

        DB::transaction(function () use ($attendance, $event, $entry, $now, $status, $delta, $message) {
            $attendance->update([
                'time_out' => $now,
                'activity_hours' => $delta,
                'status' => 'approved',
                'task_description' => $message,
                'is_anomaly' => $status === 'late' || $delta <= 0 && $status === 'on_time',
                'anomaly_reason' => $status === 'late'
                    ? 'Clocked in after the on-time window. No hours were added or deducted.'
                    : ($delta <= 0 && $status === 'on_time'
                        ? 'Force-closed without activity hour credit.'
                        : null),
            ]);

            $row = $entry ?: new RenderedHourEntry([
                'event_id' => $event->id,
                'user_id' => $attendance->user_id,
            ]);
            $row->status = $status;
            $row->scanned_at = $row->scanned_at ?: $attendance->time_in;
            $row->hours_delta = $delta;
            $row->attendance_id = $attendance->id;
            $row->save();
        });

        if ($attendance->user_id) {
            Notification::create([
                'user_id' => $attendance->user_id,
                'title' => 'Forced activity clock-out',
                'message' => 'A Super Admin closed your open '.$label.' session. '.$message,
            ]);
        }

        return [
            'ok' => true,
            'attendance_id' => (int) $attendance->id,
            'session_kind' => 'activity',
            'hours_rendered' => (float) $delta,
            'message' => $message,
            'attendance' => $attendance->fresh(['user.profile']),
            'forced_by' => $actor->id,
        ];
    }
}
