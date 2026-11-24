<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\SemesterTerm;
use App\Models\User;
use App\Models\UserProfile;
use App\Models\WsaEvaluation;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WsaEvaluationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        Storage::fake('local');
        SemesterTerm::create([
            'label' => '1st Semester',
            'starts_on' => '2026-08-01',
            'ends_on' => '2026-12-15',
            'months' => 5,
        ]);
    }

    public function test_a_department_secretary_files_one_student_and_the_coordinator_approves_it(): void
    {
        $libraryStudent = $this->makeUser('Student', 'Library', 'Ana Cruz');
        $otherStudent = $this->makeUser('Student', 'Registrar', 'Ben Ramos');
        $secondLibrary = $this->makeUser('Student', 'Library', 'Cara Diaz');
        $secretary = $this->makeUser('Department Secretary', 'Library', 'Library Secretary', ['Library']);
        $coordinator = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'WSPO Coordinator');
        $wspoSecretary = $this->makeUser('WSPO Staff', 'WSPO Secretary', 'WSPO Secretary');
        $superAdmin = $this->makeUser('Super Admin', null, 'Super Admin');

        Sanctum::actingAs($libraryStudent);
        $this->getJson('/api/evaluations')->assertForbidden();

        Sanctum::actingAs($secretary);
        $meta = $this->getJson('/api/evaluations/meta')->assertOk();
        $meta->assertJsonPath('can_file', true);
        $meta->assertJsonPath('semester_school_year', '1st Semester / A.Y. 2026-2027');
        $meta->assertJsonPath('evaluated_on', Carbon::today()->toDateString());
        $meta->assertJsonPath('departments.0', 'Library');

        $this->getJson('/api/evaluations/candidates?department=Registrar')->assertForbidden();
        $candidates = $this->getJson('/api/evaluations/candidates?department=Library')->assertOk();
        $this->assertSame(['Ana Cruz', 'Cara Diaz'], collect($candidates->json('students'))->pluck('name')->sort()->values()->all());

        $this->post('/api/evaluations', $this->payload($libraryStudent->id), ['Accept' => 'application/json'])
            ->assertStatus(422);

        $created = $this->post('/api/evaluations', $this->payload($libraryStudent->id, [
            'evaluated_signature' => UploadedFile::fake()->image('signed-form.jpg'),
            'semester_label' => 'Should be ignored',
            'evaluated_on' => '2020-01-01',
        ]), ['Accept' => 'application/json']);
        $created->assertCreated();
        $created->assertJsonPath('evaluation.status', 'Pending');
        $created->assertJsonPath('evaluation.department', 'Library');
        $created->assertJsonPath('evaluation.semester_label', '1st Semester');
        $created->assertJsonPath('evaluation.school_year', '2026-2027');
        $created->assertJsonPath('evaluation.evaluated_on', Carbon::today()->toDateString());
        $created->assertJsonPath('evaluation.student.name', 'Ana Cruz');
        Storage::disk('local')->assertExists($created->json('evaluation.evaluated_signature_path'));
        $this->assertTrue(Notification::query()->where('user_id', $coordinator->id)->where('title', 'Evaluation submitted')->exists());
        $this->assertFalse(Notification::query()->where('user_id', $wspoSecretary->id)->where('title', 'Evaluation submitted')->exists());

        $this->post('/api/evaluations', $this->payload($libraryStudent->id, [
            'signature_proof' => UploadedFile::fake()->image('again.jpg'),
        ]), ['Accept' => 'application/json'])->assertStatus(422);

        $second = $this->post('/api/evaluations', $this->payload($secondLibrary->id, [
            'signature_proof' => UploadedFile::fake()->image('signed-form-2.jpg'),
        ]), ['Accept' => 'application/json']);
        $second->assertCreated();
        Storage::disk('local')->assertExists($second->json('evaluation.evaluated_signature_path'));
        $this->assertNull($second->json('evaluation.attested_signature_path'));

        $this->post('/api/evaluations', $this->payload($otherStudent->id, [
            'department' => 'Library',
            'signature_proof' => UploadedFile::fake()->image('wrong-office.jpg'),
        ]), ['Accept' => 'application/json'])->assertStatus(422);

        $id = $created->json('evaluation.id');
        Sanctum::actingAs($wspoSecretary);
        $this->patchJson('/api/evaluations/'.$id, ['status' => 'Approved'])->assertForbidden();

        Sanctum::actingAs($superAdmin);
        $this->getJson('/api/evaluations')->assertOk();
        $this->patchJson('/api/evaluations/'.$id, ['status' => 'Approved'])->assertForbidden();

        Sanctum::actingAs($coordinator);
        $this->patchJson('/api/evaluations/'.$id, [
            'status' => 'Approved',
            'decision_note' => 'Signatures are complete.',
        ])->assertOk()->assertJsonPath('evaluation.status', 'Approved');

        $this->assertSame('Approved', WsaEvaluation::query()->find($id)->status);
        $this->assertTrue(Notification::query()->where('user_id', $secretary->id)->where('title', 'Evaluation approved')->exists());
        $this->assertTrue(Notification::query()->where('user_id', $libraryStudent->id)->where('title', 'Performance evaluation approved')->exists());
    }

    private function payload(int $studentId, array $extra = []): array
    {
        $ratings = [];
        foreach (WsaEvaluation::standardIds() as $id) {
            $ratings[$id] = 'Good';
        }

        return array_merge([
            'department' => 'Library',
            'student_id' => $studentId,
            'ratings' => json_encode($ratings),
            'comments' => 'Reliable on the front desk.',
            'recommendation' => 'Retained',
            'evaluated_by_name' => 'Mila Santos',
            'attested_by_name' => 'Dr. Paulo Reyes',
        ], $extra);
    }

    private function makeUser(string $role, ?string $office, string $name, array $secretaryDepartments = []): User
    {
        $user = User::create([
            'name' => $name,
            'username' => strtolower(str_replace(' ', '.', $name)).'.'.uniqid(),
            'password' => 'password',
            'role' => $role,
        ]);

        UserProfile::create([
            'user_id' => $user->id,
            'assigned_office' => $office,
            'supervised_departments' => $role === 'Supervisor' && $office ? [$office] : null,
            'secretary_departments' => $secretaryDepartments === [] ? null : $secretaryDepartments,
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
            $table->string('student_id_number')->nullable();
            $table->json('supervised_departments')->nullable();
            $table->json('secretary_departments')->nullable();
            $table->timestamps();
        });

        Schema::create('semester_terms', function (Blueprint $table) {
            $table->id();
            $table->string('label', 80);
            $table->date('starts_on');
            $table->date('ends_on');
            $table->unsignedTinyInteger('months')->default(5);
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
        });

        Schema::create('wsa_evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('submitted_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $table->string('department');
            $table->string('semester_label');
            $table->string('school_year', 20);
            $table->date('evaluated_on');
            $table->json('ratings');
            $table->text('comments')->nullable();
            $table->string('recommendation');
            $table->string('evaluated_by_name');
            $table->string('attested_by_name');
            $table->string('evaluated_signature_path')->nullable();
            $table->string('evaluated_signature_name')->nullable();
            $table->string('attested_signature_path')->nullable();
            $table->string('attested_signature_name')->nullable();
            $table->string('status')->default('Draft');
            $table->text('decision_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
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
