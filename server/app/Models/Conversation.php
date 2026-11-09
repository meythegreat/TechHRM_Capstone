<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\DB;

class Conversation extends Model
{
    public const TYPE_DIRECT = 'direct';

    public const TYPE_GROUP = 'group';

    protected $fillable = [
        'type',
        'name',
        'created_by',
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

    public function isGroup(): bool
    {
        return $this->type === self::TYPE_GROUP;
    }

    public function isDirect(): bool
    {
        return ! $this->isGroup();
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
            ->where('type', self::TYPE_DIRECT)
            ->where('user_low_id', $low)
            ->where('user_high_id', $high)
            ->first();
    }

    public static function findOrCreateBetween(int $firstId, int $secondId): self
    {
        [$low, $high] = self::orderedPair($firstId, $secondId);

        $conversation = self::query()->firstOrCreate(
            [
                'type' => self::TYPE_DIRECT,
                'user_low_id' => $low,
                'user_high_id' => $high,
            ],
            [
                'name' => null,
                'created_by' => null,
            ]
        );

        $conversation->syncParticipants([$low, $high]);

        return $conversation;
    }

    public static function createGroup(string $name, int $creatorId, array $memberIds): self
    {
        $members = collect($memberIds)
            ->map(fn ($id) => (int) $id)
            ->push($creatorId)
            ->unique()
            ->values()
            ->all();

        return DB::transaction(function () use ($name, $creatorId, $members) {
            $conversation = self::query()->create([
                'type' => self::TYPE_GROUP,
                'name' => $name,
                'created_by' => $creatorId,
                'user_low_id' => null,
                'user_high_id' => null,
            ]);

            $conversation->syncParticipants($members);

            return $conversation;
        });
    }

    /**
     * @param  array<int>  $userIds
     */
    public function syncParticipants(array $userIds): void
    {
        $ids = collect($userIds)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        foreach ($ids as $userId) {
            $this->participantRows()->firstOrCreate(
                ['user_id' => $userId],
                ['last_read_at' => null]
            );
        }
    }

    public function involves(int $userId): bool
    {
        if ($this->relationLoaded('participants')) {
            return $this->participants->contains(fn (User $user) => (int) $user->id === $userId);
        }

        if ($this->participantRows()->where('user_id', $userId)->exists()) {
            return true;
        }

        // Legacy fallback before participants were backfilled.
        return (int) $this->user_low_id === $userId || (int) $this->user_high_id === $userId;
    }

    public function peerIdFor(int $userId): ?int
    {
        if ($this->isGroup()) {
            return null;
        }

        if ((int) $this->user_low_id === $userId) {
            return (int) $this->user_high_id;
        }

        if ((int) $this->user_high_id === $userId) {
            return (int) $this->user_low_id;
        }

        $peer = $this->participants
            ->first(fn (User $user) => (int) $user->id !== $userId);

        return $peer ? (int) $peer->id : null;
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function userLow(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_low_id');
    }

    public function userHigh(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_high_id');
    }

    public function participantRows(): HasMany
    {
        return $this->hasMany(ConversationParticipant::class);
    }

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'conversation_participants')
            ->withPivot(['last_read_at', 'archived_at', 'hidden_at'])
            ->withTimestamps();
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
