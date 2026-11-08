<?php

namespace Tests\Feature;

use App\Models\DailyCleaningGroup;
use App\Models\RenderedHourEntry;
use App\Models\RenderedHourEvent;
use App\Models\User;
use App\Models\UserProfile;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ActivityAttendanceAllYearLevelsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        Carbon::setTestNow(Carbon::parse('2026-10-28 05:15:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_activity_roster_and_passcode_cover_every_year_level(): void
    {
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator');
        $leader = $this->makeStudent('Leader One', 1, '2026-0001');
        $yearOne = $this->makeStudent('Year One', 1, '2026-0002');
        $yearTwo = $this->makeStudent('Year Two', 2, '2026-0003');
        $yearFour = $this->makeStudent('Year Four', 4, '2026-0004');

        $group = DailyCleaningGroup::create(['name' => 'Alpha']);
        $this->attachMembers($group, [$leader->id, $yearOne->id, $yearTwo->id, $yearFour->id], $leader->id);

        Sanctum::actingAs($staff);
        $create = $this->postJson('/api/financial/hour-events', [
            'kind' => 'daily_cleaning',
            'title' => 'Daily cleaning',
            'event_date' => '2026-10-28',
            'year_level' => 1,
            'group_id' => $group->id,
            'starts_at' => '05:00',
        ]);

        $create->assertCreated();
        $eventId = (int) $create->json('event.id');
        $this->assertNull($create->json('event.year_level'));
        $this->assertNull($create->json('event.year_label'));
        $this->assertSame(4, (int) $create->json('event.eligible_count'));

        $rosterIds = collect($create->json('event.entries'))->pluck('user_id')->sort()->values()->all();
        $this->assertSame(
            collect([$leader->id, $yearOne->id, $yearTwo->id, $yearFour->id])->sort()->values()->all(),
            $rosterIds
        );

        $passcode = $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId);
        $passcode->assertOk();
        $code = $passcode->json('token_code');
        $this->assertNotEmpty($code);

        foreach ([$yearOne, $yearTwo, $yearFour] as $student) {
            Sanctum::actingAs($student);
            $clockIn = $this->postJson('/api/attendance/secure-clock-in', [
                'token_code' => $code,
                'method' => 'passcode',
            ])->assertOk()
                ->assertJsonPath('activity', true)
                ->assertJsonPath('status', 'timed_in')
                ->assertJsonPath('hours_delta', 0);

            $this->assertDatabaseHas('rendered_hour_entries', [
                'event_id' => $eventId,
                'user_id' => $student->id,
                'status' => 'timed_in',
            ]);
            $this->assertDatabaseHas('attendances', [
                'id' => $clockIn->json('attendance.id'),
                'user_id' => $student->id,
                'time_out' => null,
            ]);

            $this->putJson('/api/attendance/secure-clock-out/'.$clockIn->json('attendance.id'), [
                'token_code' => $code,
                'method' => 'passcode',
            ])->assertOk()
                ->assertJsonPath('timed_out', true)
                ->assertJsonPath('status', 'on_time')
                ->assertJsonPath('hours_delta', 1);

            $this->assertDatabaseHas('rendered_hour_entries', [
                'event_id' => $eventId,
                'user_id' => $student->id,
                'status' => 'on_time',
            ]);
        }
    }

    public function test_legacy_year_scoped_qr_works_for_sibling_year_levels(): void
    {
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator');
        $yearOne = $this->makeStudent('Legacy One', 1, '2026-1001');
        $yearTwo = $this->makeStudent('Legacy Two', 2, '2026-1002');

        $group = DailyCleaningGroup::create(['name' => 'Legacy']);
        $this->attachMembers($group, [$yearOne->id, $yearTwo->id], $yearOne->id);

        $eventYearOne = RenderedHourEvent::create([
            'kind' => RenderedHourEvent::GENERAL_CLEANING,
            'title' => 'General cleaning',
            'event_date' => '2026-10-28',
            'hours' => 5,
            'year_level' => 1,
            'group_name' => $group->name,
            'group_id' => $group->id,
            'starts_at' => '05:00',
            'valid_until' => '06:00',
            'created_by' => $staff->id,
        ]);
        $eventYearTwo = RenderedHourEvent::create([
            'kind' => RenderedHourEvent::GENERAL_CLEANING,
            'title' => 'General cleaning',
            'event_date' => '2026-10-28',
            'hours' => 5,
            'year_level' => 2,
            'group_name' => $group->name,
            'group_id' => $group->id,
            'starts_at' => '05:00',
            'valid_until' => '06:00',
            'created_by' => $staff->id,
        ]);

        RenderedHourEntry::create(['event_id' => $eventYearOne->id, 'user_id' => $yearOne->id, 'hours_delta' => 0]);
        RenderedHourEntry::create(['event_id' => $eventYearTwo->id, 'user_id' => $yearTwo->id, 'hours_delta' => 0]);

        Sanctum::actingAs($staff);
        $qr = $this->getJson('/api/attendance/activity-qr?event_id='.$eventYearOne->id);
        $qr->assertOk();
        $payload = $qr->json('payload');
        $this->assertStringStartsWith('THRM1A|', $payload);

        Sanctum::actingAs($yearTwo);
        $clockIn = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $payload,
            'method' => 'qr',
        ])->assertOk()
            ->assertJsonPath('activity', true)
            ->assertJsonPath('status', 'timed_in')
            ->assertJsonPath('hours_delta', 0);

        $this->putJson('/api/attendance/secure-clock-out/'.$clockIn->json('attendance.id'), [
            'token_code' => $payload,
            'method' => 'qr',
        ])->assertOk()
            ->assertJsonPath('status', 'on_time')
            ->assertJsonPath('hours_delta', 5);

        $this->assertDatabaseHas('rendered_hour_entries', [
            'event_id' => $eventYearTwo->id,
            'user_id' => $yearTwo->id,
            'status' => 'on_time',
        ]);
        $this->assertDatabaseMissing('rendered_hour_entries', [
            'event_id' => $eventYearOne->id,
            'user_id' => $yearTwo->id,
            'status' => 'on_time',
        ]);
    }

    public function test_group_leader_can_issue_passcode_for_all_years(): void
    {
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator');
        $leader = $this->makeStudent('Group Leader', 3, '2026-2001');
        $yearOne = $this->makeStudent('Member One', 1, '2026-2002');

        $group = DailyCleaningGroup::create(['name' => 'Bravo']);
        $this->attachMembers($group, [$leader->id, $yearOne->id], $leader->id);

        Sanctum::actingAs($staff);
        $eventId = (int) $this->postJson('/api/financial/hour-events', [
            'kind' => 'meeting_assembly',
            'title' => 'Meeting assembly',
            'event_date' => '2026-10-28',
            'group_id' => $group->id,
            'starts_at' => '05:00',
        ])->assertCreated()->json('event.id');

        Sanctum::actingAs($leader);
        $passcode = $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId)
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($yearOne);
        $clockIn = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $passcode,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('activity', true)
            ->assertJsonPath('hours_delta', 0);

        $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $passcode,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('timed_out', true)
            ->assertJsonPath('status', 'on_time')
            ->assertJsonPath('hours_delta', 5);

        $this->assertNotNull($clockIn->json('attendance.id'));
    }

    public function test_late_activity_clock_in_adds_nothing_when_timing_out(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-28 07:15:00'));
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator');
        $student = $this->makeStudent('Late Student', 1, '2026-3001');
        $group = DailyCleaningGroup::create(['name' => 'Late']);
        $this->attachMembers($group, [$student->id], $student->id);

        Sanctum::actingAs($staff);
        $eventId = (int) $this->postJson('/api/financial/hour-events', [
            'kind' => 'daily_cleaning',
            'title' => 'Daily cleaning',
            'event_date' => '2026-10-28',
            'group_id' => $group->id,
            'starts_at' => '05:00',
        ])->assertCreated()->json('event.id');

        $code = $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId)
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($student);
        $clockIn = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('status', 'timed_in')
            ->assertJsonPath('hours_delta', 0);

        $this->putJson('/api/attendance/secure-clock-out/'.$clockIn->json('attendance.id'), [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('status', 'late')
            ->assertJsonPath('hours_delta', 0);

        $this->assertDatabaseHas('rendered_hour_entries', [
            'event_id' => $eventId,
            'user_id' => $student->id,
            'status' => 'late',
        ]);
    }

    public function test_wspo_staff_can_manually_set_activity_timeout(): void
    {
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator');
        $student = $this->makeStudent('Manual Timeout', 1, '2026-5001');
        $group = DailyCleaningGroup::create(['name' => 'Manual']);
        $this->attachMembers($group, [$student->id], $student->id);

        Sanctum::actingAs($staff);
        $eventId = (int) $this->postJson('/api/financial/hour-events', [
            'kind' => 'daily_cleaning',
            'title' => 'Daily cleaning',
            'event_date' => '2026-10-28',
            'group_id' => $group->id,
            'starts_at' => '05:00',
        ])->assertCreated()->json('event.id');

        $this->patchJson('/api/financial/hour-events/'.$eventId.'/time', [
            'user_id' => $student->id,
            'time' => '05:10',
        ])->assertOk()
            ->assertJsonPath('event.entries.0.status', 'timed_in');

        Carbon::setTestNow(Carbon::parse('2026-10-28 06:00:00'));
        $this->patchJson('/api/financial/hour-events/'.$eventId.'/timeout', [
            'user_id' => $student->id,
            'time' => '05:45',
        ])->assertOk()
            ->assertJsonPath('event.entries.0.status', 'on_time')
            ->assertJsonPath('event.entries.0.hours_delta', 1)
            ->assertJsonPath('event.entries.0.time_in', '05:10')
            ->assertJsonPath('event.entries.0.time_out', '05:45');

        $this->assertDatabaseHas('rendered_hour_entries', [
            'event_id' => $eventId,
            'user_id' => $student->id,
            'status' => 'on_time',
        ]);
        $this->assertDatabaseHas('attendances', [
            'user_id' => $student->id,
            'rendered_hour_event_id' => $eventId,
            'activity_hours' => 1,
            'status' => 'accepted',
        ]);
    }

    public function test_group_leader_can_manually_set_activity_time_in_and_timeout(): void
    {
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator');
        $leader = $this->makeStudent('Timeout Leader', 2, '2026-5002');
        $student = $this->makeStudent('Timeout Member', 1, '2026-5003');
        $outsider = $this->makeStudent('Other Group Member', 1, '2026-5005');
        $group = DailyCleaningGroup::create(['name' => 'Leader Allow']);
        $otherGroup = DailyCleaningGroup::create(['name' => 'Other Group']);
        $this->attachMembers($group, [$leader->id, $student->id], $leader->id);
        $this->attachMembers($otherGroup, [$outsider->id], $outsider->id);

        Sanctum::actingAs($staff);
        $eventId = (int) $this->postJson('/api/financial/hour-events', [
            'kind' => 'daily_cleaning',
            'title' => 'Daily cleaning',
            'event_date' => '2026-10-28',
            'group_id' => $group->id,
            'starts_at' => '05:00',
        ])->assertCreated()->json('event.id');

        Carbon::setTestNow(Carbon::parse('2026-10-28 06:00:00'));
        Sanctum::actingAs($leader);
        $timedIn = $this->patchJson('/api/financial/hour-events/'.$eventId.'/time', [
            'user_id' => $student->id,
            'time' => '05:10',
        ])->assertOk();
        $timedInEntry = collect($timedIn->json('event.entries'))->firstWhere('user_id', $student->id);
        $this->assertSame('timed_in', $timedInEntry['status'] ?? null);
        $this->assertSame('05:10', $timedInEntry['time_in'] ?? null);

        $timedOut = $this->patchJson('/api/financial/hour-events/'.$eventId.'/timeout', [
            'user_id' => $student->id,
            'time' => '05:45',
        ])->assertOk();
        $timedOutEntry = collect($timedOut->json('event.entries'))->firstWhere('user_id', $student->id);
        $this->assertSame('on_time', $timedOutEntry['status'] ?? null);
        $this->assertSame(1, (int) ($timedOutEntry['hours_delta'] ?? 0));
        $this->assertSame('05:45', $timedOutEntry['time_out'] ?? null);

        Sanctum::actingAs($outsider);
        $this->patchJson('/api/financial/hour-events/'.$eventId.'/time', [
            'user_id' => $student->id,
            'time' => '05:12',
        ])->assertForbidden();
        $this->patchJson('/api/financial/hour-events/'.$eventId.'/timeout', [
            'user_id' => $student->id,
            'time' => '05:50',
        ])->assertForbidden();
    }

    public function test_manual_timeout_requires_clock_in_and_rejects_absent(): void
    {
        $staff = $this->makeUser('WSPO Staff', 'WSPO Secretary');
        $student = $this->makeStudent('Needs Clock In', 3, '2026-5004');
        $group = DailyCleaningGroup::create(['name' => 'Needs In']);
        $this->attachMembers($group, [$student->id], $student->id);

        Sanctum::actingAs($staff);
        $eventId = (int) $this->postJson('/api/financial/hour-events', [
            'kind' => 'devotional',
            'title' => 'Devotional meeting',
            'event_date' => '2026-10-28',
            'group_id' => $group->id,
            'starts_at' => '05:00',
        ])->assertCreated()->json('event.id');

        Carbon::setTestNow(Carbon::parse('2026-10-28 06:00:00'));
        $this->patchJson('/api/financial/hour-events/'.$eventId.'/timeout', [
            'user_id' => $student->id,
            'time' => '05:45',
        ])->assertStatus(422)
            ->assertJsonFragment(['message' => 'Save a clock-in time for this student before setting time out.']);

        $this->patchJson('/api/financial/hour-events/'.$eventId.'/time', [
            'user_id' => $student->id,
            'time' => '05:10',
        ])->assertOk();

        $this->postJson('/api/financial/hour-events/'.$eventId.'/marks', [
            'marks' => [['user_id' => $student->id, 'status' => 'absent']],
        ])->assertOk();

        $this->patchJson('/api/financial/hour-events/'.$eventId.'/timeout', [
            'user_id' => $student->id,
            'time' => '05:45',
        ])->assertStatus(422)
            ->assertJsonFragment(['message' => 'This activity was marked absent, so it cannot be timed out.']);
    }

    public function test_activity_can_be_edited_with_start_and_end_times(): void
    {
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator');
        $student = $this->makeStudent('Edit Student', 1, '2026-6001');
        $group = DailyCleaningGroup::create(['name' => 'Edit Group']);
        $this->attachMembers($group, [$student->id], $student->id);

        Sanctum::actingAs($staff);
        $eventId = (int) $this->postJson('/api/financial/hour-events', [
            'kind' => 'meeting_assembly',
            'title' => 'Meeting assembly',
            'event_date' => '2026-10-28',
            'group_id' => $group->id,
            'starts_at' => '08:00',
            'ends_at' => '12:00',
        ])->assertCreated()
            ->assertJsonPath('event.starts_at', '08:00')
            ->assertJsonPath('event.ends_at', '12:00')
            ->json('event.id');

        $this->putJson('/api/financial/hour-events/'.$eventId, [
            'kind' => 'meeting_assembly',
            'title' => 'Afternoon assembly',
            'event_date' => '2026-10-28',
            'group_id' => $group->id,
            'starts_at' => '13:00',
            'ends_at' => '17:00',
        ])->assertOk()
            ->assertJsonPath('event.title', 'Afternoon assembly')
            ->assertJsonPath('event.starts_at', '13:00')
            ->assertJsonPath('event.ends_at', '17:00')
            ->assertJsonPath('event.valid_until', '14:00');
    }

    public function test_manual_timeout_may_use_activity_end_before_wall_clock(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-28 14:00:00'));
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator');
        $student = $this->makeStudent('End Time Student', 2, '2026-6002');
        $group = DailyCleaningGroup::create(['name' => 'End Time']);
        $this->attachMembers($group, [$student->id], $student->id);

        Sanctum::actingAs($staff);
        $eventId = (int) $this->postJson('/api/financial/hour-events', [
            'kind' => 'meeting_assembly',
            'title' => 'Meeting assembly',
            'event_date' => '2026-10-28',
            'group_id' => $group->id,
            'starts_at' => '13:00',
            'ends_at' => '17:00',
        ])->assertCreated()->json('event.id');

        $this->patchJson('/api/financial/hour-events/'.$eventId.'/time', [
            'user_id' => $student->id,
            'time' => '13:10',
        ])->assertOk();

        $this->patchJson('/api/financial/hour-events/'.$eventId.'/timeout', [
            'user_id' => $student->id,
            'time' => '17:00',
        ])->assertOk()
            ->assertJsonPath('event.entries.0.time_out', '17:00')
            ->assertJsonPath('event.entries.0.status', 'on_time')
            ->assertJsonPath('event.entries.0.hours_delta', 5);

        $this->patchJson('/api/financial/hour-events/'.$eventId.'/timeout', [
            'user_id' => $student->id,
            'time' => '17:30',
        ])->assertStatus(422);
    }

    public function test_qr_timeout_records_activity_end_time(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-28 13:20:00'));
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator');
        $student = $this->makeStudent('Qr End Student', 1, '2026-6003');
        $group = DailyCleaningGroup::create(['name' => 'Qr End']);
        $this->attachMembers($group, [$student->id], $student->id);

        Sanctum::actingAs($staff);
        $eventId = (int) $this->postJson('/api/financial/hour-events', [
            'kind' => 'meeting_assembly',
            'title' => 'Meeting assembly',
            'event_date' => '2026-10-28',
            'group_id' => $group->id,
            'starts_at' => '13:00',
            'ends_at' => '17:00',
        ])->assertCreated()->json('event.id');
        $code = $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId)
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($student);
        $clockIn = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-10-28 14:20:00'));
        Sanctum::actingAs($staff);
        $code = $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId)
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($student);
        $this->putJson('/api/attendance/secure-clock-out/'.$clockIn->json('attendance.id'), [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('status', 'on_time')
            ->assertJsonPath('hours_delta', 5);

        $this->assertDatabaseHas('attendances', [
            'id' => $clockIn->json('attendance.id'),
            'time_out' => '2026-10-28 17:00:00',
        ]);
    }

    public function test_devotional_hours_are_credited_when_timing_out_after_the_window(): void
    {
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator');
        $student = $this->makeStudent('Devotional Student', 2, '2026-4001');
        $group = DailyCleaningGroup::create(['name' => 'Chapel']);
        $this->attachMembers($group, [$student->id], $student->id);

        Carbon::setTestNow(Carbon::parse('2026-10-28 05:20:00'));
        Sanctum::actingAs($staff);
        $eventId = (int) $this->postJson('/api/financial/hour-events', [
            'kind' => 'devotional',
            'title' => 'Devotional meeting',
            'event_date' => '2026-10-28',
            'group_id' => $group->id,
            'starts_at' => '05:00',
        ])->assertCreated()->json('event.id');
        $code = $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId)
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($student);
        $clockIn = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('hours_delta', 0);

        Carbon::setTestNow(Carbon::parse('2026-10-28 07:00:00'));
        Sanctum::actingAs($staff);
        $passcode = $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId)
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($student);
        $this->putJson('/api/attendance/secure-clock-out/'.$clockIn->json('attendance.id'), [
            'token_code' => $passcode,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('status', 'on_time')
            ->assertJsonPath('hours_delta', 1);
    }

    private function makeUser(string $role, ?string $office = null): User
    {
        $user = User::create([
            'name' => $role.' User',
            'username' => strtolower(str_replace(' ', '.', $role)).'.'.uniqid(),
            'password' => bcrypt('password'),
            'role' => $role,
        ]);

        if ($office !== null) {
            UserProfile::create([
                'user_id' => $user->id,
                'assigned_office' => $office,
            ]);
        }

        return $user->load('profile');
    }

    private function makeStudent(string $name, int $year, string $studentId): User
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
            'year_level' => $year,
            'course' => 'BSIT',
            'assigned_office' => 'Library',
        ]);

        return $user->load('profile');
    }

    /**
     * @param  list<int>  $memberIds
     */
    private function attachMembers(DailyCleaningGroup $group, array $memberIds, int $leaderId): void
    {
        $sync = [];
        foreach ($memberIds as $memberId) {
            $sync[$memberId] = ['is_leader' => $memberId === $leaderId];
        }
        $group->students()->sync($sync);
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

        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('student_id_number')->nullable();
            $table->string('assigned_office')->nullable();
            $table->string('course')->nullable();
            $table->integer('year_level')->nullable();
            $table->string('gender')->nullable();
            $table->json('supervised_departments')->nullable();
            $table->string('duty_type')->nullable();
            $table->text('duty_request')->nullable();
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
            $table->unique(['group_id', 'user_id']);
        });

        Schema::create('rendered_hour_events', function (Blueprint $table) {
            $table->id();
            $table->string('kind');
            $table->string('title');
            $table->date('event_date');
            $table->decimal('hours', 8, 2)->default(0);
            $table->string('direction')->nullable();
            $table->unsignedTinyInteger('year_level')->nullable();
            $table->string('group_name')->nullable();
            $table->foreignId('group_id')->nullable()->constrained('daily_cleaning_groups')->nullOnDelete();
            $table->time('starts_at')->nullable();
            $table->time('ends_at')->nullable();
            $table->time('valid_until')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
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
            $table->unique(['event_id', 'user_id']);
        });

        Schema::create('daily_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('token_code');
            $table->string('type');
            $table->string('channel')->default('passcode');
            $table->string('description')->nullable();
            $table->foreignId('event_id')->nullable()->constrained('rendered_hour_events')->nullOnDelete();
            $table->foreignId('generated_by')->constrained('users');
            $table->timestamp('expires_at');
            $table->timestamps();
        });

        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('attendance_type')->nullable();
            $table->string('verification_code_used')->nullable();
            $table->string('check_in_method')->nullable();
            $table->unsignedBigInteger('code_owner_id')->nullable();
            $table->timestamp('time_in')->nullable();
            $table->timestamp('time_out')->nullable();
            $table->decimal('rendered_hours', 8, 2)->nullable();
            $table->decimal('computed_hours', 8, 2)->default(0);
            $table->string('work_type')->nullable();
            $table->text('task_description')->nullable();
            $table->string('status')->nullable();
            $table->boolean('is_anomaly')->default(false);
            $table->text('anomaly_reason')->nullable();
            $table->unsignedBigInteger('rendered_hour_event_id')->nullable();
            $table->decimal('activity_hours', 8, 2)->nullable();
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

        Schema::create('campus_settings', function (Blueprint $table) {
            $table->id();
            $table->decimal('hourly_rate', 8, 2)->default(28);
            $table->decimal('weekly_standard_hours', 8, 2)->default(20);
            $table->decimal('weekly_extended_hours', 8, 2)->default(25);
            $table->decimal('monthly_max_hours', 8, 2)->default(100);
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
        });

        Schema::create('disciplinary_records', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('student_id');
            $table->string('penalty')->nullable();
            $table->string('status')->nullable();
            $table->timestamp('suspension_ends_at')->nullable();
            $table->string('suspension_length')->nullable();
            $table->text('suspension_reason')->nullable();
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

        DB::table('campus_settings')->insert([
            'hourly_rate' => 28,
            'weekly_standard_hours' => 20,
            'weekly_extended_hours' => 25,
            'monthly_max_hours' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
