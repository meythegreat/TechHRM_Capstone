<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\User;
use App\Models\UserProfile;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BulletinAnnouncementTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        Carbon::setTestNow(Carbon::parse('2026-11-23 10:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_only_super_admin_can_publish_a_bulletin(): void
    {
        $student = $this->makeStudent('Pilot Student', 'Library', 2, '2026-08-01 09:00:00');
        Sanctum::actingAs($student);

        $this->postJson('/api/admin/bulletins', $this->payload([
            'audience' => 'students',
            'user_ids' => [$student->id],
        ]))->assertForbidden();
    }

    public function test_specific_students_receive_the_bulletin_notification_and_dashboard_copy(): void
    {
        $admin = $this->makeUser('Super Admin');
        $pilot = $this->makeStudent('Pilot Student', 'Library', 2, '2026-08-04 09:00:00');
        $later = $this->makeStudent('Later Student', 'Library', 2, '2026-11-02 09:00:00');

        Sanctum::actingAs($admin);
        $found = $this->getJson('/api/admin/bulletins/students?created_from=2026-08-01&created_until=2026-08-31')
            ->assertOk()
            ->json('ids');

        $this->assertSame([$pilot->id], $found);

        $this->postJson('/api/admin/bulletins', $this->payload([
            'title' => 'Update your student number',
            'message' => 'Pilot accounts must change their student number and password.',
            'priority' => 'urgent',
            'audience' => 'students',
            'user_ids' => $found,
            'expires_at' => '2026-11-30 17:00:00',
        ]))->assertCreated()
            ->assertJsonPath('delivered_count', 1)
            ->assertJsonPath('active', true);

        Sanctum::actingAs($pilot);
        $this->getJson('/api/bulletins/mine')
            ->assertOk()
            ->assertJsonPath('bulletins.0.title', 'Update your student number')
            ->assertJsonPath('bulletins.0.priority', 'urgent')
            ->assertJsonPath('bulletins.0.dismissed', false);

        $this->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('0.title', 'Urgent announcement: Update your student number');

        Sanctum::actingAs($later);
        $this->getJson('/api/bulletins/mine')->assertJsonPath('bulletins', []);
        $this->assertSame(0, Notification::query()->where('user_id', $later->id)->count());
    }

    public function test_year_level_and_office_filters_stay_inside_the_selected_group(): void
    {
        $admin = $this->makeUser('Super Admin');
        $firstYear = $this->makeStudent('First Year', 'Library', 1);
        $secondYear = $this->makeStudent('Second Year', 'Library', 2);
        $registrar = $this->makeStudent('Registrar Student', 'Registrar', 2);
        $supervisor = $this->makeUser('Supervisor', 'Library');

        Sanctum::actingAs($admin);
        $this->postJson('/api/admin/bulletins', $this->payload([
            'title' => 'Second-year reminder',
            'audience' => 'year_level',
            'year_levels' => [2],
        ]))->assertCreated()->assertJsonPath('delivered_count', 2);

        $this->postJson('/api/admin/bulletins', $this->payload([
            'title' => 'Library duty note',
            'audience' => 'office',
            'offices' => ['Library'],
        ]))->assertCreated()->assertJsonPath('delivered_count', 3);

        Sanctum::actingAs($secondYear);
        $titles = collect($this->getJson('/api/bulletins/mine')->json('bulletins'))->pluck('title')->all();
        $this->assertEqualsCanonicalizing(['Second-year reminder', 'Library duty note'], $titles);

        Sanctum::actingAs($firstYear);
        $this->assertSame(
            ['Library duty note'],
            collect($this->getJson('/api/bulletins/mine')->json('bulletins'))->pluck('title')->all()
        );

        Sanctum::actingAs($registrar);
        $this->assertSame(
            ['Second-year reminder'],
            collect($this->getJson('/api/bulletins/mine')->json('bulletins'))->pluck('title')->all()
        );

        Sanctum::actingAs($supervisor);
        $this->assertSame(
            ['Library duty note'],
            collect($this->getJson('/api/bulletins/mine')->json('bulletins'))->pluck('title')->all()
        );
    }

    public function test_expired_bulletins_leave_the_dashboard_and_notifications(): void
    {
        $admin = $this->makeUser('Super Admin');
        $student = $this->makeStudent('Working Student', 'Clinic', 3);

        Sanctum::actingAs($admin);
        $created = $this->postJson('/api/admin/bulletins', $this->payload([
            'audience' => 'everyone',
            'expires_at' => '2026-11-23 18:00:00',
        ]))->assertCreated();

        Sanctum::actingAs($student);
        $this->getJson('/api/bulletins/mine')->assertJsonCount(1, 'bulletins');
        $this->getJson('/api/notifications')->assertJsonCount(1);

        Carbon::setTestNow(Carbon::parse('2026-11-23 18:01:00'));

        $this->getJson('/api/bulletins/mine')->assertJsonPath('bulletins', []);
        $this->getJson('/api/notifications')->assertJsonCount(0);
        $this->assertSame(1, Notification::query()->where('user_id', $student->id)->count());

        Sanctum::actingAs($admin);
        $this->assertFalse($this->getJson('/api/admin/bulletins')->json('bulletins.0.active'));
        $this->deleteJson('/api/admin/bulletins/'.$created->json('id'))->assertOk();
        $this->assertSame(0, Notification::query()->where('bulletin_id', $created->json('id'))->count());
    }

    public function test_dismissing_an_urgent_bulletin_hides_the_popup_until_it_expires(): void
    {
        $admin = $this->makeUser('Super Admin');
        $student = $this->makeStudent('Working Student', 'Clinic', 3);

        Sanctum::actingAs($admin);
        $id = $this->postJson('/api/admin/bulletins', $this->payload([
            'priority' => 'special',
            'audience' => 'students',
            'user_ids' => [$student->id],
        ]))->json('id');

        Sanctum::actingAs($student);
        $this->postJson("/api/bulletins/{$id}/dismiss")->assertOk()->assertJsonPath('dismissed', true);
        $this->getJson('/api/bulletins/mine')
            ->assertJsonPath('bulletins.0.dismissed', true)
            ->assertJsonPath('bulletins.0.priority', 'special');
        $this->getJson('/api/notifications')->assertJsonCount(1);

        Sanctum::actingAs($admin);
        $this->postJson("/api/bulletins/{$id}/dismiss")->assertNotFound();
    }

    public function test_expiry_must_be_in_the_future(): void
    {
        $admin = $this->makeUser('Super Admin');
        Sanctum::actingAs($admin);

        $this->postJson('/api/admin/bulletins', $this->payload([
            'audience' => 'everyone',
            'expires_at' => '2026-11-23 09:00:00',
        ]))->assertStatus(422)->assertJsonValidationErrors(['expires_at']);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'title' => 'Campus bulletin',
            'message' => 'Please read this update.',
            'priority' => 'normal',
            'audience' => 'everyone',
            'expires_at' => '2026-12-01 17:00:00',
        ], $overrides);
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

    private function makeStudent(string $name, string $office, int $year, ?string $createdAt = null): User
    {
        $user = User::create([
            'name' => $name,
            'username' => strtolower(str_replace(' ', '.', $name)).'.'.uniqid(),
            'password' => 'password',
            'role' => 'Student',
        ]);

        if ($createdAt) {
            $user->forceFill([
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ])->saveQuietly();
        }

        UserProfile::create([
            'user_id' => $user->id,
            'student_id_number' => 'ID-'.uniqid(),
            'assigned_office' => $office,
            'year_level' => $year,
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
            $table->boolean('must_change_password')->default(false);
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
            $table->integer('year_level')->nullable();
            $table->json('supervised_departments')->nullable();
            $table->json('secretary_departments')->nullable();
            $table->timestamps();
        });

        Schema::create('bulletins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title');
            $table->text('message');
            $table->string('priority', 16);
            $table->string('audience', 32);
            $table->json('year_levels')->nullable();
            $table->json('offices')->nullable();
            $table->unsignedInteger('delivered_count')->default(0);
            $table->timestamp('expires_at');
            $table->timestamps();
        });

        Schema::create('bulletin_recipients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bulletin_id')->constrained('bulletins')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['bulletin_id', 'user_id']);
        });

        Schema::create('bulletin_dismissals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bulletin_id')->constrained('bulletins')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['bulletin_id', 'user_id']);
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('bulletin_id')->nullable()->constrained('bulletins')->cascadeOnDelete();
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
    }
}
