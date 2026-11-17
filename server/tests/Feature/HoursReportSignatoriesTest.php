<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HoursReportSignatoriesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
    }

    public function test_hours_report_shows_elected_student_secretary_name(): void
    {
        $viewer = $this->makeUser('Super Admin', null, 'Report Viewer');
        $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'Ana Coordinator');

        $secretary = $this->makeUser('Student', 'College of Computer Studies', 'Quia de Felipe');
        $secretary->profile->update([
            'organization_officer' => true,
            'officer_position' => 'WSPO Secretary',
            'year_level' => 3,
            'student_id_number' => '2026-8801',
        ]);

        Sanctum::actingAs($viewer);
        $this->getJson('/api/financial/hours-report?period_start=2026-11-01&period_end=2026-11-30')
            ->assertOk()
            ->assertJsonPath('signatories.secretary', 'Quia de Felipe')
            ->assertJsonPath('signatories.coordinator', 'Ana Coordinator');
    }

    public function test_hours_report_shows_legacy_wspo_staff_secretary_with_compound_office_label(): void
    {
        $viewer = $this->makeUser('Super Admin', null, 'Report Viewer');
        $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'Ana Coordinator');

        $this->makeUser('WSPO Staff', 'CCS · WSPO Secretary', 'Legacy Secretary');

        Sanctum::actingAs($viewer);
        $this->getJson('/api/financial/hours-report?period_start=2026-11-01&period_end=2026-11-30')
            ->assertOk()
            ->assertJsonPath('signatories.secretary', 'Legacy Secretary')
            ->assertJsonPath('signatories.coordinator', 'Ana Coordinator');
    }

    public function test_hours_report_shows_legacy_exact_office_secretary_name(): void
    {
        $viewer = $this->makeUser('Super Admin', null, 'Report Viewer');
        $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'Ana Coordinator');
        $this->makeUser('WSPO Staff', 'WSPO Secretary', 'Exact Secretary');

        Sanctum::actingAs($viewer);
        $this->getJson('/api/financial/hours-report?period_start=2026-11-01&period_end=2026-11-30')
            ->assertOk()
            ->assertJsonPath('signatories.secretary', 'Exact Secretary')
            ->assertJsonPath('signatories.coordinator', 'Ana Coordinator');
    }

    private function makeUser(string $role, ?string $office = null, ?string $name = null): User
    {
        $user = User::create([
            'name' => $name ?: $role.' User',
            'username' => strtolower(str_replace(' ', '.', $name ?: $role)).'.'.uniqid(),
            'password' => bcrypt('password'),
            'role' => $role,
        ]);

        UserProfile::create([
            'user_id' => $user->id,
            'assigned_office' => $office,
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
            $table->string('work_department')->nullable();
            $table->boolean('organization_officer')->default(false);
            $table->string('officer_position')->nullable();
            $table->string('assignment_area')->nullable();
            $table->boolean('special_hours_request')->default(false);
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
            $table->string('abbreviation')->nullable();
            $table->timestamps();
        });

        Schema::create('rendered_hour_events', function (Blueprint $table) {
            $table->id();
            $table->string('kind');
            $table->string('title');
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
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });

        Schema::create('rendered_hour_entries', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('event_id');
            $table->unsignedBigInteger('user_id');
            $table->string('status')->nullable();
            $table->timestamp('scanned_at')->nullable();
            $table->decimal('hours_delta', 8, 2)->default(0);
            $table->unsignedBigInteger('attendance_id')->nullable();
            $table->timestamps();
        });

        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('attendance_type')->nullable();
            $table->timestamp('time_in')->nullable();
            $table->timestamp('time_out')->nullable();
            $table->decimal('rendered_hours', 8, 2)->nullable();
            $table->decimal('computed_hours', 8, 2)->default(0);
            $table->string('work_type')->nullable();
            $table->string('status')->nullable();
            $table->unsignedBigInteger('rendered_hour_event_id')->nullable();
            $table->timestamps();
        });

        Schema::create('disciplinary_records', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('student_id');
            $table->string('penalty')->nullable();
            $table->string('status')->nullable();
            $table->decimal('penalty_hours', 8, 2)->default(0);
            $table->date('incident_date')->nullable();
            $table->timestamps();
        });

        Schema::create('campus_settings', function (Blueprint $table) {
            $table->id();
            $table->decimal('hourly_rate', 8, 2)->default(28);
            $table->decimal('weekly_standard_hours', 8, 2)->default(20);
            $table->decimal('weekly_extended_hours', 8, 2)->default(25);
            $table->decimal('monthly_max_hours', 8, 2)->default(100);
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
        });
    }
}
