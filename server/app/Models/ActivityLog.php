<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ActivityLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'admin_id',
        'admin_name',
        'description',
    ];

    // Optional: Relationship back to the Admin/User
    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }
}
