<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AssemblyYearRepresentative extends Model
{
    protected $fillable = [
        'year_level',
        'user_id',
    ];

    protected $casts = [
        'year_level' => 'integer',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public static function forYear(int $yearLevel): ?self
    {
        return static::query()->where('year_level', $yearLevel)->first();
    }

    public static function forUser(int $userId): ?self
    {
        return static::query()->where('user_id', $userId)->first();
    }
}
