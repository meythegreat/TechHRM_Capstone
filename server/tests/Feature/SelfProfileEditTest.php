<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SelfProfileEditTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
    }

    public function test_a_working_student_can_update_email_phone_and_student_id(): void
    {
        $student = $this->makeUser('Student', 'student.one', 'student.one@filamer.edu.ph');
        UserProfile::create([
            'user_id' => $student->id,
            'student_id_number' => 'FCU-100',
        ]);
        Sanctum::actingAs($student);

        $this->putJson('/api/user', [
            'name' => $student->name,
            'email' => 'new.student@filamer.edu.ph',
            'phone_number' => '09171234567',
            'student_id_number' => 'FCU-200',
        ])->assertOk();

        $student->refresh();
        $this->assertSame('new.student@filamer.edu.ph', $student->email);
        $this->assertSame('09171234567', $student->phone_number);
        $this->assertSame('FCU-200', $student->profile->student_id_number);
    }

    public function test_a_working_student_cannot_set_an_employee_id(): void
    {
        $student = $this->makeUser('Student', 'student.two', 'student.two@filamer.edu.ph');
        UserProfile::create([
            'user_id' => $student->id,
            'student_id_number' => 'FCU-300',
        ]);
        Sanctum::actingAs($student);

        $this->putJson('/api/user', [
            'name' => $student->name,
            'employee_id' => 'EMP-9',
        ])->assertOk();

        $this->assertNull($student->fresh()->profile->employee_id);
        $this->assertSame('FCU-300', $student->fresh()->profile->student_id_number);
    }

    public function test_department_staff_can_update_email_phone_and_employee_id(): void
    {
        foreach (['Supervisor', 'WSPO Staff', 'Department Secretary', 'Immediate Supervisor'] as $index => $role) {
            $user = $this->makeUser($role, 'staff.'.$index, "staff.{$index}@filamer.edu.ph");
            UserProfile::create(['user_id' => $user->id]);
            Sanctum::actingAs($user);

            $this->putJson('/api/user', [
                'name' => $user->name,
                'email' => "updated.staff.{$index}@filamer.edu.ph",
                'phone_number' => '0917000000'.$index,
                'employee_id' => 'EMP-10'.$index,
            ])->assertOk();

            $user->refresh();
            $this->assertSame("updated.staff.{$index}@filamer.edu.ph", $user->email);
            $this->assertSame('0917000000'.$index, $user->phone_number);
            $this->assertSame('EMP-10'.$index, $user->profile->employee_id);
        }
    }

    public function test_a_super_admin_can_update_email_and_phone_only(): void
    {
        $admin = $this->makeUser('Super Admin', 'super.admin', 'admin@filamer.edu.ph');
        Sanctum::actingAs($admin);

        $this->putJson('/api/user', [
            'name' => $admin->name,
            'email' => 'new.admin@filamer.edu.ph',
            'phone_number' => '09179998888',
            'employee_id' => 'EMP-1',
            'student_id_number' => 'FCU-1',
        ])->assertOk();

        $admin->refresh();
        $this->assertSame('new.admin@filamer.edu.ph', $admin->email);
        $this->assertSame('09179998888', $admin->phone_number);
        $this->assertNull($admin->profile);
    }

    public function test_duplicate_email_phone_and_ids_are_rejected(): void
    {
        $owner = $this->makeUser('Student', 'owner.user', 'owner@filamer.edu.ph', '09170000000');
        UserProfile::create([
            'user_id' => $owner->id,
            'student_id_number' => 'FCU-TAKEN',
        ]);
        $staffOwner = $this->makeUser('Supervisor', 'owner.staff', 'staff.owner@filamer.edu.ph');
        UserProfile::create([
            'user_id' => $staffOwner->id,
            'employee_id' => 'EMP-TAKEN',
        ]);

        $student = $this->makeUser('Student', 'editor.student', 'editor.student@filamer.edu.ph');
        UserProfile::create([
            'user_id' => $student->id,
            'student_id_number' => 'FCU-FREE',
        ]);
        Sanctum::actingAs($student);

        $this->putJson('/api/user', [
            'name' => $student->name,
            'email' => 'owner@filamer.edu.ph',
        ])->assertStatus(422);

        $this->putJson('/api/user', [
            'name' => $student->name,
            'phone_number' => '09170000000',
        ])->assertStatus(422);

        $this->putJson('/api/user', [
            'name' => $student->name,
            'student_id_number' => 'FCU-TAKEN',
        ])->assertStatus(422);

        $staff = $this->makeUser('Department Secretary', 'editor.staff', 'editor.staff@filamer.edu.ph');
        Sanctum::actingAs($staff);
        $this->putJson('/api/user', [
            'name' => $staff->name,
            'employee_id' => 'EMP-TAKEN',
        ])->assertStatus(422);
    }

    private function makeUser(string $role, string $username, string $email, ?string $phone = null): User
    {
        return User::create([
            'name' => $username,
            'username' => $username,
            'email' => $email,
            'password' => 'password',
            'role' => $role,
            'phone_number' => $phone,
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
            $table->string('phone_number')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('student_id_number')->nullable();
            $table->string('employee_id')->nullable()->unique();
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
};
