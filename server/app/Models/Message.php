<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Message extends Model
{
    public const EDIT_WINDOW_MINUTES = 15;

    protected $fillable = [
        'conversation_id',
        'sender_id',
        'body',
        'delivered_at',
        'read_at',
        'edited_at',
        'unsent_at',
    ];

    protected function casts(): array
    {
        return [
            'delivered_at' => 'datetime',
            'read_at' => 'datetime',
            'edited_at' => 'datetime',
            'unsent_at' => 'datetime',
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function isUnsent(): bool
    {
        return $this->unsent_at !== null;
    }

    public function isWithinEditWindow(): bool
    {
        if (! $this->created_at) {
            return false;
        }

        return $this->created_at->gt(now()->subMinutes(self::EDIT_WINDOW_MINUTES));
    }

    public function canBeEditedBy(int $userId): bool
    {
        return (int) $this->sender_id === $userId
            && ! $this->isUnsent()
            && $this->isWithinEditWindow();
    }

    public function canBeUnsentBy(int $userId): bool
    {
        return (int) $this->sender_id === $userId && ! $this->isUnsent();
    }
}
