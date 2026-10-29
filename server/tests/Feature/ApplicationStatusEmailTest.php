<?php

namespace Tests\Feature;

use App\Models\Application;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApplicationStatusEmailTest extends TestCase
{
    private const WEBHOOK = 'https://n8n.test/webhook/techhrm/application-submitted';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        config([
            'services.n8n.application_status_webhook' => self::WEBHOOK,
            'mail.from.name' => 'TechHRM WSPO',
        ]);
    }

    public function test_status_changes_email_the_applicant_through_n8n(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            self::WEBHOOK => Http::response(['ok' => true], 200),
        ]);

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

        $messages = Http::recorded()
            ->filter(fn (array $pair) => $pair[0]->url() === self::WEBHOOK)
            ->map(fn (array $pair) => $pair[0]->data())
            ->values();

        $this->assertCount(2, $messages);
        $this->assertSame('ana.cruz@school.edu', $messages[0]['email']);
        $this->assertSame('Ana Cruz', $messages[0]['applicant_name']);
        $this->assertSame('Training', $messages[0]['status']);
        $this->assertSame('WSPO-ANA01', $messages[0]['tracking_code']);
        $this->assertSame('ana.cruz@school.edu', $messages[1]['email']);
        $this->assertSame('Rejected', $messages[1]['status']);
        $this->assertSame('Incomplete requirements.', $messages[1]['rejection_reason']);
    }

    public function test_status_is_saved_when_the_webhook_rejects_the_email(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            self::WEBHOOK => Http::response(['message' => 'Workflow is not active'], 404),
        ]);

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
            ->assertJsonPath('message', 'Workflow status updated to For Result. The status email was not sent: Workflow is not active');

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
            $table->string('email')->nullable();
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
