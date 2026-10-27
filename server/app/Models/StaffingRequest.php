<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StaffingRequest extends Model
{
    protected $fillable = [
        'requested_by',
        'department',
        'duty_type',
        'duty_request',
        'event_title',
        'duty_period',
        'duty_start_date',
        'duty_end_date',
        'hours_per_day',
        'reason',
        'approval_letter_path',
        'quantity',
        'requested_genders',
        'assigned_student_ids',
        'status',
    ];

    protected $casts = [
        'assigned_student_ids' => 'array',
        'requested_genders' => 'array',
        'duty_start_date' => 'date:Y-m-d',
        'duty_end_date' => 'date:Y-m-d',
        'hours_per_day' => 'float',
    ];

    public function requester()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function assignedStudents()
    {
        return User::query()
            ->where('role', 'Student')
            ->whereIn('id', $this->assigned_student_ids ?? []);
    }
}
