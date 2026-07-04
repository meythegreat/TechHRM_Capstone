<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'attendance_type',
        'verification_code_used',
        'time_in',
        'time_out',
        'rendered_hours',
        'computed_hours',
        'work_type',
        'task_description',
        'status',
        'is_anomaly',
        'anomaly_reason',
    ];

    protected $casts = [
        'time_in' => 'datetime',
        'time_out' => 'datetime',
        'is_anomaly' => 'boolean',
        'computed_hours' => 'decimal:2',
    ];

    // An attendance record belongs to one specific User
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
