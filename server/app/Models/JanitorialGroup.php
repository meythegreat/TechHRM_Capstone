<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class JanitorialGroup extends Model
{
    public const MAX_PER_DEPARTMENT = 5;

    public const MAX_MEMBERS = 5;

    protected $fillable = [
        'department',
        'name',
        'area',
        'supervisor_user_id',
    ];

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_user_id');
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'janitorial_group_members', 'group_id', 'user_id')
            ->withTimestamps();
    }

    public function includesStudent(int $userId): bool
    {
        if ((int) $this->supervisor_user_id === $userId) {
            return true;
        }

        return $this->members()->where('users.id', $userId)->exists();
    }
}
