<?php

namespace App\Support;

class OffenseCatalog
{
    /** Official minor and major offenses a supervisor or coordinator can record. */
    public const OFFENSES = [
        ['name' => 'Tardiness', 'level' => 'minor'],
        ['name' => 'Leaving the post early', 'level' => 'minor'],
        ['name' => 'Absence without prior notice', 'level' => 'minor'],
        ['name' => 'Incomplete assigned task', 'level' => 'minor'],
        ['name' => 'Improper uniform or ID', 'level' => 'minor'],
        ['name' => 'Unauthorized break', 'level' => 'minor'],
        ['name' => 'Minor policy breach', 'level' => 'minor'],
        ['name' => 'Repeated tardiness or absence', 'level' => 'major'],
        ['name' => 'Insubordination', 'level' => 'major'],
        ['name' => 'Falsifying time records', 'level' => 'major'],
        ['name' => 'Abandonment of duty', 'level' => 'major'],
        ['name' => 'Property damage', 'level' => 'major'],
        ['name' => 'Discourtesy or misconduct', 'level' => 'major'],
        ['name' => 'Gross policy breach', 'level' => 'major'],
    ];

    /** Older labels still stored on records filed before the catalog. */
    private const LEGACY_LEVELS = [
        'absenteeism' => 'minor',
        'policy breach' => 'minor',
        'property damage' => 'major',
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
