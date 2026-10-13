<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\RecordsActivity;

class Schedule extends Model
{
    use RecordsActivity;

    protected $fillable = [
        'user_id',
        'kind',
        'day',
        'time',
        'duty_type',
        'subject',
        'room',
        'instructor',
        'department',
        'supervisor',
        'edit_request_note',
        'edit_request_status',
    ];

    // Link back to the user
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
