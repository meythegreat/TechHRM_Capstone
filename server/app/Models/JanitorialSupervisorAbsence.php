<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JanitorialSupervisorAbsence extends Model
{
    public const PENDING = 'Pending';

    public const APPROVED = 'Approved';

    public const REJECTED = 'Rejected';

    protected $fillable = [
        'user_id',
        'absent_on',
        'reason',
        'status',
        'decision_note',
        'reviewed_by',
        'reviewed_at',
    ];

    protected $casts = [
        'absent_on' => 'date',
        'reviewed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
