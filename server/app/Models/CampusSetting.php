<?php

namespace App\Models;

use App\Traits\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CampusSetting extends Model
{
    use RecordsActivity;

    protected $fillable = [
        'hourly_rate',
        'weekly_standard_hours',
        'weekly_extended_hours',
        'monthly_max_hours',
        'updated_by',
    ];

    protected $casts = [
        'hourly_rate' => 'float',
        'weekly_standard_hours' => 'float',
        'weekly_extended_hours' => 'float',
        'monthly_max_hours' => 'float',
    ];

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public static function current(): self
    {
        $setting = static::query()->orderBy('id')->first();
        if ($setting) {
            return $setting;
        }

        return static::query()->create([
            'hourly_rate' => 28,
            'weekly_standard_hours' => 20,
            'weekly_extended_hours' => 25,
            'monthly_max_hours' => 100,
        ]);
    }

    public static function hourlyRate(): float
    {
        return round((float) static::current()->hourly_rate, 2);
    }

    /** @return array{weekly_standard: float, weekly_extended: float, monthly_max: float} */
    public static function hourLimits(): array
    {
        $setting = static::current();

        return [
            'weekly_standard' => round((float) ($setting->weekly_standard_hours ?? 20), 2),
            'weekly_extended' => round((float) ($setting->weekly_extended_hours ?? 25), 2),
            'monthly_max' => round((float) ($setting->monthly_max_hours ?? 100), 2),
        ];
    }
}
