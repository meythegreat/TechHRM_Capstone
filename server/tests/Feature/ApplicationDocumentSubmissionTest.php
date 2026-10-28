<?php

namespace Tests\Feature;

use App\Models\Application;
use App\Models\ApplicationDocument;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Database\Schema\Blueprint;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApplicationDocumentSubmissionTest extends TestCase
{
    private const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        Storage::fake('local');
        Http::fake();
    }

    public function test_public_apply_stores_required_documents_with_keys(): void
    {
        $payload = $this->officialPayload('website.applicant@example.com');

        $response = $this->post('/api/apply', $payload);

        $response->assertCreated()
            ->assertJsonStructure(['tracking_code', 'tracker']);

        $application = Application::with('documents')->first();
        $this->assertNotNull($application);
        $this->assertSame('website', $application->source);
        $this->assertCount(5, $application->documents);

        $keys = $application->documents->pluck('document_key')->sort()->values()->all();
        $this->assertSame([
            'application_letter',
            'birth_certificate',
            'id_picture',
            'indigency',
            'report_card',
        ], $keys);

        foreach ($application->documents as $document) {
            Storage::disk('local')->assertExists($document->file_path);
            $this->assertStringStartsWith('application-documents/', $document->file_path);
        }
    }

    public function test_public_apply_rejects_submission_without_documents(): void
    {
        $payload = $this->officialPayload('missing.docs@example.com');
        unset($payload['documents'], $payload['document_keys']);

        $this->postJson('/api/apply', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['documents', 'document_keys']);

        $this->assertSame(0, Application::count());
        $this->assertSame(0, ApplicationDocument::count());
    }

    public function test_staff_can_open_documents_for_archived_applications(): void
    {
        $staff = User::create([
            'name' => 'WSPO Coordinator',
            'username' => 'wspo.staff',
            'password' => bcrypt('password'),
            'role' => 'WSPO Staff',
        ]);

        $application = Application::create([
            'first_name' => 'Ana',
            'last_name' => 'Reyes',
            'age' => 18,
            'gender' => 'Female',
            'address' => 'Roxas City',
            'contact_number' => '09171234567',
            'year_level' => '1st Year',
            'course' => 'BSIT',
            'email' => 'ana.reyes@example.com',
            'status' => 'Rejected',
            'source' => 'website',
            'tracking_code' => 'WSPO-ARCH01',
        ]);

        $path = 'application-documents/archived-letter.pdf';
        Storage::disk('local')->put($path, 'pdf-bytes');
        $application->documents()->create([
            'document_key' => 'application_letter',
            'original_name' => 'letter.pdf',
            'file_path' => $path,
            'mime_type' => 'application/pdf',
            'file_size' => 9,
        ]);
        $application->delete();

        Sanctum::actingAs($staff);

        $this->getJson('/api/secure-file?path='.urlencode($path))
            ->assertOk();
    }

    private function officialPayload(string $email): array
    {
        $files = [
            'application_letter' => UploadedFile::fake()->create('letter.pdf', 120, 'application/pdf'),
            'report_card' => UploadedFile::fake()->create('grades.pdf', 120, 'application/pdf'),
            'birth_certificate' => UploadedFile::fake()->create('birth.pdf', 120, 'application/pdf'),
            'id_picture' => UploadedFile::fake()->image('photo.jpg', 200, 200),
            'indigency' => UploadedFile::fake()->create('indigency.pdf', 120, 'application/pdf'),
        ];

        return [
            'first_name' => 'Juan',
            'middle_name' => 'Dela',
            'last_name' => 'Cruz',
            'email' => $email,
            'age' => 18,
            'gender' => 'Male',
            'address' => 'Brgy. Poblacion, Roxas City',
            'contact_number' => '09171234567',
            'year_level' => '1st Year',
            'course' => 'BS Information Technology',
            'form_details' => json_encode([
                'religion' => 'Christian',
                'civil_status' => 'Single',
                'tel_number' => '',
                'date_of_birth' => '2006-01-15',
                'place_of_birth' => 'Roxas City',
                'height' => '5\'6"',
                'weight' => '55',
                'sex' => 'Male',
                'parent_name' => 'Pedro Cruz',
                'parent_status' => 'Living',
                'parent_tel' => '09170001111',
                'parent_occupation' => 'Farmer',
                'parent_occupation_other' => '',
                'parent_income' => '10000',
                'guardian_name' => '',
                'guardian_tel' => '',
                'guardian_occupation' => '',
                'guardian_occupation_other' => '',
                'guardian_income' => '',
                'sibling_employed_at_fcu' => 'No',
                'employed_sibling_count' => null,
                'employed_siblings' => [],
                'has_non_working_siblings' => 'No',
                'siblings' => [],
                'technical_qualification' => 'None',
                'work_experience' => 'None',
                'school_last_attended' => 'FCU Senior High',
                'school_address' => 'Roxas City',
                'degree_program' => 'BS Information Technology',
                'year_level' => '1st Year',
                'has_scholarship' => 'No',
                'scholarship_details' => '',
                'is_4ps' => 'No',
                'medical_conditions' => ['None'],
                'medical_other' => '',
                'will_pass_good_moral' => 'Yes',
                'medical_certificate_attached' => false,
                'folder_acknowledged' => true,
                'will_sign_printed_copy' => true,
                'consent_child_name' => 'Juan Dela Cruz',
                'photo' => self::TINY_JPEG,
                'email' => $email,
                'home_address' => 'Brgy. Poblacion, Roxas City',
                'cell_number' => '09171234567',
            ], JSON_THROW_ON_ERROR),
            'documents' => array_values($files),
            'document_keys' => array_keys($files),
        ];
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

        Schema::create('applications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('first_name')->nullable();
            $table->string('middle_name')->nullable();
            $table->string('last_name')->nullable();
            $table->integer('age')->nullable();
            $table->string('gender')->nullable();
            $table->string('address')->nullable();
            $table->string('contact_number')->nullable();
            $table->string('year_level')->nullable();
            $table->string('course')->nullable();
            $table->string('student_id_number')->nullable();
            $table->string('email')->nullable();
            $table->string('preferred_department')->nullable();
            $table->json('available_schedules')->nullable();
            $table->text('reason_for_applying')->nullable();
            $table->json('form_details')->nullable();
            $table->string('status')->default('Pending');
            $table->string('source')->default('portal');
            $table->string('tracking_code', 16)->nullable()->unique();
            $table->dateTime('interview_date')->nullable();
            $table->text('interview_remarks')->nullable();
            $table->string('assigned_department')->nullable();
            $table->string('assigned_position')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('application_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('application_id')->constrained('applications')->cascadeOnDelete();
            $table->string('document_key')->nullable();
            $table->string('original_name');
            $table->string('file_path');
            $table->string('mime_type')->nullable();
            $table->unsignedInteger('file_size')->nullable();
            $table->timestamps();
        });

        Schema::create('application_status_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('application_id')->constrained('applications')->cascadeOnDelete();
            $table->string('status', 32);
            $table->text('note')->nullable();
            $table->timestamp('occurred_at');
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

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('title');
            $table->text('message');
            $table->boolean('is_read')->default(false);
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
            $table->string('duty_type')->nullable();
            $table->text('duty_request')->nullable();
            $table->timestamps();
        });
    }
}
