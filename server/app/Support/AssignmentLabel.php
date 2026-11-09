<?php

namespace App\Support;

use App\Models\Office;
use Illuminate\Support\Facades\Schema;

class AssignmentLabel
{
    /**
     * Acronyms for offices that are stored under a full college name.
     *
     * @var array<string, string>
     */
    private const KNOWN = [
        'college of computer studies' => 'CCS',
        'college of nursing' => 'CON',
        'college of business and accountancy' => 'CBA',
        'college of business administration' => 'CBA',
        'college of criminal justice education' => 'CCJE',
        'college of electronic engineering' => 'COE',
        'college of engineering' => 'COE',
        'college of hospitality and tourism management' => 'CHTM',
        'college of hotel and tourism management' => 'CHTM',
        'college of teacher education' => 'CTE',
        'college of arts and sciences' => 'CAS',
        'graduate school' => 'GS',
        'senior high school department' => 'SHS',
        'high school' => 'SHS',
        'junior high school department' => 'JHS',
        'kindergarten/elementary' => 'ES',
        'elementary department' => 'ES',
        'pre-school department' => 'PS',
        'working students program office' => 'WSPO',
        'wspo' => 'WSPO',
    ];

    public static function format(?string $office, ?string $area = null, ?string $abbreviation = null): string
    {
        $office = trim((string) $office);
        $area = trim((string) $area);
        $short = trim((string) $abbreviation);
        if ($short === '') {
            $short = self::abbreviationFor($office);
        }

        $head = $short !== '' ? $short : $office;
        if ($head === '') {
            return $area;
        }
        if ($area === '') {
            return $head;
        }

        return $head.' - '.$area;
    }

    public static function abbreviationFor(?string $office): string
    {
        $office = trim((string) $office);
        if ($office === '') {
            return '';
        }

        if (preg_match('/\(([A-Za-z0-9]{2,12})\)\s*$/', $office, $match)) {
            return strtoupper($match[1]);
        }

        $known = self::KNOWN[strtolower($office)] ?? '';
        if ($known !== '') {
            return $known;
        }

        try {
            if (Schema::hasTable('offices')) {
                $stored = Office::query()
                    ->whereRaw('LOWER(name) = ?', [strtolower($office)])
                    ->value('abbreviation');
                $stored = trim((string) $stored);
                if ($stored !== '') {
                    return $stored;
                }
            }
        } catch (\Throwable) {
            return '';
        }

        return '';
    }
};
