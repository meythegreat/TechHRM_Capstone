<?php

namespace App\Models;

use App\Traits\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Bulletin extends Model
{
    use RecordsActivity;

    protected $fillable = [
        'created_by',
        'title',
        'message',
        'priority',
        'audience',
        'year_levels',
        'offices',
        'delivered_count',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'year_levels' => 'array',
            'offices' => 'array',
            'delivered_count' => 'integer',
            'expires_at' => 'datetime',
        ];
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(BulletinRecipient::class);
    }

    public function dismissals(): HasMany
    {
        return $this->hasMany(BulletinDismissal::class);
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->lte(now());
    }
}
