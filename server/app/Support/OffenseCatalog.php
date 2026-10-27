<?php

namespace App\Support;

class OffenseCatalog
{
    /** Official minor and major offenses a supervisor or coordinator can record. */
    public const OFFENSES = [
        [
            'name' => 'Late',
            'level' => 'minor',
            'note' => 'Depends on the supervisor. Report when warranted; the penalty is decided case by case.',
        ],
        [
            'name' => 'Absent',
            'level' => 'major',
            'note' => 'Major offense. Three consecutive Assembly & General Cleaning absences trigger a 1-semester suspension.',
        ],
        [
            'name' => 'AWOL',
            'level' => 'major',
            'note' => 'Major offense. Three department replacements trigger a suspension.',
        ],
    ];

    /**
     * Automatic escalation rules tied to Absent / AWOL.
     * Consecutive Assembly & General Cleaning absences → 1-semester suspension.
     * Three replacement departments → suspension.
     */
    public const ESCALATION_RULES = [
        [
            'id' => 'consecutive_assembly_gc_absences',
            'label' => '3 consecutive absences from Assembly & General Cleaning → Suspension for 1 semester',
            'threshold' => 3,
            'violation' => 'Absent',
            'suspension_span' => '1 semester',
        ],
        [
            'id' => 'replacement_departments',
            'label' => '3 replacement departments → Suspension',
            'threshold' => 3,
            'violation' => 'AWOL',
            'suspension_span' => '1 month',
        ],
    ];

    /** Older labels still stored on records filed before the catalog. */
    private const LEGACY_LEVELS = [
        'tardiness' => 'minor',
        'leaving the post early' => 'minor',
        'absence without prior notice' => 'minor',
        'incomplete assigned task' => 'minor',
        'improper uniform or id' => 'minor',
        'unauthorized break' => 'minor',
        'minor policy breach' => 'minor',
        'absenteeism' => 'minor',
        'policy breach' => 'minor',
        'repeated tardiness or absence' => 'major',
        'insubordination' => 'major',
        'falsifying time records' => 'major',
        'abandonment of duty' => 'major',
        'property damage' => 'major',
        'discourtesy or misconduct' => 'major',
        'gross policy breach' => 'major',
    ];

    /**
     * Performance standing decides the placement outcome.
     * Ok stays. Quite ok but needing training is retrained. Bad performance is reassigned.
     */
    public const RATINGS = [
        'ok' => [
            'label' => 'Ok performance',
            'outcome' => 'retainment',
            'outcome_label' => 'Retainment',
        ],
        'needs_training' => [
            'label' => 'Quite ok, needs training',
            'outcome' => 'retraining',
            'outcome_label' => 'Retraining',
        ],
        'bad' => [
            'label' => 'Bad performance',
            'outcome' => 'reassign',
            'outcome_label' => 'Reassign',
        ],
    ];

    public static function names(): array
    {
        return array_column(self::OFFENSES, 'name');
    }

    public static function levelFor(?string $name): ?string
    {
        $needle = strtolower(trim((string) $name));
        foreach (self::OFFENSES as $offense) {
            if (strtolower($offense['name']) === $needle) {
                return $offense['level'];
            }
        }

        return self::LEGACY_LEVELS[$needle] ?? null;
    }

    public static function grouped(): array
    {
        $minor = [];
        $major = [];
        foreach (self::OFFENSES as $offense) {
            if ($offense['level'] === 'major') {
                $major[] = $offense;
            } else {
                $minor[] = $offense;
            }
        }

        return ['minor' => $minor, 'major' => $major];
    }

    public static function currentSchoolYear(): string
    {
        $year = (int) now()->year;
        $start = now()->month >= 6 ? $year : $year - 1;

        return $start . '-' . ($start + 1);
    }
}
