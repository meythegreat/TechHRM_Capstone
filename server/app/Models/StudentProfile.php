<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudentProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'student_id_number',
        'course',
        'year_level',
        'assigned_office',
        'contact_number',
    ];

    // A profile belongs to one specific User
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
