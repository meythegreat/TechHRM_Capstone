<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Schedule;
use App\Models\ScheduleSubmission;
use App\Models\SemesterTerm;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ScheduleSubmissionTest extends TestCase
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

    public function test_class_schedule_requires_proof_and_the_office_supervisor_approves_it(): void
    {
        $student = $this->makeUser('Student', 'Library', 'Ana Cruz');
        $supervisor = $this->makeUser('Supervisor', 'Library', 'Library Supervisor');
        $other = $this->makeUser('Supervisor', 'Registrar', 'Registrar Supervisor');
        $coordinator = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'WSPO Coordinator');
        $this->makeSchedule($student, 'work', 'Monday', '1:00 PM - 4:00 PM', 'Clerical');

        Sanctum::actingAs($student);
        $this->postJson('/api/schedule-submissions', [
            'kind' => 'class',
            'entries' => json_encode([[
                'days' => ['Monday', 'Wednesday'],
                'time' => '8:00 AM - 10:00 AM',
                'subject' => 'Calculus',
                'room' => 'B201',
                'instructor' => 'Dr. Cruz',
            ]]),
        ])->assertStatus(422);

        $created = $this->post('/api/schedule-submissions', [
            'kind' => 'class',
            'entries' => json_encode([[
                'days' => ['Monday', 'Wednesday'],
                'time' => '8:00 AM - 10:00 AM',
                'subject' => 'Calculus',
                'room' => 'B201',
                'instructor' => 'Dr. Cruz',
            ]]),
            'proof' => UploadedFile::fake()->image('registration.jpg'),
        ], ['Accept' => 'application/json']);

        $created->assertCreated();
        $created->assertJsonPath('submission.status', 'Pending');
        $created->assertJsonPath('submission.kind', 'class');
        $submissionId = $created->json('submission.id');
        $proofPath = $created->json('submission.proof_path');
        Storage::disk('local')->assertExists($proofPath);
        $this->assertSame(0, Schedule::query()->where('kind', 'class')->count());
        $this->assertTrue(Notification::query()->where('user_id', $supervisor->id)->where('title', 'Class schedule submitted')->exists());
        $this->assertFalse(Notification::query()->where('user_id', $coordinator->id)->where('title', 'Class schedule submitted')->exists());

        $this->post('/api/schedule-submissions', [
            'kind' => 'class',
            'entries' => json_encode([['days' => ['Friday'], 'time' => '1:00 PM - 2:00 PM']]),
            'proof' => UploadedFile::fake()->image('again.jpg'),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        Sanctum::actingAs($student);
        $this->get('/api/secure-file?path='.urlencode($proofPath))->assertOk();

        Sanctum::actingAs($other);
        $this->patchJson('/api/schedule-submissions/'.$submissionId, ['action' => 'approve'])
            ->assertForbidden();
        $this->get('/api/secure-file?path='.urlencode($proofPath))->assertForbidden();

        Sanctum::actingAs($coordinator);
        $this->patchJson('/api/schedule-submissions/'.$submissionId, ['action' => 'approve'])
            ->assertForbidden();
        $this->getJson('/api/schedule-submissions/review')
            ->assertOk()
            ->assertJsonMissing(['id' => $submissionId]);

        Sanctum::actingAs($supervisor);
        $this->getJson('/api/schedule-submissions/review')
            ->assertOk()
            ->assertJsonPath('submissions.0.id', $submissionId)
            ->assertJsonPath('submissions.0.kind', 'class');
        $this->get('/api/secure-file?path='.urlencode($proofPath))->assertOk();

        $this->patchJson('/api/schedule-submissions/'.$submissionId, [
            'action' => 'approve',
        ])->assertOk();

        $this->assertSame('Approved', ScheduleSubmission::query()->find($submissionId)->status);
        $classes = Schedule::query()->where('user_id', $student->id)->where('kind', 'class')->orderBy('day')->get();
        $this->assertCount(2, $classes);
        $this->assertSame('Calculus', $classes->firstWhere('day', 'Monday')->subject);
        $this->assertSame('B201', $classes->firstWhere('day', 'Wednesday')->room);
        $this->assertSame(1, Schedule::query()->where('user_id', $student->id)->where('kind', 'work')->count());
        $this->assertTrue(Notification::query()->where('user_id', $student->id)->where('title', 'Class schedule approved')->exists());
    }

    public function test_duty_schedule_goes_to_the_wspo_coordinator(): void
    {
        $student = $this->makeUser('Student', 'Library', 'Ben Santos');
        $supervisor = $this->makeUser('Supervisor', 'Library', 'Library Supervisor');
        $coordinator = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'WSPO Coordinator');
        $secretary = $this->makeUser('WSPO Staff', 'WSPO Secretary', 'WSPO Secretary');
        $this->makeSchedule($student, 'work', 'Tuesday', '8:00 AM - 12:00 PM', 'Old shift');
        $this->makeSchedule($student, 'class', 'Tuesday', '1:00 PM - 3:00 PM', 'Physics');

        Sanctum::actingAs($student);
        $created = $this->post('/api/schedule-submissions', [
            'kind' => 'work',
            'entries' => json_encode([[
                'days' => ['Thursday'],
                'time' => '8:00 AM - 12:00 PM',
                'duty_type' => 'Library Assistant',
            ]]),
            'proof' => UploadedFile::fake()->image('duty-schedule.jpg'),
        ], ['Accept' => 'application/json']);
        $created->assertCreated();
        $submissionId = $created->json('submission.id');

        Sanctum::actingAs($supervisor);
        $this->patchJson('/api/schedule-submissions/'.$submissionId, ['action' => 'approve'])->assertForbidden();
        $this->getJson('/api/schedule-submissions/review')
            ->assertOk()
            ->assertJsonCount(0, 'submissions');

        Sanctum::actingAs($secretary);
        $this->patchJson('/api/schedule-submissions/'.$submissionId, ['action' => 'approve'])->assertForbidden();

        Sanctum::actingAs($coordinator);
        $this->patchJson('/api/schedule-submissions/'.$submissionId, [
            'action' => 'reject',
        ])->assertStatus(422);

        $this->patchJson('/api/schedule-submissions/'.$submissionId, [
            'action' => 'reject',
            'note' => 'The photo is unreadable. Send a clearer copy.',
        ])->assertOk();

        $submission = ScheduleSubmission::query()->find($submissionId);
        $this->assertSame('Rejected', $submission->status);
        $this->assertSame('Old shift', Schedule::query()->where('kind', 'work')->value('duty_type'));
        $this->assertTrue(
            Notification::query()->where('user_id', $student->id)->where('title', 'Duty schedule declined')->exists()
        );

        Sanctum::actingAs($student);
        $again = $this->post('/api/schedule-submissions', [
            'kind' => 'work',
            'entries' => json_encode([[
                'days' => ['Thursday'],
                'time' => '8:00 AM - 12:00 PM',
                'duty_type' => 'Library Assistant',
            ]]),
            'proof' => UploadedFile::fake()->image('duty-schedule-clear.jpg'),
        ], ['Accept' => 'application/json']);
        $again->assertCreated();

        Sanctum::actingAs($coordinator);
        $this->patchJson('/api/schedule-submissions/'.$again->json('submission.id'), [
            'action' => 'approve',
        ])->assertOk();

        $work = Schedule::query()->where('user_id', $student->id)->where('kind', 'work')->orderBy('day')->get();
        $this->assertCount(2, $work);
        $this->assertSame('Old shift', $work->firstWhere('day', 'Tuesday')->duty_type);
        $this->assertSame('Library Assistant', $work->firstWhere('day', 'Thursday')->duty_type);
        $this->assertSame('WSPO Coordinator', $work->first()->supervisor);
        $this->assertSame(1, Schedule::query()->where('user_id', $student->id)->where('kind', 'class')->count());
    }

    public function test_approval_stops_when_the_class_overlaps_duty(): void
    {
        $student = $this->makeUser('Student', 'Library', 'Cara Diaz');
        $supervisor = $this->makeUser('Supervisor', 'Library', 'Library Supervisor');
        $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'WSPO Coordinator');
        $this->makeSchedule($student, 'work', 'Monday', '8:00 AM - 12:00 PM', 'Clerical');

        Sanctum::actingAs($student);
        $created = $this->post('/api/schedule-submissions', [
            'kind' => 'class',
            'entries' => json_encode([[
                'days' => ['Monday'],
                'time' => '10:00 AM - 11:00 AM',
                'subject' => 'Algebra',
            ]]),
            'proof' => UploadedFile::fake()->image('registration.jpg'),
        ], ['Accept' => 'application/json']);
        $created->assertStatus(422);
        $this->assertSame(0, ScheduleSubmission::query()->count());

        $this->assertSame(1, Schedule::query()->where('kind', 'work')->count());
        $this->assertTrue($supervisor->exists);
    }

    public function test_an_approver_can_leave_out_a_mistaken_block(): void
    {
        $student = $this->makeUser('Student', 'Library', 'Faye Ong');
        $supervisor = $this->makeUser('Supervisor', 'Library', 'Library Supervisor');

        Sanctum::actingAs($student);
        $created = $this->post('/api/schedule-submissions', [
            'kind' => 'class',
            'entries' => json_encode([
                ['days' => ['Monday'], 'time' => '8:00 AM - 10:00 AM', 'subject' => 'Calculus'],
                ['days' => ['Wednesday'], 'time' => '1:00 PM - 3:00 PM', 'subject' => 'Typing'],
            ]),
            'proof' => UploadedFile::fake()->image('registration.jpg'),
        ], ['Accept' => 'application/json']);
        $created->assertCreated();
        $submissionId = $created->json('submission.id');
        $entries = collect($created->json('submission.entries'));
        $mistakeId = $entries->firstWhere('subject', 'Typing')['id'];
        $keptId = $entries->firstWhere('subject', 'Calculus')['id'];

        Sanctum::actingAs($supervisor);
        $this->patchJson('/api/schedule-submissions/'.$submissionId, [
            'action' => 'approve',
            'omit_entry_ids' => [$mistakeId, $keptId],
        ])->assertStatus(422);

        $this->patchJson('/api/schedule-submissions/'.$submissionId, [
            'action' => 'approve',
            'omit_entry_ids' => [$mistakeId],
        ])->assertStatus(422);

        $this->patchJson('/api/schedule-submissions/'.$submissionId, [
            'action' => 'approve',
            'omit_entry_ids' => [$mistakeId],
            'note' => 'Typing is not on the registration form.',
        ])->assertOk()
            ->assertJsonPath('message', 'Class schedule approved for Monday. Other approved days stay on the schedule. 1 mistaken block was left out.');

        $classes = Schedule::query()->where('user_id', $student->id)->where('kind', 'class')->get();
        $this->assertCount(1, $classes);
        $this->assertSame('Calculus', $classes->first()->subject);
        $this->assertSame(1, (int) ScheduleSubmission::query()->find($submissionId)->entries()->where('kept', true)->count());
        $this->assertSame(0, (int) ScheduleSubmission::query()->find($submissionId)->entries()->where('id', $mistakeId)->where('kept', true)->count());
        $this->assertTrue(
            Notification::query()
                ->where('user_id', $student->id)
                ->where('title', 'Class schedule approved')
                ->where('message', 'like', '%Wednesday%')
                ->exists()
        );
    }

    public function test_a_later_approval_keeps_a_day_that_was_not_submitted_again(): void
    {
        $student = $this->makeUser('Student', 'Library', 'Gio Tan');
        $coordinator = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'WSPO Coordinator');

        Sanctum::actingAs($student);
        $first = $this->post('/api/schedule-submissions', [
            'kind' => 'work',
            'entries' => json_encode([[
                'days' => ['Monday', 'Wednesday', 'Friday'],
                'time' => '1:00 PM - 5:00 PM',
                'duty_type' => 'Clerical Work',
            ]]),
            'proof' => UploadedFile::fake()->image('duty-schedule.jpg'),
        ], ['Accept' => 'application/json']);
        $first->assertCreated();
        $fridayId = collect($first->json('submission.entries'))->firstWhere('day', 'Friday')['id'];

        Sanctum::actingAs($coordinator);
        $this->patchJson('/api/schedule-submissions/'.$first->json('submission.id'), [
            'action' => 'approve',
            'omit_entry_ids' => [$fridayId],
            'note' => 'Friday is not on the duty schedule.',
        ])->assertOk();

        $wednesday = Schedule::query()->where('user_id', $student->id)->where('day', 'Wednesday')->first();
        $this->assertNotNull($wednesday);

        Sanctum::actingAs($student);
        $second = $this->post('/api/schedule-submissions', [
            'kind' => 'work',
            'entries' => json_encode([[
                'days' => ['Monday', 'Friday'],
                'time' => '1:00 PM - 5:00 PM',
                'duty_type' => 'Clerical Work',
            ]]),
            'proof' => UploadedFile::fake()->image('duty-schedule-2.jpg'),
        ], ['Accept' => 'application/json']);
        $second->assertCreated();

        Sanctum::actingAs($coordinator);
        $review = $this->getJson('/api/schedule-submissions/review')->assertOk();
        $approvedDays = collect($review->json('submissions.0.approved'))->pluck('day')->all();
        $this->assertEqualsCanonicalizing(['Monday', 'Wednesday'], $approvedDays);

        $this->patchJson('/api/schedule-submissions/'.$second->json('submission.id'), [
            'action' => 'approve',
        ])->assertOk();

        $days = Schedule::query()->where('user_id', $student->id)->where('kind', 'work')->orderBy('day')->pluck('day')->all();
        $this->assertSame(['Friday', 'Monday', 'Wednesday'], $days);
        $this->assertTrue(Schedule::query()->whereKey($wednesday->id)->exists());
    }

    public function test_a_student_can_withdraw_a_pending_submission(): void
    {
        $student = $this->makeUser('Student', 'Library', 'Dan Reyes');
        $this->makeUser('Supervisor', 'Library', 'Library Supervisor');

        Sanctum::actingAs($student);
        $created = $this->post('/api/schedule-submissions', [
            'kind' => 'class',
            'entries' => json_encode([['days' => ['Friday'], 'time' => '9:00 AM - 11:00 AM', 'subject' => 'English']]),
            'proof' => UploadedFile::fake()->image('registration.jpg'),
        ], ['Accept' => 'application/json']);
        $created->assertCreated();
        $id = $created->json('submission.id');
        $path = $created->json('submission.proof_path');

        $this->deleteJson('/api/schedule-submissions/'.$id)->assertOk();
        $this->assertNull(ScheduleSubmission::query()->find($id));
        Storage::disk('local')->assertMissing($path);
    }

    public function test_the_coordinator_approves_class_schedules_for_students_placed_in_wspo(): void
    {
        $student = $this->makeUser('Student', 'WSPO', 'Eva Lim');
        $coordinator = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'WSPO Coordinator');
        $library = $this->makeUser('Supervisor', 'Library', 'Library Supervisor');

        Sanctum::actingAs($student);
        $created = $this->post('/api/schedule-submissions', [
            'kind' => 'class',
            'entries' => json_encode([['days' => ['Tuesday'], 'time' => '7:00 AM - 9:00 AM', 'subject' => 'Ethics']]),
            'proof' => UploadedFile::fake()->image('registration.jpg'),
        ], ['Accept' => 'application/json']);
        $created->assertCreated();
        $id = $created->json('submission.id');

        Sanctum::actingAs($library);
        $this->patchJson('/api/schedule-submissions/'.$id, ['action' => 'approve'])->assertForbidden();

        Sanctum::actingAs($coordinator);
        $this->patchJson('/api/schedule-submissions/'.$id, ['action' => 'approve'])->assertOk();
        $this->assertSame('Ethics', Schedule::query()->where('kind', 'class')->value('subject'));
    }

    private function makeUser(string $role, ?string $office, string $name): User
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
        ]);

        return $user->load('profile');
    }

    private function makeSchedule(User $student, string $kind, string $day, string $time, string $name): Schedule
    {
        return Schedule::create([
            'user_id' => $student->id,
            'kind' => $kind,
            'day' => $day,
            'time' => $time,
            'duty_type' => $kind === 'class' ? $name : $name,
            'subject' => $kind === 'class' ? $name : null,
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

        Schema::create('schedule_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind');
            $table->string('status')->default('Pending');
            $table->string('proof_path');
            $table->string('proof_name')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->timestamps();
        });

        Schema::create('schedule_submission_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('schedule_submission_id')->constrained('schedule_submissions')->cascadeOnDelete();
            $table->string('day');
            $table->string('time');
            $table->string('duty_type')->nullable();
            $table->string('subject')->nullable();
            $table->string('room')->nullable();
            $table->string('instructor')->nullable();
            $table->boolean('kept')->nullable();
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
