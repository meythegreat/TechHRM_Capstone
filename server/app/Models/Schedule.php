<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Schedule extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'day',
        'time',
        'duty_type',
        'department',
        'supervisor'
    ];

    // A schedule belongs to a specific user
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
