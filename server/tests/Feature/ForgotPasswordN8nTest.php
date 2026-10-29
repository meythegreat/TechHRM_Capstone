<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ForgotPasswordN8nTest extends TestCase
{
    private string $webhook = 'https://n8n.example/webhook/techhrm/forgot-password';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        config([
            'services.n8n.forgot_password_webhook' => $this->webhook,
            'mail.contact_address' => 'miguel102104@gmail.com',
            'mail.from.name' => 'TechHRM WSPO',
        ]);
    }

    public function test_forgot_password_sends_any_account_through_n8n_and_then_changes_the_password(): void
    {
        $user = User::create([
            'name' => 'Other Student',
            'username' => 'other.student',
            'email' => 'other.student@school.edu',
            'password' => 'original-password',
            'role' => 'Student',
        ]);

        Http::fake([
            $this->webhook => Http::response(['ok' => true], 200),
        ]);

        $response = $this->postJson('/api/forgot-password', [
            'username' => 'other.student',
        ]);

        $response->assertOk()
            ->assertJsonPath('masked_email', 'ot***********@school.edu');

        Http::assertSent(function ($request) {
            $body = $request->data();

            return $request->url() === $this->webhook
                && $request->method() === 'POST'
                && ($body['email'] ?? null) === 'other.student@school.edu'
                && ($body['from_email'] ?? null) === 'miguel102104@gmail.com'
                && ($body['subject'] ?? null) === 'Your TechHRM temporary password'
                && str_contains((string) ($body['message'] ?? ''), 'TEMPORARY PASSWORD')
                && !array_key_exists('temporary_password', $body);
        });

        $fresh = $user->fresh();
        $this->assertTrue($fresh->must_change_password);
        $this->assertFalse(Hash::check('original-password', $fresh->password));
    }

    public function test_forgot_password_keeps_the_old_password_when_n8n_rejects_the_send(): void
    {
        $user = User::create([
            'name' => 'Other Student',
            'username' => 'other.student',
            'email' => 'other.student@school.edu',
            'password' => 'original-password',
            'role' => 'Student',
        ]);

        Http::fake([
            $this->webhook => Http::response(['message' => 'Invalid login'], 500),
        ]);

        $response = $this->postJson('/api/forgot-password', [
            'username' => 'other.student@school.edu',
        ]);

        $response->assertStatus(502)
            ->assertJsonPath('message', 'Could not send the password reset email: Invalid login');

        $fresh = $user->fresh();
        $this->assertFalse($fresh->must_change_password);
        $this->assertTrue(Hash::check('original-password', $fresh->password));
    }

    public function test_forgot_password_does_not_call_n8n_when_the_webhook_is_missing(): void
    {
        User::create([
            'name' => 'Other Student',
            'username' => 'other.student',
            'email' => 'other.student@school.edu',
            'password' => 'original-password',
            'role' => 'Student',
        ]);

        config(['services.n8n.forgot_password_webhook' => '']);
        Http::fake();

        $response = $this->postJson('/api/forgot-password', [
            'username' => 'other.student',
        ]);

        $response->assertStatus(502)
            ->assertJsonPath('message', 'Password reset email is not configured. Set N8N_FORGOT_PASSWORD_WEBHOOK in the server environment.');
        Http::assertNothingSent();
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
            $table->string('module')->nullable();
            $table->unsignedBigInteger('record_id')->nullable();
            $table->text('description');
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('ip_address')->nullable();
            $table->timestamps();
        });
    }
}
