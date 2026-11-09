<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Notification;
use App\Models\User;
use App\Models\UserProfile;
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

    public function test_presence_and_typing_are_visible_to_the_peer(): void
    {
        $ana = User::create([
            'name' => 'Ana Cruz',
            'username' => 'ana.presence',
            'password' => 'password',
            'role' => 'Student',
        ]);
        $ben = User::create([
            'name' => 'Ben Reyes',
            'username' => 'ben.presence',
            'password' => 'password',
            'role' => 'Supervisor',
        ]);

        Sanctum::actingAs($ana);
        $conversationId = $this->postJson('/api/chat/conversations', ['user_id' => $ben->id])
            ->assertOk()
            ->json('id');

        $this->postJson('/api/chat/presence')->assertOk()->assertJsonPath('online', true);
        $this->postJson("/api/chat/conversations/{$conversationId}/typing", ['typing' => true])
            ->assertOk();

        Sanctum::actingAs($ben);

        $this->getJson("/api/chat/conversations/{$conversationId}/state")
            ->assertOk()
            ->assertJsonPath('peer_online', true)
            ->assertJsonPath('peer_typing', true);

        Sanctum::actingAs($ana);
        $this->postJson("/api/chat/conversations/{$conversationId}/typing", ['typing' => false])
            ->assertOk();

        Sanctum::actingAs($ben);
        $this->getJson("/api/chat/conversations/{$conversationId}/state")
            ->assertOk()
            ->assertJsonPath('peer_typing', false)
            ->assertJsonPath('peer_online', true);
    }

    public function test_sender_can_edit_within_fifteen_minutes_and_unsend(): void
    {
        $ana = User::create([
            'name' => 'Ana Cruz',
            'username' => 'ana.edit',
            'password' => 'password',
            'role' => 'Student',
        ]);
        $ben = User::create([
            'name' => 'Ben Reyes',
            'username' => 'ben.edit',
            'password' => 'password',
            'role' => 'Supervisor',
        ]);

        Sanctum::actingAs($ana);
        $conversationId = $this->postJson('/api/chat/conversations', ['user_id' => $ben->id])
            ->assertOk()
            ->json('id');

        $messageId = $this->postJson("/api/chat/conversations/{$conversationId}/messages", [
            'body' => 'Original wording',
        ])->assertCreated()->json('data.id');

        $this->patchJson("/api/chat/conversations/{$conversationId}/messages/{$messageId}", [
            'body' => 'Updated wording',
        ])
            ->assertOk()
            ->assertJsonPath('data.body', 'Updated wording')
            ->assertJsonPath('data.can_edit', true);

        $this->assertNotNull(Message::query()->find($messageId)?->edited_at);

        Sanctum::actingAs($ben);
        $this->patchJson("/api/chat/conversations/{$conversationId}/messages/{$messageId}", [
            'body' => 'Hijacked',
        ])->assertForbidden();

        Sanctum::actingAs($ana);
        $this->deleteJson("/api/chat/conversations/{$conversationId}/messages/{$messageId}")
            ->assertOk()
            ->assertJsonPath('data.is_unsent', true)
            ->assertJsonPath('data.body', '')
            ->assertJsonPath('data.can_edit', false)
            ->assertJsonPath('data.can_unsend', false);

        $this->patchJson("/api/chat/conversations/{$conversationId}/messages/{$messageId}", [
            'body' => 'Too late',
        ])->assertStatus(422);

        Message::query()->whereKey($messageId)->update([
            'created_at' => now()->subMinutes(16),
            'unsent_at' => null,
            'body' => 'Old enough',
            'edited_at' => null,
        ]);

        $this->patchJson("/api/chat/conversations/{$conversationId}/messages/{$messageId}", [
            'body' => 'Should fail',
        ])->assertStatus(422);
    }

    public function test_chat_exposes_assignment_clock_status_and_active_now(): void
    {
        $ana = User::create([
            'name' => 'Ana Cruz',
            'username' => 'ana.active',
            'password' => 'password',
            'role' => 'Student',
        ]);
        UserProfile::create([
            'user_id' => $ana->id,
            'assigned_office' => 'College of Computer Studies',
            'assignment_area' => 'Laboratory',
            'duty_type' => 'Clerical',
        ]);
        $ben = User::create([
            'name' => 'Ben Reyes',
            'username' => 'ben.active',
            'password' => 'password',
            'role' => 'Supervisor',
        ]);

        Attendance::create([
            'user_id' => $ana->id,
            'time_in' => now()->subHour(),
            'time_out' => null,
            'work_type' => 'Clerical',
            'status' => 'Timed in',
        ]);

        Sanctum::actingAs($ben);

        $this->getJson('/api/chat/users?q=Ana')
            ->assertOk()
            ->assertJsonPath('0.assignment', 'CCS - Laboratory')
            ->assertJsonPath('0.clocked_in', true)
            ->assertJsonPath('0.work_type', 'Clerical');

        $this->getJson('/api/chat/active-now')
            ->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('people.0.id', $ana->id)
            ->assertJsonPath('people.0.clocked_in', true);

        $conversationId = $this->postJson('/api/chat/conversations', ['user_id' => $ana->id])
            ->assertOk()
            ->assertJsonPath('peer.assignment', 'CCS - Laboratory')
            ->assertJsonPath('peer.clocked_in', true)
            ->json('id');

        $this->getJson("/api/chat/conversations/{$conversationId}/state")
            ->assertOk()
            ->assertJsonPath('peer_assignment', 'CCS - Laboratory')
            ->assertJsonPath('peer_clocked_in', true)
            ->assertJsonPath('peer_work_type', 'Clerical');
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
            $table->timestamp('edited_at')->nullable();
            $table->timestamp('unsent_at')->nullable();
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

        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('student_id_number')->nullable();
            $table->string('course')->nullable();
            $table->string('year_level')->nullable();
            $table->string('gender')->nullable();
            $table->string('assigned_office')->nullable();
            $table->string('assignment_area')->nullable();
            $table->boolean('special_hours_request')->default(false);
            $table->json('supervised_departments')->nullable();
            $table->json('secretary_departments')->nullable();
            $table->date('supervisor_absent_on')->nullable();
            $table->string('duty_type')->nullable();
            $table->text('duty_request')->nullable();
            $table->timestamps();
        });

        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('attendance_type')->nullable();
            $table->string('verification_code_used')->nullable();
            $table->string('check_in_method')->nullable();
            $table->foreignId('code_owner_id')->nullable();
            $table->timestamp('time_in')->nullable();
            $table->timestamp('time_out')->nullable();
            $table->decimal('rendered_hours', 8, 2)->nullable();
            $table->decimal('computed_hours', 8, 2)->nullable();
            $table->string('work_type')->nullable();
            $table->text('task_description')->nullable();
            $table->string('status')->nullable();
            $table->boolean('is_anomaly')->default(false);
            $table->string('anomaly_reason')->nullable();
            $table->unsignedBigInteger('rendered_hour_event_id')->nullable();
            $table->float('activity_hours')->nullable();
            $table->unsignedBigInteger('schedule_id')->nullable();
            $table->timestamps();
        });
    }
}
