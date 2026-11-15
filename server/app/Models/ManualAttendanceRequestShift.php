<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ManualAttendanceRequestShift extends Model
{
    protected $fillable = [
        'manual_attendance_request_id',
        'work_date',
        'time_in',
        'time_out',
        'janitorial_area',
        'janitorial_group_id',
        'sort_order',
        'attendance_id',
    ];

    protected $casts = [
        'work_date' => 'date',
    ];

    public function request(): BelongsTo
    {
        return $this->belongsTo(ManualAttendanceRequest::class, 'manual_attendance_request_id');
    }

    public function attendance(): BelongsTo
    {
        return $this->belongsTo(Attendance::class);
    }
}
