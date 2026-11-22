<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\DailyCleaningGroup;
use App\Models\Notification;
use App\Models\RenderedHourEntry;
use App\Models\RenderedHourEvent;
use App\Models\User;
use App\Models\UserProfile;
use App\Services\ShiftClockReminder;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StudentDashboardActivitiesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_dashboard_shows_live_assembly_and_upcoming_devotional_for_student(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-20 08:30:00'));

        $student = $this->makeStudent('Miggy Student', 3, '2026-3001');
        $firstYear = $this->makeStudent('First Year Student', 1, '2026-1001');

        // Ongoing campus-wide assembly right now (08:00 - 13:00 on 2026-11-20)
        $liveAssembly = RenderedHourEvent::create([
            'kind' => RenderedHourEvent::ASSEMBLY,
            'title' => 'General Assembly Meeting',
            'event_date' => '2026-11-20',
            'hours' => 5,
            'starts_at' => '08:00',
            'ends_at' => '13:00',
            'valid_until' => '09:00',
        ]);

        // Future devotional meeting next week (all year levels)
        $futureDevotional = RenderedHourEvent::create([
            'kind' => RenderedHourEvent::DEVOTIONAL,
            'title' => 'Wednesday Morning Devotional',
            'event_date' => '2026-11-25',
            'hours' => 1,
            'starts_at' => '07:30',
            'ends_at' => '08:30',
            'valid_until' => '08:30',
        ]);

        // Year-specific assembly for 1st year only (should NOT show for 3rd year student)
        $firstYearOnly = RenderedHourEvent::create([
            'kind' => RenderedHourEvent::ASSEMBLY,
            'title' => 'Freshmen Orientation Assembly',
            'event_date' => '2026-11-22',
            'hours' => 5,
            'year_level' => 1,
            'starts_at' => '09:00',
            'ends_at' => '14:00',
            'valid_until' => '10:00',
        ]);

        // Past ended devotional (should NOT clutter current or upcoming dashboard lists)
        RenderedHourEvent::create([
            'kind' => RenderedHourEvent::DEVOTIONAL,
            'title' => 'Last Week Devotional',
            'event_date' => '2026-11-13',
            'hours' => 1,
            'starts_at' => '07:30',
            'ends_at' => '08:30',
            'valid_until' => '08:30',
        ]);

        Sanctum::actingAs($student);

        $dashboard = $this->getJson('/api/student/dashboard')->assertOk();

        $current = $dashboard->json('current_activities');
        $upcoming = $dashboard->json('upcoming_activities');

        $this->assertCount(1, $current);
        $this->assertSame($liveAssembly->id, $current[0]['id']);
        $this->assertSame('General Assembly Meeting', $current[0]['title']);
        $this->assertSame('Meeting assembly', $current[0]['kind_label']);
        $this->assertTrue($current[0]['is_happening_now']);
        $this->assertSame('ongoing', $current[0]['timing']);
        $this->assertSame('pending', $current[0]['attendance_status']);

        $this->assertCount(1, $upcoming);
        $this->assertSame($futureDevotional->id, $upcoming[0]['id']);
        $this->assertSame('Wednesday Morning Devotional', $upcoming[0]['title']);
        $this->assertSame('Devotional meeting', $upcoming[0]['kind_label']);
        $this->assertFalse($upcoming[0]['is_happening_now']);
        $this->assertSame('upcoming', $upcoming[0]['timing']);

        // 1st-year student sees both the all-years devotional AND the 1st-year assembly
        Sanctum::actingAs($firstYear);
        $firstYearDashboard = $this->getJson('/api/student/dashboard')->assertOk();
        $upcomingIds = collect($firstYearDashboard->json('upcoming_activities'))->pluck('id')->all();
        $this->assertContains($firstYearOnly->id, $upcomingIds);
        $this->assertContains($futureDevotional->id, $upcomingIds);
    }

    public function test_group_cleaning_and_calendar_activities_endpoint_respect_membership(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-20 06:00:00'));

        $member = $this->makeStudent('Group Member', 2, '2026-2001');
        $outsider = $this->makeStudent('Outsider Student', 2, '2026-2002');

        $group = DailyCleaningGroup::create(['name' => 'Bravo']);
        DB::table('daily_cleaning_group_members')->insert([
            'group_id' => $group->id,
            'user_id' => $member->id,
            'is_leader' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $cleaning = RenderedHourEvent::create([
            'kind' => RenderedHourEvent::GENERAL_CLEANING,
            'title' => 'Campus General Cleaning',
            'event_date' => '2026-11-21',
            'hours' => 5,
            'group_id' => $group->id,
            'group_name' => $group->name,
            'starts_at' => '07:00',
            'ends_at' => '12:00',
            'valid_until' => '08:00',
        ]);

        Sanctum::actingAs($member);
        $memberActivities = $this->getJson('/api/my-activities')->assertOk()->json('activities');
        $this->assertSame([$cleaning->id], collect($memberActivities)->pluck('id')->all());

        Sanctum::actingAs($outsider);
        $outsiderActivities = $this->getJson('/api/my-activities')->assertOk()->json('activities');
        $this->assertSame([], $outsiderActivities);
    }

    public function test_creating_activity_notifies_students_and_reminders_fire_for_ongoing_and_clock_out(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-20 07:00:00'));

        $staff = User::create([
            'name' => 'WSPO Coordinator',
            'username' => 'wspo.coord',
            'password' => bcrypt('password'),
            'role' => 'WSPO Staff',
        ]);
        UserProfile::create([
            'user_id' => $staff->id,
            'assigned_office' => 'WSPO Coordinator',
        ]);

        $student = $this->makeStudent('Ana Worker', 2, '2026-2010');

        Sanctum::actingAs($staff);
        $created = $this->postJson('/api/financial/hour-events', [
            'kind' => 'devotional',
            'title' => 'Friday Devotional',
            'event_date' => '2026-11-20',
            'starts_at' => '08:00',
            'ends_at' => '09:00',
        ])->assertCreated();

        $eventId = (int) $created->json('event.id');

        // Creation notification sent immediately
        $this->assertDatabaseHas('notifications', [
            'user_id' => $student->id,
            'title' => "Today's Devotional meeting",
        ]);

        // 30 mins before start (07:30) -> upcoming reminder
        Carbon::setTestNow(Carbon::parse('2026-11-20 07:30:00'));
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $this->assertDatabaseHas('notifications', [
            'user_id' => $student->id,
            'title' => 'Upcoming Devotional meeting',
        ]);

        // Inside live window (08:05) before clocking in -> happening now reminder
        Carbon::setTestNow(Carbon::parse('2026-11-20 08:05:00'));
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $this->assertSame(0, app(ShiftClockReminder::class)->dispatch());
        $this->assertDatabaseHas('notifications', [
            'user_id' => $student->id,
            'title' => 'Happening now: Devotional meeting',
        ]);

        // Student clocks in at 08:10 and forgets to time out after 09:00
        $attendance = Attendance::create([
            'user_id' => $student->id,
            'time_in' => Carbon::parse('2026-11-20 08:10:00'),
            'attendance_type' => 'Devotional meeting',
            'work_type' => 'Devotional meeting',
            'rendered_hour_event_id' => $eventId,
            'status' => 'pending',
        ]);
        RenderedHourEntry::query()->updateOrCreate(
            ['event_id' => $eventId, 'user_id' => $student->id],
            [
                'status' => RenderedHourEntry::TIMED_IN,
                'scanned_at' => Carbon::parse('2026-11-20 08:10:00'),
                'attendance_id' => $attendance->id,
            ]
        );

        Carbon::setTestNow(Carbon::parse('2026-11-20 09:05:00'));
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $this->assertDatabaseHas('notifications', [
            'user_id' => $student->id,
            'title' => 'Clock out after Devotional meeting',
        ]);
    }

    private function makeStudent(string $name, int $yearLevel, string $studentId): User
    {
        $user = User::create([
            'name' => $name,
            'username' => strtolower(str_replace(' ', '.', $name)).'.'.uniqid(),
            'password' => bcrypt('password'),
            'role' => 'Student',
        ]);

        UserProfile::create([
            'user_id' => $user->id,
            'student_id_number' => $studentId,
            'year_level' => $yearLevel,
            'assigned_office' => 'Library',
        ]);

        return $user;
    }

    private function createSchema(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('username')->unique();
            $table->string('email')->nullable();
            $table->string('password');
            $table->string('role')->default('Student');
            $table->boolean('organization_officer')->default(false);
            $table->string('officer_position')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });

        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('student_id_number')->nullable();
            $table->unsignedTinyInteger('year_level')->nullable();
            $table->string('course')->nullable();
            $table->string('assigned_office')->nullable();
            $table->string('assignment_area')->nullable();
            $table->boolean('special_hours_request')->default(false);
            $table->timestamps();
        });

        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind')->default('work');
            $table->string('day');
            $table->string('time');
            $table->string('duty_type')->nullable();
            $table->string('department')->nullable();
            $table->timestamps();
        });

        Schema::create('daily_cleaning_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('daily_cleaning_group_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained('daily_cleaning_groups')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_leader')->default(false);
            $table->timestamps();
        });

        Schema::create('rendered_hour_events', function (Blueprint $table) {
            $table->id();
            $table->string('kind');
            $table->string('title');
            $table->date('event_date');
            $table->decimal('hours', 8, 2);
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
            $table->foreignId('event_id')->constrained('rendered_hour_events')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
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
            $table->string('work_type')->nullable();
            $table->timestamp('time_in')->nullable();
            $table->timestamp('time_out')->nullable();
            $table->decimal('rendered_hours', 8, 2)->nullable();
            $table->decimal('computed_hours', 8, 2)->default(0);
            $table->decimal('activity_hours', 8, 2)->nullable();
            $table->unsignedBigInteger('rendered_hour_event_id')->nullable();
            $table->unsignedBigInteger('schedule_id')->nullable();
            $table->string('status')->nullable();
            $table->boolean('is_anomaly')->default(false);
            $table->timestamps();
        });

        Schema::create('disciplinary_records', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('student_id');
            $table->string('penalty')->nullable();
            $table->decimal('penalty_hours', 8, 2)->default(0);
            $table->string('status')->nullable();
            $table->timestamp('suspension_ends_at')->nullable();
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

        Schema::create('shift_reminders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('dedupe_key')->unique();
            $table->string('kind');
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

        Schema::create('hour_limit_approvals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->date('week_start')->nullable();
            $table->string('status')->nullable();
            $table->decimal('approved_hours', 8, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('extra_hours_requests', function (Blueprint $table) {
            $table->id();
            $table->string('status')->nullable();
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->decimal('approved_hours', 8, 2)->nullable();
            $table->string('period_label')->nullable();
            $table->timestamps();
        });

        Schema::create('extra_hours_request_students', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('extra_hours_request_id');
            $table->unsignedBigInteger('user_id');
        });
    }
}
