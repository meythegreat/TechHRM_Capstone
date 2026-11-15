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
    public const APPROVED = 'Approved';
    public const REJECTED = 'Rejected';

    public const DEFAULT_REASON = 'Office had no internet; submitted for supervisor approval.';

    protected $fillable = [
        'user_id',
        'reason',
        'status',
        'decision_note',
        'reviewed_by',
        'reviewed_at',
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
