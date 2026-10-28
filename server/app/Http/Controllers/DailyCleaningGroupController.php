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
            ->with(['students.profile:id,user_id,student_id_number,year_level'])
            ->orderBy('name')
            ->get()
            ->map(fn (DailyCleaningGroup $group) => $this->present($group));

        return response()->json(['groups' => $groups]);
    }

    public function store(Request $request)
    {
        $this->assertCoordinator($request);
        $name = $this->validatedName($request);
        [$studentIds, $leaderIds] = $this->membership($request);

        $group = DB::transaction(function () use ($name, $studentIds, $leaderIds) {
            $group = DailyCleaningGroup::create(['name' => $name]);
            $this->syncStudents($group, $studentIds, $leaderIds);

            return $group;
        });

        return response()->json([
            'message' => 'Group saved.',
            'group' => $this->present($group->load('students.profile')),
        ], 201);
    }

    public function update(Request $request, DailyCleaningGroup $group)
    {
        $this->assertCoordinator($request);
        $name = $this->validatedName($request, $group);
        [$studentIds, $leaderIds] = $this->membership($request);

        DB::transaction(function () use ($group, $name, $studentIds, $leaderIds) {
            $group->name = $name;
            $group->save();
            $this->syncStudents($group, $studentIds, $leaderIds);
        });

        return response()->json([
            'message' => 'Group updated.',
            'group' => $this->present($group->load('students.profile')),
        ]);
    }

    public function destroy(Request $request, DailyCleaningGroup $group)
    {
        $this->assertCoordinator($request);
        $group->delete();

        return response()->json(['message' => 'Group removed. Past activities keep the students they already have.']);
    }

    private function assertCoordinator(Request $request): void
    {
        SuperAdminAudit::denyMutation($request);
        $user = $request->user()->loadMissing('profile');
        if (!app(UserController::class)->isWspoDepartmentSupervisor($user)) {
            abort(403, 'Only the WSPO coordinator can change groups.');
        }
    }

    private function validatedName(Request $request, ?DailyCleaningGroup $existing = null): string
    {
        $validated = $request->validate([
            'name' => 'required|string|max:80',
        ]);
        $name = trim($validated['name']);
        if ($name === '') {
            abort(422, 'Name the group.');
        }

        $duplicate = DailyCleaningGroup::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->when($existing, fn ($query) => $query->where('id', '!=', $existing->id))
            ->exists();
        if ($duplicate) {
            abort(422, 'A group already uses that name.');
        }

        return $name;
    }

    /**
     * Leaders are assigned per year level before the other members of that year.
     *
     * @return array{0: list<int>, 1: list<int>}
     */
    private function membership(Request $request): array
    {
        $validated = $request->validate([
            'user_ids' => 'required|array|min:1',
            'user_ids.*' => 'integer|exists:users,id',
            'leaders' => 'required|array|min:1',
            'leaders.*.year_level' => 'required|integer|min:1|max:4',
            'leaders.*.user_id' => 'required|integer|exists:users,id',
        ]);

        $ids = collect($validated['user_ids'])->map(fn ($id) => (int) $id)->unique()->values();
        $students = User::query()
            ->with('profile:id,user_id,year_level')
            ->where('role', 'Student')
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        if ($students->count() !== $ids->count()) {
            abort(422, 'Every person in a group must be a working student.');
        }

        $leaderByYear = [];
        foreach ($validated['leaders'] as $leader) {
            $year = (int) $leader['year_level'];
            $leaderId = (int) $leader['user_id'];
            if (isset($leaderByYear[$year])) {
                abort(422, 'Each year level can have only one leader or representative.');
            }

            $student = $students->get($leaderId);
            if (!$student) {
                abort(422, 'Choose the leader before adding members of that year level.');
            }

            $studentYear = (int) ($student->profile?->year_level ?? 0);
            if ($studentYear !== $year) {
                abort(422, RenderedHours::yearLabel($year).' leader must be a student in that year level.');
            }

            $leaderByYear[$year] = $leaderId;
        }

        foreach ($students as $student) {
            $year = (int) ($student->profile?->year_level ?? 0);
            if ($year < 1 || $year > 4) {
                abort(422, $student->name.' needs a year level before joining a group.');
            }
            if (!isset($leaderByYear[$year])) {
                abort(422, 'Assign the '.RenderedHours::yearLabel($year).' leader or representative before adding members.');
            }
        }

        return [$ids->all(), array_values($leaderByYear)];
    }

    /**
     * @param  list<int>  $studentIds
     * @param  list<int>  $leaderIds
     */
    private function syncStudents(DailyCleaningGroup $group, array $studentIds, array $leaderIds): void
    {
        DB::table('daily_cleaning_group_members')
            ->whereIn('user_id', $studentIds)
            ->where('group_id', '!=', $group->id)
            ->delete();

        $leaderLookup = array_fill_keys($leaderIds, true);
        $sync = [];
        foreach ($studentIds as $studentId) {
            $sync[$studentId] = ['is_leader' => isset($leaderLookup[$studentId])];
        }

        $group->students()->sync($sync);
    }

    private function present(DailyCleaningGroup $group): array
    {
        $group->loadMissing('students.profile');

        $students = $group->students
            ->sort(function (User $left, User $right) {
                $year = ((int) ($left->profile?->year_level ?? 9)) <=> ((int) ($right->profile?->year_level ?? 9));
                if ($year !== 0) {
                    return $year;
                }
                $leader = ((int) !$left->pivot?->is_leader) <=> ((int) !$right->pivot?->is_leader);
                if ($leader !== 0) {
                    return $leader;
                }

                return strcasecmp((string) $left->name, (string) $right->name);
            })
            ->values()
            ->map(fn (User $student) => [
                'id' => $student->id,
                'name' => $student->name,
                'student_id_number' => $student->profile?->student_id_number,
                'year_level' => $student->profile?->year_level,
                'year_label' => RenderedHours::yearLabel($student->profile?->year_level ? (int) $student->profile->year_level : null),
                'is_leader' => (bool) $student->pivot?->is_leader,
            ]);

        return [
            'id' => $group->id,
            'name' => $group->name,
            'student_count' => $students->count(),
            'students' => $students,
        ];
    }
}
