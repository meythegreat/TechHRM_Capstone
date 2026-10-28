<?php

namespace Tests\Feature;

use App\Models\Application;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ForgotPasswordEmailDeliveryTest extends TestCase
{
    private const WEBHOOK = 'http://n8n.test/webhook/techhrm/forgot-password';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->createSchema();
        $this->configureMail();
    }

    public function test_every_address_is_sent_through_n8n_and_not_resend(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://api.resend.com/*' => Http::response(['id' => 'should-not-send'], 200),
            self::WEBHOOK => Http::response(['ok' => true], 200),
        ]);

        $school = $this->makeUser('student.one', 'student.one@school.edu');
        $yahoo = $this->makeUser('other.person', 'other.person@yahoo.com');

        $this->postJson('/api/forgot-password', ['username' => 'student.one@school.edu'])
            ->assertOk()
            ->assertJsonPath('masked_email', 'st*********@school.edu');

        $this->postJson('/api/forgot-password', ['username' => 'other.person'])
            ->assertOk()
            ->assertJsonPath('masked_email', 'ot**********@yahoo.com');

        $this->assertTrue($school->fresh()->must_change_password);
        $this->assertTrue($yahoo->fresh()->must_change_password);
        $this->assertFalse(Hash::check('old-password', $school->fresh()->password));
        $this->assertFalse(Hash::check('old-password', $yahoo->fresh()->password));

        $recipients = Http::recorded()
            ->filter(fn (array $pair) => $pair[0]->url() === self::WEBHOOK)
            ->map(fn (array $pair) => $pair[0]->data()['email'])
            ->values()
            ->all();

        $this->assertSame([
            'student.one@school.edu',
            'other.person@yahoo.com',
        ], $recipients);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'api.resend.com'));
    }

    public function test_application_email_is_delivered_when_the_account_email_is_missing(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            self::WEBHOOK => Http::response(['ok' => true], 200),
        ]);

        $user = $this->makeUser('ana.cruz', null);
        Application::create([
            'user_id' => $user->id,
            'email' => 'ana.cruz@filamer.edu.ph',
            'status' => 'Approved',
        ]);

        $this->postJson('/api/forgot-password', ['username' => 'ana.cruz'])
            ->assertOk();

        Http::assertSent(function ($request) {
            return $request->url() === self::WEBHOOK
                && $request->data()['email'] === 'ana.cruz@filamer.edu.ph';
        });
    }

    public function test_password_is_unchanged_when_n8n_rejects_the_message(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            self::WEBHOOK => Http::response(['message' => 'Workflow is not active'], 404),
        ]);

        $user = $this->makeUser('student.two', 'student.two@school.edu');
        $original = $user->password;

        $this->postJson('/api/forgot-password', ['username' => 'student.two@school.edu'])
            ->assertStatus(502)
            ->assertJsonFragment([
                'message' => 'The Gmail password reset webhook rejected the message: Workflow is not active',
            ]);

        $fresh = $user->fresh();
        $this->assertSame($original, $fresh->password);
        $this->assertFalse($fresh->must_change_password);
    }

    private function configureMail(): void
    {
        config([
            'services.resend.key' => 're_test_key',
            'services.n8n.forgot_password_webhook' => self::WEBHOOK,
            'mail.from.address' => 'onboarding@resend.dev',
            'mail.from.name' => 'TechHRM WSPO',
        ]);
    }

    private function makeUser(string $username, ?string $email): User
    {
        return User::create([
            'name' => $username,
            'username' => $username,
            'email' => $email,
            'password' => 'old-password',
            'role' => 'Student',
        ]);
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
            $table->string('role')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();
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

        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('admin_id')->nullable();
            $table->string('admin_name');
            $table->string('action');
            $table->text('description');
            $table->string('ip_address')->nullable();
            $table->timestamps();
        });

        Schema::create('applications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('email')->nullable();
            $table->string('status')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }
}
