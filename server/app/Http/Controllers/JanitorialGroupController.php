<?php

namespace App\Http\Controllers;

use App\Models\JanitorialGroup;
use App\Models\JanitorialLeader;
use App\Models\JanitorialSupervisorAbsence;
use App\Models\Notification;
use App\Models\User;
use App\Support\JanitorialApproval;
use App\Support\RenderedHours;
use App\Support\SuperAdminAudit;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class JanitorialGroupController extends Controller
{
    public function index(Request $request)
    {
        $actor = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);
        $query = JanitorialGroup::query()
            ->with([
                'supervisor.profile:id,user_id,student_id_number,year_level,assigned_office',
                'immediateSupervisor.profile:id,user_id,student_id_number,year_level,assigned_office',
                'members.profile:id,user_id,student_id_number,year_level,assigned_office',
            ])
            ->orderBy('area')
            ->orderBy('name');

        $manages = $accounts->canManageJanitorialGroups($actor);
        if (! $manages) {
            if ($actor->role === 'Immediate Supervisor') {
                $query->where('immediate_supervisor_user_id', $actor->id);
            } elseif ($accounts->usesSupervisorScope($actor)) {
                $areas = $accounts->supervisedOfficeAreas($actor);
                if ($areas === []) {
                    $query->whereRaw('0 = 1');
                } else {
                    $query->where(function ($builder) use ($areas, $accounts) {
                        foreach ($areas as $area) {
                            $aliases = $accounts->officeNames($area);
                            $builder->orWhereIn('department', $aliases);
                        }
                    });
                }
            }

            if ($actor->role === 'Student') {
                $query->where(function ($builder) use ($actor) {
                    $builder->where('supervisor_user_id', $actor->id)
                        ->orWhere('immediate_supervisor_user_id', $actor->id)
                        ->orWhereHas('members', fn ($members) => $members->where('users.id', $actor->id));
                });
            }
        }

        $groups = $query->get();
        $presented = $groups->map(fn (JanitorialGroup $group) => $this->present($group))->values();

        return response()->json([
            'groups' => $presented,
            'leaders' => $this->leaderPayloads($actor, $manages, $groups),
            'absence_requests' => $this->absencePayloads($actor, $manages),
        ]);
    }

    /** Janitorial supervisor asks to be marked absent. The WSPO coordinator approves it. */
    public function requestAbsence(Request $request)
    {
        $actor = $request->user();
        if ($actor->role !== 'Student' || ! Schema::hasTable('janitorial_leaders')) {
            return response()->json(['message' => 'Only a janitorial supervisor can request an absence.'], 403);
        }

        $leader = JanitorialLeader::query()->where('user_id', $actor->id)->first();
        if (! $leader) {
            return response()->json(['message' => 'Only a janitorial supervisor can request an absence.'], 403);
        }

        if (! Schema::hasTable('janitorial_supervisor_absences')) {
            return response()->json(['message' => 'Absence requests are not available yet.'], 503);
        }

        $validated = $request->validate([
            'absent_on' => 'required|date|after_or_equal:today',
            'reason' => 'required|string|max:500',
        ]);

        $day = Carbon::parse($validated['absent_on'])->toDateString();
        $reason = trim($validated['reason']);
        $existing = JanitorialSupervisorAbsence::query()
            ->where('user_id', $actor->id)
            ->whereDate('absent_on', $day)
            ->first();

        if ($existing && $existing->status === JanitorialSupervisorAbsence::PENDING) {
            return response()->json(['message' => 'You already have a pending absence request for that date.'], 422);
        }
        if ($existing && $existing->status === JanitorialSupervisorAbsence::APPROVED) {
            return response()->json(['message' => 'The WSPO coordinator already approved your absence for that date.'], 422);
        }

        $row = $existing ?? new JanitorialSupervisorAbsence(['user_id' => $actor->id]);
        $row->fill([
            'absent_on' => $day,
            'reason' => $reason,
            'status' => JanitorialSupervisorAbsence::PENDING,
            'decision_note' => null,
            'reviewed_by' => null,
            'reviewed_at' => null,
        ]);
        $row->save();

        $label = Carbon::parse($day)->format('M j, Y');
        foreach ($this->coordinators() as $coordinator) {
            Notification::create([
                'user_id' => $coordinator->id,
                'title' => 'Janitorial supervisor absence request',
                'message' => $actor->name.' requested to be absent on '.$label.'. Reason: '.$reason,
            ]);
        }

        return response()->json([
            'message' => 'Absence request sent. It takes effect after the WSPO coordinator approves it.',
            'absence' => $this->presentAbsence($row->fresh(['user', 'reviewer'])),
        ], 201);
    }

    /** WSPO coordinator approves or declines a janitorial supervisor's absence request. */
    public function decideAbsence(Request $request, JanitorialSupervisorAbsence $janitorialSupervisorAbsence)
    {
        $this->assertCanManage($request);
        if (! Schema::hasTable('janitorial_supervisor_absences')) {
            return response()->json(['message' => 'Absence requests are not available yet.'], 503);
        }

        $validated = $request->validate([
            'status' => 'required|in:Approved,Rejected',
            'decision_note' => 'nullable|string|max:500',
        ]);

        if ($janitorialSupervisorAbsence->status !== JanitorialSupervisorAbsence::PENDING) {
            return response()->json(['message' => 'This absence request was already decided.'], 422);
        }

        $reviewer = $request->user();
        $approved = $validated['status'] === JanitorialSupervisorAbsence::APPROVED;
        $janitorialSupervisorAbsence->update([
            'status' => $approved ? JanitorialSupervisorAbsence::APPROVED : JanitorialSupervisorAbsence::REJECTED,
            'decision_note' => trim((string) ($validated['decision_note'] ?? '')) ?: null,
            'reviewed_by' => $reviewer->id,
            'reviewed_at' => now(),
        ]);

        $day = Carbon::parse($janitorialSupervisorAbsence->absent_on);
        if ($approved && $day->isSameDay(now())) {
            JanitorialLeader::query()
                ->where('user_id', $janitorialSupervisorAbsence->user_id)
                ->update(['is_present' => false]);
        }

        $label = $day->format('M j, Y');
        $message = $approved
            ? 'The WSPO coordinator approved your absence for '.$label.'. Members record that duty as offline attendance.'
            : 'The WSPO coordinator declined your absence request for '.$label.'.';
        Notification::create([
            'user_id' => $janitorialSupervisorAbsence->user_id,
            'title' => $approved ? 'Janitorial absence approved' : 'Janitorial absence declined',
            'message' => $message,
        ]);

        return response()->json([
            'message' => $approved
                ? 'Absence approved. The janitorial supervisor is off duty on '.$label.'.'
                : 'Absence request declined.',
            'absence' => $this->presentAbsence($janitorialSupervisorAbsence->fresh(['user', 'reviewer'])),
        ]);
    }

    public function storeLeader(Request $request)
    {
        $this->assertCanManage($request);
        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
        ]);

        $leader = $this->appointLeader((int) $validated['user_id']);

        return response()->json([
            'message' => 'Janitorial leader added.',
            'leader' => $this->presentLeader($leader->load('user.profile'), collect()),
        ], 201);
    }

    public function updateLeader(Request $request, JanitorialLeader $janitorialLeader)
    {
        $this->assertCanManage($request);
        $request->validate([
            'is_present' => 'required|boolean',
        ]);

        $present = $request->boolean('is_present');
        $janitorialLeader->update([
            'is_present' => $present,
        ]);

        if ($present && Schema::hasTable('janitorial_supervisor_absences')) {
            JanitorialSupervisorAbsence::query()
                ->where('user_id', $janitorialLeader->user_id)
                ->where('status', JanitorialSupervisorAbsence::APPROVED)
                ->whereDate('absent_on', now()->toDateString())
                ->update([
                    'status' => JanitorialSupervisorAbsence::REJECTED,
                    'decision_note' => 'Marked present by the WSPO coordinator.',
                    'reviewed_by' => $request->user()->id,
                    'reviewed_at' => now(),
                ]);
        }

        return response()->json([
            'message' => $janitorialLeader->is_present
                ? 'Leader marked present. Members can use a photo or this leader\'s code.'
                : 'Leader marked absent. Members record duty as offline attendance with a time in and dated photos.',
            'leader' => $this->presentLeader($janitorialLeader->fresh()->load('user.profile')),
        ]);
    }

    public function destroyLeader(Request $request, JanitorialLeader $janitorialLeader)
    {
        $this->assertCanManage($request);

        DB::transaction(function () use ($janitorialLeader) {
            JanitorialGroup::query()
                ->where('supervisor_user_id', $janitorialLeader->user_id)
                ->get()
                ->each(fn (JanitorialGroup $group) => $group->delete());
            $janitorialLeader->delete();
        });

        return response()->json(['message' => 'Janitorial leader removed. Past attendance rows keep their credited hours.']);
    }

    public function store(Request $request)
    {
        $this->assertCanManage($request);
        $payload = $this->validatedPayload($request);

        $group = DB::transaction(function () use ($payload) {
            $this->appointLeader($payload['supervisor_user_id']);
            $group = JanitorialGroup::create([
                'department' => $payload['department'],
                'name' => $payload['name'],
                'area' => $payload['area'],
                'supervisor_user_id' => $payload['supervisor_user_id'],
                'immediate_supervisor_user_id' => $payload['immediate_supervisor_user_id'],
            ]);
            $group->members()->sync($payload['member_ids']);

            return $group;
        });

        return response()->json([
            'message' => 'Janitorial group saved.',
            'group' => $this->present($group->load(['supervisor.profile', 'immediateSupervisor.profile', 'members.profile'])),
        ], 201);
    }

    public function update(Request $request, JanitorialGroup $janitorialGroup)
    {
        $this->assertCanManage($request, $janitorialGroup);
        $payload = $this->validatedPayload($request, $janitorialGroup);

        DB::transaction(function () use ($janitorialGroup, $payload) {
            $this->appointLeader($payload['supervisor_user_id']);
            $janitorialGroup->update([
                'department' => $payload['department'],
                'name' => $payload['name'],
                'area' => $payload['area'],
                'supervisor_user_id' => $payload['supervisor_user_id'],
                'immediate_supervisor_user_id' => $payload['immediate_supervisor_user_id'],
            ]);
            $janitorialGroup->members()->sync($payload['member_ids']);
        });

        return response()->json([
            'message' => 'Janitorial group updated.',
            'group' => $this->present($janitorialGroup->fresh()->load(['supervisor.profile', 'immediateSupervisor.profile', 'members.profile'])),
        ]);
    }

    public function destroy(Request $request, JanitorialGroup $janitorialGroup)
    {
        $this->assertCanManage($request, $janitorialGroup);
        $janitorialGroup->delete();

        return response()->json(['message' => 'Janitorial group removed. Past attendance rows keep their credited hours.']);
    }

    private function assertCanManage(Request $request, ?JanitorialGroup $group = null): void
    {
        SuperAdminAudit::denyMutation($request);
        $actor = $request->user()->loadMissing('profile');
        if (! app(UserController::class)->canManageJanitorialGroups($actor)) {
            abort(403, 'Only the WSPO Coordinator can manage janitorial leaders and groups.');
        }
    }

    private function appointLeader(int $userId): JanitorialLeader
    {
        $student = User::query()->where('role', 'Student')->whereKey($userId)->first();
        if (! $student) {
            abort(422, 'Choose a working student as the janitorial leader.');
        }

        if (DB::table('janitorial_group_members')->where('user_id', $userId)->exists()) {
            abort(422, $student->name.' is already a member of a janitorial group.');
        }

        if (! Schema::hasTable('janitorial_leaders')) {
            return new JanitorialLeader(['user_id' => $userId]);
        }

        return JanitorialLeader::query()->firstOrCreate(['user_id' => $userId]);
    }

    /**
     * @return array{department: string, name: string, area: string, supervisor_user_id: int, immediate_supervisor_user_id: int, member_ids: list<int>}
     */
    private function validatedPayload(Request $request, ?JanitorialGroup $existing = null): array
    {
        $validated = $request->validate([
            'department' => 'required|string|max:120',
            'name' => 'nullable|string|max:80',
            'area' => 'required|string|max:120',
            'supervisor_user_id' => 'required|integer|exists:users,id',
            'immediate_supervisor_user_id' => 'nullable|integer|exists:users,id',
            'member_ids' => 'present|array|max:'.JanitorialGroup::MAX_MEMBERS,
            'member_ids.*' => 'integer|exists:users,id',
        ]);

        $area = trim($validated['area']);
        $name = trim((string) ($validated['name'] ?? ''));
        if ($area === '') {
            abort(422, 'Choose the area this group will clean.');
        }
        if ($name === '') {
            $name = $area;
        }

        $supervisorId = (int) $validated['supervisor_user_id'];
        $immediateId = (int) ($validated['immediate_supervisor_user_id'] ?? 0);
        $memberIds = collect($validated['member_ids'])
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        if (in_array($supervisorId, $memberIds, true)) {
            abort(422, 'The janitorial supervisor cannot also be listed as a member.');
        }

        if (count($memberIds) > JanitorialGroup::MAX_MEMBERS) {
            abort(422, 'A janitorial group may have at most '.JanitorialGroup::MAX_MEMBERS.' members.');
        }

        $supervisor = User::query()
            ->with('profile:id,user_id,assigned_office')
            ->where('role', 'Student')
            ->find($supervisorId);
        if (! $supervisor) {
            abort(422, 'The janitorial leader must be a working student.');
        }

        $department = trim((string) ($validated['department'] ?? ''));
        if ($department === '') {
            abort(422, 'Select the department area for this janitorial group.');
        }

        $otherGroups = JanitorialGroup::query()
            ->where('supervisor_user_id', $supervisorId)
            ->when($existing, fn ($query) => $query->where('id', '!=', $existing->id))
            ->get();

        if ($otherGroups->count() >= JanitorialGroup::MAX_GROUPS) {
            abort(422, 'A janitorial leader may handle at most '.JanitorialGroup::MAX_GROUPS.' groups, each in a different area.');
        }

        $areaKey = mb_strtolower($area);
        $sameArea = $otherGroups->first(fn (JanitorialGroup $group) => mb_strtolower(trim($group->area)) === $areaKey);
        if ($sameArea) {
            abort(422, 'This leader already has a group for '.$area.'. Each group must cover a different area.');
        }

        $students = User::query()
            ->with('profile:id,user_id,assigned_office,year_level')
            ->where('role', 'Student')
            ->whereIn('id', $memberIds)
            ->get()
            ->keyBy('id');

        if ($students->count() !== count($memberIds)) {
            abort(422, 'Every member of a janitorial group must be a working student.');
        }

        $immediate = JanitorialApproval::resolveImmediateSupervisor($department);
        if ($immediateId > 0 && $immediateId !== (int) $immediate->id) {
            abort(422, 'The immediate supervisor comes from the department area. '.$immediate->name.' covers '.$department.'.');
        }
        $immediateId = (int) $immediate->id;
        if ($immediateId === $supervisorId || in_array($immediateId, $memberIds, true)) {
            abort(422, 'The immediate supervisor is a different person from the janitorial supervisor and the members.');
        }
        $immediateBlock = JanitorialApproval::immediateSupervisorBlock($immediate);
        if ($immediateBlock) {
            abort(422, $immediateBlock);
        }
        if (Schema::hasTable('janitorial_leaders') && JanitorialLeader::query()->where('user_id', $immediateId)->exists()) {
            abort(422, $immediate->name.' is a janitorial supervisor and cannot be the immediate supervisor.');
        }
        if (JanitorialGroup::query()->where('supervisor_user_id', $immediateId)->exists()) {
            abort(422, $immediate->name.' is a janitorial supervisor and cannot be the immediate supervisor.');
        }
        $immediateIsMember = JanitorialGroup::query()
            ->whereHas('members', fn ($members) => $members->where('users.id', $immediateId))
            ->exists();
        if ($immediateIsMember) {
            abort(422, $immediate->name.' is already a member of a janitorial group.');
        }

        if (Schema::hasTable('janitorial_leaders') && $memberIds !== []) {
            $leaderMember = JanitorialLeader::query()->whereIn('user_id', $memberIds)->first();
            if ($leaderMember) {
                $nameOfLeader = $students->get($leaderMember->user_id)?->name ?? 'A selected student';
                abort(422, $nameOfLeader.' is a janitorial leader and cannot be added as a member.');
            }
        }

        $memberConflict = JanitorialGroup::query()
            ->when($existing, fn ($query) => $query->where('id', '!=', $existing->id))
            ->whereHas('members', fn ($members) => $members->whereIn('users.id', $memberIds))
            ->first();
        if ($memberConflict) {
            abort(422, 'A student can only belong to one janitorial group (conflict: '.$memberConflict->name.').');
        }

        $supervisesElsewhere = JanitorialGroup::query()
            ->when($existing, fn ($query) => $query->where('id', '!=', $existing->id))
            ->whereIn('supervisor_user_id', $memberIds)
            ->first();
        if ($supervisesElsewhere) {
            abort(422, 'A janitorial leader cannot also be a member of a group.');
        }

        return [
            'department' => $department,
            'name' => $name,
            'area' => $area,
            'supervisor_user_id' => $supervisorId,
            'immediate_supervisor_user_id' => $immediateId,
            'member_ids' => $memberIds,
        ];
    }

    /**
     * @param  \Illuminate\Support\Collection<int, JanitorialGroup>  $groups
     * @return list<array<string, mixed>>
     */
    private function leaderPayloads(User $actor, bool $manages, $groups): array
    {
        if (! Schema::hasTable('janitorial_leaders')) {
            return [];
        }

        $leaderQuery = JanitorialLeader::query()->with('user.profile');
        if (! $manages) {
            if ($actor->role === 'Student') {
                $leaderQuery->where('user_id', $actor->id);
            } else {
                $supervisorIds = $groups->pluck('supervisor_user_id')->unique()->filter()->values();
                if ($supervisorIds->isEmpty()) {
                    return [];
                }
                $leaderQuery->whereIn('user_id', $supervisorIds);
            }
        }

        $bySupervisor = $groups->groupBy('supervisor_user_id');

        return $leaderQuery->orderBy('id')->get()
            ->map(function (JanitorialLeader $leader) use ($bySupervisor) {
                $assigned = $bySupervisor->get($leader->user_id, collect());

                return $this->presentLeader($leader, $assigned);
            })
            ->values()
            ->all();
    }

    /**
     * @param  \Illuminate\Support\Collection<int, JanitorialGroup>  $groups
     */
    private function presentLeader(JanitorialLeader $leader, $groups = null): array
    {
        $groups = $groups ?? $leader->groups()->with(['supervisor.profile', 'members.profile'])->get();
        $leader->loadMissing('user.profile');
        $user = $leader->user;
        $presented = $groups
            ->sortBy(fn (JanitorialGroup $group) => mb_strtolower($group->area))
            ->values()
            ->map(fn (JanitorialGroup $group) => $this->present($group));

        return [
            'id' => $leader->id,
            'user' => $user ? $this->studentPayload($user) : null,
            'groups' => $presented,
            'group_count' => $presented->count(),
            'max_groups' => JanitorialGroup::MAX_GROUPS,
            'is_present' => (bool) ($leader->is_present ?? true),
        ];
    }

    private function present(JanitorialGroup $group): array
    {
        $group->loadMissing(['supervisor.profile', 'immediateSupervisor.profile', 'members.profile']);
        $supervisor = $group->supervisor;
        $immediate = $group->immediateSupervisor;
        $members = $group->members
            ->sortBy(fn (User $student) => mb_strtolower((string) $student->name))
            ->values()
            ->map(fn (User $student) => $this->studentPayload($student));

        return [
            'id' => $group->id,
            'department' => $group->department,
            'name' => $group->name,
            'area' => $group->area,
            'supervisor' => $supervisor ? $this->studentPayload($supervisor) : null,
            'immediate_supervisor' => $immediate ? $this->studentPayload($immediate) : null,
            'members' => $members,
            'member_count' => $members->count(),
            'max_members' => JanitorialGroup::MAX_MEMBERS,
            'max_groups' => JanitorialGroup::MAX_GROUPS,
            'leader_present' => JanitorialLeader::isOnDuty((int) $group->supervisor_user_id),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function absencePayloads(User $actor, bool $manages): array
    {
        if (! Schema::hasTable('janitorial_supervisor_absences')) {
            return [];
        }

        $query = JanitorialSupervisorAbsence::query()->with(['user:id,name', 'reviewer:id,name']);
        if ($manages) {
            $query->orderByRaw("CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END");
        } elseif ($actor->role === 'Student') {
            $query->where('user_id', $actor->id);
        } else {
            return [];
        }

        return $query->orderByDesc('absent_on')->limit(40)->get()
            ->map(fn (JanitorialSupervisorAbsence $row) => $this->presentAbsence($row))
            ->values()
            ->all();
    }

    private function presentAbsence(JanitorialSupervisorAbsence $row): array
    {
        $row->loadMissing(['user:id,name', 'reviewer:id,name']);

        return [
            'id' => $row->id,
            'user_id' => $row->user_id,
            'leader_name' => $row->user?->name,
            'absent_on' => optional($row->absent_on)?->toDateString(),
            'reason' => $row->reason,
            'status' => $row->status,
            'decision_note' => $row->decision_note,
            'reviewed_by' => $row->reviewer?->name,
            'reviewed_at' => $row->reviewed_at,
        ];
    }

    /**
     * @return \Illuminate\Support\Collection<int, User>
     */
    private function coordinators()
    {
        $accounts = app(UserController::class);

        return User::query()
            ->with('profile')
            ->where('role', 'WSPO Staff')
            ->get()
            ->filter(fn (User $user) => $accounts->canManageJanitorialGroups($user))
            ->values();
    }

    private function studentPayload(User $student): array
    {
        $year = $student->profile?->year_level;

        return [
            'id' => $student->id,
            'name' => $student->name,
            'student_id_number' => $student->profile?->student_id_number,
            'year_level' => $year,
            'year_label' => RenderedHours::yearLabel($year ? (int) $year : null),
            'assigned_office' => $student->profile?->assigned_office,
            'role' => $student->role,
        ];
    }
}
