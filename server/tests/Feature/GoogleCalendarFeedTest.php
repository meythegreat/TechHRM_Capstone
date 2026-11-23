<?php

namespace Tests\Feature;

use App\Models\Holiday;
use App\Models\Schedule;
use App\Models\SemesterTerm;
use App\Models\User;
use App\Models\UserProfile;
use App\Support\GoogleCalendarFeed;
use App\Support\GoogleCalendarSync;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GoogleCalendarFeedTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
    }

    public function test_student_feed_includes_duty_class_holiday_and_skips_a_closure(): void
    {
        $student = $this->makeUser('Student', 'Library', 'Maria Santos');
        $other = $this->makeUser('Student', 'CCS', 'Other Student');

        $this->makeSchedule($student, 'Monday', '8:00 AM - 12:00 PM', 'work', 'Library');
        $this->makeSchedule($student, 'Wednesday', '1:00 PM - 3:00 PM', 'class', 'Library');
        $this->makeSchedule($other, 'Monday', '9:00 AM - 10:00 AM', 'work', 'CCS');

        Holiday::create([
            'date' => '2026-08-10',
            'end_date' => '2026-08-10',
            'name' => 'Ninoy Aquino Day',
            'kind' => 'holiday',
            'portion' => 'full',
        ]);
        Holiday::create([
            'date' => '2026-08-12',
            'end_date' => '2026-08-12',
            'name' => 'Half day',
            'kind' => 'holiday',
            'portion' => 'half',
            'starts_at' => '13:00',
            'ends_at' => '17:00',
        ]);
        Holiday::create([
            'date' => '2026-10-19',
            'end_date' => '2026-10-23',
            'name' => 'Semestral Break',
            'kind' => 'break',
            'portion' => 'full',
        ]);

        Sanctum::actingAs($student);

        $link = $this->getJson('/api/calendar/google?scope=personal')
            ->assertOk()
            ->assertJsonPath('reachable', false)
            ->assertJsonPath('calendar_name', 'TechHRM — Maria Santos');

        $google = $link->json('google_url');
        $feedUrl = $link->json('feed_url');
        $this->assertStringStartsWith('https://calendar.google.com/calendar/render?cid=', $google);
        $this->assertStringContainsString('scope=personal', $feedUrl);

        $this->getJson('/api/calendar/google?scope=assigned')->assertForbidden();

        $body = $this->get($feedUrl)->assertOk()->getContent();
        $this->assertStringContainsString('BEGIN:VCALENDAR', $body);
        $this->assertStringContainsString('SUMMARY:Duty — Library Assistant', $body);
        $this->assertStringContainsString('SUMMARY:Class — GE 101', $body);
        $this->assertStringContainsString('RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20270102T155959Z', $body);
        $this->assertStringContainsString('DTSTART;TZID=Asia/Manila:20260803T080000', $body);
        $this->assertStringContainsString('EXDATE;TZID=Asia/Manila:20260810T080000', $body);
        $this->assertStringNotContainsString('EXDATE;TZID=Asia/Manila:20260812T080000', $body);
        $this->assertStringContainsString('SUMMARY:Holiday — Ninoy Aquino Day', $body);
        $this->assertStringContainsString('DTSTART;TZID=Asia/Manila:20260812T130000', $body);
        $this->assertStringContainsString('SUMMARY:Class break — Semestral Break', $body);
        $this->assertStringContainsString('DTSTART;VALUE=DATE:20261019', $body);
        $this->assertStringContainsString('DTEND;VALUE=DATE:20261024', $body);
        $this->assertStringNotContainsString('Other Student', $body);

        foreach (app(GoogleCalendarFeed::class)->apiEvents($student, 'personal') as $event) {
            $this->assertMatchesRegularExpression('/^[a-v0-9]{5,1024}$/', (string) $event['id']);
        }

        $this->get('/api/calendar/not-a-real-token.ics')->assertNotFound();
    }

    public function test_supervisor_feed_lists_only_students_in_the_supervised_office(): void
    {
        $supervisor = $this->makeUser('Supervisor', 'Library', 'Library Supervisor');
        $libraryStudent = $this->makeUser('Student', 'Library', 'Library Worker');
        $ccsStudent = $this->makeUser('Student', 'CCS', 'CCS Worker');

        $this->makeSchedule($libraryStudent, 'Monday', '8:00 AM - 12:00 PM', 'work', 'Library');
        $this->makeSchedule($ccsStudent, 'Monday', '9:00 AM - 11:00 AM', 'class', 'CCS');

        Sanctum::actingAs($supervisor);

        $feedUrl = $this->getJson('/api/calendar/google?scope=assigned')
            ->assertOk()
            ->assertJsonPath('calendar_name', 'TechHRM — Assigned students')
            ->json('feed_url');

        $body = $this->get($feedUrl)->assertOk()->getContent();
        $this->assertStringContainsString('SUMMARY:Duty — Library Worker — Library Assistant', $body);
        $this->assertStringNotContainsString('CCS Worker', $body);
    }

    public function test_connected_gmail_receives_a_duty_event_when_the_shift_is_pushed(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('google_refresh_token')->nullable();
            $table->string('google_calendar_id')->nullable();
            $table->string('google_email')->nullable();
        });
        config([
            'services.google.client_id' => 'test-client',
            'services.google.client_secret' => 'test-secret',
            'services.google.redirect' => 'http://127.0.0.1/calendar/google/callback',
            'services.google.sync_in_tests' => true,
        ]);
        Http::fake([
            'https://oauth2.googleapis.com/*' => Http::response(['access_token' => 'ya29.test']),
            'https://www.googleapis.com/*' => Http::response(['id' => 'techhrmschedule1'], 200),
        ]);

        $student = $this->makeUser('Student', 'Library', 'Maria Santos');
        $student->forceFill([
            'google_refresh_token' => Crypt::encryptString('refresh-token'),
            'google_calendar_id' => 'cal-id',
            'google_email' => 'maria@gmail.com',
        ])->save();
        $this->makeSchedule($student, 'Monday', '8:00 AM - 12:00 PM', 'work', 'Library');

        app(GoogleCalendarSync::class)->pushSchedule(Schedule::query()->firstOrFail());

        Http::assertSent(function ($request) {
            return $request->method() === 'PUT'
                && str_contains($request->url(), '/calendars/cal-id/events/techhrmschedule')
                && ($request->data()['summary'] ?? null) === 'Duty — Library Assistant';
        });

        Sanctum::actingAs($student->fresh());
        $this->getJson('/api/calendar/google/status')
            ->assertOk()
            ->assertJsonPath('connected', true)
            ->assertJsonPath('email', 'maria@gmail.com');

        $url = $this->getJson('/api/calendar/google/connect')->assertOk()->json('url');
        $this->assertStringStartsWith('https://accounts.google.com/o/oauth2/v2/auth?', $url);
        $this->assertStringContainsString('client_id=test-client', $url);
        $this->assertStringContainsString('redirect_uri=', $url);
    }

    public function test_google_callback_connects_without_a_wospis_login_token(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('google_refresh_token')->nullable();
            $table->string('google_calendar_id')->nullable();
            $table->string('google_email')->nullable();
        });
        config([
            'services.google.client_id' => 'test-client',
            'services.google.client_secret' => 'test-secret',
            'services.google.redirect' => 'http://127.0.0.1/calendar/google/callback',
            'services.google.sync_in_tests' => true,
        ]);
        Http::fake([
            'https://oauth2.googleapis.com/*' => Http::response([
                'access_token' => 'ya29.test',
                'refresh_token' => 'refresh-token',
            ]),
            'https://www.googleapis.com/oauth2/*' => Http::response(['email' => 'person@gmail.com']),
            'https://www.googleapis.com/calendar/*' => Http::response(['id' => 'new-cal'], 200),
        ]);

        $student = $this->makeUser('Student', 'Library', 'Maria Santos');
        $url = app(GoogleCalendarSync::class)->authorizationUrl($student);
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        $this->postJson('/api/calendar/google/connect', [
            'code' => 'auth-code',
            'state' => $query['state'],
        ])->assertOk()
            ->assertJsonPath('connected', true)
            ->assertJsonPath('email', 'person@gmail.com');

        $this->assertNotNull($student->fresh()->google_calendar_id);
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
            'duty_type' => $kind === 'class' ? 'Class' : 'Library Assistant',
            'subject' => $kind === 'class' ? 'GE 101' : null,
            'room' => $kind === 'class' ? 'Room 201' : null,
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
            $table->string('calendar_token', 64)->nullable()->unique();
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
            $table->json('supervised_departments')->nullable();
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
            $table->unsignedBigInteger('created_by')->nullable();
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
