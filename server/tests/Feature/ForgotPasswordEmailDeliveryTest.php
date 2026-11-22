<?php

namespace Tests\Feature;

use App\Mail\TemporaryPasswordMail;
use App\Models\Application;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Mail\PendingMail;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ForgotPasswordEmailDeliveryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->createSchema();
        $this->configureMail();
    }

    public function test_every_address_is_sent_through_resend(): void
    {
        Mail::fake();

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

        Mail::assertSent(TemporaryPasswordMail::class, function (TemporaryPasswordMail $mail) {
            return $mail->hasTo('student.one@school.edu')
                && $mail->envelope()->subject === 'Your WoSPIS temporary password'
                && str_contains($mail->render(), 'TEMPORARY PASSWORD');
        });
        Mail::assertSent(TemporaryPasswordMail::class, fn (TemporaryPasswordMail $mail) => $mail->hasTo('other.person@yahoo.com'));
        Mail::assertSentCount(2);
    }

    public function test_application_email_is_delivered_when_the_account_email_is_missing(): void
    {
        Mail::fake();

        $user = $this->makeUser('ana.cruz', null);
        Application::create([
            'user_id' => $user->id,
            'email' => 'ana.cruz@filamer.edu.ph',
            'status' => 'Approved',
        ]);

        $this->postJson('/api/forgot-password', ['username' => 'ana.cruz'])
            ->assertOk();

        Mail::assertSent(TemporaryPasswordMail::class, fn (TemporaryPasswordMail $mail) => $mail->hasTo('ana.cruz@filamer.edu.ph'));
    }

    public function test_password_is_unchanged_when_resend_is_not_configured(): void
    {
        config(['services.resend.key' => '']);

        $user = $this->makeUser('student.two', 'student.two@school.edu');
        $original = $user->password;

        $this->postJson('/api/forgot-password', ['username' => 'student.two@school.edu'])
            ->assertStatus(502)
            ->assertJsonFragment([
                'message' => 'Password reset email is not configured. Set RESEND_API_KEY.',
            ]);

        $fresh = $user->fresh();
        $this->assertSame($original, $fresh->password);
        $this->assertFalse($fresh->must_change_password);
    }

    public function test_password_is_unchanged_when_resend_rejects_the_message(): void
    {
        $pending = \Mockery::mock(PendingMail::class);
        $pending->shouldReceive('send')->once()->andThrow(new \RuntimeException('mailbox unavailable'));
        Mail::shouldReceive('to')->once()->with('student.three@school.edu')->andReturn($pending);

        $user = $this->makeUser('student.three', 'student.three@school.edu');
        $original = $user->password;

        $this->postJson('/api/forgot-password', ['username' => 'student.three@school.edu'])
            ->assertStatus(502)
            ->assertJsonFragment([
                'message' => 'Could not send the password reset email. Your password was not changed.',
            ]);

        $fresh = $user->fresh();
        $this->assertSame($original, $fresh->password);
        $this->assertFalse($fresh->must_change_password);
    }

    private function configureMail(): void
    {
        config([
            'services.resend.key' => 're_test_key',
            'mail.from.address' => 'onboarding@resend.dev',
            'mail.from.name' => 'WoSPIS WSPO',
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
