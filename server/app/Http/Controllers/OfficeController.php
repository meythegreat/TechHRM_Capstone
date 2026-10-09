<?php

namespace App\Http\Controllers;

use App\Models\Application;
use App\Models\Office;
use App\Models\StaffingRequest;
use App\Models\StudentPerformanceReview;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OfficeController extends Controller
{
    public function index()
    {
        $studentCounts = UserProfile::query()
            ->whereHas('user', fn ($query) => $query->where('role', 'Student'))
            ->whereNotNull('assigned_office')
            ->selectRaw('assigned_office, COUNT(*) as total')
            ->groupBy('assigned_office')
            ->pluck('total', 'assigned_office');

        $supervisorCounts = [];
        UserProfile::query()
            ->whereHas('user', fn ($query) => $query->where('role', 'Supervisor'))
            ->get(['supervised_departments', 'assigned_office'])
            ->each(function (UserProfile $profile) use (&$supervisorCounts) {
                $departments = is_array($profile->supervised_departments) ? $profile->supervised_departments : [];
                if ($departments === [] && $profile->assigned_office) {
                    $departments = [$profile->assigned_office];
                }
                foreach (array_unique($departments) as $department) {
                    $name = trim((string) $department);
                    if ($name === '') {
                        continue;
                    }
                    $supervisorCounts[$name] = ($supervisorCounts[$name] ?? 0) + 1;
                }
            });

        $offices = Office::query()->orderBy('name')->get()->map(function (Office $office) use ($studentCounts, $supervisorCounts) {
            return [
                'id' => $office->id,
                'name' => $office->name,
                'student_count' => (int) ($studentCounts[$office->name] ?? 0),
                'supervisor_count' => (int) ($supervisorCounts[$office->name] ?? 0),
            ];
        });

        return response()->json($offices);
    }

    public function breakdown(Office $office)
    {
        $name = $office->name;

        $students = User::with('profile:id,user_id,assigned_office,student_id_number,course,year_level')
            ->where('role', 'Student')
            ->whereHas('profile', fn ($query) => $query->where('assigned_office', $name))
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'student_id_number' => $user->profile->student_id_number ?? null,
                'course' => $user->profile->course ?? null,
                'year_level' => $user->profile->year_level ?? null,
            ])
            ->values();

        $supervisors = User::with('profile:id,user_id,assigned_office,supervised_departments')
            ->where('role', 'Supervisor')
            ->orderBy('name')
            ->get(['id', 'name'])
            ->filter(function (User $user) use ($name) {
                $departments = is_array($user->profile?->supervised_departments) ? $user->profile->supervised_departments : [];
                if ($departments === [] && $user->profile?->assigned_office) {
                    $departments = [$user->profile->assigned_office];
                }
                return in_array($name, array_map('strval', $departments), true);
            })
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
            ])
            ->values();

        $requests = StaffingRequest::with('requester:id,name')
            ->where('department', $name)
            ->latest()
            ->get()
            ->map(fn (StaffingRequest $item) => [
                'id' => $item->id,
                'duty_type' => $item->duty_type,
                'duty_request' => $item->duty_request,
                'quantity' => $item->quantity,
                'status' => $item->status,
                'requester' => $item->requester?->name,
                'created_at' => $item->created_at,
            ])
            ->values();

        return response()->json([
            'office' => $name,
            'supervisors' => $supervisors,
            'students' => $students,
            'requests' => $requests,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $name = $this->normalizeName($validated['name']);
        $this->assertUniqueName($name);

        $office = Office::create(['name' => $name]);

        return response()->json($office, 201);
    }

    public function update(Request $request, Office $office)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $name = $this->normalizeName($validated['name']);
        $previous = $office->name;

        if (strcasecmp($name, $previous) !== 0) {
            $this->assertUniqueName($name, $office->id);
        }

        DB::transaction(function () use ($office, $previous, $name) {
            if ($name !== $previous) {
                $this->renameReferences($previous, $name);
            }
            $office->update(['name' => $name]);
        });

        return response()->json($office->fresh());
    }

    public function destroy(Office $office)
    {
        $students = UserProfile::query()
            ->where('assigned_office', $office->name)
            ->whereHas('user', fn ($query) => $query->where('role', 'Student'))
            ->count();

        $supervisors = 0;
        UserProfile::query()
            ->whereHas('user', fn ($query) => $query->where('role', 'Supervisor'))
            ->get(['supervised_departments', 'assigned_office'])
            ->each(function (UserProfile $profile) use (&$supervisors, $office) {
                $departments = is_array($profile->supervised_departments) ? $profile->supervised_departments : [];
                if ($departments === [] && $profile->assigned_office) {
                    $departments = [$profile->assigned_office];
                }
                if (in_array($office->name, $departments, true)) {
                    $supervisors++;
                }
            });

        if ($students > 0 || $supervisors > 0) {
            return response()->json([
                'message' => 'Reassign the students and supervisors using this office before removing it.',
            ], 422);
        }

        $office->delete();

        return response()->json(['message' => 'Office removed.']);
    }

    private function normalizeName(string $name): string
    {
        return trim(preg_replace('/\s+/', ' ', $name) ?? '');
    }

    private function assertUniqueName(string $name, ?int $ignoreId = null): void
    {
        $exists = Office::query()
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->exists();

        if ($name === '' || $exists) {
            abort(422, $name === '' ? 'Office name is required.' : 'An office with this name already exists.');
        }
    }

    private function renameReferences(string $previous, string $name): void
    {
        UserProfile::query()->where('assigned_office', $previous)->update(['assigned_office' => $name]);
        StaffingRequest::query()->where('department', $previous)->update(['department' => $name]);
        Application::query()->where('preferred_department', $previous)->update(['preferred_department' => $name]);
        Application::query()->where('assigned_department', $previous)->update(['assigned_department' => $name]);
        StudentPerformanceReview::query()->where('target_department', $previous)->update(['target_department' => $name]);

        UserProfile::query()
            ->whereNotNull('supervised_departments')
            ->get()
            ->each(function (UserProfile $profile) use ($previous, $name) {
                $departments = is_array($profile->supervised_departments) ? $profile->supervised_departments : [];
                if (!in_array($previous, $departments, true)) {
                    return;
                }

                $profile->supervised_departments = array_values(array_unique(array_map(
                    fn ($department) => $department === $previous ? $name : $department,
                    $departments
                )));
                $profile->save();
            });
    }
}
