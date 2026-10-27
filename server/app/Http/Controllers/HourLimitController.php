<?php

namespace App\Http\Controllers;

use App\Models\HourLimitApproval;
use App\Models\Notification;
use App\Models\User;
use App\Support\HourLimits;
use App\Support\SuperAdminAudit;
use Carbon\Carbon;
use Illuminate\Http\Request;

class HourLimitController extends Controller
{
    public function mine(Request $request)
    {
        return response()->json(HourLimits::status($request->user()->id));
    }

    public function index(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);

        $query = HourLimitApproval::query()
            ->with([
                'student:id,name',
                'student.profile:id,user_id,student_id_number,assigned_office,year_level',
                'requester:id,name',
                'reviewer:id,name',
            ])
            ->orderByRaw("CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END")
            ->orderByDesc('updated_at');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        // College supervisors see their office only. WSPO Staff (including the
        // Coordinator, who also supervises WSPO-office students) review campus-wide.
        if ($user->role === 'Supervisor') {
            $areas = $accounts->supervisedOfficeAreas($user);
            if ($areas === []) {
                $query->whereRaw('0 = 1');
            } else {
                $query->whereHas('student.profile', fn ($profile) => $profile->whereIn('assigned_office', $areas));
            }
        } elseif ($user->role === 'WSPO Staff' || $user->role === 'Super Admin') {
            // Campus-wide — no office filter.
        } else {
            return response()->json(['message' => 'Not allowed.'], 403);
        }

        $rows = $query->limit(100)->get()->map(function (HourLimitApproval $row) {
            $status = HourLimits::status($row->user_id, Carbon::parse($row->week_start));

            return [
                'id' => $row->id,
                'user_id' => $row->user_id,
                'student_name' => $row->student?->name,
                'student_id_number' => $row->student?->profile?->student_id_number,
                'assigned_office' => $row->student?->profile?->assigned_office,
                'week_start' => $row->week_start?->toDateString(),
                'week_end' => Carbon::parse($row->week_start)->endOfWeek(Carbon::SUNDAY)->toDateString(),
                'approved_hours' => (float) $row->approved_hours,
                'status' => $row->status,
                'reason' => $row->reason,
                'decision_note' => $row->decision_note,
                'requested_by' => $row->requester?->name,
                'reviewed_by' => $row->reviewer?->name,
                'reviewed_at' => $row->reviewed_at,
                'weekly_hours' => $status['weekly_hours'],
                'weekly_standard' => $status['weekly_standard'],
                'weekly_extended' => $status['weekly_extended'],
                'created_at' => $row->created_at,
            ];
        });

