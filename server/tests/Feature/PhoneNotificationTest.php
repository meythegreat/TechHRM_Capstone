<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\PushSubscription;
use App\Models\User;
use App\Services\PhonePush;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PhoneNotificationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
    }

    public function test_a_signed_in_user_can_register_this_phone(): void
    {
        $user = User::create([
            'name' => 'Ana Cruz',
            'username' => 'ana.cruz',
            'password' => 'password',
            'role' => 'Student',
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/push/vapid-public-key')
            ->assertOk()
            ->assertJsonStructure(['public_key']);

        $this->postJson('/api/push/subscribe', [
            'endpoint' => 'https://push.example.test/ana',
            'keys' => [
                'p256dh' => 'public-key',
                'auth' => 'auth-secret',
            ],
        ])->assertOk();

        $this->assertDatabaseHas('push_subscriptions', [
            'user_id' => $user->id,
            'endpoint' => 'https://push.example.test/ana',
        ]);
    }

    public function test_creating_a_notification_sends_it_to_the_phone(): void
    {
        $user = User::create([
            'name' => 'Ana Cruz',
            'username' => 'ana.push',
            'password' => 'password',
            'role' => 'Student',
        ]);

        PushSubscription::create([
            'user_id' => $user->id,
            'endpoint_hash' => hash('sha256', 'https://push.example.test/device'),
            'endpoint' => 'https://push.example.test/device',
            'public_key' => 'public-key',
            'auth_token' => 'auth-secret',
            'content_encoding' => 'aes128gcm',
        ]);

        $recorder = new class extends PhonePush {
            public array $sent = [];

            public function deliver(Notification $notification): void
            {
                $this->sent[] = [
                    'user_id' => $notification->user_id,
                    'title' => $notification->title,
                    'message' => $notification->message,
                ];
            }
        };
        $this->app->instance(PhonePush::class, $recorder);

        Notification::create([
            'user_id' => $user->id,
            'title' => 'Clock-in recorded',
            'message' => 'Your shift has started.',
        ]);

        $this->assertSame([
            [
                'user_id' => $user->id,
                'title' => 'Clock-in recorded',
                'message' => 'Your shift has started.',
            ],
        ], $recorder->sent);
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

        Schema::create('push_vapid_keys', function (Blueprint $table) {
            $table->id();
            $table->text('public_key');
            $table->text('private_key');
            $table->timestamps();
        });

        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('endpoint_hash', 64)->unique();
            $table->text('endpoint');
            $table->string('public_key');
            $table->string('auth_token');
            $table->string('content_encoding')->default('aes128gcm');
            $table->timestamps();
        });
    }
}
