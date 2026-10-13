<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Application extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'first_name',
        'middle_name',
        'last_name',
        'age',
        'gender',
        'address',
        'contact_number',
        'year_level',
        'course',
        'student_id_number',
        'email',
        'preferred_department',
        'available_schedules',
        'reason_for_applying',
        'form_details',
        'status',
        'source',
        'tracking_code',
        'interview_date',
        'interview_remarks',
        'assigned_department',
        'assigned_position'
    ];

    // Tell Laravel to treat this column as an array/JSON
    protected $hidden = [
        'form_details',
    ];

    protected $casts = [
        'available_schedules' => 'array',
        'form_details' => 'array',
        'interview_date' => 'datetime',
    ];

    // Relationship: An application belongs to a User (Student)
    public function applicant()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function documents()
    {
        return $this->hasMany(ApplicationDocument::class);
    }

    public function statusEvents()
    {
        return $this->hasMany(ApplicationStatusEvent::class)->orderBy('occurred_at')->orderBy('id');
    }
}
