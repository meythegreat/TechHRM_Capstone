<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Profile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'assigned_office',
        'course',
        'year_level',
        'student_id_number',
        'phone_number'
    ];

    // Connect it back to the User
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
