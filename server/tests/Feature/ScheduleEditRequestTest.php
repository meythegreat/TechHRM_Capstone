<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Schedule;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ScheduleEditRequestTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
    }

    public function test_a_student_request_is_approved_and_the_student_is_told(): void
    {
        $student = $this->makeUser('Student', 'Library', 'Ana Cruz');
        $coordinator = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'WSPO Coordinator');
        $schedule = $this->makeSchedule($student);

        Sanctum::actingAs($student);
        $this->postJson('/api/my-schedule/'.$schedule->id.'/request-edit', [
            'note' => 'Please move this shift to Tuesday afternoon.',
        ])->assertOk()
            ->assertJsonPath('message', 'Edit request sent. The WSPO office will review it.');

        $this->assertSame('pending', $schedule->fresh()->edit_request_status);
        $this->assertTrue(
            Notification::query()->where('user_id', $coordinator->id)->where('title', 'Schedule Edit Requested')->exists()
        );

        Sanctum::actingAs($coordinator);
        $this->patchJson('/api/schedules/'.$schedule->id.'/resolve-request', [
            'action' => 'approve',
        ])->assertOk()
            ->assertJsonPath('edit_request_status', 'approved');

        $schedule->refresh();
        $this->assertSame('approved', $schedule->edit_request_status);
        $this->assertSame('Please move this shift to Tuesday afternoon.', $schedule->edit_request_note);
        $this->assertTrue(
            Notification::query()->where('user_id', $student->id)->where('title', 'Schedule edit approved')->exists()
        );
    }

    public function test_a_request_can_be_rejected_and_a_supervisor_cannot_decide(): void
    {
        $student = $this->makeUser('Student', 'Library', 'Ben Santos');
        $supervisor = $this->makeUser('Supervisor', 'Library', 'Library Supervisor');
        $secretary = $this->makeUser('WSPO Staff', 'WSPO Secretary', 'WSPO Secretary');
        $schedule = $this->makeSchedule($student);
        $schedule->update([
            'edit_request_status' => 'pending',
            'edit_request_note' => 'I have a class at this time.',
        ]);

        Sanctum::actingAs($supervisor);
        $this->patchJson('/api/schedules/'.$schedule->id.'/resolve-request', [
            'action' => 'reject',
        ])->assertForbidden();
        $this->assertSame('pending', $schedule->fresh()->edit_request_status);

        Sanctum::actingAs($secretary);
        $this->patchJson('/api/schedules/'.$schedule->id.'/resolve-request', [
            'action' => 'reject',
        ])->assertOk()
            ->assertJsonPath('edit_request_status', 'rejected');

        $schedule->refresh();
        $this->assertSame('rejected', $schedule->edit_request_status);
        $this->assertSame('I have a class at this time.', $schedule->edit_request_note);
        $this->assertTrue(
            Notification::query()->where('user_id', $student->id)->where('title', 'Schedule edit rejected')->exists()
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
        ]);

        return $user->load('profile');
    }

    private function makeSchedule(User $student): Schedule
    {
        return Schedule::create([
            'user_id' => $student->id,
            'kind' => 'work',
            'day' => 'Monday',
            'time' => '08:00 - 12:00',
            'duty_type' => 'Clerical',
            'department' => 'Library',
            'supervisor' => 'Library Supervisor',
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
            $table->timestamps();
        });

        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind')->default('work');
            $table->string('day');
            $table->string('time');
            $table->string('duty_type');
            $table->string('department');
            $table->string('supervisor');
            $table->text('edit_request_note')->nullable();
            $table->string('edit_request_status')->default('none');
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
    }
}
