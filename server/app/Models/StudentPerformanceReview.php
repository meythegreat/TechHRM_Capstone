<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentPerformanceReview extends Model
{
    protected $fillable = [
        'student_id',
        'recorded_by',
        'school_year',
        'rating',
        'outcome',
        'target_department',
        'notes',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
