<?php

namespace App\Support;

use App\Models\User;

class WorkRequirement
{
    public const STANDARD_HOURS = 80.0;

    public const SPECIAL_HOURS = 100.0;

    public static function hoursFor(?User $user): float
    {
        $user?->loadMissing('profile');

        return $user?->profile?->special_hours_request
            ? self::SPECIAL_HOURS
            : self::STANDARD_HOURS;
    }
};
