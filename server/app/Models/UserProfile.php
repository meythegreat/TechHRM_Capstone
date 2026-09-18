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
        'assigned_office',
        'duty_type',
        'duty_request',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
