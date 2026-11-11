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
        'work_department',
        'organization_officer',
        'officer_position',
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
            'organization_officer' => 'boolean',
            'supervisor_absent_on' => 'date:Y-m-d',
        ];
    }

    public function getAssignmentLabelAttribute(): string
    {
        $office = trim((string) ($this->attributes['assigned_office'] ?? ''));
        $area = $this->attributes['assignment_area'] ?? null;
        $position = trim((string) ($this->attributes['officer_position'] ?? ''));
        $electedStudent = (bool) ($this->attributes['organization_officer'] ?? false) && $position !== '';
        if ($electedStudent) {
            $placed = \App\Support\AssignmentLabel::format($office, $area);

            return $placed !== '' ? $placed.' · '.$position : $position;
        }

        $work = trim((string) ($this->attributes['work_department'] ?? ''));
        $legacyOfficer = in_array(strtolower($office), ['wspo secretary', 'wspo president'], true);
        if ($legacyOfficer && $work !== '') {
            $placed = \App\Support\AssignmentLabel::format($work, $area);

            return $placed !== '' ? $placed.' · '.$office : $office;
        }

        return \App\Support\AssignmentLabel::format($office, $area);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
