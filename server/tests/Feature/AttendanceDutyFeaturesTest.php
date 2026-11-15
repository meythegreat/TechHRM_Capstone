<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\DailyToken;
use App\Models\JanitorialGroup;
use App\Models\ManualAttendanceRequest;
use App\Models\Schedule;
use App\Models\User;
use App\Models\UserProfile;
use App\Support\DutyHours;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceDutyFeaturesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        Carbon::setTestNow(Carbon::parse('2026-11-13 16:55:00')); // Friday
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_janitorial_group_caps_and_early_clock_out_credit_janitorial_hours(): void
    {
        $supervisor = $this->makeUser('Supervisor', 'Registrar', 'Reg Supervisor');
        $lead = $this->makeUser('Student', 'Registrar', 'Jan Lead');
        $member = $this->makeUser('Student', 'Registrar', 'Jan Member');
        $extra = [];
        for ($i = 0; $i < 5; $i++) {
            $extra[] = $this->makeUser('Student', 'Registrar', 'Extra '.$i);
        }

        Sanctum::actingAs($supervisor);
        $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Registrar',
            'name' => 'Wing A',
            'area' => 'East hallways',
            'supervisor_user_id' => $lead->id,
            'member_ids' => [$member->id],
        ])->assertCreated()
            ->assertJsonPath('group.area', 'East hallways')
            ->assertJsonPath('group.member_count', 1);

        // Cap: 5 groups per department
        for ($i = 2; $i <= 5; $i++) {
            $this->postJson('/api/attendance/janitorial-groups', [
                'department' => 'Registrar',
                'name' => 'Wing '.$i,
                'area' => 'Area '.$i,
                'supervisor_user_id' => $extra[$i - 2]->id,
                'member_ids' => [],
            ])->assertCreated();
        }
        $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Registrar',
            'name' => 'Wing Overflow',
            'area' => 'Overflow',
            'supervisor_user_id' => $extra[4]->id,
            'member_ids' => [],
        ])->assertStatus(422);

        Sanctum::actingAs($lead);
        $passcode = $this->getJson('/api/attendance/janitorial-passcode')
            ->assertOk()
            ->json('token_code');
        $this->assertNotEmpty($passcode);

        Carbon::setTestNow(Carbon::parse('2026-11-13 14:00:00'));
        Sanctum::actingAs($member);
        $clockIn = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $passcode,
            'method' => 'passcode',
        ])->assertOk();
        $attendanceId = $clockIn->json('attendance.id');
        $this->assertSame('Janitorial', $clockIn->json('attendance.attendance_type'));
        $this->assertSame('East hallways', $clockIn->json('attendance.janitorial_area'));

        // Early free clock-out after 90 minutes (no schedule wait).
        Carbon::setTestNow(Carbon::parse('2026-11-13 15:30:00'));
        Sanctum::actingAs($lead);
        $passcodeOut = $this->getJson('/api/attendance/janitorial-passcode')->json('token_code');
        Sanctum::actingAs($member);
        $this->putJson('/api/attendance/secure-clock-out/'.$attendanceId, [
            'token_code' => $passcodeOut,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('hours_rendered', 1.5);

        $row = Attendance::query()->find($attendanceId);
        $this->assertSame('approved', $row->status);
        $this->assertSame('Janitorial', $row->attendance_type);
        $this->assertEquals(1.5, (float) $row->rendered_hours);
    }

    public function test_janitorial_offline_request_credits_janitorial_type(): void
    {
        $officeSupervisor = $this->makeUser('Supervisor', 'Library', 'Lib Supervisor');
        $lead = $this->makeUser('Student', 'Library', 'Lib Lead');
        $member = $this->makeUser('Student', 'Library', 'Lib Member');

        Sanctum::actingAs($officeSupervisor);
        $groupId = $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Library',
            'name' => 'Stacks',
            'area' => 'Second floor stacks',
            'supervisor_user_id' => $lead->id,
            'member_ids' => [$member->id],
        ])->assertCreated()->json('group.id');

        Sanctum::actingAs($member);
        $requestId = $this->postJson('/api/attendance/manual-requests', [
            'request_type' => 'janitorial',
            'shifts' => [
                ['date' => '2026-11-12', 'time_in' => '09:00', 'time_out' => '11:00'],
            ],
        ])->assertCreated()
            ->assertJsonPath('request.request_type', 'janitorial')
            ->json('request.id');

        Sanctum::actingAs($officeSupervisor);
        $this->patchJson('/api/attendance/manual-requests/'.$requestId, [
            'status' => 'Approved',
        ])->assertOk();

        $attendance = Attendance::query()->where('user_id', $member->id)->first();
        $this->assertNotNull($attendance);
        $this->assertSame('Janitorial', $attendance->attendance_type);
        $this->assertSame((int) $groupId, (int) $attendance->janitorial_group_id);
        $this->assertSame('Second floor stacks', $attendance->janitorial_area);
        $this->assertEquals(2.0, (float) $attendance->rendered_hours);
    }

    public function test_regular_auto_clock_out_window_and_overtime_cap_and_library_no_lunch(): void
    {
        $this->assertSame(10, DutyHours::AUTO_CLOCK_OUT_WINDOW_MINUTES);

        $officeSupervisor = $this->makeUser('Supervisor', 'Registrar', 'Reg Supervisor');
        $student = $this->makeUser('Student', 'Registrar', 'Reg Student');
        $libraryStudent = $this->makeUser('Student', 'Library', 'Lib Student');

        Schedule::create([
            'user_id' => $student->id,
            'kind' => 'work',
            'day' => 'Friday',
            'time' => '08:00 - 17:00',
            'duty_type' => 'Clerical',
        ]);
        Schedule::create([
            'user_id' => $libraryStudent->id,
            'kind' => 'work',
            'day' => 'Friday',
            'time' => '13:00 - 17:00',
            'duty_type' => 'Library Assistant',
        ]);

        // Lunch deducted for non-Library (08:00–17:00 spans 12–13 → 8h not 9h).
        $start = Carbon::parse('2026-11-13 08:00:00');
        $end = Carbon::parse('2026-11-13 17:00:00');
        $this->assertEquals(8.0, DutyHours::creditedHours($start, $end, 'Registrar'));
        $this->assertEquals(9.0, DutyHours::creditedHours($start, $end, 'Library'));

        $token = DailyToken::create([
            'token_code' => 'ABCDEF',
            'type' => 'Daily Clock',
            'channel' => 'passcode',
            'generated_by' => $officeSupervisor->id,
            'expires_at' => Carbon::now()->addMinutes(5),
            'created_at' => Carbon::now(),
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-13 08:00:00'));
        $token->update(['expires_at' => Carbon::now()->addMinutes(5), 'created_at' => Carbon::now()]);
        Sanctum::actingAs($student);
        $attendanceId = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $token->token_code,
            'method' => 'passcode',
        ])->assertOk()->json('attendance.id');

        // Overtime: clock out at 17:30 → credit capped at 17:00, then lunch → 8h.
        Carbon::setTestNow(Carbon::parse('2026-11-13 17:30:00'));
        $token->update(['expires_at' => Carbon::now()->addMinutes(5), 'created_at' => Carbon::now()]);
        $out = $this->putJson('/api/attendance/secure-clock-out/'.$attendanceId, [
            'token_code' => $token->token_code,
            'method' => 'passcode',
        ])->assertOk();
        $this->assertEquals(8.0, (float) $out->json('hours_rendered'));
        $this->assertNotNull(Attendance::query()->find($attendanceId)->time_out);

        // Library auto clock-out within 10-minute window snaps to scheduled end.
        $libSupervisor = $this->makeUser('Supervisor', 'Library', 'Lib Code Owner');
        Carbon::setTestNow(Carbon::parse('2026-11-13 13:00:00'));
        $libToken = DailyToken::create([
            'token_code' => 'LIB001',
            'type' => 'Daily Clock',
            'channel' => 'passcode',
            'generated_by' => $libSupervisor->id,
            'expires_at' => Carbon::now()->addMinutes(5),
            'created_at' => Carbon::now(),
        ]);
        Sanctum::actingAs($libraryStudent);
        $libAttendanceId = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $libToken->token_code,
            'method' => 'passcode',
        ])->assertOk()->json('attendance.id');

        Carbon::setTestNow(Carbon::parse('2026-11-13 16:55:00'));
        $libToken->update(['expires_at' => Carbon::now()->addMinutes(5), 'created_at' => Carbon::now()]);
        $auto = $this->putJson('/api/attendance/secure-clock-out/'.$libAttendanceId, [
            'token_code' => $libToken->token_code,
            'method' => 'passcode',
            'auto_clock_out' => true,
        ])->assertOk();
        $this->assertEquals(4.0, (float) $auto->json('hours_rendered'));
        $this->assertSame(10, (int) $auto->json('auto_clock_out_window_minutes'));
    }

    public function test_class_hours_duty_requires_supervisor_approval(): void
    {
        $supervisor = $this->makeUser('Supervisor', 'CCS Office', 'CCS Supervisor');
        $student = $this->makeUser('Student', 'CCS Office', 'CCS Student');

        Schedule::create([
            'user_id' => $student->id,
            'kind' => 'class',
            'day' => 'Friday',
            'time' => '09:00 - 11:00',
            'subject' => 'Algorithms',
        ]);
        Schedule::create([
            'user_id' => $student->id,
            'kind' => 'work',
            'day' => 'Friday',
            'time' => '08:00 - 12:00',
            'duty_type' => 'Clerical',
        ]);

        $token = DailyToken::create([
            'token_code' => 'CLASS1',
            'type' => 'Daily Clock',
            'channel' => 'passcode',
            'generated_by' => $supervisor->id,
            'expires_at' => Carbon::now()->addMinutes(5),
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-13 10:00:00'));
        Sanctum::actingAs($student);
        $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $token->token_code,
            'method' => 'passcode',
        ])->assertForbidden()
            ->assertJsonPath('requires_class_hours_approval', true);

        $requestId = $this->postJson('/api/attendance/manual-requests', [
            'request_type' => 'class_hours',
            'shifts' => [
                ['date' => '2026-11-13', 'time_in' => '09:30', 'time_out' => '10:30'],
            ],
        ])->assertCreated()
            ->assertJsonPath('request.request_type', 'class_hours')
            ->json('request.id');

        $this->assertSame(0, Attendance::query()->where('user_id', $student->id)->count());

        Sanctum::actingAs($supervisor);
        $this->patchJson('/api/attendance/manual-requests/'.$requestId, [
            'status' => 'Approved',
        ])->assertOk();

        $this->assertSame(1, Attendance::query()->where('user_id', $student->id)->count());
        $this->assertEquals(1.0, (float) Attendance::query()->where('user_id', $student->id)->value('rendered_hours'));
        $this->assertSame(ManualAttendanceRequest::APPROVED, ManualAttendanceRequest::query()->find($requestId)->status);
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
            'year_level' => $role === 'Student' ? '2' : null,
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
            'weekly_standard_hours' => 40,
            'weekly_extended_hours' => 50,
            'monthly_max_hours' => 200,
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

        Schema::create('janitorial_groups', function (Blueprint $table) {
            $table->id();
            $table->string('department', 120);
            $table->string('name', 80);
            $table->string('area', 120);
            $table->foreignId('supervisor_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
        });

        Schema::create('janitorial_group_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained('janitorial_groups')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique('user_id');
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
            $table->foreignId('manual_attendance_request_id')->constrained('manual_attendance_requests')->cascadeOnDelete();
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
            $table->string('subject')->nullable();
            $table->string('room')->nullable();
            $table->string('instructor')->nullable();
            $table->timestamps();
        });

        Schema::create('daily_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('token_code');
            $table->string('type')->nullable();
            $table->string('channel')->nullable();
            $table->string('description')->nullable();
            $table->unsignedBigInteger('event_id')->nullable();
            $table->foreignId('generated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('expires_at')->nullable();
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
