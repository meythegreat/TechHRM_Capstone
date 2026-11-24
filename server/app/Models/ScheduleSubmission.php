<?php

namespace App\Models;

use App\Traits\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ScheduleSubmission extends Model
{
    use RecordsActivity;

    public const PENDING = 'Pending';

    public const APPROVED = 'Approved';

    public const REJECTED = 'Rejected';

    protected $fillable = [
        'user_id',
        'kind',
        'status',
        'proof_path',
        'proof_name',
        'reviewed_by',
        'reviewed_at',
        'review_note',
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

    public function entries(): HasMany
    {
        return $this->hasMany(ScheduleSubmissionEntry::class);
    }

    public function isPending(): bool
    {
        return $this->status === self::PENDING;
    }

    public function isClass(): bool
    {
        return $this->kind === 'class';
    }
}
