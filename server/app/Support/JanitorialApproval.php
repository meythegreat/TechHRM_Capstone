<?php

namespace App\Support;

use App\Http\Controllers\UserController;
use App\Models\Attendance;
use App\Models\JanitorialGroup;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Janitorial duty is reviewed twice.
 * The janitorial supervisor records a decision, a deduction, and notes.
 * The immediate supervisor — a separate account from the department secretary —
 * reviews that recommendation and has the final say for their department.
 * The department supervisor may give that final say only after the immediate
 * supervisor has reported an absence in advance.
 */
class JanitorialApproval
{
    public const RECOMMENDED = 'recommended';

    public const LEADER_DECLINED = 'leader_declined';

    public const AWAITING_FINAL = 'awaiting_final';

    public static function awaitingFinal(?string $status): bool
    {
        return in_array(strtolower((string) $status), [
            self::RECOMMENDED,
            self::LEADER_DECLINED,
            self::AWAITING_FINAL,
        ], true);
    }

    public static function isFinal(?string $status): bool
    {
        return in_array(strtolower((string) $status), ['accepted', 'approved', 'rejected'], true);
    }

    public static function creditedHours(float $deducted): float
    {
        $deducted = max(0, min(DutyHours::JANITORIAL_FIXED_HOURS, round($deducted, 2)));

        return round(DutyHours::JANITORIAL_FIXED_HOURS - $deducted, 2);
    }

    public static function isImmediateSupervisor(User $user, JanitorialGroup $group): bool
    {
        return (int) ($group->immediate_supervisor_user_id ?? 0) === (int) $user->id;
    }

    public static function isJanitorialSupervisor(User $user, JanitorialGroup $group): bool
    {
        return $user->role === 'Student'
            && (int) $group->supervisor_user_id === (int) $user->id;
    }

    /**
     * Null when this person may be assigned as an immediate supervisor.
     */
    public static function immediateSupervisorBlock(User $user): ?string
    {
        if ($user->role !== 'Immediate Supervisor') {
            return 'The immediate supervisor is a separate account from the department secretary and the department supervisor.';
        }

        return null;
    }

    /**
     * The one Immediate Supervisor account assigned to this department.
     */
    public static function resolveImmediateSupervisor(string $department): User
    {
        $department = trim($department);
        if ($department === '') {
            abort(422, 'Select the department area for this janitorial group.');
        }

        $accounts = app(UserController::class);
        $matches = User::query()
            ->with('profile')
            ->where('role', 'Immediate Supervisor')
            ->get()
            ->filter(function (User $user) use ($accounts, $department) {
                $office = trim((string) ($user->profile?->assigned_office ?? ''));

                return $office !== '' && $accounts->officesMatch($office, $department);
            })
            ->values();

        if ($matches->isEmpty()) {
            abort(422, 'No immediate supervisor is assigned to '.$department.'. Create that account first. It is separate from the department secretary.');
        }

        if ($matches->count() > 1) {
            abort(422, $department.' has more than one immediate supervisor. Keep one account for that department.');
        }

        return $matches->first();
    }

    public static function immediateSupervisorAbsentOn(int $userId, Carbon $date): bool
    {
        if ($userId <= 0 || ! Schema::hasTable('janitorial_immediate_absences')) {
            return false;
        }

        return DB::table('janitorial_immediate_absences')
            ->where('user_id', $userId)
            ->whereDate('absent_on', $date->toDateString())
            ->exists();
    }

    public static function isDeanOrPersonInCharge(User $actor, string $department): bool
    {
        $actor->loadMissing('profile');
        $title = strtolower(trim(
            (string) ($actor->profile?->assigned_office ?? '').' '.(string) ($actor->profile?->officer_position ?? '')
        ));
        $isDean = str_contains($title, 'dean');
        $isPersonInCharge = $actor->role === 'Supervisor';
        if (! $isDean && ! $isPersonInCharge) {
            return false;
        }

        $department = trim($department);
        if ($department === '' || strcasecmp($department, 'Campus') === 0) {
            return true;
        }

        $accounts = app(UserController::class);
        $labels = $accounts->supervisedDepartments($actor);
        $office = trim((string) ($actor->profile?->assigned_office ?? ''));
        if ($office !== '') {
            $labels[] = $office;
        }

        foreach ($labels as $label) {
            if ($accounts->officesMatch((string) $label, $department)) {
                return true;
            }
        }

        return false;
    }

    public static function canCover(User $actor, JanitorialGroup $group, Carbon $dutyDate): bool
    {
        $immediateId = (int) ($group->immediate_supervisor_user_id ?? 0);
        if ($immediateId <= 0 || $immediateId === (int) $actor->id) {
            return false;
        }

        if (! self::immediateSupervisorAbsentOn($immediateId, $dutyDate)) {
            return false;
        }

        return self::isDeanOrPersonInCharge($actor, (string) $group->department);
    }

    /**
     * Write the credited DTR hours. Returns an error message, or null on success.
     */
    public static function credit(Attendance $attendance, float $hours, string $note): ?string
    {
        $hours = round(max(0, min(DutyHours::JANITORIAL_FIXED_HOURS, $hours)), 2);
        $timeIn = Carbon::parse($attendance->time_in);
        $end = $hours > 0
            ? $timeIn->copy()->addMinutes((int) round($hours * 60))
            : $timeIn->copy();

        if ($hours > 0 && ManualDtrEntry::overlaps((int) $attendance->user_id, $timeIn, $end, (int) $attendance->id)) {
            return 'These hours overlap another DTR entry for this student.';
        }

        if ($hours > 0) {
            $fit = HourLimits::fitHours((int) $attendance->user_id, $hours, $timeIn, (int) $attendance->id);
            if ($fit['allowed'] + 0.001 < $hours) {
                return $fit['denial']
                    ?? $fit['message']
                    ?? 'This student does not have '.$hours.' hours left under the weekly or monthly limit.';
            }
        }

        $task = trim((string) ($attendance->task_description ?? ''));
        $attendance->update([
            'time_out' => $end,
            'computed_hours' => $hours,
            'rendered_hours' => $hours,
            'status' => 'accepted',
            'task_description' => $task === '' ? $note : ($task.' '.$note),
        ]);

        return null;
    }
}
