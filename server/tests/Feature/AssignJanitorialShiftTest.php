<?php

namespace Tests\Feature;

use App\Models\SemesterTerm;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AssignJanitorialShiftTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
    }

    public function test_wspo_can_assign_a_janitorial_work_shift(): void
    {
        [, $student] = $this->actingWspoWithStudent();

        $response = $this->postJson('/api/schedules', [
            'user_id' => $student->id,
            'days' => ['Monday', 'Wednesday'],
            'time' => '08:00 - 12:00',
            'kind' => 'work',
            'duty_type' => 'Janitorial',
        ]);

        $response->assertOk()
            ->assertJsonPath('message', '2 work days assigned successfully!')
            ->assertJsonPath('schedules.0.duty_type', 'Janitorial')
            ->assertJsonPath('schedules.0.day', 'Monday')
            ->assertJsonPath('schedules.1.duty_type', 'Janitorial')
            ->assertJsonPath('schedules.1.day', 'Wednesday');

        $this->assertDatabaseHas('schedules', [
            'user_id' => $student->id,
            'day' => 'Monday',
            'kind' => 'work',
            'duty_type' => 'Janitorial',
            'department' => 'Library',
        ]);
        $this->assertDatabaseHas('schedules', [
            'user_id' => $student->id,
            'day' => 'Wednesday',
            'kind' => 'work',
            'duty_type' => 'Janitorial',
        ]);
    }

    public function test_wspo_can_assign_several_work_shifts_at_once(): void
    {
        [, $student] = $this->actingWspoWithStudent();

        $response = $this->postJson('/api/schedules', [
            'user_id' => $student->id,
            'kind' => 'work',
            'entries' => [
                [
                    'days' => ['Monday', 'Wednesday'],
                    'time' => '08:00 - 12:00',
                    'duty_type' => 'Janitorial',
                ],
                [
                    'days' => ['Friday'],
                    'time' => '13:00 - 17:00',
                    'duty_type' => 'Clerical Work',
                ],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('message', '3 work days assigned across 2 shifts.')
            ->assertJsonCount(3, 'schedules');

        $this->assertDatabaseHas('schedules', [
            'user_id' => $student->id,
            'day' => 'Friday',
            'duty_type' => 'Clerical Work',
            'time' => '13:00 - 17:00',
        ]);
        $this->assertDatabaseCount('schedules', 3);
    }

    public function test_wspo_can_save_several_classes_at_once(): void
    {
        [, $student] = $this->actingWspoWithStudent();

        $response = $this->postJson('/api/schedules', [
            'user_id' => $student->id,
            'kind' => 'class',
            'entries' => [
                [
                    'days' => ['Tuesday', 'Thursday'],
                    'time' => '09:00 - 10:30',
                    'subject' => 'CS 301 Data Structures',
                    'room' => 'CCS 204',
                    'instructor' => 'Prof. Cruz',
                ],
                [
                    'days' => ['Monday'],
                    'time' => '13:00 - 16:00',
                    'subject' => 'IT 221 Networking',
                    'room' => 'CCS 101',
                    'instructor' => 'Prof. Reyes',
                ],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('message', '3 class days saved across 2 classes.');

        $this->assertDatabaseHas('schedules', [
            'user_id' => $student->id,
            'kind' => 'class',
            'day' => 'Thursday',
            'subject' => 'CS 301 Data Structures',
            'room' => 'CCS 204',
            'instructor' => 'Prof. Cruz',
        ]);
        $this->assertDatabaseHas('schedules', [
            'user_id' => $student->id,
            'kind' => 'class',
            'day' => 'Monday',
            'subject' => 'IT 221 Networking',
        ]);
    }

    public function test_wspo_can_save_classes_and_work_shifts_together(): void
    {
        [, $student] = $this->actingWspoWithStudent();

        $response = $this->postJson('/api/schedules', [
            'user_id' => $student->id,
            'kind' => 'class',
            'entries' => [
                [
                    'kind' => 'class',
                    'days' => ['Monday', 'Wednesday'],
                    'time' => '07:30 - 09:00',
                    'subject' => 'GE 101',
                    'room' => 'A-12',
                    'instructor' => 'Prof. Santos',
                ],
                [
                    'kind' => 'work',
                    'days' => ['Monday'],
                    'time' => '13:00 - 17:00',
                    'duty_type' => 'Library Assistant',
                ],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('message', '1 class and 1 work shift saved.');

        $this->assertDatabaseHas('schedules', [
            'user_id' => $student->id,
            'kind' => 'class',
            'day' => 'Wednesday',
            'subject' => 'GE 101',
        ]);
        $this->assertDatabaseHas('schedules', [
            'user_id' => $student->id,
            'kind' => 'work',
            'day' => 'Monday',
            'duty_type' => 'Library Assistant',
            'time' => '13:00 - 17:00',
        ]);
        $this->assertDatabaseCount('schedules', 3);
    }

    public function test_overlapping_shifts_in_one_save_are_rejected(): void
    {
        [, $student] = $this->actingWspoWithStudent();

        $response = $this->postJson('/api/schedules', [
            'user_id' => $student->id,
            'kind' => 'work',
            'entries' => [
                [
                    'days' => ['Monday'],
                    'time' => '08:00 - 12:00',
                    'duty_type' => 'Janitorial',
                ],
                [
                    'days' => ['Monday'],
                    'time' => '11:00 - 15:00',
                    'duty_type' => 'Clerical Work',
                ],
            ],
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Shift 1 overlaps Shift 2 on Monday.');
        $this->assertDatabaseCount('schedules', 0);
    }

    /**
     * @return array{0: User, 1: User}
     */
    private function actingWspoWithStudent(): array
    {
        $staff = User::create([
            'name' => 'WSPO Coordinator',
            'username' => 'wspo.coordinator.'.uniqid(),
            'password' => bcrypt('password'),
            'role' => 'WSPO Staff',
        ]);
        UserProfile::create([
            'user_id' => $staff->id,
            'assigned_office' => 'WSPO Coordinator',
        ]);

        $student = User::create([
            'name' => 'Janitor Worker',
            'username' => 'janitor.worker.'.uniqid(),
            'password' => bcrypt('password'),
            'role' => 'Student',
        ]);
        UserProfile::create([
            'user_id' => $student->id,
            'assigned_office' => 'Library',
            'course' => 'BSIT',
            'year_level' => 2,
        ]);

        SemesterTerm::create([
            'label' => '1st Semester',
            'starts_on' => '2026-08-03',
            'ends_on' => '2027-01-02',
            'months' => 5,
            'updated_by' => $staff->id,
        ]);

        Sanctum::actingAs($staff->load('profile'));

        return [$staff, $student];
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
            $table->string('course')->nullable();
            $table->integer('year_level')->nullable();
            $table->string('gender')->nullable();
            $table->json('supervised_departments')->nullable();
            $table->string('duty_type')->nullable();
            $table->text('duty_request')->nullable();
            $table->timestamps();
        });

        Schema::create('semester_terms', function (Blueprint $table) {
            $table->id();
            $table->string('label', 80);
            $table->date('starts_on');
            $table->date('ends_on');
            $table->unsignedTinyInteger('months')->default(5);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind')->default('work');
            $table->string('day');
            $table->string('time');
            $table->string('duty_type');
            $table->string('subject')->nullable();
            $table->string('room')->nullable();
            $table->string('instructor')->nullable();
            $table->string('department');
            $table->string('supervisor');
            $table->text('edit_request_note')->nullable();
            $table->string('edit_request_status')->default('none');
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
