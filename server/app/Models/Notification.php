<?php

namespace App\Models;

use App\Services\PhonePush;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $fillable = ['user_id', 'title', 'message', 'is_read'];

    protected static function booted(): void
    {
        static::created(function (Notification $notification): void {
            try {
                app(PhonePush::class)->deliver($notification);
            } catch (\Throwable $exception) {
                report($exception);
            }
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
