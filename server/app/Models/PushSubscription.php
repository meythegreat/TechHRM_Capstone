<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PushSubscription extends Model
{
    protected $fillable = [
        'user_id',
        'endpoint_hash',
        'endpoint',
        'public_key',
        'auth_token',
        'content_encoding',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
