<?php

namespace App\Http\Controllers;

use App\Models\JanitorialGroup;
use App\Models\User;
use App\Support\RenderedHours;
use App\Support\SuperAdminAudit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class JanitorialGroupController extends Controller
{
    public function index(Request $request)
    {
        $actor = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);
        $query = JanitorialGroup::query()
            ->with(['supervisor.profile:id,user_id,student_id_number,year_level,assigned_office', 'members.profile:id,user_id,student_id_number,year_level,assigned_office'])
            ->orderBy('department')
            ->orderBy('name');

        // Managers (Secretary / Coordinator) see every department roster.
        if (! $accounts->canManageJanitorialGroups($actor)) {
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

        $groups = $query->get()->map(fn (JanitorialGroup $group) => $this->present($group));

        return response()->json(['groups' => $groups]);
    }

    public function store(Request $request)
    {
        $this->assertCanManage($request);
        $payload = $this->validatedPayload($request);

        $group = DB::transaction(function () use ($payload) {
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
            abort(403, 'Only the WSPO Secretary or Coordinator can manage janitorial groups.');
        }
    }

    /**
     * @return array{department: string, name: string, area: string, supervisor_user_id: int, member_ids: list<int>}
     */
    private function validatedPayload(Request $request, ?JanitorialGroup $existing = null): array
    {
        $validated = $request->validate([
            'department' => 'required|string|max:120',
            'name' => 'required|string|max:80',
            'area' => 'required|string|max:120',
            'supervisor_user_id' => 'required|integer|exists:users,id',
            'member_ids' => 'present|array|max:'.JanitorialGroup::MAX_MEMBERS,
            'member_ids.*' => 'integer|exists:users,id',
        ]);

        $department = trim($validated['department']);
        $name = trim($validated['name']);
        $area = trim($validated['area']);
        if ($department === '' || $name === '' || $area === '') {
            abort(422, 'Department, group name, and area are required.');
        }

        $accounts = app(UserController::class);

        $duplicate = JanitorialGroup::query()
            ->where('department', $department)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->when($existing, fn ($query) => $query->where('id', '!=', $existing->id))
            ->exists();
        if ($duplicate) {
            abort(422, 'A janitorial group in this department already uses that name.');
        }

        $supervisorId = (int) $validated['supervisor_user_id'];
        $memberIds = collect($validated['member_ids'])
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        if (in_array($supervisorId, $memberIds, true)) {
            abort(422, 'The janitorial supervisor cannot also be listed as a member.');
        }

        if (count($memberIds) > JanitorialGroup::MAX_MEMBERS) {
            abort(422, 'A janitorial group may have at most '.JanitorialGroup::MAX_MEMBERS.' student members.');
        }

        $allIds = array_values(array_unique(array_merge([$supervisorId], $memberIds)));
        $students = User::query()
            ->with('profile:id,user_id,assigned_office,year_level')
            ->where('role', 'Student')
            ->whereIn('id', $allIds)
            ->get()
            ->keyBy('id');

        if ($students->count() !== count($allIds)) {
            abort(422, 'Every person in a janitorial group must be a working student.');
        }

        foreach ($memberIds as $memberId) {
            $student = $students->get($memberId);
            $office = trim((string) ($student?->profile?->assigned_office ?? ''));
            if ($office === '' || ! $accounts->officesMatch($department, $office)) {
                abort(422, ($student?->name ?? 'Member').' must be assigned to '.$department.' to join this group.');
            }
        }

        // Supervisor may cover up to 3 departments (one group roster per department).
        $otherForSupervisor = JanitorialGroup::query()
            ->where('supervisor_user_id', $supervisorId)
            ->when($existing, fn ($query) => $query->where('id', '!=', $existing->id));
        if ((clone $otherForSupervisor)->where('department', $department)->exists()) {
            abort(422, 'This janitorial supervisor already has a roster for '.$department.'.');
        }
        if ((clone $otherForSupervisor)->count() >= JanitorialGroup::MAX_DEPARTMENTS_PER_SUPERVISOR) {
            abort(422, 'A janitorial supervisor may cover at most '
                .JanitorialGroup::MAX_DEPARTMENTS_PER_SUPERVISOR.' departments.');
        }

        // Members cannot belong to another janitorial roster; supervisor cannot be a member elsewhere.
        $memberConflict = JanitorialGroup::query()
            ->when($existing, fn ($query) => $query->where('id', '!=', $existing->id))
            ->whereHas('members', fn ($members) => $members->whereIn('users.id', $allIds))
            ->first();
        if ($memberConflict) {
            abort(422, 'A student can only be a janitorial member of one department roster (conflict: '.$memberConflict->name.').');
        }

        return [
            'department' => $department,
            'name' => $name,
            'area' => $area,
            'supervisor_user_id' => $supervisorId,
            'member_ids' => $memberIds,
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
            'max_departments_per_supervisor' => JanitorialGroup::MAX_DEPARTMENTS_PER_SUPERVISOR,
            'fixed_hours' => \App\Support\DutyHours::JANITORIAL_FIXED_HOURS,
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
