<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentAward extends Model
{
    protected $fillable = [
        'student_id',
        'awarded_by',
        'school_year',
        'title',
        'citation',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function awarder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'awarded_by');
    }
}
