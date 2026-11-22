<?php

namespace App\Models;

use App\Traits\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ManualAttendanceRequest extends Model
{
    use RecordsActivity;

    public const PENDING = 'Pending';

    /** Janitorial supervisor recorded a decision. The immediate supervisor still decides. */
    public const RECOMMENDED = 'Recommended';

    public const APPROVED = 'Approved';
    public const REJECTED = 'Rejected';

    public const TYPE_REGULAR = 'regular';
    public const TYPE_JANITORIAL = 'janitorial';
    public const TYPE_CLASS_HOURS = 'class_hours';

    public const DEFAULT_REASON = 'Office had no internet; submitted for supervisor approval.';

    public const CLASS_HOURS_REASON = 'Duty during class hours; submitted for supervisor approval.';

    protected $fillable = [
        'user_id',
        'client_request_id',
        'request_type',
        'reason',
        'status',
        'decision_note',
        'reviewed_by',
        'reviewed_at',
        'janitorial_leader_decision',
        'janitorial_deducted_hours',
        'janitorial_leader_remarks',
        'janitorial_leader_reviewed_by',
        'janitorial_leader_reviewed_at',
        'janitorial_final_on_behalf',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
        'janitorial_leader_reviewed_at' => 'datetime',
        'janitorial_deducted_hours' => 'float',
        'janitorial_final_on_behalf' => 'boolean',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function shifts(): HasMany
    {
        return $this->hasMany(ManualAttendanceRequestShift::class)
            ->orderBy('sort_order')
            ->orderBy('work_date')
            ->orderBy('time_in');
    }

    public function isPending(): bool
    {
        return $this->status === self::PENDING;
    }
}
