<?php

namespace App\Support;

/**
 * Shared person-name helpers for account display names, profiles, and printouts.
 * Keeps multi-word surnames with particles (De / Del / De la / Van / …) intact.
 */
class PersonName
{
    /** @var list<string> */
    private const TITLE_PREFIXES = [
        'mr.',
        'ms.',
        'mrs.',
        'miss.',
        'dr.',
        'atty.',
        'engr.',
        'prof.',
    ];

    /** @var list<string> */
    private const SURNAME_PARTICLES = [
        'af',
        'al',
        'bin',
        'binti',
        'da',
        'das',
        'de',
        'del',
        'dela',
        'della',
        'der',
        'di',
        'do',
        'dos',
        'du',
        'el',
        'ibn',
        'la',
        'las',
        'le',
        'les',
        'los',
        'op',
        'san',
        'santa',
        'santo',
        'st',
        'st.',
        'ste',
        'ten',
        'ter',
        'van',
        'von',
        'y',
        'zu',
        'zur',
    ];

    public static function normalizeAbbreviation(?string $value): string
    {
        $abbreviation = rtrim(trim((string) $value), '.');

        return $abbreviation === '' ? '' : $abbreviation.'.';
    }

    public static function middleInitial(?string $middleName): string
    {
        $middleName = trim((string) $middleName);
        if ($middleName === '') {
            return '';
        }

        $middleName = rtrim($middleName, '.');
        $letter = mb_substr($middleName, 0, 1);
        if ($letter === '' || ! preg_match('/^\p{L}$/u', $letter)) {
            return '';
        }

        return mb_strtoupper($letter).'.';
    }

    public static function displayName(string $firstName, ?string $middleName, string $lastName, ?string $prefix = null): string
    {
        $title = $prefix !== null && trim($prefix) !== ''
            ? self::normalizeAbbreviation($prefix)
            : '';
        $initial = self::middleInitial($middleName);
        $parts = array_filter([
            $title,
            trim($firstName),
            $initial,
            trim($lastName),
        ], fn ($part) => $part !== '');

        return trim(preg_replace('/\s+/u', ' ', implode(' ', $parts)) ?? '');
    }

    /**
     * @return array{prefix: string, first_name: string, middle_initial: string, last_name: string}
     */
    public static function parse(string $fullName): array
    {
        $parts = preg_split('/\s+/u', trim($fullName), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $prefix = '';
        $firstName = '';
        $middleInitial = '';
        $lastName = '';

        if ($parts === []) {
            return [
                'prefix' => $prefix,
                'first_name' => $firstName,
                'middle_initial' => $middleInitial,
                'last_name' => $lastName,
            ];
        }

        $firstToken = $parts[0];
        $normalizedFirst = mb_strtolower(self::normalizeAbbreviation($firstToken));
        if (in_array($normalizedFirst, self::TITLE_PREFIXES, true)
            || (str_ends_with($firstToken, '.') && mb_strlen($firstToken) > 2)) {
            $prefix = self::normalizeAbbreviation(array_shift($parts) ?? '');
        }

        if ($parts === []) {
            return [
                'prefix' => $prefix,
                'first_name' => $firstName,
                'middle_initial' => $middleInitial,
                'last_name' => $lastName,
            ];
        }

        $lastTokens = [array_pop($parts)];
        while ($parts !== [] && self::isSurnameParticle($parts[array_key_last($parts)])) {
            array_unshift($lastTokens, array_pop($parts));
        }
        $lastName = implode(' ', array_filter($lastTokens, fn ($token) => $token !== null && $token !== ''));

        if ($parts !== []) {
            $miCandidate = $parts[array_key_last($parts)];
            if (self::isMiddleInitialToken((string) $miCandidate)) {
                $middleInitial = self::normalizeAbbreviation((string) array_pop($parts));
            } elseif (count($parts) > 1) {
                $middleName = (string) array_pop($parts);
                $middleInitial = self::middleInitial($middleName);
            }
        }

        $firstName = implode(' ', $parts);

        return [
            'prefix' => $prefix,
            'first_name' => $firstName,
            'middle_initial' => $middleInitial,
            'last_name' => $lastName,
        ];
    }

    private static function isSurnameParticle(string $token): bool
    {
        return in_array(mb_strtolower(trim($token)), self::SURNAME_PARTICLES, true);
    }

    private static function isMiddleInitialToken(string $token): bool
    {
        return (bool) preg_match('/^\p{L}\.*$/u', trim($token));
    }
}
