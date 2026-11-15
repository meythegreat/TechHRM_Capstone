<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\CampusSetting;
use App\Models\ManualAttendanceRequest;
use App\Models\Notification;
use App\Models\User;
use App\Models\UserProfile;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ManualAttendanceRequestTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        Carbon::setTestNow(Carbon::parse('2026-11-14 18:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_student_submits_multi_shift_request_and_supervisor_credits_dtr(): void
    {
        $student = $this->makeUser('Student', 'Library', 'Ana Cruz');
        $supervisor = $this->makeUser('Supervisor', 'Library', 'Library Supervisor');
        $otherSupervisor = $this->makeUser('Supervisor', 'Registrar', 'Registrar Supervisor');

        Sanctum::actingAs($student);
        $this->postJson('/api/attendance/manual-requests', [
            'reason' => 'Office had no internet yesterday.',
            'shifts' => [
                ['date' => '2026-11-13', 'time_in' => '08:00', 'time_out' => '12:00'],
                ['date' => '2026-11-13', 'time_in' => '13:00', 'time_out' => '17:00'],
            ],
        ])->assertCreated()
            ->assertJsonPath('request.status', 'Pending')
            ->assertJsonPath('request.shifts.0.time_in', '08:00')
            ->assertJsonPath('request.shifts.1.time_out', '17:00');

        $requestId = ManualAttendanceRequest::query()->value('id');
        $this->assertNotNull($requestId);
        $this->assertTrue(
            Notification::query()
                ->where('user_id', $supervisor->id)
                ->where('title', 'Offline attendance request')
                ->exists()
        );

        Sanctum::actingAs($otherSupervisor);
        $this->patchJson('/api/attendance/manual-requests/'.$requestId, [
            'status' => 'Approved',
        ])->assertForbidden();

        Sanctum::actingAs($supervisor);
        $this->getJson('/api/attendance/manual-requests')
            ->assertOk()
            ->assertJsonPath('requests.0.id', $requestId)
            ->assertJsonPath('requests.0.student_name', 'Ana Cruz');

        $this->patchJson('/api/attendance/manual-requests/'.$requestId, [
            'status' => 'Approved',
        ])->assertOk()
            ->assertJsonPath('request.status', 'Approved');

        $this->assertSame(2, Attendance::query()->where('user_id', $student->id)->count());
        // Two credited shifts: 08:00–12:00 and 13:00–17:00 → 8 hours total.
        $this->assertEquals(8.0, (float) Attendance::query()->where('user_id', $student->id)->sum('rendered_hours'));
        $this->assertSame(
            ['accepted', 'accepted'],
            Attendance::query()->where('user_id', $student->id)->orderBy('time_in')->pluck('status')->all()
        );
        $this->assertTrue(
            Notification::query()
                ->where('user_id', $student->id)
                ->where('title', 'Offline attendance approved')
                ->exists()
        );

        Sanctum::actingAs($student);
        $history = $this->getJson('/api/attendance/my-history?start=2026-11-01&end=2026-11-30')
            ->assertOk()
            ->json();
        $rows = is_array($history['history'] ?? null) ? $history['history'] : $history;
        $this->assertCount(2, $rows);
    }

    public function test_student_can_cancel_pending_and_supervisor_can_reject(): void
    {
        $student = $this->makeUser('Student', 'Library', 'Ben Santos');
        $supervisor = $this->makeUser('Supervisor', 'Library', 'Library Supervisor');

        Sanctum::actingAs($student);
        $created = $this->postJson('/api/attendance/manual-requests', [
            'shifts' => [
                ['date' => '2026-11-12', 'time_in' => '09:00', 'time_out' => '11:00'],
            ],
        ])->assertCreated()->json('request.id');

        $this->deleteJson('/api/attendance/manual-requests/'.$created)
            ->assertOk();
        $this->assertNull(ManualAttendanceRequest::query()->find($created));

        $again = $this->postJson('/api/attendance/manual-requests', [
            'shifts' => [
                ['date' => '2026-11-12', 'time_in' => '09:00', 'time_out' => '11:00'],
            ],
        ])->assertCreated()->json('request.id');

        Sanctum::actingAs($supervisor);
        $this->patchJson('/api/attendance/manual-requests/'.$again, [
            'status' => 'Rejected',
            'decision_note' => 'Times do not match office log.',
        ])->assertOk()
            ->assertJsonPath('request.status', 'Rejected');

        $this->assertSame(0, Attendance::query()->where('user_id', $student->id)->count());
        $this->assertTrue(
            Notification::query()
                ->where('user_id', $student->id)
                ->where('title', 'Offline attendance declined')
                ->exists()
        );
    }

    private function makeUser(string $role, ?string $office = null, ?string $name = null): User
    {
        $user = User::create([
            'name' => $name ?: $role.' User',
            'username' => strtolower(str_replace(' ', '.', $name ?: $role)).'.'.uniqid(),
            'password' => 'password',
            'role' => $role,
        ]);

        UserProfile::create([
            'user_id' => $user->id,
            'assigned_office' => $office,
            'supervised_departments' => $role === 'Supervisor' && $office ? [$office] : null,
            'duty_type' => $role === 'Student' ? 'Clerical' : null,
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
            $table->string('assigned_office')->nullable();
            $table->json('supervised_departments')->nullable();
            $table->string('duty_type')->nullable();
            $table->string('student_id_number')->nullable();
            $table->string('year_level')->nullable();
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

        DB::table('campus_settings')->insert([
            'hourly_rate' => 28,
            'weekly_standard_hours' => 20,
            'weekly_extended_hours' => 25,
            'monthly_max_hours' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Schema::create('disciplinary_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $table->string('status')->nullable();
            $table->string('penalty')->nullable();
            $table->decimal('penalty_hours', 8, 2)->default(0);
            $table->date('incident_date')->nullable();
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
            $table->decimal('computed_hours', 8, 2)->nullable();
            $table->string('work_type')->nullable();
            $table->text('task_description')->nullable();
            $table->string('status')->nullable();
            $table->boolean('is_anomaly')->default(false);
            $table->string('anomaly_reason')->nullable();
            $table->unsignedBigInteger('rendered_hour_event_id')->nullable();
            $table->float('activity_hours')->nullable();
            $table->unsignedBigInteger('schedule_id')->nullable();
            $table->unsignedBigInteger('janitorial_group_id')->nullable();
            $table->string('janitorial_area', 120)->nullable();
            $table->timestamps();
        });

        Schema::create('manual_attendance_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('request_type', 40)->default('regular');
            $table->string('reason', 1000)->default('Office had no internet; submitted for supervisor approval.');
            $table->string('status', 20)->default('Pending');
            $table->text('decision_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('manual_attendance_request_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('manual_attendance_request_id')
                ->constrained('manual_attendance_requests')
                ->cascadeOnDelete();
            $table->date('work_date');
            $table->string('time_in', 5);
            $table->string('time_out', 5);
            $table->string('janitorial_area', 120)->nullable();
            $table->unsignedBigInteger('janitorial_group_id')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->foreignId('attendance_id')->nullable()->constrained('attendances')->nullOnDelete();
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
            $table->string('admin_name')->nullable();
            $table->string('action');
            $table->string('module')->nullable();
            $table->unsignedBigInteger('record_id')->nullable();
            $table->text('description')->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('ip_address')->nullable();
            $table->timestamps();
        });

        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind')->default('work');
            $table->string('day')->nullable();
            $table->string('time')->nullable();
            $table->string('duty_type')->nullable();
            $table->string('department')->nullable();
            $table->string('supervisor')->nullable();
            $table->timestamps();
        });

        Schema::create('extra_hours_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->string('department')->nullable();
            $table->string('status', 20)->default('Draft');
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->decimal('approved_hours', 8, 2)->default(25);
            $table->timestamps();
        });

        Schema::create('extra_hours_request_students', function (Blueprint $table) {
            $table->id();
            $table->foreignId('extra_hours_request_id')->constrained('extra_hours_requests')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
        });

        Schema::create('hour_limit_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('week_start')->nullable();
            $table->decimal('approved_hours', 8, 2)->nullable();
            $table->string('status')->default('pending');
            $table->timestamps();
        });

        Schema::create('rendered_hour_events', function (Blueprint $table) {
            $table->id();
            $table->date('event_date')->nullable();
            $table->string('kind')->nullable();
            $table->timestamps();
        });

        Schema::create('rendered_hour_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rendered_hour_event_id')->constrained('rendered_hour_events')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->float('hours_delta')->default(0);
            $table->string('status')->nullable();
            $table->timestamps();
        });
    }
}
