<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\RecordsActivity;

class UserProfile extends Model
{
    use HasFactory, RecordsActivity;

    protected $fillable = [
        'user_id',
        'student_id_number',
        'course',
        'year_level',
        'gender',
        'assigned_office',
        'assignment_area',
        'special_hours_request',
        'supervised_departments',
        'secretary_departments',
        'supervisor_absent_on',
        'duty_type',
        'duty_request',
    ];

    protected $appends = ['assignment_label'];

    protected function casts(): array
    {
        return [
            'supervised_departments' => 'array',
            'secretary_departments' => 'array',
            'special_hours_request' => 'boolean',
            'supervisor_absent_on' => 'date:Y-m-d',
        ];
    }

    public function getAssignmentLabelAttribute(): string
    {
        return \App\Support\AssignmentLabel::format(
            $this->attributes['assigned_office'] ?? null,
            $this->attributes['assignment_area'] ?? null,
        );
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
