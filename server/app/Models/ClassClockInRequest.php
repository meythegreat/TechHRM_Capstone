<?php

namespace App\Models;

use App\Traits\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClassClockInRequest extends Model
{
    use RecordsActivity;

    public const PENDING = 'Pending';

    public const APPROVED = 'Approved';

    public const REJECTED = 'Rejected';

    protected $fillable = [
        'user_id',
        'schedule_id',
        'class_day',
        'class_time',
        'class_subject',
        'class_room',
        'class_instructor',
        'reason',
        'status',
        'decision_note',
        'reviewed_by',
        'reviewed_at',
        'attendance_id',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function schedule(): BelongsTo
    {
        return $this->belongsTo(Schedule::class);
    }

    public function attendance(): BelongsTo
    {
        return $this->belongsTo(Attendance::class);
    }

    public function isPending(): bool
    {
        return $this->status === self::PENDING;
    }
}
