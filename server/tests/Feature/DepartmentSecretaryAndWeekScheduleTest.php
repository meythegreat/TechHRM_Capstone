<?php

namespace Tests\Feature;

use App\Http\Controllers\UserController;
use App\Models\Office;
use App\Models\Schedule;
use App\Models\SemesterTerm;
use App\Models\User;
use App\Models\UserProfile;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DepartmentSecretaryAndWeekScheduleTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        Carbon::setTestNow(Carbon::parse('2026-11-09 09:00:00', 'Asia/Manila'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_schedules_are_arranged_monday_through_friday(): void
    {
        $admin = $this->makeUser('Super Admin');
        $student = $this->makeUser('Student', 'Library', 'Week Worker');
        SemesterTerm::create([
            'label' => '1st Semester',
            'starts_on' => '2026-08-03',
            'ends_on' => '2027-01-02',
            'months' => 5,
            'updated_by' => $admin->id,
        ]);

        $this->makeSchedule($student, 'Friday', '13:00 - 17:00');
        $this->makeSchedule($student, 'Monday', '08:00 - 12:00');
        $this->makeSchedule($student, 'Wednesday', '08:00 - 12:00');

        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/schedules?audit=1');
        $response->assertOk();
        $this->assertSame(
            ['Monday', 'Wednesday', 'Friday'],
            collect($response->json())->pluck('day')->all()
        );
    }

    public function test_elected_wspo_officer_appears_in_the_assigned_department_and_an_employee_secretary_does_not(): void
    {
        $supervisor = $this->makeUser('Supervisor', 'College of Computer Studies', 'CCS Supervisor');
        $supervisor->profile->update(['supervised_departments' => ['College of Computer Studies']]);

        $officer = $this->makeUser('Student', 'College of Computer Studies', 'Quia de Felipe');
        $officer->profile->update([
            'organization_officer' => true,
            'officer_position' => 'WSPO Secretary',
        ]);

        $employee = $this->makeUser('Department Secretary', 'College of Computer Studies', 'CCS Employee Secretary');
        $employee->profile->update(['secretary_departments' => ['College of Computer Studies']]);

        $coordinator = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'WSPO Coordinator');

        $accounts = app(UserController::class);
        $this->assertTrue($accounts->supervisorCanAccessStudent($supervisor->fresh('profile'), $officer->fresh('profile')));
        $this->assertFalse($accounts->isStudentOfficer($employee->fresh('profile')));
        $this->assertFalse($accounts->supervisorCanAccessStudent($supervisor->fresh('profile'), $employee->fresh('profile')));
        $this->assertFalse($accounts->supervisorCanAccessStudent($supervisor->fresh('profile'), $coordinator->fresh('profile')));

        Sanctum::actingAs($supervisor->fresh('profile'));
        $names = collect($this->getJson('/api/personnel')->assertOk()->json())->pluck('name');
        $this->assertTrue($names->contains('Quia de Felipe'));
        $this->assertFalse($names->contains('CCS Employee Secretary'));
        $this->assertFalse($names->contains('WSPO Coordinator'));
    }

    public function test_secretary_acts_only_while_the_supervisor_is_absent(): void
    {
        $supervisor = $this->makeUser('Supervisor', 'Library', 'Library Supervisor');
        $supervisor->profile->update(['supervised_departments' => ['Library']]);
        $secretary = $this->makeUser('Department Secretary', 'Library', 'Library Secretary');
        $secretary->profile->update(['secretary_departments' => ['Library']]);
        $student = $this->makeUser('Student', 'Library', 'Library Worker');

        $accounts = app(UserController::class);
        $this->assertFalse($accounts->isActingDepartmentSecretary($secretary->fresh('profile')));

        Sanctum::actingAs($secretary->fresh('profile'));
        $this->getJson('/api/schedules')->assertForbidden();

        Sanctum::actingAs($supervisor);
        $this->postJson('/api/supervisor-absence', ['absent' => true])->assertOk();

        $this->assertTrue($accounts->isActingDepartmentSecretary($secretary->fresh('profile')));

        Sanctum::actingAs($secretary->fresh('profile'));
        $this->getJson('/api/schedules')->assertOk();
        $this->getJson('/api/organization-schedules')
            ->assertOk()
            ->assertJsonPath('scope', 'office');

        $this->assertTrue($accounts->supervisorCanAccessStudent($secretary->fresh('profile'), $student->fresh('profile')));
    }

    private function makeUser(string $role, ?string $office = null, ?string $name = null): User
    {
        $user = User::create([
            'name' => $name ?: $role.' User',
            'username' => strtolower(str_replace(' ', '.', $name ?: $role)).'.'.uniqid(),
            'password' => bcrypt('password'),
            'role' => $role,
        ]);

        if ($office !== null || in_array($role, ['Supervisor', 'Department Secretary', 'Student', 'WSPO Staff'], true)) {
            UserProfile::create([
                'user_id' => $user->id,
                'assigned_office' => $office,
                'supervised_departments' => $role === 'Supervisor' && $office ? [$office] : null,
                'secretary_departments' => $role === 'Department Secretary' && $office ? [$office] : null,
            ]);
        }

        return $user->load('profile');
    }

    private function makeSchedule(User $student, string $day, string $time): void
    {
        Schedule::create([
            'user_id' => $student->id,
            'kind' => 'work',
            'day' => $day,
            'time' => $time,
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
            $table->string('work_department')->nullable();
            $table->boolean('organization_officer')->default(false);
            $table->string('officer_position')->nullable();
            $table->string('assignment_area')->nullable();
            $table->boolean('special_hours_request')->default(false);
            $table->string('course')->nullable();
            $table->integer('year_level')->nullable();
            $table->string('gender')->nullable();
            $table->json('supervised_departments')->nullable();
            $table->json('secretary_departments')->nullable();
            $table->date('supervisor_absent_on')->nullable();
            $table->string('duty_type')->nullable();
            $table->text('duty_request')->nullable();
            $table->timestamps();
        });

        Schema::create('offices', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('abbreviation', 32)->nullable()->unique();
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

        Office::create(['name' => 'Library', 'abbreviation' => 'LIB']);
    }
}
