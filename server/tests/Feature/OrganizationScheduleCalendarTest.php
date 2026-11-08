<?php

namespace Tests\Feature;

use App\Models\Office;
use App\Models\Schedule;
use App\Models\SemesterTerm;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrganizationScheduleCalendarTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
    }

    public function test_supervisor_sees_only_students_in_their_office_from_morning_to_evening(): void
    {
        $librarySupervisor = $this->makeUser('Supervisor', 'Library');
        $ccsSupervisor = $this->makeUser('Supervisor', 'College of Computer Studies (CCS)');
        $libraryStudent = $this->makeUser('Student', 'Library', 'Library Worker');
        $ccsStudent = $this->makeUser('Student', 'CCS', 'CCS Worker');
        $movedStudent = $this->makeUser('Student', 'CCS', 'Moved Worker');

        $this->makeSchedule($libraryStudent, 'Monday', '1:00 PM - 3:00 PM', 'work', 'Library');
        $this->makeSchedule($ccsStudent, 'Monday', '9:00 AM - 10:00 AM', 'work', 'CCS');
        $this->makeSchedule($libraryStudent, 'Monday', '08:00 - 09:00', 'class', 'Library');
        $this->makeSchedule($movedStudent, 'Monday', '07:00 - 08:00', 'work', 'Library');

        Sanctum::actingAs($librarySupervisor);

        $library = $this->getJson('/api/organization-schedules');
        $library->assertOk()
            ->assertJsonPath('scope', 'office')
            ->assertJsonPath('offices', ['Library']);

        $this->assertSame(
            ['Library Worker', 'Library Worker'],
            collect($library->json('schedules'))->pluck('student_name')->all()
        );
        $this->assertSame(
            ['08:00 - 09:00', '1:00 PM - 3:00 PM'],
            collect($library->json('schedules'))->pluck('time')->all()
        );

        Sanctum::actingAs($ccsSupervisor);

        $ccs = $this->getJson('/api/organization-schedules');
        $ccs->assertOk()->assertJsonPath('scope', 'office');
        $this->assertSame(
            ['07:00 - 08:00', '9:00 AM - 10:00 AM'],
            collect($ccs->json('schedules'))->pluck('time')->all()
        );
        $this->assertEqualsCanonicalizing(
            ['Moved Worker', 'CCS Worker'],
            collect($ccs->json('schedules'))->pluck('student_name')->all()
        );
    }

    public function test_super_admin_and_wspo_staff_see_every_office_in_morning_order(): void
    {
        $admin = $this->makeUser('Super Admin');
        $coordinator = $this->makeUser('WSPO Staff', 'WSPO Coordinator');
        $secretary = $this->makeUser('WSPO Staff', 'WSPO Secretary');
        $libraryStudent = $this->makeUser('Student', 'Library', 'Library Worker');
        $ccsStudent = $this->makeUser('Student', 'CCS', 'CCS Worker');

        Office::create(['name' => 'Library']);
        Office::create(['name' => 'Registrar']);

        $this->makeSchedule($libraryStudent, 'Monday', '1:00 PM - 3:00 PM', 'work', 'Library');
        $this->makeSchedule($ccsStudent, 'Monday', '9:00 AM - 10:00 AM', 'class', 'CCS');
        $this->makeSchedule($libraryStudent, 'Monday', '08:00 - 09:00', 'work', 'Library');

        foreach ([$admin, $coordinator, $secretary] as $viewer) {
            Sanctum::actingAs($viewer);

            $response = $this->getJson('/api/organization-schedules');
            $response->assertOk()->assertJsonPath('scope', 'organization');
            $this->assertSame(
                ['08:00 - 09:00', '9:00 AM - 10:00 AM', '1:00 PM - 3:00 PM'],
                collect($response->json('schedules'))->pluck('time')->all()
            );
            $this->assertEqualsCanonicalizing(
                ['Library', 'Registrar'],
                $response->json('offices')
            );
        }
    }

    public function test_supervisor_without_an_office_sees_no_schedules(): void
    {
        $supervisor = $this->makeUser('Supervisor');
        $student = $this->makeUser('Student', 'Library', 'Library Worker');
        $this->makeSchedule($student, 'Tuesday', '08:00 - 12:00', 'work', 'Library');

        Sanctum::actingAs($supervisor);

        $this->getJson('/api/organization-schedules')
            ->assertOk()
            ->assertJsonPath('scope', 'office')
            ->assertJsonPath('schedules', [])
            ->assertJsonPath('offices', []);
    }

    private function makeUser(string $role, ?string $office = null, ?string $name = null): User
    {
        $user = User::create([
            'name' => $name ?: $role.' User',
            'username' => strtolower(str_replace(' ', '.', $name ?: $role)).'.'.uniqid(),
            'password' => bcrypt('password'),
            'role' => $role,
        ]);

        if ($office !== null || $role === 'Supervisor') {
            UserProfile::create([
                'user_id' => $user->id,
                'assigned_office' => $office,
                'supervised_departments' => $role === 'Supervisor' && $office ? [$office] : null,
            ]);
        }

        return $user->load('profile');
    }

    private function makeSchedule(User $student, string $day, string $time, string $kind, string $department): void
    {
        Schedule::create([
            'user_id' => $student->id,
            'kind' => $kind,
            'day' => $day,
            'time' => $time,
            'duty_type' => $kind === 'class' ? 'Class' : 'Janitorial',
            'subject' => $kind === 'class' ? 'GE 101' : null,
            'department' => $department,
            'supervisor' => 'Office Supervisor',
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
            $table->string('course')->nullable();
            $table->integer('year_level')->nullable();
            $table->string('gender')->nullable();
            $table->json('supervised_departments')->nullable();
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

        SemesterTerm::create([
            'label' => '1st Semester',
            'starts_on' => '2026-08-03',
            'ends_on' => '2027-01-02',
            'months' => 5,
        ]);
    }
}
