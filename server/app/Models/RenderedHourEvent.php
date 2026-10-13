<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RenderedHourEvent extends Model
{
    public const SPECIAL = 'special_request';

    public const DAILY_CLEANING = 'daily_cleaning';

    public const GENERAL_CLEANING = 'general_cleaning';

    public const DEVOTIONAL = 'devotional';

    public const ASSEMBLY = 'meeting_assembly';

    public const KINDS = [
        self::SPECIAL => ['label' => 'Special request', 'hours' => null],
        self::DAILY_CLEANING => ['label' => 'Daily cleaning', 'hours' => 1, 'window' => 60],
        self::GENERAL_CLEANING => ['label' => 'General cleaning', 'hours' => 5, 'window' => 60],
        self::DEVOTIONAL => ['label' => 'Devotional meeting', 'hours' => 1, 'window' => 60],
        self::ASSEMBLY => ['label' => 'Meeting assembly', 'hours' => 5, 'window' => 60],
    ];

    protected $fillable = [
        'kind',
        'title',
        'event_date',
        'hours',
        'direction',
        'year_level',
        'group_name',
        'starts_at',
        'valid_until',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'event_date' => 'date:Y-m-d',
        'hours' => 'float',
        'year_level' => 'integer',
    ];

    public function entries(): HasMany
    {
        return $this->hasMany(RenderedHourEntry::class, 'event_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function usesAttendance(): bool
    {
        return $this->kind !== self::SPECIAL;
    }

    public function windowMinutes(): int
    {
        return (int) (self::KINDS[$this->kind]['window'] ?? 60);
    }

    public function officialStart(): ?Carbon
    {
        if (!$this->starts_at || !$this->event_date) {
            return null;
        }

        return Carbon::parse($this->event_date->toDateString().' '.substr((string) $this->starts_at, 0, 5));
    }

    /** On time through one hour after the official time in. A later clock-in is late. */
    public function statusAt(Carbon $moment): string
    {
        $start = $this->officialStart();
        if (!$start) {
            return 'on_time';
        }

        if ($moment->lt($start)) {
            return 'late';
        }

        $cutoff = $start->copy()->addMinutes($this->windowMinutes());
        if (!$moment->isSameDay($start) || $moment->gt($cutoff)) {
            return 'late';
        }

        return 'on_time';
    }

    /**
     * On time adds the event hours. A late scan adds nothing and deducts nothing.
     * Absent deducts the same hours. Special requests apply the entered hours directly.
     */
    public function deltaFor(?string $status): float
    {
        $hours = round((float) $this->hours, 2);
        if ($this->kind === self::SPECIAL) {
            return $this->direction === 'deduct' ? -$hours : $hours;
        }

        return match ($status) {
            'on_time' => $hours,
            'late' => 0.0,
            'absent' => -$hours,
            default => 0.0,
        };
    }
}
