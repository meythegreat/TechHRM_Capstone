<?php

namespace Tests\Feature;

use App\Models\Schedule;
use App\Models\User;
use App\Models\UserProfile;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MultiOfficeAttendanceCodeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        Carbon::setTestNow(Carbon::parse('2026-11-09 09:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_one_code_covers_every_office_a_supervisor_handles(): void
    {
        $supervisor = $this->makeSupervisor('Exequiel Calimutan', [
            'Human Resource Development Center',
            'VP-Administration',
        ]);
        $vpOnly = $this->makeSupervisor('Other Supervisor', ['VP-Administration']);
        $hrdcStudent = $this->makeStudent('HRDC Student', 'Human Resource Development Center');
        $vpStudent = $this->makeStudent('VP Student', 'VP-Administration');
        $libraryStudent = $this->makeStudent('Library Student', 'Library');

        Sanctum::actingAs($vpOnly);
        $vpCode = $this->getJson('/api/attendance/passcode?'.http_build_query(['type' => 'Daily Clock']))
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($supervisor);
        $passcode = $this->getJson('/api/attendance/passcode?'.http_build_query(['type' => 'Daily Clock']));
        $passcode->assertOk()
            ->assertJsonPath('department', 'Human Resource Development Center and VP-Administration')
            ->assertJsonPath('departments', [
                'Human Resource Development Center',
                'VP-Administration',
            ]);
        $sharedCode = $passcode->json('token_code');
        $this->assertNotSame($vpCode, $sharedCode);

        $again = $this->getJson('/api/attendance/passcode?'.http_build_query(['type' => 'Daily Clock']))
            ->assertOk()
            ->json('token_code');
        $this->assertSame($sharedCode, $again);

        $qr = $this->getJson('/api/attendance/qr-code?'.http_build_query(['type' => 'Daily Clock']));
        $qr->assertOk()
            ->assertJsonPath('department', 'Human Resource Development Center and VP-Administration');

        Sanctum::actingAs($hrdcStudent);
        $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $vpCode,
            'method' => 'passcode',
        ])->assertForbidden()
            ->assertJsonPath('message', 'This code is only valid for VP-Administration students. You are assigned to Human Resource Development Center.');

        $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $sharedCode,
            'method' => 'passcode',
        ])->assertOk();

        Sanctum::actingAs($vpStudent);
        $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => substr($qr->json('payload'), 6),
            'method' => 'qr',
        ])->assertOk();

        Sanctum::actingAs($libraryStudent);
        $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $sharedCode,
            'method' => 'passcode',
        ])->assertForbidden()
            ->assertJsonPath('message', 'This code is only valid for Human Resource Development Center and VP-Administration students. You are assigned to Library.');
    }

    public function test_clock_out_any_time_after_clock_in_is_approved(): void
    {
        $supervisor = $this->makeSupervisor('Duty Supervisor', ['Library']);
        $student = $this->makeStudent('Early Out Student', 'Library');

        Carbon::setTestNow(Carbon::parse('2026-11-09 07:40:00'));
        Sanctum::actingAs($supervisor);
        $code = $this->getJson('/api/attendance/passcode?'.http_build_query(['type' => 'Daily Clock']))
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($student);
        $clockIn = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-11-09 07:55:00'));
        Sanctum::actingAs($supervisor);
        $code = $this->getJson('/api/attendance/passcode?'.http_build_query(['type' => 'Daily Clock']))
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($student);
        $this->putJson('/api/attendance/secure-clock-out/'.$clockIn->json('attendance.id'), [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk();

        $this->assertDatabaseHas('attendances', [
            'id' => $clockIn->json('attendance.id'),
            'time_in' => '2026-11-09 07:40:00',
            'time_out' => '2026-11-09 07:55:00',
            'status' => 'approved',
        ]);
    }

    /**
     * @param  list<string>  $offices
     */
    private function makeSupervisor(string $name, array $offices): User
    {
        $user = User::create([
            'name' => $name,
            'username' => strtolower(str_replace(' ', '.', $name)).'.'.uniqid(),
            'password' => 'password',
            'role' => 'Supervisor',
        ]);

        UserProfile::create([
            'user_id' => $user->id,
            'assigned_office' => $offices[0],
            'supervised_departments' => $offices,
        ]);

        return $user->load('profile');
    }

    private function makeStudent(string $name, string $office): User
    {
        $user = User::create([
            'name' => $name,
            'username' => strtolower(str_replace(' ', '.', $name)).'.'.uniqid(),
            'password' => 'password',
            'role' => 'Student',
        ]);

        UserProfile::create([
            'user_id' => $user->id,
            'student_id_number' => 'ID-'.uniqid(),
            'assigned_office' => $office,
        ]);

        Schedule::create([
            'user_id' => $user->id,
            'kind' => 'work',
            'day' => 'Monday',
            'time' => '08:00 - 12:00',
            'department' => $office,
        ]);

        return $user->load('profile');
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
            $table->string('profile_picture')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->timestamp('email_verified_at')->nullable();
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

        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('student_id_number')->nullable();
            $table->string('assigned_office')->nullable();
            $table->json('supervised_departments')->nullable();
            $table->timestamps();
        });

        Schema::create('offices', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('abbreviation')->nullable();
            $table->timestamps();
        });

        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind')->nullable();
            $table->string('day')->nullable();
            $table->string('time')->nullable();
            $table->string('department')->nullable();
            $table->timestamps();
        });

        Schema::create('daily_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('token_code');
            $table->string('type');
            $table->string('channel')->default('passcode');
            $table->string('description')->nullable();
            $table->unsignedBigInteger('event_id')->nullable();
            $table->foreignId('generated_by')->constrained('users');
            $table->timestamp('expires_at');
            $table->timestamps();
        });

        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('attendance_type')->nullable();
            $table->string('verification_code_used')->nullable();
            $table->string('check_in_method')->nullable();
            $table->unsignedBigInteger('code_owner_id')->nullable();
            $table->timestamp('time_in')->nullable();
            $table->timestamp('time_out')->nullable();
            $table->decimal('rendered_hours', 8, 2)->nullable();
            $table->decimal('computed_hours', 8, 2)->default(0);
            $table->string('work_type')->nullable();
            $table->text('task_description')->nullable();
            $table->string('status')->nullable();
            $table->boolean('is_anomaly')->default(false);
            $table->text('anomaly_reason')->nullable();
            $table->unsignedBigInteger('rendered_hour_event_id')->nullable();
            $table->decimal('activity_hours', 8, 2)->nullable();
            $table->unsignedBigInteger('schedule_id')->nullable();
            $table->timestamps();
        });

        Schema::create('rendered_hour_events', function (Blueprint $table) {
            $table->id();
            $table->string('kind');
            $table->date('event_date');
            $table->timestamps();
        });

        Schema::create('rendered_hour_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained('rendered_hour_events')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('status')->nullable();
            $table->decimal('hours_delta', 8, 2)->default(0);
            $table->timestamps();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('title');
            $table->text('message');
            $table->boolean('is_read')->default(false);
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

        Schema::create('campus_settings', function (Blueprint $table) {
            $table->id();
            $table->decimal('hourly_rate', 8, 2)->default(28);
            $table->decimal('weekly_standard_hours', 8, 2)->default(20);
            $table->decimal('weekly_extended_hours', 8, 2)->default(25);
            $table->decimal('monthly_max_hours', 8, 2)->default(100);
            $table->timestamps();
        });

        Schema::create('disciplinary_records', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('student_id');
            $table->string('penalty')->nullable();
            $table->string('status')->nullable();
            $table->timestamp('suspension_ends_at')->nullable();
            $table->timestamps();
        });

        Schema::create('hour_limit_approvals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->date('week_start')->nullable();
            $table->string('status')->nullable();
            $table->decimal('approved_hours', 8, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('extra_hours_requests', function (Blueprint $table) {
            $table->id();
            $table->string('status')->nullable();
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->decimal('approved_hours', 8, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('extra_hours_request_students', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('extra_hours_request_id');
            $table->unsignedBigInteger('user_id');
            $table->timestamps();
        });
    }
}
