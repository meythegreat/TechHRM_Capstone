<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DisciplinaryRecord extends Model
{
    protected $fillable = [
        'student_id',
        'issued_by',
        'violation_type',
        'description',
        'penalty_hours',
        'status',
        'appeal_notes',
        'resolved_at',
        'resolution_remarks',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
        'penalty_hours' => 'decimal:2',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function issuer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'issued_by');
    }
}
