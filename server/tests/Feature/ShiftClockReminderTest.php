<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Notification;
use App\Models\Schedule;
use App\Models\User;
use App\Services\ShiftClockReminder;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ShiftClockReminderTest extends TestCase
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

    public function test_a_student_is_reminded_to_clock_in_before_the_shift(): void
    {
        $student = $this->makeStudent('Ana Cruz');
        $this->makeShift($student, 'Monday', '08:00 - 12:00');

        $this->at('2026-11-09 07:29:00');
        $this->assertSame(0, app(ShiftClockReminder::class)->dispatch());

        $this->at('2026-11-09 07:30:00');
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $this->assertSame(0, app(ShiftClockReminder::class)->dispatch());

        $notice = Notification::query()->where('user_id', $student->id)->first();
        $this->assertNotNull($notice);
        $this->assertSame('Clock in before your shift', $notice->title);
        $this->assertStringContainsString('8:00 AM', $notice->message);
        $this->assertStringContainsString('Clock in before it begins.', $notice->message);
    }

    public function test_clock_in_reminder_is_skipped_after_the_student_clocks_in(): void
    {
        $student = $this->makeStudent('Ben Cruz');
        $shift = $this->makeShift($student, 'Monday', '08:00 - 12:00');
        $this->clock($student, $shift, '2026-11-09 07:35:00');

        $this->at('2026-11-09 07:40:00');
        $this->assertSame(0, app(ShiftClockReminder::class)->dispatch());
        $this->assertSame(0, Notification::query()->count());
    }

    public function test_clock_out_overtime_and_forgotten_clock_out_follow_the_shift(): void
    {
        $student = $this->makeStudent('Cara Diaz');
        $shift = $this->makeShift($student, 'Monday', '08:00 - 12:00');
        $this->clock($student, $shift, '2026-11-09 08:05:00');

        $this->at('2026-11-09 11:59:00');
        $this->assertSame(0, app(ShiftClockReminder::class)->dispatch());

        $this->at('2026-11-09 12:00:00');
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $this->assertSame('Clock out after your shift', Notification::query()->latest('id')->first()->title);

        $this->at('2026-11-09 12:15:00');
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $this->assertSame('Overtime on your shift', Notification::query()->latest('id')->first()->title);

        $this->at('2026-11-09 13:00:00');
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $notice = Notification::query()->latest('id')->first();
        $this->assertSame('Forgot to clock out', $notice->title);
        $this->assertStringContainsString('still clocked in', $notice->message);

        $this->assertSame(3, Notification::query()->where('user_id', $student->id)->count());
        $this->assertSame(0, app(ShiftClockReminder::class)->dispatch());
    }

    public function test_a_finished_shift_does_not_get_after_shift_reminders(): void
    {
        $student = $this->makeStudent('Dina Flores');
        $shift = $this->makeShift($student, 'Monday', '08:00 - 12:00');
        $this->clock($student, $shift, '2026-11-09 08:00:00', '2026-11-09 12:05:00');

        $this->at('2026-11-09 12:20:00');
        $this->assertSame(0, app(ShiftClockReminder::class)->dispatch());

        $this->at('2026-11-09 13:30:00');
        $this->assertSame(0, app(ShiftClockReminder::class)->dispatch());
        $this->assertSame(0, Notification::query()->count());
    }

    public function test_only_the_scheduled_working_student_is_reminded(): void
    {
        $student = $this->makeStudent('Eva Gomez');
        $other = $this->makeStudent('Finn Gomez');
        $staff = $this->makeStudent('Gia Gomez', 'WSPO Staff');
        $this->makeShift($student, 'Monday', '08:00 AM - 12:00 PM');
        $this->makeShift($other, 'Tuesday', '08:00 - 12:00');
        $this->makeShift($staff, 'Monday', '08:00 - 12:00');
        Schedule::create([
            'user_id' => $student->id,
            'kind' => 'class',
            'day' => 'Monday',
            'time' => '13:00 - 16:00',
        ]);

        $this->at('2026-11-09 07:30:00');
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());

        $this->assertSame(1, Notification::query()->count());
        $this->assertSame($student->id, Notification::query()->value('user_id'));
    }

    public function test_a_meeting_scan_does_not_count_as_clocking_in(): void
    {
        $student = $this->makeStudent('Hana Ibarra');
        $shift = $this->makeShift($student, 'Monday', '08:00 - 12:00');
        Attendance::create([
            'user_id' => $student->id,
            'schedule_id' => $shift->id,
            'time_in' => Carbon::parse('2026-11-09 07:40:00', 'Asia/Manila'),
            'attendance_type' => 'Meeting',
            'work_type' => 'Meeting',
        ]);

        $this->at('2026-11-09 07:45:00');
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $this->assertSame('Clock in before your shift', Notification::query()->value('title'));
    }

    public function test_the_next_shift_is_reminded_while_an_earlier_shift_is_still_open(): void
    {
        $student = $this->makeStudent('Ivan Jose');
        $morning = $this->makeShift($student, 'Monday', '08:00 - 12:00');
        $this->makeShift($student, 'Monday', '13:00 - 17:00');
        $this->clock($student, $morning, '2026-11-09 08:00:00');

        $this->at('2026-11-09 12:30:00');
        $this->assertSame(2, app(ShiftClockReminder::class)->dispatch());

        $titles = Notification::query()->orderBy('id')->pluck('title')->all();
        $this->assertSame(['Overtime on your shift', 'Clock in before your shift'], $titles);
        $this->assertStringContainsString('Clock out of your open shift', Notification::query()->where('title', 'Clock in before your shift')->value('message'));
    }

    public function test_an_overnight_shift_is_reminded_across_midnight(): void
    {
        $student = $this->makeStudent('Jade Lim');
        $shift = $this->makeShift($student, 'Sunday', '22:00 - 02:00');

        $this->at('2026-11-08 21:30:00');
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $this->assertSame('Clock in before your shift', Notification::query()->value('title'));

        $this->clock($student, $shift, '2026-11-08 21:40:00');

        $this->at('2026-11-09 02:00:00');
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $this->assertSame('Clock out after your shift', Notification::query()->latest('id')->value('title'));

        $this->at('2026-11-09 03:00:00');
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $this->assertSame('Forgot to clock out', Notification::query()->latest('id')->value('title'));
    }

    public function test_a_shift_left_open_from_an_earlier_day_still_gets_one_missed_clock_out(): void
    {
        $student = $this->makeStudent('Ken Mora');
        $shift = $this->makeShift($student, 'Monday', '08:00 - 12:00');
        $this->clock($student, $shift, '2026-11-09 08:05:00');

        $this->at('2026-11-11 09:00:00');
        $this->assertSame(1, app(ShiftClockReminder::class)->dispatch());
        $this->assertSame('Forgot to clock out', Notification::query()->value('title'));
        $this->assertSame(0, app(ShiftClockReminder::class)->dispatch());

        $this->at('2026-11-13 09:00:00');
        $this->assertSame(0, app(ShiftClockReminder::class)->dispatch());
    }

    public function test_the_scheduled_command_sends_the_reminder(): void
    {
        $student = $this->makeStudent('Liza Nunez');
        $this->makeShift($student, 'Monday', '08:00 - 12:00');
        $this->at('2026-11-09 07:30:00');

        $this->artisan('shifts:remind')->assertSuccessful();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $student->id,
            'title' => 'Clock in before your shift',
        ]);
    }

    public function test_opening_notifications_sends_a_due_reminder(): void
    {
        $student = $this->makeStudent('Mia Ocampo');
        $this->makeShift($student, 'Monday', '08:00 - 12:00');
        $this->at('2026-11-09 07:30:00');
        Sanctum::actingAs($student);

        $this->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Clock in before your shift']);

        $this->getJson('/api/notifications')->assertOk();
        $this->assertSame(1, Notification::query()->where('user_id', $student->id)->count());
    }

    public function test_shift_reminders_are_scheduled_every_minute(): void
    {
        $event = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())
            ->first(fn ($event) => str_contains((string) $event->command, 'shifts:remind'));

        $this->assertNotNull($event);
        $this->assertSame('* * * * *', $event->expression);
    }

    private function at(string $moment): void
    {
        Carbon::setTestNow(Carbon::parse($moment, 'Asia/Manila'));
    }

    private function makeStudent(string $name, string $role = 'Student'): User
    {
        return User::create([
            'name' => $name,
            'username' => strtolower(str_replace(' ', '.', $name)).'.'.uniqid(),
            'password' => 'password',
            'role' => $role,
        ]);
    }

    private function makeShift(User $user, string $day, string $time): Schedule
    {
        return Schedule::create([
            'user_id' => $user->id,
            'kind' => 'work',
            'day' => $day,
            'time' => $time,
        ]);
    }

    private function clock(User $user, Schedule $shift, string $timeIn, ?string $timeOut = null): Attendance
    {
        return Attendance::create([
            'user_id' => $user->id,
            'schedule_id' => $shift->id,
            'time_in' => Carbon::parse($timeIn, 'Asia/Manila'),
            'time_out' => $timeOut ? Carbon::parse($timeOut, 'Asia/Manila') : null,
            'work_type' => 'Clerical',
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
            $table->string('role')->default('Student');
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

        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind')->nullable();
            $table->string('day')->nullable();
            $table->string('time')->nullable();
            $table->timestamps();
        });

        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('attendance_type')->nullable();
            $table->string('work_type')->nullable();
            $table->timestamp('time_in')->nullable();
            $table->timestamp('time_out')->nullable();
            $table->unsignedBigInteger('rendered_hour_event_id')->nullable();
            $table->unsignedBigInteger('schedule_id')->nullable();
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
    }
}
