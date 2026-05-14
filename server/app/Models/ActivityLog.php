<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ActivityLog extends Model
{
    use HasFactory;

    // This array tells Laravel which columns are safe to save data into
    protected $fillable = [
        'admin_id',
        'admin_name',    // <-- THIS IS THE MISSING PIECE!
        'action',
        'description',
        'ip_address',
    ];

    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }
}
