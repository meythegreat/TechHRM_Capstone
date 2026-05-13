<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ActivityLog extends Model
{
    use HasFactory;

    // 1. UPDATE THIS ARRAY to match your database columns
    protected $fillable = [
        'admin_id',     // Changed from 'user_id'
        'admin_name',   // Added this!
        'action',
        'description',
        'ip_address'
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }
}
