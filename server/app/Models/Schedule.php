<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Schedule extends Model
{
    protected $fillable = [
        'user_id',
        'day',
        'time',
        'duty_type',
        'department',
        'supervisor'
    ];

    // Link back to the user
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