        return response()->json(['approvals' => $rows]);
    }

    public function requestExtension(Request $request)
    {
        $user = $request->user();
        if ($user->role !== 'Student') {
            return response()->json(['message' => 'Only working students can view Extra Hours status.'], 403);
        }

        $settings = \App\Models\CampusSetting::current();

        return response()->json([
            'message' => 'Extra Hours (up to '
                . HourLimits::hoursLabel((float) $settings->weekly_extended_hours)
                . ' hrs/week) requires a signed Extra Hours letter from your supervisor. Ask them to print, collect signatures, and submit it to WSPO.',
            'hour_limits' => HourLimits::status($user->id),
        ], 422);
    }

    public function grant(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $reviewer = $this->assertCanReview($request);
        if ($reviewer instanceof \Illuminate\Http\JsonResponse) {
            return $reviewer;
        }

        $settings = \App\Models\CampusSetting::current();
        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
            'week_start' => 'nullable|date_format:Y-m-d',
            'approved_hours' => 'nullable|numeric|min:' . ((float) $settings->weekly_standard_hours + 0.01) . '|max:' . (float) $settings->weekly_extended_hours,
            'decision_note' => 'nullable|string|max:1000',
        ]);

        $student = User::with('profile')->where('role', 'Student')->findOrFail($validated['user_id']);
        if (!$this->canAccessStudent($reviewer, $student)) {
            return response()->json(['message' => 'You can only approve extensions for students in your scope.'], 403);
        }

        $at = isset($validated['week_start'])
            ? Carbon::parse($validated['week_start'])
            : Carbon::now();
        $weekStart = HourLimits::weekStart($at);
        $hours = isset($validated['approved_hours'])
            ? round((float) $validated['approved_hours'], 2)
            : (float) $settings->weekly_extended_hours;

        $approval = HourLimitApproval::updateOrCreate(
            [
                'user_id' => $student->id,
                'week_start' => $weekStart->toDateString(),
            ],
            [
                'approved_hours' => $hours,
                'status' => HourLimitApproval::APPROVED,
                'decision_note' => trim((string) ($validated['decision_note'] ?? '')) ?: null,
                'requested_by' => $request->user()->id,
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
            ]
        );

        Notification::create([
            'user_id' => $student->id,
            'title' => 'Weekly hour extension approved',
            'message' => 'You may work up to ' . HourLimits::hoursLabel($hours)
                . ' hours for the week of ' . $weekStart->format('M j, Y') . '.',
        ]);

        return response()->json([
            'message' => 'Extension approved for ' . $student->name . '.',
            'approval' => $approval,
            'hour_limits' => HourLimits::status($student->id, $at),
        ]);
    }

    public function decide(Request $request, HourLimitApproval $approval)
    {
        SuperAdminAudit::denyMutation($request);
        $reviewer = $this->assertCanReview($request);
        if ($reviewer instanceof \Illuminate\Http\JsonResponse) {
            return $reviewer;
        }

        $approval->loadMissing('student.profile');
        if (!$approval->student || !$this->canAccessStudent($reviewer, $approval->student)) {
            return response()->json(['message' => 'You can only review extensions for students in your scope.'], 403);
        }

        $settings = \App\Models\CampusSetting::current();
        $validated = $request->validate([
            'status' => 'required|in:approved,rejected',
            'approved_hours' => 'nullable|numeric|min:' . ((float) $settings->weekly_standard_hours + 0.01) . '|max:' . (float) $settings->weekly_extended_hours,
            'decision_note' => 'nullable|string|max:1000',
        ]);

        $hours = isset($validated['approved_hours'])
            ? round((float) $validated['approved_hours'], 2)
            : (float) ($approval->approved_hours ?: $settings->weekly_extended_hours);

        $approval->update([
            'status' => $validated['status'],
            'approved_hours' => $hours,
            'decision_note' => trim((string) ($validated['decision_note'] ?? '')) ?: null,
            'reviewed_by' => $reviewer->id,
            'reviewed_at' => now(),
        ]);

        $weekLabel = Carbon::parse($approval->week_start)->format('M j, Y');
        if ($validated['status'] === HourLimitApproval::APPROVED) {
            Notification::create([
                'user_id' => $approval->user_id,
                'title' => 'Weekly hour extension approved',
                'message' => 'You may work up to ' . HourLimits::hoursLabel($hours)
                    . ' hours for the week of ' . $weekLabel . '.',
            ]);
            $message = 'Extension approved.';
        } else {
            Notification::create([
                'user_id' => $approval->user_id,
                'title' => 'Weekly hour extension declined',
                'message' => 'Your request to exceed '
                    . HourLimits::hoursLabel((float) $settings->weekly_standard_hours)
                    . ' hours for the week of ' . $weekLabel . ' was declined.',
            ]);
            $message = 'Extension declined.';
        }

        return response()->json([
            'message' => $message,
            'approval' => $approval->fresh(['student.profile', 'reviewer:id,name']),
            'hour_limits' => HourLimits::status($approval->user_id, Carbon::parse($approval->week_start)),
        ]);
    }

    private function assertCanReview(Request $request): User|\Illuminate\Http\JsonResponse
    {
        $user = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);

        if ($user->role === 'Supervisor' || $user->role === 'WSPO Staff' || $accounts->isWspoDepartmentSupervisor($user)) {
            return $user;
        }

        return response()->json(['message' => 'Only supervisors or WSPO staff can approve weekly hour extensions.'], 403);
    }

    private function canAccessStudent(User $reviewer, User $student): bool
    {
        $accounts = app(UserController::class);
        if ($reviewer->role === 'WSPO Staff' && !$accounts->isWspoDepartmentSupervisor($reviewer)) {
            return true;
        }

        if ($reviewer->role === 'Supervisor' || $accounts->isWspoDepartmentSupervisor($reviewer)) {
            return $accounts->supervisorCanAccessStudent($reviewer, $student);
        }

        return $reviewer->role === 'WSPO Staff';
    }

}
