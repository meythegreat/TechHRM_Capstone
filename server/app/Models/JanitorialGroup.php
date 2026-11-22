<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class JanitorialGroup extends Model
{
    /** One janitorial supervisor may cover at most this many areas. */
    public const MAX_GROUPS = 3;

    /** Members on one janitorial group. */
    public const MAX_MEMBERS = 6;

    protected $fillable = [
        'department',
        'name',
        'area',
        'supervisor_user_id',
        'immediate_supervisor_user_id',
    ];

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_user_id');
    }

    public function immediateSupervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'immediate_supervisor_user_id');
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'janitorial_group_members', 'group_id', 'user_id')
            ->withTimestamps();
    }

    public function includesStudent(int $userId): bool
    {
        return $this->members()->where('users.id', $userId)->exists();
    }

    public function isSupervisedBy(int $userId): bool
    {
        return (int) $this->supervisor_user_id === $userId;
    }
}
