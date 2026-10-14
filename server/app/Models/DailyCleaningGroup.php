<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class DailyCleaningGroup extends Model
{
    protected $fillable = [
        'name',
    ];

    public function students(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'daily_cleaning_group_members', 'group_id', 'user_id')
            ->withTimestamps();
    }
}
