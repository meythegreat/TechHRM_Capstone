<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Str;

class AccountLogin
{
    public static function generateUsername(string $firstName, string $lastName): string
    {
        $first = strtolower(preg_replace('/[^a-z0-9]/i', '', $firstName) ?? '');
        $last = strtolower(preg_replace('/[^a-z0-9]/i', '', $lastName) ?? '');
        $base = trim($first . '.' . $last, '.');

        if ($base === '') {
            $base = 'user';
        }

        for ($attempt = 0; $attempt < 25; $attempt++) {
            $candidate = $base . random_int(0, 999);
            if (!self::identifierTaken($candidate)) {
                return $candidate;
            }
        }

        return $base . strtolower(Str::random(6));
    }

    public static function identifierTaken(string $value, ?int $ignoreUserId = null): bool
    {
        $value = strtolower(trim($value));
        if ($value === '') {
            return false;
        }

        return User::query()
            ->when($ignoreUserId, fn ($query) => $query->where('id', '!=', $ignoreUserId))
            ->where(function ($query) use ($value) {
                // Bind the empty fallback — Postgres treats "" as an identifier, not a string.
                $query->whereRaw('LOWER(username) = ?', [$value])
                    ->orWhereRaw('LOWER(COALESCE(email, ?)) = ?', ['', $value]);
            })
            ->exists();
    }
}
