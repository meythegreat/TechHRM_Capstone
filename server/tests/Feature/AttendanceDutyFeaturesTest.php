<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\ClassClockInRequest;
use App\Models\DailyToken;
use App\Models\ManualAttendanceRequest;
use App\Models\RenderedHourEntry;
use App\Models\RenderedHourEvent;
use App\Models\Schedule;
use App\Models\User;
use App\Models\UserProfile;
use App\Support\DutyHours;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceDutyFeaturesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createSchema();
        Carbon::setTestNow(Carbon::parse('2026-11-13 16:55:00')); // Friday
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_janitorial_leader_groups_span_departments_and_credit_four_hours_on_approval(): void
    {
        $wspo = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'WSPO Coord');
        $immediate = $this->makeUser('Immediate Supervisor', 'Registrar', 'Reg Secretary');
        $lead = $this->makeUser('Student', 'Registrar', 'Jan Lead');
        $regMember = $this->makeUser('Student', 'Registrar', 'Reg Member');
        $clinicMember = $this->makeUser('Student', 'Clinic', 'Clinic Member');
        $libMember = $this->makeUser('Student', 'Library', 'Lib Member');
        $ccsMember = $this->makeUser('Student', 'CCS Office', 'Ccs Member');
        $extraMember = $this->makeUser('Student', 'Guidance', 'Extra Member');
        $fourthMember = $this->makeUser('Student', 'Clinic', 'Fourth Member');

        Sanctum::actingAs($wspo);
        $leaderId = $this->postJson('/api/attendance/janitorial-leaders', [
            'user_id' => $lead->id,
        ])->assertCreated()
            ->assertJsonPath('leader.user.id', $lead->id)
            ->assertJsonPath('leader.group_count', 0)
            ->json('leader.id');

        $this->getJson('/api/attendance/janitorial-groups')
            ->assertOk()
            ->assertJsonPath('leaders.0.id', $leaderId)
            ->assertJsonPath('leaders.0.user.name', 'Jan Lead');

        // Members may come from any department. The leader is chosen first.
        $regGroupId = $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Registrar',
            'name' => 'East crew',
            'area' => 'East hallways',
            'supervisor_user_id' => $lead->id,
            'immediate_supervisor_user_id' => $immediate->id,
            'member_ids' => [$regMember->id, $clinicMember->id],
        ])->assertCreated()
            ->assertJsonPath('group.immediate_supervisor.id', $immediate->id)
            ->assertJsonPath('group.immediate_supervisor.name', 'Reg Secretary')
            ->assertJsonPath('group.max_members', 6)
            ->assertJsonPath('group.max_groups', 3)
            ->assertJsonPath('group.area', 'East hallways')
            ->json('group.id');

        $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Registrar',
            'name' => 'East again',
            'area' => 'East hallways',
            'supervisor_user_id' => $lead->id,
            'immediate_supervisor_user_id' => $immediate->id,
            'member_ids' => [$extraMember->id],
        ])->assertStatus(422);

        $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Registrar',
            'name' => 'Library clean',
            'area' => 'Stacks',
            'supervisor_user_id' => $lead->id,
            'immediate_supervisor_user_id' => $immediate->id,
            'member_ids' => [$libMember->id],
        ])->assertCreated();
        $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Registrar',
            'name' => 'CCS clean',
            'area' => 'Labs',
            'supervisor_user_id' => $lead->id,
            'immediate_supervisor_user_id' => $immediate->id,
            'member_ids' => [$ccsMember->id],
        ])->assertCreated();
        $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Registrar',
            'name' => 'Fourth area',
            'area' => 'Lobby',
            'supervisor_user_id' => $lead->id,
            'immediate_supervisor_user_id' => $immediate->id,
            'member_ids' => [$fourthMember->id],
        ])->assertStatus(422);

        Carbon::setTestNow(Carbon::parse('2026-11-13 17:15:00'));
        Sanctum::actingAs($lead);
        $regCode = $this->getJson('/api/attendance/janitorial-passcode?group_id='.$regGroupId)
            ->assertOk()
            ->json('token_code');
        $this->assertNotEmpty($regCode);

        Sanctum::actingAs($regMember);
        $clockIn = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $regCode,
            'method' => 'passcode',
        ])->assertOk();
        $attendanceId = $clockIn->json('attendance.id');
        $this->attachCleaningProofs($attendanceId);

        Carbon::setTestNow(Carbon::parse('2026-11-13 18:00:00'));
        Sanctum::actingAs($lead);
        $passcodeOut = $this->getJson('/api/attendance/janitorial-passcode?group_id='.$regGroupId)->json('token_code');
        Sanctum::actingAs($regMember);
        $this->putJson('/api/attendance/secure-clock-out/'.$attendanceId, [
            'token_code' => $passcodeOut,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('hours_rendered', 0);

        $pending = Attendance::query()->findOrFail($attendanceId);
        $this->assertSame('pending', $pending->status);
        $this->assertEquals(0.0, (float) $pending->rendered_hours);

        Sanctum::actingAs($lead);
        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, ['status' => 'accepted'])
            ->assertOk()
            ->assertJsonPath('entry.status', 'recommended');

        $recommended = Attendance::query()->findOrFail($attendanceId);
        $this->assertEquals(0.0, (float) $recommended->rendered_hours);
        $this->assertSame('recommended', $recommended->status);

        Sanctum::actingAs($immediate);
        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, ['status' => 'accepted'])
            ->assertOk()
            ->assertJsonPath('entry.status', 'accepted')
            ->assertJsonPath('entry.final_on_behalf', false);

        $accepted = Attendance::query()->findOrFail($attendanceId);
        $this->assertEquals(4.0, (float) $accepted->rendered_hours);
        $this->assertTrue(
            Carbon::parse($accepted->time_in)->addHours(4)->equalTo(Carbon::parse($accepted->time_out))
        );
    }

    public function test_janitorial_offline_request_credits_janitorial_type(): void
    {
        $coordinator = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'WSPO Coord');
        $officeSupervisor = $this->makeUser('Supervisor', 'Library', 'Lib Supervisor');
        $immediate = $this->makeUser('Immediate Supervisor', 'Library', 'Lib Secretary');
        $lead = $this->makeUser('Student', 'Library', 'Lib Lead');
        $member = $this->makeUser('Student', 'Library', 'Lib Member');

        Sanctum::actingAs($coordinator);
        $groupId = $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Library',
            'name' => 'Stacks',
            'area' => 'Second floor stacks',
            'supervisor_user_id' => $lead->id,
            'immediate_supervisor_user_id' => $immediate->id,
            'member_ids' => [$member->id],
        ])->assertCreated()->json('group.id');

        Sanctum::actingAs($member);
        Storage::fake('local');
        $this->post('/api/attendance/manual-requests', [
            'request_type' => 'janitorial',
            'shifts' => [
                ['date' => '2026-11-12', 'time_in' => '09:00', 'time_out' => '11:00'],
            ],
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $requestId = $this->post('/api/attendance/manual-requests', [
            'request_type' => 'janitorial',
            'shifts' => [
                [
                    'date' => '2026-11-12',
                    'time_in' => '09:00',
                    'time_out' => '11:00',
                    'before_photo' => UploadedFile::fake()->image('before.jpg', 640, 480),
                    'after_photo' => UploadedFile::fake()->image('after.jpg', 640, 480),
                    'before_captured_at' => '2026-11-12T09:00:00',
                    'after_captured_at' => '2026-11-12T11:00:00',
                    'capture_source' => 'live_camera',
                ],
            ],
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('request.request_type', 'janitorial')
            ->json('request.id');

        Sanctum::actingAs($officeSupervisor);
        $this->patchJson('/api/attendance/manual-requests/'.$requestId, [
            'status' => 'Approved',
        ])->assertForbidden();

        Sanctum::actingAs($lead);
        $this->getJson('/api/attendance/janitorial-offline-requests')
            ->assertOk()
            ->assertJsonPath('requests.0.id', $requestId);
        $this->patchJson('/api/attendance/janitorial-offline-requests/'.$requestId, [
            'status' => 'Approved',
        ])->assertOk()
            ->assertJsonPath('request.status', 'Recommended');
        $this->assertNull(Attendance::query()->where('user_id', $member->id)->first());

        Sanctum::actingAs($officeSupervisor);
        $this->patchJson('/api/attendance/janitorial-offline-requests/'.$requestId, [
            'status' => 'Approved',
        ])->assertForbidden();

        Sanctum::actingAs($immediate);
        $this->patchJson('/api/attendance/janitorial-offline-requests/'.$requestId, [
            'status' => 'Approved',
        ])->assertOk();

        $attendance = Attendance::query()->where('user_id', $member->id)->first();
        $this->assertNotNull($attendance);
        $this->assertSame('Janitorial', $attendance->attendance_type);
        $this->assertSame((int) $groupId, (int) $attendance->janitorial_group_id);
        $this->assertSame('Second floor stacks', $attendance->janitorial_area);
        $this->assertEquals(4.0, (float) $attendance->rendered_hours);
        $this->assertTrue(
            Carbon::parse($attendance->time_in)->addHours(4)->equalTo(Carbon::parse($attendance->time_out))
        );
        $this->assertNotEmpty($attendance->cleaning_before_path);
        $this->assertNotEmpty($attendance->cleaning_after_path);
        Storage::disk('local')->assertExists($attendance->cleaning_before_path);
        Storage::disk('local')->assertExists($attendance->cleaning_after_path);

        // Time in 16:30 with the clock at 16:55 credits a 20:30 clock-out, which is still later today.
        Sanctum::actingAs($member);
        $futureCreditId = $this->post('/api/attendance/manual-requests', [
            'request_type' => 'janitorial',
            'shifts' => [
                [
                    'date' => '2026-11-13',
                    'time_in' => '16:30',
                    'time_out' => '17:00',
                    'before_photo' => UploadedFile::fake()->image('before-late.jpg', 640, 480),
                    'after_photo' => UploadedFile::fake()->image('after-late.jpg', 640, 480),
                    'before_captured_at' => '2026-11-13T16:30:00',
                    'after_captured_at' => '2026-11-13T16:50:00',
                    'capture_source' => 'live_camera',
                ],
            ],
        ], ['Accept' => 'application/json'])->assertCreated()->json('request.id');

        Sanctum::actingAs($lead);
        $this->patchJson('/api/attendance/janitorial-offline-requests/'.$futureCreditId, [
            'status' => 'Approved',
        ])->assertOk();
        Sanctum::actingAs($immediate);
        $this->patchJson('/api/attendance/janitorial-offline-requests/'.$futureCreditId, [
            'status' => 'Approved',
        ])->assertOk();

        $late = Attendance::query()->where('user_id', $member->id)->orderByDesc('id')->first();
        $this->assertTrue(Carbon::parse($late->time_in)->addHours(4)->equalTo(Carbon::parse($late->time_out)));
        $this->assertTrue(Carbon::parse($late->time_out)->greaterThan(Carbon::parse('2026-11-13 16:55:00')));
    }

    public function test_only_coordinator_can_manage_janitorial_leaders_and_groups(): void
    {
        $coordinator = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'Coord');
        $secretary = $this->makeUser('WSPO Staff', 'WSPO Secretary', 'Secretary');
        $president = $this->makeUser('WSPO Staff', 'WSPO President', 'President');
        $supervisor = $this->makeUser('Supervisor', 'Library', 'Lib Supervisor');
        $immediate = $this->makeUser('Immediate Supervisor', 'Library', 'Lib Secretary');
        $lead = $this->makeUser('Student', 'Library', 'Lib Lead');
        $member = $this->makeUser('Student', 'Library', 'Lib Member');
        $payload = [
            'department' => 'Library',
            'name' => 'Stacks',
            'area' => 'Second floor',
            'supervisor_user_id' => $lead->id,
            'immediate_supervisor_user_id' => $immediate->id,
            'member_ids' => [$member->id],
        ];

        $accounts = app(\App\Http\Controllers\UserController::class);
        $this->assertTrue($accounts->canManageJanitorialGroups($coordinator));
        $this->assertFalse($accounts->canManageJanitorialGroups($secretary));
        $this->assertFalse($accounts->canManageJanitorialGroups($president));
        $this->assertFalse($accounts->canManageJanitorialGroups($supervisor));

        Sanctum::actingAs($supervisor);
        $this->postJson('/api/attendance/janitorial-groups', $payload)->assertForbidden();
        $this->postJson('/api/attendance/janitorial-leaders', ['user_id' => $lead->id])->assertForbidden();

        Sanctum::actingAs($president);
        $this->postJson('/api/attendance/janitorial-groups', $payload)->assertForbidden();

        Sanctum::actingAs($secretary);
        $this->getJson('/api/user')
            ->assertOk()
            ->assertJsonPath('can_manage_janitorial_groups', false);
        $this->postJson('/api/attendance/janitorial-leaders', ['user_id' => $lead->id])->assertForbidden();
        $this->postJson('/api/attendance/janitorial-groups', $payload)->assertForbidden();

        Sanctum::actingAs($coordinator);
        $this->getJson('/api/user')
            ->assertOk()
            ->assertJsonPath('can_manage_janitorial_groups', true);
        $leaderId = $this->postJson('/api/attendance/janitorial-leaders', ['user_id' => $lead->id])
            ->assertCreated()
            ->json('leader.id');
        $groupId = $this->postJson('/api/attendance/janitorial-groups', $payload)
            ->assertCreated()
            ->json('group.id');

        $this->putJson('/api/attendance/janitorial-groups/'.$groupId, [
            'department' => 'Library',
            'name' => 'Stacks East',
            'area' => 'East wing',
            'supervisor_user_id' => $lead->id,
            'immediate_supervisor_user_id' => $immediate->id,
            'member_ids' => [$member->id],
        ])->assertOk();

        Sanctum::actingAs($supervisor);
        $this->deleteJson('/api/attendance/janitorial-groups/'.$groupId)->assertForbidden();
        $this->deleteJson('/api/attendance/janitorial-leaders/'.$leaderId)->assertForbidden();

        Sanctum::actingAs($coordinator);
        $this->deleteJson('/api/attendance/janitorial-leaders/'.$leaderId)->assertOk();
        $this->assertNull(\App\Models\JanitorialGroup::query()->find($groupId));
    }

    public function test_dean_is_not_the_immediate_supervisor_and_covers_only_after_advance_notice(): void
    {
        $coordinator = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'Coord');
        $dean = $this->makeUser('Supervisor', 'Library', 'Library Dean');
        $immediate = $this->makeUser('Immediate Supervisor', 'Library', 'Library Secretary');
        $lead = $this->makeUser('Student', 'Library', 'Lead');
        $member = $this->makeUser('Student', 'Library', 'Member');

        Sanctum::actingAs($coordinator);
        $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Library',
            'name' => 'Stacks',
            'area' => 'Second floor',
            'supervisor_user_id' => $lead->id,
            'immediate_supervisor_user_id' => $dean->id,
            'member_ids' => [$member->id],
        ])->assertStatus(422);

        $groupId = $this->postJson('/api/attendance/janitorial-groups', [
            'department' => 'Library',
            'name' => 'Stacks',
            'area' => 'Second floor',
            'supervisor_user_id' => $lead->id,
            'immediate_supervisor_user_id' => $immediate->id,
            'member_ids' => [$member->id],
        ])->assertCreated()->json('group.id');

        Carbon::setTestNow(Carbon::parse('2026-11-13 17:15:00'));
        Sanctum::actingAs($lead);
        $code = $this->getJson('/api/attendance/janitorial-passcode?group_id='.$groupId)->json('token_code');
        Sanctum::actingAs($member);
        $attendanceId = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk()->json('attendance.id');
        $this->attachCleaningProofs($attendanceId);
        Carbon::setTestNow(Carbon::parse('2026-11-13 18:00:00'));
        Sanctum::actingAs($lead);
        $out = $this->getJson('/api/attendance/janitorial-passcode?group_id='.$groupId)->json('token_code');
        Sanctum::actingAs($member);
        $this->putJson('/api/attendance/secure-clock-out/'.$attendanceId, [
            'token_code' => $out,
            'method' => 'passcode',
        ])->assertOk();

        Sanctum::actingAs($lead);
        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, [
            'status' => 'accepted',
            'deducted_hours' => 0.5,
            'remarks' => 'Short break.',
        ])->assertOk();

        Sanctum::actingAs($dean);
        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, ['status' => 'accepted'])
            ->assertForbidden();
        $this->postJson('/api/attendance/janitorial-immediate-absence', [
            'absent_on' => '2026-11-14',
            'absent' => true,
        ])->assertForbidden();

        Sanctum::actingAs($immediate);
        $this->postJson('/api/attendance/janitorial-immediate-absence', [
            'absent_on' => '2026-11-13',
            'absent' => true,
        ])->assertStatus(422);
        Carbon::setTestNow(Carbon::parse('2026-11-12 09:00:00'));
        $this->postJson('/api/attendance/janitorial-immediate-absence', [
            'absent_on' => '2026-11-13',
            'absent' => true,
            'reason' => 'Campus activity',
        ])->assertOk()
            ->assertJsonPath('absences.0', '2026-11-13');

        Carbon::setTestNow(Carbon::parse('2026-11-13 18:10:00'));
        Sanctum::actingAs($dean);
        $this->patchJson('/api/attendance/janitorial-reviews/'.$attendanceId, ['status' => 'accepted'])
            ->assertOk()
            ->assertJsonPath('entry.final_on_behalf', true)
            ->assertJsonPath('entry.rendered_hours', 3.5);

        $accepted = Attendance::query()->findOrFail($attendanceId);
        $this->assertEquals(3.5, (float) $accepted->rendered_hours);
        $this->assertTrue((bool) $accepted->janitorial_final_on_behalf);
        $this->assertTrue(
            Carbon::parse($accepted->time_in)->addMinutes(210)->equalTo(Carbon::parse($accepted->time_out))
        );

        Storage::fake('local');
        Sanctum::actingAs($lead);
        $this->post('/api/attendance/janitorial-supervision', [
            'group_id' => $groupId,
            'capture_source' => 'live_camera',
            'captured_at' => '2026-11-13T08:00:00+08:00',
            'photo' => UploadedFile::fake()->image('presence.jpg', 640, 480),
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->post('/api/attendance/janitorial-supervision', [
            'group_id' => $groupId,
            'capture_source' => 'live_camera',
            'captured_at' => '2026-11-13T08:30:00+08:00',
            'photo' => UploadedFile::fake()->image('presence-again.jpg', 640, 480),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $supervision = Attendance::query()
            ->where('user_id', $lead->id)
            ->where('janitorial_supervision', true)
            ->first();
        $this->assertNotNull($supervision);
        $this->assertEquals(0.0, (float) $supervision->rendered_hours);
        $this->assertSame('awaiting_final', $supervision->status);
        $this->assertNotEmpty($supervision->cleaning_before_path);

        Sanctum::actingAs($dean);
        $this->patchJson('/api/attendance/janitorial-reviews/'.$supervision->id, ['status' => 'accepted'])
            ->assertOk()
            ->assertJsonPath('entry.final_on_behalf', true);

        $credited = Attendance::query()->findOrFail($supervision->id);
        $this->assertEquals(4.0, (float) $credited->rendered_hours);
        $this->assertSame('Janitorial', $credited->attendance_type);
    }

    public function test_assembly_students_must_use_year_representative_code(): void
    {
        $staff = $this->makeUser('WSPO Staff', 'WSPO Coordinator', 'WSPO Coord');
        $repY1 = $this->makeUser('Student', 'Library', 'Year One Rep');
        $repY1->profile->update(['year_level' => '1']);
        $studentY1 = $this->makeUser('Student', 'Library', 'Year One Student');
        $studentY1->profile->update(['year_level' => '1']);
        $studentY2 = $this->makeUser('Student', 'Library', 'Year Two Student');
        $studentY2->profile->update(['year_level' => '2']);

        Sanctum::actingAs($staff);
        $this->putJson('/api/attendance/assembly-year-representatives', [
            'year_level' => 1,
            'user_id' => $repY1->id,
        ])->assertOk();

        $event = RenderedHourEvent::create([
            'kind' => RenderedHourEvent::ASSEMBLY,
            'title' => 'General assembly',
            'event_date' => '2026-11-13',
            'hours' => 5,
            'starts_at' => '08:00',
            'ends_at' => '12:00',
            'created_by' => $staff->id,
        ]);
        foreach ([$studentY1->id, $studentY2->id, $repY1->id] as $uid) {
            RenderedHourEntry::create([
                'event_id' => $event->id,
                'user_id' => $uid,
                'hours_delta' => 0,
                'status' => RenderedHourEntry::SELECTED,
            ]);
        }
        $eventId = $event->id;

        // Staff cannot issue assembly codes (rep-only).
        Sanctum::actingAs($staff);
        $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId)
            ->assertForbidden();

        Carbon::setTestNow(Carbon::parse('2026-11-13 08:15:00'));
        Sanctum::actingAs($repY1);
        $code = $this->getJson('/api/attendance/activity-passcode?event_id='.$eventId)
            ->assertOk()
            ->json('token_code');

        Sanctum::actingAs($studentY1);
        $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertOk()
            ->assertJsonPath('activity', true);

        Sanctum::actingAs($studentY2);
        $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $code,
            'method' => 'passcode',
        ])->assertForbidden()
            ->assertJsonPath('requires_year_representative', true);
    }

    public function test_regular_auto_clock_out_window_and_overtime_cap_and_library_no_lunch(): void
    {
        $this->assertSame(10, DutyHours::AUTO_CLOCK_OUT_WINDOW_MINUTES);

        $officeSupervisor = $this->makeUser('Supervisor', 'Registrar', 'Reg Supervisor');
        $student = $this->makeUser('Student', 'Registrar', 'Reg Student');
        $libraryStudent = $this->makeUser('Student', 'Library', 'Lib Student');

        Schedule::create([
            'user_id' => $student->id,
            'kind' => 'work',
            'day' => 'Friday',
            'time' => '08:00 - 17:00',
            'duty_type' => 'Clerical',
        ]);
        Schedule::create([
            'user_id' => $libraryStudent->id,
            'kind' => 'work',
            'day' => 'Friday',
            'time' => '13:00 - 17:00',
            'duty_type' => 'Library Assistant',
        ]);

        // Lunch deducted for non-Library (08:00–17:00 spans 12–13 → 8h not 9h).
        $start = Carbon::parse('2026-11-13 08:00:00');
        $end = Carbon::parse('2026-11-13 17:00:00');
        $this->assertEquals(8.0, DutyHours::creditedHours($start, $end, 'Registrar'));
        $this->assertEquals(9.0, DutyHours::creditedHours($start, $end, 'Library'));

        $token = DailyToken::create([
            'token_code' => 'ABCDEF',
            'type' => 'Daily Clock',
            'channel' => 'passcode',
            'generated_by' => $officeSupervisor->id,
            'expires_at' => Carbon::now()->addMinutes(5),
            'created_at' => Carbon::now(),
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-13 08:00:00'));
        $token->update(['expires_at' => Carbon::now()->addMinutes(5), 'created_at' => Carbon::now()]);
        Sanctum::actingAs($student);
        $attendanceId = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $token->token_code,
            'method' => 'passcode',
        ])->assertOk()->json('attendance.id');

        // Overtime: clock out at 17:30 → credit capped at 17:00, then lunch → 8h.
        Carbon::setTestNow(Carbon::parse('2026-11-13 17:30:00'));
        $token->update(['expires_at' => Carbon::now()->addMinutes(5), 'created_at' => Carbon::now()]);
        $out = $this->putJson('/api/attendance/secure-clock-out/'.$attendanceId, [
            'token_code' => $token->token_code,
            'method' => 'passcode',
        ])->assertOk();
        $this->assertEquals(8.0, (float) $out->json('hours_rendered'));
        $this->assertNotNull(Attendance::query()->find($attendanceId)->time_out);

        // Library auto clock-out within 10-minute window snaps to scheduled end.
        $libSupervisor = $this->makeUser('Supervisor', 'Library', 'Lib Code Owner');
        Carbon::setTestNow(Carbon::parse('2026-11-13 13:00:00'));
        $libToken = DailyToken::create([
            'token_code' => 'LIB001',
            'type' => 'Daily Clock',
            'channel' => 'passcode',
            'generated_by' => $libSupervisor->id,
            'expires_at' => Carbon::now()->addMinutes(5),
            'created_at' => Carbon::now(),
        ]);
        Sanctum::actingAs($libraryStudent);
        $libAttendanceId = $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $libToken->token_code,
            'method' => 'passcode',
        ])->assertOk()->json('attendance.id');

        Carbon::setTestNow(Carbon::parse('2026-11-13 16:55:00'));
        $libToken->update(['expires_at' => Carbon::now()->addMinutes(5), 'created_at' => Carbon::now()]);
        $auto = $this->putJson('/api/attendance/secure-clock-out/'.$libAttendanceId, [
            'token_code' => $libToken->token_code,
            'method' => 'passcode',
            'auto_clock_out' => true,
        ])->assertOk();
        $this->assertEquals(4.0, (float) $auto->json('hours_rendered'));
        $this->assertSame(10, (int) $auto->json('auto_clock_out_window_minutes'));
    }

    public function test_class_hours_duty_requires_supervisor_approval(): void
    {
        $supervisor = $this->makeUser('Supervisor', 'CCS Office', 'CCS Supervisor');
        $student = $this->makeUser('Student', 'CCS Office', 'CCS Student');

        Schedule::create([
            'user_id' => $student->id,
            'kind' => 'class',
            'day' => 'Friday',
            'time' => '09:00 - 11:00',
            'subject' => 'Algorithms',
        ]);
        Schedule::create([
            'user_id' => $student->id,
            'kind' => 'work',
            'day' => 'Friday',
            'time' => '08:00 - 12:00',
            'duty_type' => 'Clerical',
        ]);

        $token = DailyToken::create([
            'token_code' => 'CLASS1',
            'type' => 'Daily Clock',
            'channel' => 'passcode',
            'generated_by' => $supervisor->id,
            'expires_at' => Carbon::now()->addMinutes(5),
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-13 10:00:00'));
        Sanctum::actingAs($student);
        $this->postJson('/api/attendance/secure-clock-in', [
            'token_code' => $token->token_code,
            'method' => 'passcode',
        ])->assertForbidden()
            ->assertJsonPath('requires_class_hours_approval', true);

        $requestId = $this->postJson('/api/attendance/manual-requests', [
            'request_type' => 'class_hours',
            'shifts' => [
                ['date' => '2026-11-13', 'time_in' => '09:30', 'time_out' => '10:30'],
            ],
        ])->assertCreated()
            ->assertJsonPath('request.request_type', 'class_hours')
            ->json('request.id');

        $this->assertSame(0, Attendance::query()->where('user_id', $student->id)->count());

        Sanctum::actingAs($supervisor);
        $this->patchJson('/api/attendance/manual-requests/'.$requestId, [
            'status' => 'Approved',
        ])->assertOk();

        $this->assertSame(1, Attendance::query()->where('user_id', $student->id)->count());
        $this->assertEquals(1.0, (float) Attendance::query()->where('user_id', $student->id)->value('rendered_hours'));
        $this->assertSame(ManualAttendanceRequest::APPROVED, ManualAttendanceRequest::query()->find($requestId)->status);
    }

    public function test_class_clock_in_request_opens_a_normal_shift_after_supervisor_approval(): void
    {
        $supervisor = $this->makeUser('Supervisor', 'CCS Office', 'CCS Supervisor');
        $other = $this->makeUser('Supervisor', 'Library', 'Library Supervisor');
        $student = $this->makeUser('Student', 'CCS Office', 'CCS Student');

        $class = Schedule::create([
            'user_id' => $student->id,
            'kind' => 'class',
            'day' => 'Friday',
            'time' => '09:00 - 11:00',
            'subject' => 'Algorithms',
            'room' => 'CCS 201',
            'instructor' => 'Dr. Reyes',
        ]);
        $work = Schedule::create([
            'user_id' => $student->id,
            'kind' => 'work',
            'day' => 'Friday',
            'time' => '08:00 - 12:00',
            'duty_type' => 'Clerical',
        ]);
        Schedule::create([
            'user_id' => $student->id,
            'kind' => 'class',
            'day' => 'Monday',
            'time' => '13:00 - 15:00',
            'subject' => 'Databases',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-13 10:00:00'));
        Sanctum::actingAs($student);

        $this->postJson('/api/attendance/class-clock-in-requests', [
            'schedule_id' => $class->id,
            'reason' => '   ',
        ])->assertStatus(422);

        $this->getJson('/api/attendance/class-clock-in-requests/classes')
            ->assertOk()
            ->assertJsonPath('classes.0.subject', 'Algorithms')
            ->assertJsonPath('classes.0.in_session', true)
            ->assertJsonPath('classes.0.room', 'CCS 201')
            ->assertJsonPath('classes.0.instructor', 'Dr. Reyes');

        $monday = Schedule::query()->where('subject', 'Databases')->first();
        $this->postJson('/api/attendance/class-clock-in-requests', [
            'schedule_id' => $monday->id,
            'reason' => 'Teacher is out.',
        ])->assertStatus(422);

        $requestId = $this->postJson('/api/attendance/class-clock-in-requests', [
            'schedule_id' => $class->id,
            'reason' => 'The instructor did not meet, so I am rendering duty.',
        ])->assertCreated()
            ->assertJsonPath('request.status', 'Pending')
            ->assertJsonPath('request.class.subject', 'Algorithms')
            ->json('request.id');

        $this->assertSame(0, Attendance::query()->where('user_id', $student->id)->count());

        $this->postJson('/api/attendance/class-clock-in-requests', [
            'schedule_id' => $class->id,
            'reason' => 'Second request should wait.',
        ])->assertStatus(422);

        Sanctum::actingAs($other);
        $this->getJson('/api/attendance/class-clock-in-requests')
            ->assertOk()
            ->assertJsonCount(0, 'requests');
        $this->patchJson('/api/attendance/class-clock-in-requests/'.$requestId, [
            'status' => 'Approved',
        ])->assertForbidden();

        Sanctum::actingAs($supervisor);
        $this->getJson('/api/attendance/class-clock-in-requests')
            ->assertOk()
            ->assertJsonPath('requests.0.id', $requestId)
            ->assertJsonPath('requests.0.student_name', 'CCS Student')
            ->assertJsonPath('requests.0.assigned_office', 'CCS Office')
            ->assertJsonPath('requests.0.class.room', 'CCS 201');

        $this->patchJson('/api/attendance/class-clock-in-requests/'.$requestId, [
            'status' => 'Approved',
        ])->assertOk();

        $attendance = Attendance::query()->where('user_id', $student->id)->first();
        $this->assertNotNull($attendance);
        $this->assertNull($attendance->time_out);
        $this->assertSame('pending', $attendance->status);
        $this->assertSame('Regular', $attendance->attendance_type);
        $this->assertSame($work->id, (int) $attendance->schedule_id);
        $this->assertSame(ClassClockInRequest::APPROVED, ClassClockInRequest::query()->find($requestId)->status);
        $this->assertSame($attendance->id, (int) ClassClockInRequest::query()->find($requestId)->attendance_id);

        $this->getJson('/api/attendance/student/'.$student->id)
            ->assertOk()
            ->assertJsonPath('history.0.id', $attendance->id);

        Carbon::setTestNow(Carbon::parse('2026-11-13 11:00:00'));
        $token = DailyToken::create([
            'token_code' => 'CLASSIN',
            'type' => 'Daily Clock',
            'channel' => 'passcode',
            'generated_by' => $supervisor->id,
            'expires_at' => Carbon::now()->addMinutes(5),
        ]);
        Sanctum::actingAs($student);
        $out = $this->putJson('/api/attendance/secure-clock-out/'.$attendance->id, [
            'token_code' => $token->token_code,
            'method' => 'passcode',
        ])->assertOk();

        $this->assertEquals(1.0, (float) $out->json('hours_rendered'));
        $closed = Attendance::query()->find($attendance->id);
        $this->assertNotNull($closed->time_out);
        $this->assertEquals(1.0, (float) $closed->rendered_hours);
        $this->assertSame('approved', $closed->status);

        $history = $this->getJson('/api/attendance/my-history')->assertOk();
        $this->assertEquals(1.0, (float) $history->json('history.0.rendered_hours'));
        $this->assertSame($attendance->id, $history->json('history.0.id'));
    }

    public function test_rejected_class_clock_in_request_does_not_touch_the_dtr(): void
    {
        $supervisor = $this->makeUser('Supervisor', 'CCS Office', 'CCS Supervisor');
        $student = $this->makeUser('Student', 'CCS Office', 'CCS Student');
        $class = Schedule::create([
            'user_id' => $student->id,
            'kind' => 'class',
            'day' => 'Friday',
            'time' => '09:00 - 11:00',
            'subject' => 'Algorithms',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-13 10:00:00'));
        Sanctum::actingAs($student);
        $requestId = $this->postJson('/api/attendance/class-clock-in-requests', [
            'schedule_id' => $class->id,
            'reason' => 'Teacher did not arrive.',
        ])->assertCreated()->json('request.id');

        Sanctum::actingAs($supervisor);
        $this->patchJson('/api/attendance/class-clock-in-requests/'.$requestId, [
            'status' => 'Rejected',
        ])->assertOk();

        $this->assertSame(0, Attendance::query()->where('user_id', $student->id)->count());
        $this->assertSame(ClassClockInRequest::REJECTED, ClassClockInRequest::query()->find($requestId)->status);
    }

    private function attachCleaningProofs(int $attendanceId): void
    {
        Storage::fake('local');
        foreach (['before', 'after'] as $phase) {
            $this->post('/api/attendance/'.$attendanceId.'/cleaning-proof', [
                'phase' => $phase,
                'capture_source' => 'live_camera',
                'captured_at' => now()->toIso8601String(),
                'photo' => UploadedFile::fake()->image($phase.'.jpg', 640, 480),
            ], ['Accept' => 'application/json'])->assertCreated();
        }
    }

    private function makeUser(string $role, ?string $office = null, ?string $name = null): User
    {
        $user = User::create([
            'name' => $name ?: $role.' User',
            'username' => strtolower(str_replace(' ', '.', $name ?: $role)).'.'.uniqid(),
            'password' => 'password',
            'role' => $role,
        ]);

        UserProfile::create([
            'user_id' => $user->id,
            'assigned_office' => $office,
            'supervised_departments' => $role === 'Supervisor' && $office ? [$office] : null,
            'duty_type' => $role === 'Student' ? 'Clerical' : null,
            'year_level' => $role === 'Student' ? '2' : null,
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
            $table->json('supervised_departments')->nullable();
            $table->string('duty_type')->nullable();
            $table->string('student_id_number')->nullable();
            $table->string('year_level')->nullable();
            $table->timestamps();
        });

        Schema::create('campus_settings', function (Blueprint $table) {
            $table->id();
            $table->decimal('hourly_rate', 8, 2)->default(28);
            $table->decimal('weekly_standard_hours', 8, 2)->default(20);
            $table->decimal('weekly_extended_hours', 8, 2)->default(25);
            $table->decimal('monthly_max_hours', 8, 2)->default(100);
            $table->timestamps();
        });
        DB::table('campus_settings')->insert([
            'hourly_rate' => 28,
            'weekly_standard_hours' => 40,
            'weekly_extended_hours' => 50,
            'monthly_max_hours' => 200,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Schema::create('disciplinary_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $table->string('status')->nullable();
            $table->string('penalty')->nullable();
            $table->decimal('penalty_hours', 8, 2)->default(0);
            $table->date('incident_date')->nullable();
            $table->timestamp('suspension_ends_at')->nullable();
            $table->timestamps();
        });

        Schema::create('janitorial_leaders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->boolean('is_present')->default(true);
            $table->timestamps();
        });

        Schema::create('janitorial_groups', function (Blueprint $table) {
            $table->id();
            $table->string('department', 120);
            $table->string('name', 80);
            $table->string('area', 120);
            $table->foreignId('supervisor_user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('immediate_supervisor_user_id')->nullable();
            $table->timestamps();
        });

        Schema::create('janitorial_group_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained('janitorial_groups')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique('user_id');
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
            $table->decimal('computed_hours', 8, 2)->nullable();
            $table->string('work_type')->nullable();
            $table->text('task_description')->nullable();
            $table->string('status')->nullable();
            $table->boolean('is_anomaly')->default(false);
            $table->string('anomaly_reason')->nullable();
            $table->unsignedBigInteger('rendered_hour_event_id')->nullable();
            $table->float('activity_hours')->nullable();
            $table->unsignedBigInteger('schedule_id')->nullable();
            $table->unsignedBigInteger('janitorial_group_id')->nullable();
            $table->string('janitorial_area', 120)->nullable();
            $table->string('janitorial_leader_decision', 20)->nullable();
            $table->decimal('janitorial_deducted_hours', 8, 2)->nullable();
            $table->text('janitorial_leader_remarks')->nullable();
            $table->unsignedBigInteger('janitorial_leader_reviewed_by')->nullable();
            $table->timestamp('janitorial_leader_reviewed_at')->nullable();
            $table->unsignedBigInteger('janitorial_final_by')->nullable();
            $table->boolean('janitorial_final_on_behalf')->default(false);
            $table->boolean('janitorial_supervision')->default(false);
            $table->string('cleaning_before_path', 500)->nullable();
            $table->string('cleaning_after_path', 500)->nullable();
            $table->timestamp('cleaning_before_captured_at')->nullable();
            $table->timestamp('cleaning_after_captured_at')->nullable();
            $table->timestamps();
        });

        Schema::create('manual_attendance_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('client_request_id', 80)->nullable();
            $table->string('request_type', 40)->default('regular');
            $table->string('reason', 1000)->default('Office had no internet; submitted for supervisor approval.');
            $table->string('status', 20)->default('Pending');
            $table->text('decision_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('janitorial_leader_decision', 20)->nullable();
            $table->decimal('janitorial_deducted_hours', 8, 2)->nullable();
            $table->text('janitorial_leader_remarks')->nullable();
            $table->unsignedBigInteger('janitorial_leader_reviewed_by')->nullable();
            $table->timestamp('janitorial_leader_reviewed_at')->nullable();
            $table->boolean('janitorial_final_on_behalf')->default(false);
            $table->timestamps();
        });

        Schema::create('janitorial_immediate_absences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('absent_on');
            $table->string('reason', 500)->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'absent_on']);
        });

        Schema::create('manual_attendance_request_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('manual_attendance_request_id')->constrained('manual_attendance_requests')->cascadeOnDelete();
            $table->date('work_date');
            $table->string('time_in', 5);
            $table->string('time_out', 5);
            $table->string('janitorial_area', 120)->nullable();
            $table->unsignedBigInteger('janitorial_group_id')->nullable();
            $table->string('before_photo_path', 500)->nullable();
            $table->string('after_photo_path', 500)->nullable();
            $table->timestamp('before_captured_at')->nullable();
            $table->timestamp('after_captured_at')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->foreignId('attendance_id')->nullable()->constrained('attendances')->nullOnDelete();
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

        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind')->default('work');
            $table->string('day')->nullable();
            $table->string('time')->nullable();
            $table->string('duty_type')->nullable();
            $table->string('department')->nullable();
            $table->string('supervisor')->nullable();
            $table->string('subject')->nullable();
            $table->string('room')->nullable();
            $table->string('instructor')->nullable();
            $table->timestamps();
        });

        Schema::create('daily_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('token_code');
            $table->string('type')->nullable();
            $table->string('channel')->nullable();
            $table->string('description')->nullable();
            $table->unsignedBigInteger('event_id')->nullable();
            $table->foreignId('generated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });

        Schema::create('extra_hours_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->string('department')->nullable();
            $table->string('status', 20)->default('Draft');
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->decimal('approved_hours', 8, 2)->default(25);
            $table->timestamps();
        });

        Schema::create('extra_hours_request_students', function (Blueprint $table) {
            $table->id();
            $table->foreignId('extra_hours_request_id')->constrained('extra_hours_requests')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
        });

        Schema::create('hour_limit_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('week_start')->nullable();
            $table->decimal('approved_hours', 8, 2)->nullable();
            $table->string('status')->default('pending');
            $table->timestamps();
        });

        Schema::create('rendered_hour_events', function (Blueprint $table) {
            $table->id();
            $table->string('kind')->nullable();
            $table->string('title')->nullable();
            $table->date('event_date')->nullable();
            $table->decimal('hours', 8, 2)->default(0);
            $table->string('direction')->nullable();
            $table->unsignedTinyInteger('year_level')->nullable();
            $table->string('group_name')->nullable();
            $table->unsignedBigInteger('group_id')->nullable();
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
            $table->float('hours_delta')->default(0);
            $table->string('status')->nullable();
            $table->timestamp('scanned_at')->nullable();
            $table->unsignedBigInteger('attendance_id')->nullable();
            $table->timestamps();
        });

        Schema::create('class_clock_in_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('schedule_id')->nullable();
            $table->string('class_day')->nullable();
            $table->string('class_time')->nullable();
            $table->string('class_subject')->nullable();
            $table->string('class_room')->nullable();
            $table->string('class_instructor')->nullable();
            $table->string('reason', 1000);
            $table->string('status', 20)->default('Pending');
            $table->text('decision_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('attendance_id')->nullable()->constrained('attendances')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('assembly_year_representatives', function (Blueprint $table) {
            $table->id();
            $table->unsignedTinyInteger('year_level');
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique('year_level');
            $table->unique('user_id');
        });
    }
}
