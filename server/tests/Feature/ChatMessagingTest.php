<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChatMessagingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
    }

    public function test_any_signed_in_user_can_message_another_user(): void
    {
        $ana = User::create([
            'name' => 'Ana Cruz',
            'username' => 'ana.cruz',
            'password' => 'password',
            'role' => 'Student',
        ]);
        $ben = User::create([
            'name' => 'Ben Reyes',
            'username' => 'ben.reyes',
            'password' => 'password',
            'role' => 'Supervisor',
        ]);

        Sanctum::actingAs($ana);

        $this->getJson('/api/chat/users')
            ->assertOk()
            ->assertJsonFragment(['username' => 'ben.reyes'])
            ->assertJsonMissing(['username' => 'ana.cruz']);

        $open = $this->postJson('/api/chat/conversations', ['user_id' => $ben->id])
            ->assertOk()
            ->assertJsonPath('peer.id', $ben->id);

        $conversationId = $open->json('id');

        $this->postJson("/api/chat/conversations/{$conversationId}/messages", [
            'body' => 'Hello Ben, can we review my schedule?',
        ])
            ->assertCreated()
            ->assertJsonPath('data.body', 'Hello Ben, can we review my schedule?')
            ->assertJsonPath('data.is_mine', true);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $ben->id,
            'title' => 'New Message',
        ]);

        Sanctum::actingAs($ben);

        $this->getJson('/api/chat/conversations')
            ->assertOk()
            ->assertJsonPath('0.peer.id', $ana->id)
            ->assertJsonPath('0.unread_count', 1);

        $this->getJson("/api/chat/conversations/{$conversationId}/messages")
            ->assertOk()
            ->assertJsonPath('0.body', 'Hello Ben, can we review my schedule?')
            ->assertJsonPath('0.is_mine', false);

        $this->assertNotNull(Message::query()->where('conversation_id', $conversationId)->value('read_at'));

        $this->postJson("/api/chat/conversations/{$conversationId}/messages", [
            'body' => 'Sure, come by after your shift.',
        ])->assertCreated();

        Sanctum::actingAs($ana);

        $this->getJson('/api/chat/conversations')
            ->assertOk()
            ->assertJsonPath('0.unread_count', 1)
            ->assertJsonPath('0.last_message.body', 'Sure, come by after your shift.');
    }

    public function test_users_cannot_open_a_chat_with_themselves_or_read_others_threads(): void
    {
        $ana = User::create([
            'name' => 'Ana Cruz',
            'username' => 'ana.self',
            'password' => 'password',
            'role' => 'Student',
        ]);
        $ben = User::create([
            'name' => 'Ben Reyes',
            'username' => 'ben.other',
            'password' => 'password',
            'role' => 'WSPO Staff',
        ]);
        $carla = User::create([
            'name' => 'Carla Lim',
            'username' => 'carla.lim',
            'password' => 'password',
            'role' => 'Student',
        ]);

        Sanctum::actingAs($ana);

        $this->postJson('/api/chat/conversations', ['user_id' => $ana->id])
            ->assertStatus(422);

        $conversation = Conversation::findOrCreateBetween($ben->id, $carla->id);
        Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => $ben->id,
            'body' => 'Private staff note',
        ]);

        $this->getJson("/api/chat/conversations/{$conversation->id}/messages")
            ->assertForbidden();

        $this->postJson("/api/chat/conversations/{$conversation->id}/messages", [
            'body' => 'Trying to sneak in',
        ])->assertForbidden();
    }

    public function test_opening_the_same_pair_reuses_one_conversation(): void
    {
        $ana = User::create([
            'name' => 'Ana Cruz',
            'username' => 'ana.pair',
            'password' => 'password',
            'role' => 'Student',
        ]);
        $ben = User::create([
            'name' => 'Ben Reyes',
            'username' => 'ben.pair',
            'password' => 'password',
            'role' => 'Supervisor',
        ]);

        Sanctum::actingAs($ana);
        $first = $this->postJson('/api/chat/conversations', ['user_id' => $ben->id])->assertOk()->json('id');

        Sanctum::actingAs($ben);
        $second = $this->postJson('/api/chat/conversations', ['user_id' => $ana->id])->assertOk()->json('id');

        $this->assertSame($first, $second);
        $this->assertSame(1, Conversation::query()->count());
        $this->assertSame(0, Notification::query()->count());
    }

    private function createSchema(): void
    {
        Schema::dropAllTables();

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('username')->unique();
            $table->string('email')->nullable();
            $table->string('password');
            $table->string('role')->default('Student');
            $table->string('profile_picture')->nullable();
            $table->string('phone_number')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('title');
            $table->text('message');
            $table->boolean('is_read')->default(false);
            $table->timestamps();
        });

        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_low_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('user_high_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();
            $table->unique(['user_low_id', 'user_high_id']);
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
            $table->foreignId('sender_id')->constrained('users')->cascadeOnDelete();
            $table->text('body');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
    }
}
