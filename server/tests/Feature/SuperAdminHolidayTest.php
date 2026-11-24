<?php

namespace Tests\Feature;

use App\Models\Holiday;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SuperAdminHolidayTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
    }

    public function test_super_admin_can_add_edit_and_remove_a_holiday_and_a_class_break(): void
    {
        $admin = $this->makeUser('Super Admin');
        Sanctum::actingAs($admin);

        $holiday = $this->postJson('/api/holidays', [
            'date' => '2026-12-24',
            'name' => 'Christmas Eve',
            'kind' => 'holiday',
        ])->assertCreated()
            ->assertJsonPath('name', 'Christmas Eve')
            ->assertJsonPath('kind', 'holiday');

        $this->putJson('/api/holidays/'.$holiday->json('id'), [
            'date' => '2026-12-24',
            'end_date' => '2026-12-25',
            'name' => 'Christmas Break Days',
            'kind' => 'holiday',
        ])->assertOk()
            ->assertJsonPath('name', 'Christmas Break Days')
            ->assertJsonPath('end_date', '2026-12-25');

        $this->postJson('/api/holidays', [
            'date' => '2026-10-20',
            'end_date' => '2026-10-24',
            'name' => 'Wellness Break',
            'kind' => 'break',
        ])->assertCreated()
            ->assertJsonPath('kind', 'break');

        $this->deleteJson('/api/holidays/'.$holiday->json('id'))
            ->assertOk();

        $this->assertDatabaseMissing('holidays', ['id' => $holiday->json('id')]);
        $this->assertSame(1, Holiday::query()->count());
    }

    public function test_wspo_staff_can_still_add_a_holiday_and_other_roles_cannot(): void
    {
        $staff = $this->makeUser('WSPO Staff');
        Sanctum::actingAs($staff);
        $this->postJson('/api/holidays', [
            'date' => '2026-11-01',
            'name' => 'All Saints',
            'kind' => 'holiday',
        ])->assertCreated();

        foreach (['Student', 'Supervisor'] as $role) {
            Sanctum::actingAs($this->makeUser($role));
            $this->postJson('/api/holidays', [
                'date' => '2026-11-02',
                'name' => 'Blocked',
                'kind' => 'holiday',
            ])->assertForbidden();
        }
    }

    private function makeUser(string $role): User
    {
        return User::create([
            'name' => $role.' User',
            'username' => strtolower(str_replace(' ', '.', $role)).'.'.uniqid(),
            'password' => 'password',
            'role' => $role,
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

        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->date('end_date')->nullable();
            $table->string('name');
            $table->string('kind', 20)->default('holiday');
            $table->string('portion', 10)->default('full');
            $table->time('starts_at')->nullable();
            $table->time('ends_at')->nullable();
            $table->foreignId('created_by')->nullable();
            $table->timestamps();
        });
    }
}
