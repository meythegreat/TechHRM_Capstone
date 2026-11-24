<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScheduleSubmissionEntry extends Model
{
    protected $fillable = [
        'schedule_submission_id',
        'day',
        'time',
        'duty_type',
        'subject',
        'room',
        'instructor',
        'kept',
    ];

    protected $casts = [
        'kept' => 'boolean',
    ];

    public function submission(): BelongsTo
    {
        return $this->belongsTo(ScheduleSubmission::class, 'schedule_submission_id');
    }
}
