<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class DailyCleaningGroup extends Model
{
    protected $fillable = [
        'name',
        'leader_id',
    ];

    public function students(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'daily_cleaning_group_members', 'group_id', 'user_id')
            ->withTimestamps();
    }

    public function leader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'leader_id');
    }
}
