<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RenderedHourEntry extends Model
{
    /** Clocked in for an activity. Hours stay at zero until the student times out. */
    public const TIMED_IN = 'timed_in';

    protected $fillable = [
        'event_id',
        'user_id',
        'status',
        'scanned_at',
        'hours_delta',
        'attendance_id',
    ];

    protected $casts = [
        'scanned_at' => 'datetime',
        'hours_delta' => 'float',
    ];

    public function event(): BelongsTo
    {
        return $this->belongsTo(RenderedHourEvent::class, 'event_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
