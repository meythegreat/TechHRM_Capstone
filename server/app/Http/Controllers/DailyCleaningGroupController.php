<?php

namespace App\Http\Controllers;

use App\Models\DailyCleaningGroup;
use App\Models\User;
use App\Support\RenderedHours;
use App\Support\SuperAdminAudit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DailyCleaningGroupController extends Controller
{
    public function index()
    {
        $groups = DailyCleaningGroup::query()
            ->with(['students.profile:id,user_id,student_id_number,year_level', 'leader.profile:id,user_id,student_id_number,year_level'])
            ->orderBy('name')
            ->get()
            ->map(fn (DailyCleaningGroup $group) => $this->present($group));

        return response()->json(['groups' => $groups]);
    }

    public function store(Request $request)
    {
        $this->assertCoordinator($request);
        $name = $this->validatedName($request);
        $studentIds = $this->studentIds($request);
        $leaderId = $this->leaderId($request, $studentIds);

        $group = DB::transaction(function () use ($name, $studentIds, $leaderId) {
            $group = DailyCleaningGroup::create([
                'name' => $name,
                'leader_id' => $leaderId,
            ]);
            $this->syncStudents($group, $studentIds);

            return $group;
        });

        return response()->json([
            'message' => 'Cleaning group saved.',
            'group' => $this->present($group->load(['students.profile', 'leader.profile'])),
        ], 201);
    }

    public function update(Request $request, DailyCleaningGroup $group)
    {
        $this->assertCoordinator($request);
        $name = $this->validatedName($request, $group);
        $studentIds = $this->studentIds($request);
        $leaderId = $this->leaderId($request, $studentIds);

        DB::transaction(function () use ($group, $name, $studentIds, $leaderId) {
            $group->name = $name;
            $group->leader_id = $leaderId;
            $group->save();
            $this->syncStudents($group, $studentIds);
        });

        return response()->json([
            'message' => 'Cleaning group updated.',
            'group' => $this->present($group->load(['students.profile', 'leader.profile'])),
        ]);
    }

    public function destroy(Request $request, DailyCleaningGroup $group)
    {
        $this->assertCoordinator($request);
        $group->delete();

        return response()->json(['message' => 'Cleaning group removed. Past cleaning activities keep the students they already have.']);
    }

    private function assertCoordinator(Request $request): void
    {
        SuperAdminAudit::denyMutation($request);
        $user = $request->user()->loadMissing('profile');
        if (!app(UserController::class)->isWspoDepartmentSupervisor($user)) {
            abort(403, 'Only the WSPO coordinator can change cleaning groups.');
        }
    }

    private function validatedName(Request $request, ?DailyCleaningGroup $existing = null): string
    {
        $validated = $request->validate([
            'name' => 'required|string|max:80',
        ]);
        $name = trim($validated['name']);
        if ($name === '') {
            abort(422, 'Name the cleaning group.');
        }

        $duplicate = DailyCleaningGroup::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->when($existing, fn ($query) => $query->where('id', '!=', $existing->id))
            ->exists();
        if ($duplicate) {
            abort(422, 'A cleaning group already uses that name.');
        }

        return $name;
    }

    /**
     * @return list<int>
     */
    private function studentIds(Request $request): array
    {
        $validated = $request->validate([
            'user_ids' => 'required|array|min:1',
            'user_ids.*' => 'integer|exists:users,id',
        ]);

        $ids = collect($validated['user_ids'])->map(fn ($id) => (int) $id)->unique()->values();
        $students = User::query()->where('role', 'Student')->whereIn('id', $ids)->pluck('id');
        if ($students->count() !== $ids->count()) {
            abort(422, 'Every person in a cleaning group must be a working student.');
        }

        return $ids->all();
    }

    /**
     * @param  list<int>  $studentIds
     */
    private function leaderId(Request $request, array $studentIds): int
    {
        $validated = $request->validate([
            'leader_id' => 'required|integer|exists:users,id',
        ]);
        $leaderId = (int) $validated['leader_id'];
        if (!in_array($leaderId, $studentIds, true)) {
            abort(422, 'The group leader must be one of the selected students.');
        }

        $leader = User::query()->where('role', 'Student')->where('id', $leaderId)->first();
        if (!$leader) {
            abort(422, 'The group leader must be a working student.');
        }

        return $leaderId;
    }

    /**
     * @param  list<int>  $studentIds
     */
    private function syncStudents(DailyCleaningGroup $group, array $studentIds): void
    {
        DB::table('daily_cleaning_group_members')
            ->whereIn('user_id', $studentIds)
            ->where('group_id', '!=', $group->id)
            ->delete();

        $group->students()->sync($studentIds);
    }

    private function presentStudent(User $student): array
    {
        return [
            'id' => $student->id,
            'name' => $student->name,
            'student_id_number' => $student->profile?->student_id_number,
            'year_level' => $student->profile?->year_level,
            'year_label' => RenderedHours::yearLabel($student->profile?->year_level ? (int) $student->profile->year_level : null),
        ];
    }

    private function present(DailyCleaningGroup $group): array
    {
        $group->loadMissing(['students.profile', 'leader.profile']);

        return [
            'id' => $group->id,
            'name' => $group->name,
            'leader_id' => $group->leader_id,
            'leader' => $group->leader ? $this->presentStudent($group->leader) : null,
            'student_count' => $group->students->count(),
            'students' => $group->students
                ->sortBy('name')
                ->values()
                ->map(fn (User $student) => $this->presentStudent($student)),
        ];
    }
}
