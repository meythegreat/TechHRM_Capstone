<?php

namespace Tests\Feature;

use App\Mail\AccountEventMail;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Mail\PendingMail;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccountEventEmailTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        $this->configureMail();
    }

    public function test_a_successful_web_and_mobile_login_emails_the_account(): void
    {
        Mail::fake();
        $user = $this->makeUser('Super Admin', 'office.admin', 'admin@filamer.edu.ph');

        $this->postJson('/api/login', [
            'username' => 'office.admin',
            'password' => 'password',
        ])->assertOk();

        $this->postJson('/api/mobile/login', [
            'username' => 'admin@filamer.edu.ph',
            'password' => 'password',
        ])->assertOk();

        Mail::assertSent(AccountEventMail::class, function (AccountEventMail $mail) {
            return $mail->hasTo('admin@filamer.edu.ph')
                && $mail->subjectLine === 'New sign-in to your WoSPIS account'
                && str_contains($mail->render(), 'office.admin');
        });
        Mail::assertSentCount(2);

        $this->assertSame(2, $user->tokens()->count());
    }

    public function test_a_failed_login_sends_nothing(): void
    {
        Mail::fake();
        $this->makeUser('Super Admin', 'office.admin', 'admin@filamer.edu.ph');

        $this->postJson('/api/login', [
            'username' => 'office.admin',
            'password' => 'wrong-password',
        ])->assertUnauthorized();

        Mail::assertNothingSent();
    }

    public function test_login_still_succeeds_when_the_security_email_cannot_be_sent(): void
    {
        $pending = \Mockery::mock(PendingMail::class);
        $pending->shouldReceive('send')->once()->andThrow(new \RuntimeException('mailbox unavailable'));
        Mail::shouldReceive('to')->once()->with('admin@filamer.edu.ph')->andReturn($pending);

        $this->makeUser('Super Admin', 'office.admin', 'admin@filamer.edu.ph');

        $this->postJson('/api/login', [
            'username' => 'office.admin',
            'password' => 'password',
        ])->assertOk();
    }

    public function test_security_emails_are_skipped_when_resend_is_not_configured(): void
    {
        Mail::fake();
        config(['services.resend.key' => '']);
        $user = $this->makeUser('Super Admin', 'office.admin', 'admin@filamer.edu.ph');
        Sanctum::actingAs($user);

        $this->postJson('/api/login', [
            'username' => 'office.admin',
            'password' => 'password',
        ])->assertOk();

        $this->putJson('/api/user', [
            'name' => $user->name,
            'email' => 'moved.admin@filamer.edu.ph',
        ])->assertOk();

        Mail::assertNothingSent();
    }

    public function test_changing_your_own_email_notifies_the_old_and_new_addresses(): void
    {
        Mail::fake();
        $user = $this->makeUser('Super Admin', 'office.admin', 'admin@filamer.edu.ph');
        Sanctum::actingAs($user);

        $this->putJson('/api/user', [
            'name' => 'Office Admin',
            'email' => 'moved.admin@filamer.edu.ph',
        ])->assertOk();

        Mail::assertSent(AccountEventMail::class, fn (AccountEventMail $mail) => $mail->hasTo('admin@filamer.edu.ph')
            && $mail->subjectLine === 'Your WoSPIS email address was changed'
            && str_contains($mail->render(), 'moved.admin@filamer.edu.ph'));
        Mail::assertSent(AccountEventMail::class, fn (AccountEventMail $mail) => $mail->hasTo('moved.admin@filamer.edu.ph')
            && $mail->subjectLine === 'This email is now used for your WoSPIS account');
        Mail::assertSentCount(2);
    }

    public function test_changing_your_own_password_does_not_include_the_new_password(): void
    {
        Mail::fake();
        $user = $this->makeUser('Super Admin', 'office.admin', 'admin@filamer.edu.ph');
        $user->must_change_password = true;
        $user->save();
        Sanctum::actingAs($user);

        $this->putJson('/api/user', [
            'name' => $user->name,
            'password' => 'fresh-secret',
            'password_confirmation' => 'fresh-secret',
            'current_password' => 'password',
        ])->assertOk();

        $user->refresh();
        $user->must_change_password = true;
        $user->save();
        Sanctum::actingAs($user);

        $this->postJson('/api/user/change-password', [
            'password' => 'another-secret',
            'password_confirmation' => 'another-secret',
        ])->assertOk();

        Mail::assertSent(AccountEventMail::class, 2);
        foreach (Mail::sent(AccountEventMail::class) as $mail) {
            $html = $mail->render();
            $this->assertTrue($mail->hasTo('admin@filamer.edu.ph'));
            $this->assertSame('Your WoSPIS password was changed', $mail->subjectLine);
            $this->assertStringNotContainsString('fresh-secret', $html);
            $this->assertStringNotContainsString('another-secret', $html);
        }
    }

    public function test_an_administrator_email_and_password_change_notifies_the_account(): void
    {
        Mail::fake();
        $admin = $this->makeUser('Super Admin', 'office.admin', 'admin@filamer.edu.ph');
        $staff = $this->makeUser('Super Admin', 'second.admin', 'second@filamer.edu.ph');
        Sanctum::actingAs($admin);

        $this->putJson('/api/users/'.$staff->id, [
            'name' => 'Second Admin',
            'role' => 'Super Admin',
            'email' => 'second.moved@filamer.edu.ph',
            'password' => 'managed-secret',
        ])->assertOk();

        $this->assertTrue(Hash::check('managed-secret', $staff->fresh()->password));
        Mail::assertSent(AccountEventMail::class, fn (AccountEventMail $mail) => $mail->hasTo('second@filamer.edu.ph')
            && str_contains($mail->render(), 'An administrator'));
        Mail::assertSent(AccountEventMail::class, fn (AccountEventMail $mail) => $mail->hasTo('second.moved@filamer.edu.ph')
            && $mail->subjectLine === 'Your WoSPIS password was changed'
            && ! str_contains($mail->render(), 'managed-secret'));
    }

    public function test_duty_events_email_the_account_without_blocking_when_resend_is_missing(): void
    {
        Mail::fake();
        $user = $this->makeUser('Student', 'ana.cruz', 'ana.cruz@filamer.edu.ph');

        app(\App\Services\AccountEventMailer::class)->clock($user, 'in', '2026-11-23 08:00:00', 'Your duty clock-in was recorded.');
        app(\App\Services\AccountEventMailer::class)->duty(
            $user,
            'Class-hours clock-in submitted',
            'Request submitted',
            'Your class-hours clock-in was submitted.',
        );

        Mail::assertSent(AccountEventMail::class, fn (AccountEventMail $mail) => $mail->hasTo('ana.cruz@filamer.edu.ph')
            && $mail->subjectLine === 'You clocked in to WoSPIS');
        Mail::assertSent(AccountEventMail::class, fn (AccountEventMail $mail) => $mail->subjectLine === 'Class-hours clock-in submitted');

        config(['services.resend.key' => '']);
        Mail::fake();
        app(\App\Services\AccountEventMailer::class)->clock($user, 'out', now());
        Mail::assertNothingSent();
    }

    public function test_a_profile_save_without_email_or_password_changes_sends_nothing(): void
    {
        Mail::fake();
        $user = $this->makeUser('Super Admin', 'office.admin', 'admin@filamer.edu.ph');
        Sanctum::actingAs($user);

        $this->putJson('/api/user', [
            'name' => 'Renamed Admin',
            'email' => 'admin@filamer.edu.ph',
        ])->assertOk();

        Mail::assertNothingSent();
    }

    private function configureMail(): void
    {
        config([
            'services.resend.key' => 're_test_key',
            'mail.from.address' => 'notifications@fcu-wospis.com',
            'mail.from.name' => 'WoSPIS WSPO',
        ]);
    }

    private function makeUser(string $role, string $username, string $email): User
    {
        return User::create([
            'name' => $username,
            'username' => $username,
            'email' => $email,
            'password' => 'password',
            'role' => $role,
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
            $table->string('phone_number')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('assigned_office')->nullable();
            $table->boolean('special_hours_request')->default(false);
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
