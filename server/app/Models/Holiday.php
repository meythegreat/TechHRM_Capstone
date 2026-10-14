<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Holiday extends Model
{
    protected $fillable = [
        'date',
        'end_date',
        'name',
        'kind',
        'portion',
        'starts_at',
        'ends_at',
        'created_by',
    ];

    protected $casts = [
        'date' => 'date',
        'end_date' => 'date',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
