<?php

namespace Tests\Feature;

use App\Mail\ApplicationStatusMail;
use App\Models\Application;
use App\Models\User;
use App\Services\CompletedApplicationForm;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApplicationStatusEmailTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        config([
            'services.resend.key' => 're_test_key',
            'mail.from.address' => 'onboarding@resend.dev',
            'mail.from.name' => 'WoSPIS WSPO',
        ]);
    }

    public function test_status_changes_email_the_applicant_through_resend(): void
    {
        Mail::fake();

        $staff = User::create([
            'name' => 'WSPO Coordinator',
            'username' => 'wspo.staff',
            'password' => 'password',
            'role' => 'WSPO Staff',
        ]);
        $application = Application::create([
            'first_name' => 'Ana',
            'last_name' => 'Cruz',
            'email' => 'ana.cruz@school.edu',
            'status' => 'Pending',
            'tracking_code' => 'WSPO-ANA01',
        ]);

        Sanctum::actingAs($staff);

        $this->putJson('/api/applications/'.$application->id.'/status', [
            'status' => 'Training',
        ])->assertOk()
            ->assertJsonPath('message', 'Workflow status updated to Training.');

        $this->putJson('/api/applications/'.$application->id.'/status', [
            'status' => 'Rejected',
            'rejection_reason' => 'Incomplete requirements.',
        ])->assertOk()
            ->assertJsonPath('message', 'Applicant declined, and their tracker now shows Not Approved. A rejection email has been sent.');

        Mail::assertSent(ApplicationStatusMail::class, function (ApplicationStatusMail $mail) {
            return $mail->hasTo('ana.cruz@school.edu')
                && $mail->applicantName === 'Ana Cruz'
                && $mail->status === 'Training'
                && $mail->trackingCode === 'WSPO-ANA01'
                && $mail->attachmentPdf === null
                && $mail->envelope()->subject === 'WoSPIS Application — Training Stage';
        });
        Mail::assertSent(ApplicationStatusMail::class, function (ApplicationStatusMail $mail) {
            return $mail->hasTo('ana.cruz@school.edu')
                && $mail->status === 'Rejected'
                && $mail->rejectionReason() === 'Incomplete requirements.'
                && $mail->attachmentPdf === null;
        });
        Mail::assertSentCount(2);
    }

    public function test_the_first_email_attaches_the_completed_form(): void
    {
        Mail::fake();

        $staff = User::create([
            'name' => 'WSPO Coordinator',
            'username' => 'wspo.staff',
            'password' => 'password',
            'role' => 'WSPO Staff',
        ]);
        $application = Application::create([
            'first_name' => 'Ana',
            'middle_name' => 'M',
            'last_name' => 'Cruz',
            'age' => 19,
            'email' => 'ana.cruz@school.edu',
            'course' => 'BS Information Technology',
            'year_level' => '1st Year',
            'status' => 'Interview',
            'tracking_code' => 'WSPO-ANA01',
            'form_details' => [
                'religion' => 'Christian',
                'sex' => 'Female',
                'civil_status' => 'Single',
                'home_address' => 'Roxas City',
                'date_of_birth' => '2007-03-01',
                'parent_status' => 'Living',
                'parent_occupation' => 'Farmer',
                'has_scholarship' => 'No',
                'is_4ps' => 'Yes',
                'medical_conditions' => ['None'],
                'consent_child_name' => 'Cruz, Ana M',
            ],
        ]);

        Sanctum::actingAs($staff);

        $this->putJson('/api/applications/'.$application->id.'/status', [
            'status' => 'Pending',
        ])->assertOk();

        Mail::assertSent(ApplicationStatusMail::class, function (ApplicationStatusMail $mail) {
            $pdf = $mail->attachmentPdf;

            return $mail->hasTo('ana.cruz@school.edu')
                && $mail->status === 'Pending'
                && $mail->envelope()->subject === 'WoSPIS Application Received'
                && $mail->attachmentName === 'WSPO-ANA01-completed-forms.pdf'
                && is_string($pdf)
                && str_starts_with($pdf, '%PDF');
        });

        $html = app(CompletedApplicationForm::class)->html($application->fresh());
        $this->assertStringContainsString('PERSONAL INFORMATION', $html);
        $this->assertStringContainsString('INFORMATION SHEET', $html);
        $this->assertStringContainsString('FCU-EOMS-WP-012', $html);
        $this->assertStringContainsString('Cruz, Ana M', $html);
        $this->assertStringContainsString('March 1, 2007', $html);
        $this->assertStringContainsString('PARENTS CONSENT', $html);
        $this->assertStringContainsString('FORM FOR PARENTS (GUARDIAN’S) PERMISSION AND AGREEMENT', $html);
        $this->assertStringContainsString('Father’s Name &amp; Signature', $html);
        $this->assertStringNotContainsString('Completed application form', $html);
    }

    public function test_status_is_saved_when_resend_is_not_configured(): void
    {
        config(['services.resend.key' => '']);

        $staff = User::create([
            'name' => 'WSPO Coordinator',
            'username' => 'wspo.staff',
            'password' => 'password',
            'role' => 'WSPO Staff',
        ]);
        $application = Application::create([
            'first_name' => 'Luis',
            'last_name' => 'Reyes',
            'email' => 'luis.reyes@school.edu',
            'status' => 'Pending',
            'tracking_code' => 'WSPO-LUIS1',
        ]);

        Sanctum::actingAs($staff);

        $this->putJson('/api/applications/'.$application->id.'/status', [
            'status' => 'For Result',
        ])->assertOk()
            ->assertJsonPath('message', 'Workflow status updated to For Result. The status email was not sent: Set RESEND_API_KEY before status emails can be sent.');

        $this->assertSame('For Result', $application->fresh()->status);
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
            $table->string('address')->nullable();
            $table->string('course')->nullable();
            $table->string('year_level')->nullable();
            $table->string('email')->nullable();
            $table->json('form_details')->nullable();
            $table->string('status')->nullable();
            $table->string('tracking_code', 16)->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('application_status_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('application_id')->constrained('applications')->cascadeOnDelete();
            $table->string('status', 32);
            $table->text('note')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
        });
    }
}
