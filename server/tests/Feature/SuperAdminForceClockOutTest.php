<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\CampusSetting;
use App\Models\RenderedHourEntry;
use App\Models\RenderedHourEvent;
use App\Models\Schedule;
use App\Models\User;
use App\Models\UserProfile;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SuperAdminForceClockOutTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        CampusSetting::create([
            'hourly_rate' => 28,
            'weekly_standard_hours' => 20,
            'weekly_extended_hours' => 25,
            'monthly_max_hours' => 100,
        ]);
        Carbon::setTestNow(Carbon::parse('2026-11-13 11:00:00')); // Friday
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_only_super_admin_can_list_and_force_clock_out(): void
    {
        $student = $this->makeStudent('Open Student', 'Library');
        $open = $this->openRegular($student, '2026-11-13 08:00:00');

        foreach (['Student', 'Supervisor', 'WSPO Staff'] as $role) {
            $actor = $this->makeUser($role, $role === 'Supervisor' ? 'Library' : 'WSPO Coordinator');
            Sanctum::actingAs($actor);
            $this->getJson('/api/admin/open-sessions')->assertForbidden();
            $this->postJson('/api/admin/force-clock-out', [
                'mode' => 'selected',
                'attendance_ids' => [$open->id],
            ])->assertForbidden();
        }

        $admin = $this->makeUser('Super Admin');
        Sanctum::actingAs($admin);
        $this->getJson('/api/admin/open-sessions')
            ->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('sessions.0.id', $open->id);
    }

    public function test_selected_clock_out_closes_regular_and_activity_with_hours(): void
    {
        $admin = $this->makeUser('Super Admin');
        $regularStudent = $this->makeStudent('Regular Student', 'Library');
        $activityStudent = $this->makeStudent('Activity Student', 'Registrar');
        $otherStudent = $this->makeStudent('Leave Open', 'Clinic');

        $regular = $this->openRegular($regularStudent, '2026-11-13 08:00:00');
        $activity = $this->openActivity($activityStudent, '2026-11-13 08:05:00', 1.0);
        $leaveOpen = $this->openRegular($otherStudent, '2026-11-13 09:00:00');

        Sanctum::actingAs($admin);
        $this->postJson('/api/admin/force-clock-out', [
            'mode' => 'selected',
            'attendance_ids' => [$regular->id, $activity->id],
        ])->assertOk()
            ->assertJsonPath('mode', 'selected')
            ->assertJsonPath('closed', 2)
            ->assertJsonPath('failed', 0);

        $regular->refresh();
        $this->assertNotNull($regular->time_out);
        $this->assertSame('approved', $regular->status);
        // Library 08:00–11:00 = 3h, no lunch deduction.
        $this->assertEquals(3.0, (float) $regular->computed_hours);
        $this->assertStringContainsString('Forced clock-out by Super Admin.', (string) $regular->task_description);

        $activity->refresh();
        $this->assertNotNull($activity->time_out);
        $this->assertEquals(1.0, (float) $activity->activity_hours);
        $this->assertDatabaseHas('rendered_hour_entries', [
            'user_id' => $activityStudent->id,
            'status' => 'on_time',
            'hours_delta' => 1,
            'attendance_id' => $activity->id,
        ]);

        $leaveOpen->refresh();
        $this->assertNull($leaveOpen->time_out);

        $list = $this->getJson('/api/admin/open-sessions')->assertOk();
        $this->assertSame(1, (int) $list->json('count'));
        $this->assertSame($leaveOpen->id, (int) $list->json('sessions.0.id'));
    }

    public function test_bulk_clock_out_closes_every_open_regular_and_activity_session(): void
    {
        $admin = $this->makeUser('Super Admin');
        $a = $this->makeStudent('A Student', 'Library');
        $b = $this->makeStudent('B Student', 'Registrar');

        $regular = $this->openRegular($a, '2026-11-13 07:00:00');
        // On-time window starts at event starts_at (08:00); early punches count as late.
        $activity = $this->openActivity($b, '2026-11-13 08:10:00', 5.0);

        Sanctum::actingAs($admin);
        $this->postJson('/api/admin/force-clock-out', ['mode' => 'bulk'])
            ->assertOk()
            ->assertJsonPath('mode', 'bulk')
            ->assertJsonPath('closed', 2)
            ->assertJsonPath('failed', 0);

        $this->assertNotNull($regular->fresh()->time_out);
        $this->assertNotNull($activity->fresh()->time_out);
        $this->assertEquals(5.0, (float) $activity->fresh()->activity_hours);
        $this->assertSame(0, (int) $this->getJson('/api/admin/open-sessions')->json('count'));
    }

    public function test_regular_hours_cap_at_scheduled_end_like_student_clock_out(): void
    {
        $admin = $this->makeUser('Super Admin');
        $student = $this->makeStudent('Shift Student', 'Registrar'); // non-library → lunch rules apply when relevant
        Schedule::create([
            'user_id' => $student->id,
            'kind' => 'work',
            'day' => 'Friday',
            'time' => '08:00 - 10:00',
            'department' => 'Registrar',
        ]);

        // Clocked in at 08:00, forgotten; force at 11:00 → credit capped at 10:00 = 2h.
        $open = Attendance::create([
            'user_id' => $student->id,
            'attendance_type' => 'Regular',
            'work_type' => 'Regular',
            'time_in' => '2026-11-13 08:00:00',
            'time_out' => null,
            'status' => 'pending',
            'computed_hours' => 0,
        ]);

        Sanctum::actingAs($admin);
        $this->postJson('/api/admin/force-clock-out', [
            'mode' => 'selected',
            'attendance_ids' => [$open->id],
        ])->assertOk()
            ->assertJsonPath('closed', 1);

        $open->refresh();
        $this->assertSame('2026-11-13 10:00:00', $open->time_out->format('Y-m-d H:i:s'));
        $this->assertEquals(2.0, (float) $open->computed_hours);
        $this->assertStringContainsString('Hours capped at scheduled shift end', (string) $open->task_description);
    }

    private function makeUser(string $role, ?string $office = null): User
    {
        $user = User::create([
            'name' => $role.' '.uniqid(),
            'username' => strtolower(str_replace(' ', '.', $role)).'.'.uniqid(),
            'password' => 'password',
            'role' => $role,
        ]);

        UserProfile::create([
            'user_id' => $user->id,
            'assigned_office' => $office,
            'supervised_departments' => $role === 'Supervisor' && $office ? [$office] : null,
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
            'year_level' => 2,
        ]);

        return $user->load('profile');
    }

    private function openRegular(User $student, string $timeIn): Attendance
    {
        return Attendance::create([
            'user_id' => $student->id,
            'attendance_type' => 'Regular',
            'work_type' => 'Regular',
            'time_in' => $timeIn,
            'time_out' => null,
            'status' => 'pending',
            'computed_hours' => 0,
        ]);
    }

    private function openActivity(User $student, string $timeIn, float $hours): Attendance
    {
        $event = RenderedHourEvent::create([
            'kind' => RenderedHourEvent::DEVOTIONAL,
            'title' => 'Morning devotion',
            'event_date' => '2026-11-13',
            'hours' => $hours,
            'starts_at' => '08:00',
            'ends_at' => '09:00',
            'created_by' => $student->id,
        ]);

        $attendance = Attendance::create([
            'user_id' => $student->id,
            'attendance_type' => 'Activity',
            'work_type' => 'Activity',
            'time_in' => $timeIn,
            'time_out' => null,
            'status' => 'pending',
            'rendered_hour_event_id' => $event->id,
            'computed_hours' => 0,
        ]);

        RenderedHourEntry::create([
            'event_id' => $event->id,
            'user_id' => $student->id,
            'status' => RenderedHourEntry::TIMED_IN,
            'scanned_at' => $timeIn,
            'hours_delta' => 0,
            'attendance_id' => $attendance->id,
        ]);

        return $attendance;
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
            $table->integer('year_level')->nullable();
            $table->json('supervised_departments')->nullable();
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
            $table->unsignedBigInteger('janitorial_group_id')->nullable();
            $table->string('janitorial_area')->nullable();
            $table->timestamps();
        });

        Schema::create('rendered_hour_events', function (Blueprint $table) {
            $table->id();
            $table->string('kind');
            $table->string('title')->nullable();
            $table->date('event_date');
            $table->decimal('hours', 8, 2)->default(0);
            $table->string('direction')->nullable();
            $table->unsignedTinyInteger('year_level')->nullable();
            $table->string('group_name')->nullable();
            $table->unsignedBigInteger('group_id')->nullable();
            $table->time('starts_at')->nullable();
            $table->time('ends_at')->nullable();
            $table->time('valid_until')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('rendered_hour_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained('rendered_hour_events')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('status')->nullable();
            $table->timestamp('scanned_at')->nullable();
            $table->decimal('hours_delta', 8, 2)->default(0);
            $table->unsignedBigInteger('attendance_id')->nullable();
            $table->timestamps();
            $table->unique(['event_id', 'user_id']);
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
