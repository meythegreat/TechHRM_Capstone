<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApplicationStatusEvent extends Model
{
    protected $fillable = [
        'application_id',
        'status',
        'note',
        'occurred_at',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
    ];

    public function application()
    {
        return $this->belongsTo(Application::class);
    }
}
