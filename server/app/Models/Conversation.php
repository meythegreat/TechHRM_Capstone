<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Conversation extends Model
{
    protected $fillable = [
        'user_low_id',
        'user_high_id',
        'last_message_at',
    ];

    protected function casts(): array
    {
        return [
            'last_message_at' => 'datetime',
        ];
    }

    public static function orderedPair(int $firstId, int $secondId): array
    {
        return $firstId < $secondId
            ? [$firstId, $secondId]
            : [$secondId, $firstId];
    }

    public static function findBetween(int $firstId, int $secondId): ?self
    {
        [$low, $high] = self::orderedPair($firstId, $secondId);

        return self::query()
            ->where('user_low_id', $low)
            ->where('user_high_id', $high)
            ->first();
    }

    public static function findOrCreateBetween(int $firstId, int $secondId): self
    {
        [$low, $high] = self::orderedPair($firstId, $secondId);

        return self::query()->firstOrCreate(
            [
                'user_low_id' => $low,
                'user_high_id' => $high,
            ]
        );
    }

    public function involves(int $userId): bool
    {
        return $this->user_low_id === $userId || $this->user_high_id === $userId;
    }

    public function peerIdFor(int $userId): int
    {
        return $this->user_low_id === $userId
            ? (int) $this->user_high_id
            : (int) $this->user_low_id;
    }

    public function userLow(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_low_id');
    }

    public function userHigh(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_high_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function latestMessage(): HasOne
    {
        return $this->hasOne(Message::class)->latestOfMany();
    }
}
