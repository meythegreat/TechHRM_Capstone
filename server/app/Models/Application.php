<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Application extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'preferred_department',
        'available_schedules',
        'reason_for_applying',
        'status',
        'interview_date',
        'interview_remarks',
        'assigned_department',
        'assigned_position'
    ];

    // Tell Laravel to treat this column as an array/JSON
    protected $casts = [
        'available_schedules' => 'array',
        'interview_date' => 'datetime',
    ];

    // Relationship: An application belongs to a User (Student)
    public function applicant()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
