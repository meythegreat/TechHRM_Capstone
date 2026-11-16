<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Schema;

class JanitorialLeader extends Model
{
    protected $fillable = [
        'user_id',
        'is_present',
    ];

    protected $casts = [
        'is_present' => 'boolean',
    ];

    /** Coordinator marks a leader absent when they are not with the group. */
    public static function isOnDuty(int $userId): bool
    {
        if (! Schema::hasTable('janitorial_leaders') || ! Schema::hasColumn('janitorial_leaders', 'is_present')) {
            return true;
        }

        $flag = static::query()->where('user_id', $userId)->value('is_present');

        return $flag === null ? true : (bool) $flag;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function groups(): HasMany
    {
        return $this->hasMany(JanitorialGroup::class, 'supervisor_user_id', 'user_id');
    }
}
