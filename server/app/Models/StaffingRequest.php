<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StaffingRequest extends Model
{
    protected $fillable = ['requested_by', 'department', 'duty_type', 'duty_request', 'quantity', 'status'];

    public function requester()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }
}
