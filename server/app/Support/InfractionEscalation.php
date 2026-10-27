<?php

namespace App\Support;

use App\Models\DisciplinaryRecord;
use App\Models\Notification;
use App\Models\RenderedHourEntry;
use App\Models\RenderedHourEvent;
use App\Models\SemesterTerm;
use App\Models\StudentDepartmentReplacement;
use App\Models\User;
use Carbon\Carbon;

class InfractionEscalation
{
    public const CONSECUTIVE_ABSENCE_THRESHOLD = 3;
    public const REPLACEMENT_THRESHOLD = 3;

    /**
     * After Assembly or General Cleaning is marked absent, suspend for 1 semester
     * once the student has 3 consecutive absences across those activities.
     */
    public function checkConsecutiveActivityAbsences(int $studentId, ?int $recordedBy = null): ?DisciplinaryRecord
    {
        $streak = $this->consecutiveAssemblyGcAbsences($studentId);
        if ($streak < self::CONSECUTIVE_ABSENCE_THRESHOLD) {
            return null;
        }

        if ($this->hasOpenAutoSuspension($studentId, 'consecutive Assembly & General Cleaning absences')) {
            return null;
        }

        return $this->createAutoSuspension(
            $studentId,
            'Absent',
            '1 semester',
            "Automatic suspension after {$streak} consecutive absences from Assembly & General Cleaning.",
            'consecutive Assembly & General Cleaning absences',
            $recordedBy
        );
    }

    /**
     * Record a department replacement (not the first placement). At 3 replacements, suspend.
     */
    public function recordDepartmentReplacement(
        int $studentId,
        ?string $fromDepartment,
        string $toDepartment,
        ?int $recordedBy = null,
        string $source = 'reassign'
    ): ?DisciplinaryRecord {
        $from = trim((string) $fromDepartment);
        $to = trim($toDepartment);
        if ($to === '' || $from === '' || strcasecmp($from, $to) === 0) {
            return null;
        }

        StudentDepartmentReplacement::create([
            'student_id' => $studentId,
            'recorded_by' => $recordedBy,
            'from_department' => $from,
            'to_department' => $to,
            'source' => $source,
        ]);

        $count = StudentDepartmentReplacement::where('student_id', $studentId)->count();
        if ($count < self::REPLACEMENT_THRESHOLD) {
            return null;
        }

        if ($this->hasOpenAutoSuspension($studentId, 'department replacements')) {
            return null;
        }

        return $this->createAutoSuspension(
            $studentId,
            'AWOL',
            '1 month',
            "Automatic suspension after {$count} department replacements (most recent: {$from} → {$to}).",
            'department replacements',
            $recordedBy
        );
    }

    public function consecutiveAssemblyGcAbsences(int $studentId): int
    {
        $entries = RenderedHourEntry::query()
            ->where('user_id', $studentId)
            ->whereNotNull('status')
            ->whereHas('event', function ($query) {
                $query->whereIn('kind', [
                    RenderedHourEvent::GENERAL_CLEANING,
                    RenderedHourEvent::ASSEMBLY,
                ]);
            })
            ->with(['event:id,kind,event_date'])
            ->get()
            ->sortBy(function (RenderedHourEntry $entry) {
                $date = optional($entry->event)->event_date;
                $stamp = $date ? Carbon::parse($date)->format('Y-m-d') : '0000-00-00';

                return $stamp . '|' . str_pad((string) $entry->event_id, 10, '0', STR_PAD_LEFT);
            })
            ->values();

        $streak = 0;
        foreach ($entries->reverse() as $entry) {
            if ($entry->status === 'absent') {
                $streak++;
                continue;
            }
            break;
        }

        return $streak;
    }

    public function replacementCount(int $studentId): int
    {
        return StudentDepartmentReplacement::where('student_id', $studentId)->count();
    }

    private function hasOpenAutoSuspension(int $studentId, string $reasonNeedle): bool
    {
        return DisciplinaryRecord::query()
            ->where('student_id', $studentId)
            ->where('penalty', 'Suspension')
            ->whereIn('status', ['Active', 'Pending Appeal'])
            ->where(function ($query) {
                $query->whereNull('suspension_ends_at')
                    ->orWhere('suspension_ends_at', '>', now());
            })
            ->where('suspension_reason', 'like', '%' . $reasonNeedle . '%')
            ->exists();
    }

    private function createAutoSuspension(
        int $studentId,
        string $violation,
        string $span,
        string $description,
        string $reasonTag,
        ?int $recordedBy
    ): DisciplinaryRecord {
        [$length, $endsAt] = $this->suspensionWindow($span);
        $issuerId = $recordedBy ?: $this->fallbackIssuerId($studentId);

        $record = DisciplinaryRecord::create([
            'student_id' => $studentId,
            'issued_by' => $issuerId,
            'violation_type' => $violation,
            'offense_level' => OffenseCatalog::levelFor($violation),
            'incident_date' => now()->toDateString(),
            'description' => $description,
            'penalty_hours' => 0,
            'penalty' => 'Suspension',
            'deduction_amount' => 0,
            'suspension_length' => $length,
            'suspension_ends_at' => $endsAt,
            'suspension_reason' => "Policy escalation: {$reasonTag}.",
            'status' => 'Active',
        ]);

        Notification::create([
            'user_id' => $studentId,
            'title' => 'Infraction Decision',
            'message' => $record->suspensionNotice() . " This is for {$violation}.",
        ]);

        $coordinators = User::whereIn('role', ['WSPO Staff', 'Super Admin'])->get(['id']);
        foreach ($coordinators as $coordinator) {
            if ((int) $coordinator->id === (int) $issuerId) {
                continue;
            }
            Notification::create([
                'user_id' => $coordinator->id,
                'title' => 'Automatic Suspension Applied',
                'message' => "A working student received an automatic {$length} suspension for {$reasonTag}.",
            ]);
        }

        return $record;
    }

    /** @return array{0: string, 1: Carbon} */
    private function suspensionWindow(string $span): array
    {
        $start = Carbon::now();

        if ($span === '1 semester') {
            $term = SemesterTerm::current();
            if ($term && $term->ends_on && $term->ends_on->greaterThan($start)) {
                return ['1 semester', $term->ends_on->copy()->endOfDay()];
            }

            $months = (int) ($term?->months ?: 5);

            return ['1 semester', $start->copy()->addMonthsNoOverflow(max(1, $months))];
        }

        if ($span === '1 month') {
            return ['1 month', $start->copy()->addMonth()];
        }

        return ['1 month', $start->copy()->addMonth()];
    }

    private function fallbackIssuerId(int $studentId): int
    {
        $coordinator = User::whereIn('role', ['WSPO Staff', 'Super Admin'])->orderBy('id')->value('id');

        return (int) ($coordinator ?: $studentId);
    }
}
