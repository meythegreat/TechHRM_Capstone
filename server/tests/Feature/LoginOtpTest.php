<?php

namespace Tests\Feature;

use App\Mail\LoginOtpMail;
use App\Models\Application;
use App\Models\Notification;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LoginOtpTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->createSchema();
        config([
            'services.resend.key' => 're_test_key',
            'mail.from.address' => 'notifications@fcu-wospis.com',
            'mail.from.name' => 'WoSPIS WSPO',
        ]);
    }

    public function test_password_remains_the_default_sign_in(): void
    {
        $user = $this->makeUser('student.one', 'student.one@school.edu');

        $this->postJson('/api/login', [
            'username' => 'student.one',
            'password' => 'password',
        ])->assertOk()
            ->assertJsonPath('profile_notice', null);

        $this->assertSame(1, $user->tokens()->count());
        $this->assertSame(0, Notification::query()->count());
    }

    public function test_an_eight_digit_code_signs_the_account_in(): void
    {
        Mail::fake();
        $user = $this->makeUser('student.one', 'student.one@school.edu');

        $this->postJson('/api/login/otp', ['username' => 'student.one'])
            ->assertOk()
            ->assertJsonPath('masked_email', 'st*********@school.edu');

        $code = null;
        Mail::assertSent(LoginOtpMail::class, function (LoginOtpMail $mail) use (&$code) {
            $code = $mail->code;

            return $mail->hasTo('student.one@school.edu')
                && $mail->envelope()->subject === 'Your WoSPIS sign-in code'
                && strlen($mail->code) === 8
                && ctype_digit($mail->code);
        });

        $this->postJson('/api/login/otp/verify', [
            'username' => 'student.one',
            'code' => $code,
        ])->assertOk()
            ->assertJsonPath('message', 'Login successful');

        $this->assertSame(1, $user->tokens()->count());
    }

    public function test_a_wrong_code_is_rejected(): void
    {
        Mail::fake();
        $this->makeUser('student.one', 'student.one@school.edu');
        $this->postJson('/api/login/otp', ['username' => 'student.one'])->assertOk();

        $this->postJson('/api/login/otp/verify', [
            'username' => 'student.one',
            'code' => '00000000',
        ])->assertStatus(422);

        $this->assertSame(0, User::first()->tokens()->count());
    }

    public function test_an_account_without_email_is_sent_back_to_the_password(): void
    {
        Mail::fake();
        $user = $this->makeUser('FCU-20421', null, 'Ana Cruz');

        $this->postJson('/api/login/otp', ['username' => 'FCU-20421'])
            ->assertStatus(422)
            ->assertJsonPath('use_password', true)
            ->assertJsonFragment(['use_password' => true]);

        $response = $this->postJson('/api/login/otp', ['username' => 'FCU-20421']);
        $this->assertStringContainsString('FCU account', $response->json('message'));
        $this->assertStringContainsString('personal information', $response->json('message'));

        Mail::assertNothingSent();

        $this->postJson('/api/login', [
            'username' => 'FCU-20421',
            'password' => 'password',
        ])->assertOk();

        $notice = Notification::query()->where('user_id', $user->id)->first();
        $this->assertNotNull($notice);
        $this->assertSame('Complete your account', $notice->title);
        $this->assertStringContainsString('FCU account', $notice->message);

        $this->postJson('/api/login', [
            'username' => 'FCU-20421',
            'password' => 'password',
        ])->assertOk();

        $this->assertSame(1, Notification::query()->where('user_id', $user->id)->where('is_read', false)->count());
    }

    public function test_an_fcu_student_id_with_an_incomplete_profile_is_reminded_after_password_login(): void
    {
        $user = $this->makeUser('ana.cruz', 'ana.cruz@school.edu', 'Ana Cruz', '09170000000');
        UserProfile::create([
            'user_id' => $user->id,
            'student_id_number' => 'FCU-100',
        ]);

        $this->postJson('/api/login', [
            'username' => 'ana.cruz',
            'password' => 'password',
        ])->assertOk();

        $this->assertStringContainsString(
            'personal information',
            (string) Notification::query()->where('user_id', $user->id)->value('message')
        );
    }

    public function test_an_application_email_can_receive_the_code(): void
    {
        Mail::fake();
        $user = $this->makeUser('ana.cruz', null);
        Application::create([
            'user_id' => $user->id,
            'email' => 'ana.cruz@filamer.edu.ph',
            'status' => 'Approved',
        ]);

        $this->postJson('/api/login/otp', ['username' => 'ana.cruz'])->assertOk();

        Mail::assertSent(LoginOtpMail::class, fn (LoginOtpMail $mail) => $mail->hasTo('ana.cruz@filamer.edu.ph'));
    }

    private function makeUser(string $username, ?string $email, string $name = 'Student One', ?string $phone = null): User
    {
        return User::create([
            'name' => $name,
            'username' => $username,
            'email' => $email,
            'password' => 'password',
            'role' => 'Student',
            'phone_number' => $phone,
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
            $table->string('profile_picture')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('student_id_number')->nullable();
            $table->string('course')->nullable();
            $table->integer('year_level')->nullable();
            $table->string('gender')->nullable();
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

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('title');
            $table->text('message');
            $table->boolean('is_read')->default(false);
            $table->timestamps();
        });
    }
}
