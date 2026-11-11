<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShiftReminder extends Model
{
    protected $fillable = [
        'user_id',
        'dedupe_key',
        'kind',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
