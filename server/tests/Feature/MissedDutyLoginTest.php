<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Holiday;
use App\Models\Schedule;
use App\Models\SemesterTerm;
use App\Models\User;
use App\Services\MissedDutyLogin;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MissedDutyLoginTest extends TestCase
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

    public function test_a_finished_duty_with_no_login_is_flagged_once(): void
    {
        $student = $this->makeStudent('Ana Cruz');
        $shift = $this->makeShift($student, 'Monday', '08:00 - 12:00');

        $this->at('2026-11-09 11:59:00');
        $this->assertSame(0, app(MissedDutyLogin::class)->flag());

        $this->at('2026-11-09 12:05:00');
        $this->assertSame(1, app(MissedDutyLogin::class)->flag());
        $this->assertSame(0, app(MissedDutyLogin::class)->flag());

        $record = Attendance::query()->first();
        $this->assertNotNull($record);
        $this->assertTrue($record->is_anomaly);
        $this->assertTrue($record->isMissedDutyLogin());
        $this->assertFalse($record->isNormalClockIn());
        $this->assertSame($shift->id, $record->schedule_id);
        $this->assertSame('anomaly', $record->status);
        $this->assertEquals(0, (float) $record->rendered_hours);
        $this->assertStringContainsString('Did not log in during the scheduled duty', (string) $record->anomaly_reason);
        $this->assertStringContainsString('8:00 AM', (string) $record->anomaly_reason);
        $this->assertNotNull($record->time_out);
    }

    public function test_a_login_during_the_duty_window_is_not_an_anomaly(): void
    {
        $student = $this->makeStudent('Ben Cruz');
        $this->makeShift($student, 'Monday', '08:00 - 12:00');

        $this->at('2026-11-09 07:40:00');
        $student->createToken('auth_token');

        $this->at('2026-11-09 12:05:00');
        $this->assertSame(0, app(MissedDutyLogin::class)->flag());
        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_using_an_open_session_during_the_duty_is_not_an_anomaly(): void
    {
        $student = $this->makeStudent('Cara Diaz');
        $this->makeShift($student, 'Monday', '08:00 - 12:00');

        $this->at('2026-11-09 06:30:00');
        $token = $student->createToken('auth_token');
        $token->accessToken->forceFill([
            'last_used_at' => Carbon::parse('2026-11-09 09:15:00', 'Asia/Manila'),
        ])->save();

        $this->at('2026-11-09 12:05:00');
        $this->assertSame(0, app(MissedDutyLogin::class)->flag());
    }

    public function test_a_login_before_the_duty_window_still_flags_the_miss(): void
    {
        $student = $this->makeStudent('Dina Flores');
        $this->makeShift($student, 'Monday', '08:00 - 12:00');

        $this->at('2026-11-09 07:00:00');
        $student->createToken('auth_token');

        $this->at('2026-11-09 12:05:00');
        $this->assertSame(1, app(MissedDutyLogin::class)->flag());
    }

    public function test_clocking_in_during_the_duty_is_not_an_anomaly(): void
    {
        $student = $this->makeStudent('Eva Gomez');
        $shift = $this->makeShift($student, 'Monday', '08:00 - 12:00');
        Attendance::create([
            'user_id' => $student->id,
            'schedule_id' => $shift->id,
            'time_in' => Carbon::parse('2026-11-09 08:05:00', 'Asia/Manila'),
            'check_in_method' => 'passcode',
            'work_type' => 'Clerical',
        ]);

        $this->at('2026-11-09 12:10:00');
        $this->assertSame(0, app(MissedDutyLogin::class)->flag());
        $this->assertSame(0, Attendance::query()->where('is_anomaly', true)->count());
    }

    public function test_class_blocks_and_non_students_are_ignored(): void
    {
        $student = $this->makeStudent('Finn Gomez');
        $staff = $this->makeStudent('Gia Gomez', 'WSPO Staff');
        Schedule::create([
            'user_id' => $student->id,
            'kind' => 'class',
            'day' => 'Monday',
            'time' => '08:00 - 12:00',
        ]);
        $this->makeShift($staff, 'Monday', '08:00 - 12:00');

        $this->at('2026-11-09 12:10:00');
        $this->assertSame(0, app(MissedDutyLogin::class)->flag());
    }

    public function test_a_holiday_or_a_break_suspends_the_duty(): void
    {
        $student = $this->makeStudent('Hana Ibarra');
        $this->makeShift($student, 'Monday', '08:00 - 12:00');
        Holiday::create([
            'date' => '2026-11-09',
            'end_date' => '2026-11-09',
            'name' => 'Foundation Day',
            'kind' => 'holiday',
            'portion' => 'full',
        ]);

        $this->at('2026-11-09 12:10:00');
        $this->assertSame(0, app(MissedDutyLogin::class)->flag());
    }

    public function test_a_half_day_holiday_only_covers_the_overlapping_duty(): void
    {
        $student = $this->makeStudent('Ivan Jose');
        $this->makeShift($student, 'Monday', '08:00 - 12:00');
        $this->makeShift($student, 'Monday', '13:00 - 17:00');
        Holiday::create([
            'date' => '2026-11-09',
            'end_date' => '2026-11-09',
            'name' => 'Half day',
            'kind' => 'holiday',
            'portion' => 'half',
            'starts_at' => '08:00',
            'ends_at' => '12:00',
        ]);

        $this->at('2026-11-09 17:05:00');
        $this->assertSame(1, app(MissedDutyLogin::class)->flag());
        $this->assertStringContainsString('1:00 PM', (string) Attendance::query()->value('anomaly_reason'));
    }

    public function test_a_shift_outside_the_semester_is_not_a_duty(): void
    {
        $student = $this->makeStudent('Jade Kim');
        $this->makeShift($student, 'Monday', '08:00 - 12:00');
        SemesterTerm::create([
            'label' => '1st Semester',
            'starts_on' => '2026-08-03',
            'ends_on' => '2026-12-15',
            'months' => 5,
        ]);

        $this->at('2027-01-04 12:10:00');
        $this->assertSame(0, app(MissedDutyLogin::class)->flag());

        $this->at('2026-11-09 12:10:00');
        $this->assertSame(1, app(MissedDutyLogin::class)->flag());
    }

    public function test_the_scheduled_command_flags_the_missed_login(): void
    {
        $student = $this->makeStudent('Liza Nunez');
        $this->makeShift($student, 'Monday', '08:00 - 12:00');
        $this->at('2026-11-09 12:05:00');

        $this->artisan('shifts:remind')->assertSuccessful();

        $this->assertSame(1, Attendance::query()->where('user_id', $student->id)->where('is_anomaly', true)->count());
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
            $table->string('check_in_method')->nullable();
            $table->string('work_type')->nullable();
            $table->text('task_description')->nullable();
            $table->timestamp('time_in')->nullable();
            $table->timestamp('time_out')->nullable();
            $table->decimal('rendered_hours', 8, 2)->nullable();
            $table->decimal('computed_hours', 8, 2)->nullable();
            $table->string('status')->nullable();
            $table->boolean('is_anomaly')->default(false);
            $table->string('anomaly_reason')->nullable();
            $table->unsignedBigInteger('rendered_hour_event_id')->nullable();
            $table->unsignedBigInteger('schedule_id')->nullable();
            $table->timestamps();
        });

        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->date('end_date')->nullable();
            $table->string('name');
            $table->string('kind')->default('holiday');
            $table->string('portion')->default('full');
            $table->time('starts_at')->nullable();
            $table->time('ends_at')->nullable();
            $table->timestamps();
        });

        Schema::create('semester_terms', function (Blueprint $table) {
            $table->id();
            $table->string('label');
            $table->date('starts_on');
            $table->date('ends_on');
            $table->unsignedTinyInteger('months')->default(5);
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

        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('admin_id')->nullable();
            $table->string('admin_name')->nullable();
            $table->string('action')->nullable();
            $table->text('description')->nullable();
            $table->string('ip_address')->nullable();
            $table->timestamps();
        });
    }
}
