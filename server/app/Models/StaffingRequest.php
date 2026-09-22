<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StaffingRequest extends Model
{
    protected $fillable = ['requested_by', 'department', 'duty_type', 'duty_request', 'quantity', 'requested_genders', 'assigned_student_ids', 'status'];

    protected $casts = [
        'assigned_student_ids' => 'array',
        'requested_genders' => 'array',
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
