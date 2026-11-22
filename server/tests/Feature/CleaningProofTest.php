<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\User;
use App\Models\UserProfile;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CleaningProofTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        Storage::fake('local');
        Carbon::setTestNow(Carbon::parse('2026-11-13 17:15:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_janitorial_photos_clock_in_and_out_without_a_code(): void
    {
        [$lead, $member, $groupId] = $this->seedJanitorialGroup();

        Sanctum::actingAs($member);
        $started = $this->post('/api/attendance/janitorial-photo', [
            'phase' => 'before',
            'capture_source' => 'live_camera',
            'captured_at' => '2026-11-13T17:16:00+08:00',
            'group_id' => $groupId,
            'photo' => UploadedFile::fake()->image('before.jpg', 640, 480),
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('attendance.check_in_method', 'photo');

        $attendanceId = $started->json('attendance.id');
        $open = Attendance::query()->findOrFail($attendanceId);
        $this->assertNull($open->time_out);
        $this->assertTrue(Carbon::parse($open->time_in)->equalTo(Carbon::parse('2026-11-13T17:16:00+08:00')));
        $this->assertEquals(0.0, (float) $open->rendered_hours);

        Carbon::setTestNow(Carbon::parse('2026-11-13 17:40:00'));
        $this->post('/api/attendance/janitorial-photo', [
            'phase' => 'after',
            'capture_source' => 'live_camera',
            'captured_at' => '2026-11-13T17:40:00+08:00',
            'photo' => UploadedFile::fake()->image('after.jpg', 640, 480),
        ], ['Accept' => 'application/json'])->assertCreated();

        $closed = Attendance::query()->findOrFail($attendanceId);
        $this->assertSame('pending', $closed->status);
        $this->assertEquals(0.0, (float) $closed->rendered_hours);
        $this->assertTrue(Carbon::parse($closed->time_out)->equalTo(Carbon::parse('2026-11-13T17:40:00+08:00')));

        Sanctum::actingAs($lead);
        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, ['status' => 'accepted'])
            ->assertOk()
            ->assertJsonPath('entry.status', 'recommended');
        $this->assertEquals(0.0, (float) Attendance::query()->findOrFail($attendanceId)->rendered_hours);

        $immediate = User::query()->where('role', 'Immediate Supervisor')->firstOrFail();
        Sanctum::actingAs($immediate);
        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, ['status' => 'accepted'])
            ->assertOk();

        $accepted = Attendance::query()->findOrFail($attendanceId);
        $this->assertEquals(4.0, (float) $accepted->rendered_hours);
        $this->assertTrue(Carbon::parse($accepted->time_in)->addHours(4)->equalTo(Carbon::parse($accepted->time_out)));
    }

    public function test_absent_janitorial_leader_blocks_code_and_live_photo(): void
    {
        [$lead, $member, $groupId] = $this->seedJanitorialGroup();
        $leaderRow = \App\Models\JanitorialLeader::query()->where('user_id', $lead->id)->firstOrFail();
        $coordinator = User::query()->where('role', 'WSPO Staff')->firstOrFail();

        Sanctum::actingAs($coordinator);
        $this->patchJson('/api/attendance/janitorial-leaders/'.$leaderRow->id, [
            'is_present' => false,
        ])->assertOk()
            ->assertJsonPath('leader.is_present', false);

        Sanctum::actingAs($lead);
        $code = $this->getJson('/api/attendance/janitorial-passcode?group_id='.$groupId)
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($member);
        $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertStatus(422);

        $this->post('/api/attendance/janitorial-photo', [
            'phase' => 'before',
            'capture_source' => 'live_camera',
            'captured_at' => '2026-11-13T17:16:00+08:00',
            'group_id' => $groupId,
            'photo' => UploadedFile::fake()->image('before.jpg', 640, 480),
        ], ['Accept' => 'application/json'])->assertStatus(422);
    }

    public function test_janitorial_clock_out_rejected_without_cleaning_proof(): void
    {
        [$lead, $member, $groupId] = $this->seedJanitorialGroup();

        Sanctum::actingAs($lead);
        $code = $this->getJson('/api/attendance/janitorial-passcode?group_id='.$groupId)
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($member);
        $attendanceId = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('cleaning_proof.required', true)
            ->assertJsonPath('cleaning_proof.complete', false)
            ->json('attendance.id');

        Carbon::setTestNow(Carbon::parse('2026-11-13 18:00:00'));
        Sanctum::actingAs($lead);
        $outCode = $this->getJson('/api/attendance/janitorial-passcode?group_id='.$groupId)->json('token_code');
        Sanctum::actingAs($member);
        $this->putJson('/api/attendance/secure-clock-out/'.$attendanceId, [
            'token_code' => $outCode,
            'method' => 'passcode',
        ])->assertStatus(422)
            ->assertJsonPath('requires_cleaning_proof', true);

        $this->assertNull(Attendance::query()->find($attendanceId)?->time_out);
        $this->assertSame(0.0, (float) Attendance::query()->where('user_id', $member->id)->sum('rendered_hours'));
    }

    public function test_live_camera_before_after_proof_unlocks_janitorial_hours(): void
    {
        [$lead, $member, $groupId] = $this->seedJanitorialGroup();

        Sanctum::actingAs($lead);
        $code = $this->getJson('/api/attendance/janitorial-passcode?group_id='.$groupId)->json('token_code');

        Sanctum::actingAs($member);
        $attendanceId = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk()->json('attendance.id');

        $this->post('/api/attendance/'.$attendanceId.'/cleaning-proof', [
            'phase' => 'after',
            'capture_source' => 'live_camera',
            'captured_at' => now()->toIso8601String(),
            'photo' => UploadedFile::fake()->image('after.jpg', 640, 480),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->post('/api/attendance/'.$attendanceId.'/cleaning-proof', [
            'phase' => 'before',
            'capture_source' => 'gallery',
            'captured_at' => now()->toIso8601String(),
            'photo' => UploadedFile::fake()->image('before.jpg', 640, 480),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $before = $this->post('/api/attendance/'.$attendanceId.'/cleaning-proof', [
            'phase' => 'before',
            'capture_source' => 'live_camera',
            'captured_at' => '2026-11-13T17:20:00+08:00',
            'photo' => UploadedFile::fake()->image('before.jpg', 640, 480),
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('cleaning_proof.missing.0', 'after');

        Storage::disk('local')->assertExists($before->json('path'));

        $after = $this->post('/api/attendance/'.$attendanceId.'/cleaning-proof', [
            'phase' => 'after',
            'capture_source' => 'live_camera',
            'captured_at' => '2026-11-13T17:55:00+08:00',
            'photo' => UploadedFile::fake()->image('after.jpg', 640, 480),
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('cleaning_proof.complete', true);

        Storage::disk('local')->assertExists($after->json('path'));

        Carbon::setTestNow(Carbon::parse('2026-11-13 18:05:00'));
        Sanctum::actingAs($lead);
        $outCode = $this->getJson('/api/attendance/janitorial-passcode?group_id='.$groupId)->json('token_code');
        Sanctum::actingAs($member);
        $this->putJson('/api/attendance/secure-clock-out/'.$attendanceId, [
            'token_code' => $outCode,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('hours_rendered', 0)
            ->assertJsonPath('cleaning_proof.complete', true);

        $row = Attendance::query()->findOrFail($attendanceId);
        $this->assertNotNull($row->time_out);
        $this->assertNotEmpty($row->cleaning_before_path);
        $this->assertNotEmpty($row->cleaning_after_path);
        $this->assertEquals(0.0, (float) $row->rendered_hours);
        $this->assertSame('pending', $row->status);

        Sanctum::actingAs($lead);
        $this->getJson('/api/attendance/'.$attendanceId.'/cleaning-proof')
            ->assertOk()
            ->assertJsonPath('cleaning_proof.complete', true);

        $this->get('/api/secure-file?path='.urlencode($row->cleaning_before_path))
            ->assertOk();
    }

    public function test_janitorial_supervisor_accepts_or_declines_photo_entry(): void
    {
        [$lead, $member, $groupId] = $this->seedJanitorialGroup();
        $outsider = $this->makeUser('Student', 'Library', 'Outsider');

        Sanctum::actingAs($lead);
        $code = $this->getJson('/api/attendance/janitorial-passcode?group_id='.$groupId)->json('token_code');
        Sanctum::actingAs($member);
        $attendanceId = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk()->json('attendance.id');

        foreach (['before' => '2026-11-13T17:16:00+08:00', 'after' => '2026-11-13T17:40:00+08:00'] as $phase => $capturedAt) {
            $this->post('/api/attendance/'.$attendanceId.'/cleaning-proof', [
                'phase' => $phase,
                'capture_source' => 'live_camera',
                'captured_at' => $capturedAt,
                'photo' => UploadedFile::fake()->image($phase.'.jpg', 640, 480),
            ], ['Accept' => 'application/json'])->assertCreated();
        }

        Sanctum::actingAs($lead);
        $this->getJson('/api/attendance/janitorial-reviews')
            ->assertOk()
            ->assertJsonPath('entries.0.id', $attendanceId)
            ->assertJsonPath('entries.0.time_out', null)
            ->assertJsonPath('entries.0.before_captured_at', '2026-11-13T17:16:00+08:00');

        $outCode = $this->getJson('/api/attendance/janitorial-passcode?group_id='.$groupId)->json('token_code');
        Sanctum::actingAs($member);
        $this->putJson('/api/attendance/secure-clock-out/'.$attendanceId, [
            'token_code' => $outCode,
            'method' => 'passcode',
        ])->assertOk();

        Sanctum::actingAs($member);
        $this->getJson('/api/attendance/janitorial-reviews')->assertOk()->assertJsonPath('entries', []);
        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, ['status' => 'accepted'])->assertForbidden();

        Sanctum::actingAs($outsider);
        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, ['status' => 'accepted'])->assertForbidden();

        Sanctum::actingAs($lead);
        $this->getJson('/api/attendance/janitorial-reviews')
            ->assertOk()
            ->assertJsonPath('entries.0.id', $attendanceId)
            ->assertJsonPath('entries.0.status', 'pending')
            ->assertJsonPath('entries.0.before_captured_at', '2026-11-13T17:16:00+08:00')
            ->assertJsonPath('entries.0.after_captured_at', '2026-11-13T17:40:00+08:00');

        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, [
            'status' => 'accepted',
            'deducted_hours' => 1,
            'remarks' => 'Left the area early.',
        ])->assertOk()
            ->assertJsonPath('entry.status', 'recommended')
            ->assertJsonPath('entry.deducted_hours', 1);
        $recommended = Attendance::query()->findOrFail($attendanceId);
        $this->assertSame('recommended', $recommended->status);
        $this->assertEquals(0.0, (float) $recommended->rendered_hours);
        $this->assertSame('Left the area early.', $recommended->janitorial_leader_remarks);

        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, ['status' => 'rejected'])
            ->assertStatus(422);

        $immediate = User::query()->where('role', 'Immediate Supervisor')->firstOrFail();
        Sanctum::actingAs($immediate);
        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, ['status' => 'accepted'])
            ->assertOk()
            ->assertJsonPath('entry.status', 'accepted');
        $accepted = Attendance::query()->findOrFail($attendanceId);
        $this->assertSame('accepted', $accepted->status);
        $this->assertEquals(3.0, (float) $accepted->rendered_hours);
        $this->assertTrue(
            Carbon::parse($accepted->time_in)->addHours(3)->equalTo(Carbon::parse($accepted->time_out))
        );

        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, ['status' => 'rejected'])
            ->assertStatus(422);
        $this->assertSame('accepted', Attendance::query()->findOrFail($attendanceId)->status);
        $this->assertEquals(3.0, (float) Attendance::query()->findOrFail($attendanceId)->rendered_hours);
    }

    public function test_daily_cleaning_time_out_requires_proof(): void
    {
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'Coord');
        $student = $this->makeUser('Student', 'Library', 'Cleaner');

        Sanctum::actingAs($staff);
        $groupId = DB::table('daily_cleaning_groups')->insertGetId([
            'name' => 'Wing A',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('daily_cleaning_group_members')->insert([
            'group_id' => $groupId,
            'user_id' => $student->id,
            'is_leader' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $eventId = DB::table('rendered_hour_events')->insertGetId([
            'kind' => 'daily_cleaning',
            'title' => 'Daily cleaning',
            'event_date' => '2026-11-13',
            'hours' => 1,
            'group_id' => $groupId,
            'starts_at' => '05:00:00',
            'created_by' => $staff->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('rendered_hour_entries')->insert([
            'event_id' => $eventId,
            'user_id' => $student->id,
            'hours_delta' => 0,
            'status' => 'selected',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-13 05:10:00'));
        Sanctum::actingAs($staff);
        $token = $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId)
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($student);
        $attendanceId = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $token,
            'method' => 'passcode',
        ])->assertOk()->json('attendance.id');

        Carbon::setTestNow(Carbon::parse('2026-11-13 05:40:00'));
        Sanctum::actingAs($staff);
        $outToken = $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId)
            ->assertOk()
            ->json('token_code');
        Sanctum::actingAs($student);
        $this->putJson('/api/attendance/secure-clock-out/'.$attendanceId, [
            'token_code' => $outToken,
            'method' => 'passcode',
        ])->assertStatus(422)
            ->assertJsonPath('requires_cleaning_proof', true);

        foreach (['before', 'after'] as $phase) {
            $this->post('/api/attendance/'.$attendanceId.'/cleaning-proof', [
                'phase' => $phase,
                'capture_source' => 'live_camera',
                'captured_at' => now()->toIso8601String(),
                'photo' => UploadedFile::fake()->image($phase.'.jpg', 640, 480),
            ], ['Accept' => 'application/json'])->assertCreated();
        }

        Sanctum::actingAs($staff);
        $outToken2 = $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId)
            ->assertOk()
            ->json('token_code');
        Sanctum::actingAs($student);
        $this->putJson('/api/attendance/secure-clock-out/'.$attendanceId, [
            'token_code' => $outToken2,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('hours_rendered', 1);
    }

    /**
     * @return array{0: User, 1: User, 2: int}
     */
    private function seedJanitorialGroup(): array
    {
        $wspo = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'Coord');
        $lead = $this->makeUser('Student', 'Library', 'Lead');
        $member = $this->makeUser('Student', 'Library', 'Member');
        $immediate = $this->makeUser('Immediate Supervisor', 'Library', 'Library Secretary');

        Sanctum::actingAs($wspo);
        $groupId = $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Library',
            'name' => 'Stacks',
            'area' => 'Second floor',
            'supervisor_user_id' => $lead->id,
            'immediate_supervisor_user_id' => $immediate->id,
            'member_ids' => [$member->id],
        ])->assertCreated()->json('group.id');

        return [$lead, $member, (int) $groupId];
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
            $table->timestamp('deleted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('assigned_office')->nullable();
            $table->json('supervised_departments')->nullable();
            $table->string('duty_type')->nullable();
            $table->string('status')->nullable();
            $table->boolean('special_hours_request')->default(false);
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

        Schema::create('janitorial_leaders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->boolean('is_present')->default(true);
            $table->timestamps();
        });

        Schema::create('janitorial_groups', function (Blueprint $table) {
            $table->id();
            $table->string('department', 120);
            $table->string('name', 80);
            $table->string('area', 120);
            $table->foreignId('supervisor_user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('immediate_supervisor_user_id')->nullable();
            $table->timestamps();
        });

        Schema::create('janitorial_group_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained('janitorial_groups')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique('user_id');
        });

        Schema::create('daily_cleaning_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('daily_cleaning_group_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained('daily_cleaning_groups')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_leader')->default(false);
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
            $table->string('janitorial_leader_decision', 20)->nullable();
            $table->decimal('janitorial_deducted_hours', 8, 2)->nullable();
            $table->text('janitorial_leader_remarks')->nullable();
            $table->unsignedBigInteger('janitorial_leader_reviewed_by')->nullable();
            $table->timestamp('janitorial_leader_reviewed_at')->nullable();
            $table->unsignedBigInteger('janitorial_final_by')->nullable();
            $table->boolean('janitorial_final_on_behalf')->default(false);
            $table->boolean('janitorial_supervision')->default(false);
            $table->string('cleaning_before_path', 500)->nullable();
            $table->string('cleaning_after_path', 500)->nullable();
            $table->timestamp('cleaning_before_captured_at')->nullable();
            $table->timestamp('cleaning_after_captured_at')->nullable();
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

        Schema::create('rendered_hour_events', function (Blueprint $table) {
            $table->id();
            $table->string('kind')->nullable();
            $table->string('title')->nullable();
            $table->date('event_date')->nullable();
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
            $table->float('hours_delta')->default(0);
            $table->string('status')->nullable();
            $table->timestamp('scanned_at')->nullable();
            $table->unsignedBigInteger('attendance_id')->nullable();
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
    }
}
