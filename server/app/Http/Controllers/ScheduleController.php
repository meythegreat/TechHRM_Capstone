<?php

namespace App\Http\Controllers;

use App\Models\Office;
use App\Models\Schedule;
use App\Models\SemesterTerm;
use App\Models\User;
use App\Support\SuperAdminAudit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class ScheduleController extends Controller
{
    // 1. For the STUDENT Dashboard (Shows only their own schedule)
    public function mySchedule(Request $request)
    {
        $schedules = Schedule::where('user_id', $request->user()->id)->get();
        return response()->json($schedules);
    }

    // 2. For the ADMIN Dashboard (Filtered by Role!)
    public function index(Request $request)
    {
        $user = $request->user();
        if ($user->role === 'Super Admin') {
            $query = Schedule::with(['user' => function ($relation) {
                $relation->withTrashed()->select('id', 'name', 'profile_picture', 'deleted_at');
            }]);
        } else {
            $query = Schedule::with('user:id,name,profile_picture')->whereHas('user');
        }

        // IF THE USER IS A SUPERVISOR: Strict Department Filter
        if ($user->role === 'Supervisor') {
            $myDepartment = $user->profile->assigned_office ?? 'Unassigned';
            $query->where('department', $myDepartment);
        }

        if (in_array($request->query('kind'), ['work', 'class'], true)) {
            $query->where('kind', $request->query('kind'));
        }

        $name = trim((string) $request->query('name', ''));
        if ($name !== '') {
            $like = '%'.addcslashes($name, '%_\\').'%';
            $query->whereHas('user', function ($relation) use ($like, $user) {
                if ($user->role === 'Super Admin') {
                    $relation->withTrashed();
                }
                $relation->where('name', 'like', $like);
            });
        }

        $day = trim((string) $request->query('day', ''));
        if (in_array($day, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], true)) {
            $query->where('day', $day);
        }

        if ($request->boolean('audit') && $user->role === 'Super Admin') {
            return response()->json($query->latest()->get());
        }

        $schedules = $query->latest()->paginate(10);
        return response()->json($schedules);
    }

    /**
     * Recurring work and class schedules for the organization calendar.
     * Shown on Student, Supervisor, WSPO Staff, and Super Admin dashboards.
     */
    public function organization(Request $request)
    {
        $user = $request->user();
        abort_unless(in_array($user->role, ['Student', 'Supervisor', 'WSPO Staff', 'Super Admin'], true), 403);

        $schedules = Schedule::with('user:id,name,profile_picture')
            ->whereHas('user')
            ->orderBy('day')
            ->orderBy('time')
            ->get()
            ->map(function (Schedule $shift) {
                return [
                    'id' => $shift->id,
                    'day' => $shift->day,
                    'time' => $shift->time,
                    'kind' => $shift->kind ?: 'work',
                    'duty_type' => $shift->duty_type,
                    'subject' => $shift->subject,
                    'room' => $shift->room,
                    'instructor' => $shift->instructor,
                    'department' => $shift->department,
                    'student_name' => $shift->user?->name ?? 'Student',
                    'profile_picture' => $shift->user?->profile_picture,
                ];
            })
            ->values();

        return response()->json([
            'scope' => 'Organization',
            'semester' => SemesterTerm::current()?->toPayload(),
            'offices' => Office::query()->orderBy('name')->pluck('name')->values(),
            'schedules' => $schedules,
        ]);
    }

    // 3. For Assigning a New Shift (WITH SMART OVERLAP PREVENTION)
    public function store(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'days' => 'required|array|min:1',
            'days.*' => 'required|string|in:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
            'time' => 'required|string',
            'kind' => 'nullable|in:work,class',
            'duty_type' => 'required_unless:kind,class|nullable|string|max:120',
            'subject' => 'required_if:kind,class|nullable|string|max:160',
            'room' => 'nullable|string|max:120',
            'instructor' => 'nullable|string|max:120',
        ]);

        if (! SemesterTerm::current()) {
            return response()->json([
                'message' => 'Set the semester length before creating a schedule. Weekly schedules repeat only inside that window.',
            ], 422);
        }

        $kind = $validated['kind'] ?? 'work';
        $student = User::with('profile')->where('role', 'Student')->findOrFail($validated['user_id']);
        abort_unless(
            app(UserController::class)->canManageWorkSchedules($request->user()),
            403,
            $kind === 'class'
                ? 'Only the WSPO coordinator or secretary can add a class schedule.'
                : 'Only the WSPO coordinator or secretary can assign a work schedule.'
        );

        $department = trim((string) ($student->profile?->assigned_office ?? ''));
        if ($kind === 'work' && $department === '') {
            return response()->json([
                'message' => 'This student has no assigned office yet.',
            ], 422);
        }
        if ($department === '') {
            $department = 'Unassigned';
        }

        $days = array_values(array_unique($validated['days']));
        $newTimes = preg_split('/\s*-\s*/', $validated['time']) ?: [];
        if (count($newTimes) !== 2) {
            return response()->json(['message' => 'Enter a start and end time.'], 422);
        }
        $newStart = Carbon::parse($newTimes[0]);
        $newEnd = Carbon::parse($newTimes[1]);
        if ($newEnd->lte($newStart)) {
            $newEnd->addDay();
        }

        $existingShifts = Schedule::where('user_id', $student->id)
            ->whereIn('day', $days)
            ->get();

        foreach ($existingShifts as $shift) {
            $existingTimes = preg_split('/\s*-\s*/', (string) $shift->time) ?: [];
            if (count($existingTimes) !== 2) {
                continue;
            }
            $existingStart = Carbon::parse($existingTimes[0]);
            $existingEnd = Carbon::parse($existingTimes[1]);
            if ($existingEnd->lte($existingStart)) {
                $existingEnd->addDay();
            }
            if ($newStart->lt($existingEnd) && $newEnd->gt($existingStart)) {
                $existingKind = ($shift->kind ?? 'work') === 'class' ? 'class' : 'work shift';
                $detail = $shift->kind === 'class' && $shift->subject ? " ({$shift->subject})" : '';

                return response()->json([
                    'message' => "Conflict! This student already has a {$existingKind}{$detail} on {$shift->day} from {$shift->time}.",
                ], 422);
            }
        }

        $subject = trim((string) ($validated['subject'] ?? ''));
        $room = trim((string) ($validated['room'] ?? ''));
        $instructor = trim((string) ($validated['instructor'] ?? ''));

        $schedules = DB::transaction(function () use ($student, $days, $validated, $department, $kind, $subject, $room, $instructor) {
            return collect($days)->map(fn (string $day) => Schedule::create([
                'user_id' => $student->id,
                'kind' => $kind,
                'day' => $day,
                'time' => $validated['time'],
                'duty_type' => $kind === 'class' ? ($subject !== '' ? $subject : 'Class') : $validated['duty_type'],
                'subject' => $kind === 'class' ? $subject : null,
                'room' => $kind === 'class' && $room !== '' ? $room : null,
                'instructor' => $kind === 'class' && $instructor !== '' ? $instructor : null,
                'department' => $department,
                'supervisor' => $kind === 'class' ? $instructor : '',
            ]))->values();
        });

        $saved = count($days);
        $message = $kind === 'class'
            ? ($saved === 1 ? 'Class schedule saved.' : $saved.' class days saved.')
            : ($saved === 1 ? 'Schedule assigned successfully!' : $saved.' work days assigned successfully!');

        return response()->json([
            'message' => $message,
            'schedules' => $schedules,
        ]);
    }

    // 4. For Removing a Shift
    public function destroy(Request $request, int $id)
    {
        SuperAdminAudit::denyMutation($request);
        abort_unless(
            app(UserController::class)->canManageWorkSchedules($request->user()),
            403,
            'Only the WSPO coordinator or secretary can remove a work schedule.'
        );
        $schedule = Schedule::findOrFail($id);
        $schedule->delete();

        return response()->json([
            'message' => 'Schedule removed successfully!'
        ]);
    }

    // 5. For Students Requesting a Schedule Change
    public function requestEdit(Request $request, $id)
    {
        $validated = $request->validate([
            'note' => 'required|string|max:500'
        ]);

        // Ensure the student actually owns this shift before they can request an edit
        $schedule = Schedule::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        if ($schedule->kind === 'class') {
            return response()->json([
                'message' => 'Class schedules are updated by the WSPO coordinator or secretary.',
            ], 422);
        }

        $schedule->update([
            'edit_request_note' => $validated['note'],
            'edit_request_status' => 'pending'
        ]);

        $schedule->update([
            'edit_request_note' => $validated['note'],
            'edit_request_status' => 'pending'
        ]);

        // --- NEW: NOTIFY ALL ADMINS/SUPERVISORS ---
        $supervisors = \App\Models\User::whereIn('role', ['Super Admin', 'Supervisor'])->get();
        foreach($supervisors as $sup) {
            \App\Models\Notification::create([
                'user_id' => $sup->id,
                'title' => 'Schedule Edit Requested',
                'message' => $request->user()->name . ' requested an edit for their ' . $schedule->day . ' shift.'
            ]);
        }

        return response()->json(['message' => 'Edit request sent to your Supervisor!']);
    }

    // Clear the pending edit request badge
    public function resolveRequest(Request $request, $id)
    {
        SuperAdminAudit::denyMutation($request);
        abort_unless(
            app(UserController::class)->canManageWorkSchedules($request->user()),
            403,
            'Only the WSPO coordinator or secretary can resolve a schedule request.'
        );
        $schedule = Schedule::findOrFail($id);
        $schedule->update([
            'edit_request_status' => 'none',
            'edit_request_note' => null
        ]);

        return response()->json(['message' => 'Student request acknowledged and cleared.']);
    }
}
