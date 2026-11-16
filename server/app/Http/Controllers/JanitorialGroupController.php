<?php

namespace App\Http\Controllers;

use App\Models\JanitorialGroup;
use App\Models\JanitorialLeader;
use App\Models\User;
use App\Support\RenderedHours;
use App\Support\SuperAdminAudit;
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
            ->with(['supervisor.profile:id,user_id,student_id_number,year_level,assigned_office', 'members.profile:id,user_id,student_id_number,year_level,assigned_office'])
            ->orderBy('area')
            ->orderBy('name');

        $manages = $accounts->canManageJanitorialGroups($actor);
        if (! $manages) {
            if ($accounts->usesSupervisorScope($actor)) {
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
                        ->orWhereHas('members', fn ($members) => $members->where('users.id', $actor->id));
                });
            }
        }

        $groups = $query->get();
        $presented = $groups->map(fn (JanitorialGroup $group) => $this->present($group))->values();

        return response()->json([
            'groups' => $presented,
            'leaders' => $this->leaderPayloads($actor, $manages, $groups),
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

        $janitorialLeader->update([
            'is_present' => $request->boolean('is_present'),
        ]);

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
            ]);
            $group->members()->sync($payload['member_ids']);

            return $group;
        });

        return response()->json([
            'message' => 'Janitorial group saved.',
            'group' => $this->present($group->load(['supervisor.profile', 'members.profile'])),
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
            ]);
            $janitorialGroup->members()->sync($payload['member_ids']);
        });

        return response()->json([
            'message' => 'Janitorial group updated.',
            'group' => $this->present($janitorialGroup->fresh()->load(['supervisor.profile', 'members.profile'])),
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
     * @return array{department: string, name: string, area: string, supervisor_user_id: int, member_ids: list<int>}
     */
    private function validatedPayload(Request $request, ?JanitorialGroup $existing = null): array
    {
        $validated = $request->validate([
            'department' => 'nullable|string|max:120',
            'name' => 'nullable|string|max:80',
            'area' => 'required|string|max:120',
            'supervisor_user_id' => 'required|integer|exists:users,id',
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
        $memberIds = collect($validated['member_ids'])
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        if (in_array($supervisorId, $memberIds, true)) {
            abort(422, 'The janitorial leader cannot also be listed as a member.');
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
            $department = trim((string) ($supervisor->profile?->assigned_office ?? ''));
        }
        if ($department === '') {
            $department = 'Campus';
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
        $group->loadMissing(['supervisor.profile', 'members.profile']);
        $supervisor = $group->supervisor;
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
            'members' => $members,
            'member_count' => $members->count(),
            'max_members' => JanitorialGroup::MAX_MEMBERS,
            'max_groups' => JanitorialGroup::MAX_GROUPS,
            'leader_present' => JanitorialLeader::isOnDuty((int) $group->supervisor_user_id),
        ];
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
        ];
    }
}
