<?php

namespace App\Http\Controllers;

use App\Models\ManualAttendanceRequest;
use App\Models\ManualAttendanceRequestShift;
use App\Models\Notification;
use App\Models\User;
use App\Support\ManualDtrEntry;
use App\Support\SuperAdminAudit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ManualAttendanceRequestController extends Controller
{
    /** Student: list own offline manual attendance requests. */
    public function mine(Request $request)
    {
        $user = $request->user();
        if ($user->role !== 'Student') {
            return response()->json(['message' => 'Only working students can view their offline attendance requests.'], 403);
        }

        $rows = ManualAttendanceRequest::query()
            ->with(['shifts', 'reviewer:id,name'])
            ->where('user_id', $user->id)
            ->orderByRaw("CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END")
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (ManualAttendanceRequest $row) => $this->serialize($row));

        return response()->json(['requests' => $rows]);
    }

    /** Supervisor / WSPO: list requests in scope (pending first). */
    public function index(Request $request)
    {
        $actor = $request->user()->loadMissing('profile');
        if (!in_array($actor->role, ['Supervisor', 'WSPO Staff', 'Super Admin'], true)) {
            return response()->json(['message' => 'Not allowed.'], 403);
        }

        $accounts = app(UserController::class);
        $query = ManualAttendanceRequest::query()
            ->with([
                'student:id,name',
                'student.profile:id,user_id,student_id_number,assigned_office,year_level,duty_type',
                'shifts',
                'reviewer:id,name',
            ])
            ->orderByRaw("CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END")
            ->orderByDesc('created_at');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($accounts->usesSupervisorScope($actor)) {
            $areas = $accounts->supervisedOfficeAreas($actor);
            if ($areas === []) {
                $query->whereRaw('0 = 1');
            } else {
                $query->whereHas('student', function ($owner) use ($areas, $accounts) {
                    $accounts->constrainPlacedIn($owner, $areas);
                });
            }
        }

        $rows = $query->limit(100)->get()->map(fn (ManualAttendanceRequest $row) => $this->serialize($row, true));

        return response()->json(['requests' => $rows]);
    }

    /** Student: submit offline manual attendance (one or more shifts). */
    public function store(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        if ($user->role !== 'Student') {
            return response()->json(['message' => 'Only working students can submit offline attendance requests.'], 403);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:1000',
            'shifts' => 'required|array|min:1|max:10',
            'shifts.*.date' => 'required|date_format:Y-m-d',
            'shifts.*.time_in' => ['required', 'regex:/^\d{2}:\d{2}$/'],
            'shifts.*.time_out' => ['required', 'regex:/^\d{2}:\d{2}$/'],
        ]);

        $shiftRows = [];
        foreach (array_values($validated['shifts']) as $index => $shift) {
            [$timeIn, $timeOut, $error] = ManualDtrEntry::resolveTimes(
                $shift['date'],
                $shift['time_in'],
                $shift['time_out'],
            );
            if ($error) {
                return response()->json([
                    'message' => 'Shift '.($index + 1).': '.$error,
                ], 422);
            }

            foreach ($shiftRows as $prior) {
                if ($prior['time_in']->lt($timeOut) && $prior['time_out']->gt($timeIn)) {
                    return response()->json([
                        'message' => 'Shift '.($index + 1).' overlaps another shift in this request.',
                    ], 422);
                }
            }

            if (ManualDtrEntry::overlaps((int) $user->id, $timeIn, $timeOut)) {
                return response()->json([
                    'message' => 'Shift '.($index + 1).' overlaps an existing DTR entry.',
                ], 422);
            }

            $shiftRows[] = [
                'work_date' => $shift['date'],
                'time_in' => $shift['time_in'],
                'time_out' => $shift['time_out'],
                'sort_order' => $index,
                'time_in_at' => $timeIn,
                'time_out_at' => $timeOut,
            ];
        }

        $reason = trim((string) ($validated['reason'] ?? ''));
        if ($reason === '') {
            $reason = ManualAttendanceRequest::DEFAULT_REASON;
        }

        $row = DB::transaction(function () use ($user, $reason, $shiftRows) {
            $requestRow = ManualAttendanceRequest::create([
                'user_id' => $user->id,
                'reason' => $reason,
                'status' => ManualAttendanceRequest::PENDING,
            ]);

            foreach ($shiftRows as $shift) {
                ManualAttendanceRequestShift::create([
                    'manual_attendance_request_id' => $requestRow->id,
                    'work_date' => $shift['work_date'],
                    'time_in' => $shift['time_in'],
                    'time_out' => $shift['time_out'],
                    'sort_order' => $shift['sort_order'],
                ]);
            }

            return $requestRow->load(['shifts', 'reviewer:id,name']);
        });

        $this->notifyReviewers(
            $user,
            'Offline attendance request',
            $user->name.' submitted a manual attendance request (no office internet) with '
                .count($shiftRows).(count($shiftRows) === 1 ? ' shift' : ' shifts').' for approval.',
        );

        return response()->json([
            'message' => 'Offline attendance request submitted. It will appear on your DTR after your supervisor approves it.',
            'request' => $this->serialize($row),
        ], 201);
    }

    /** Student: withdraw a pending request. */
    public function destroy(Request $request, ManualAttendanceRequest $manualAttendanceRequest)
    {
        $user = $request->user();
        if ($user->role !== 'Student' || (int) $manualAttendanceRequest->user_id !== (int) $user->id) {
            return response()->json(['message' => 'You can only cancel your own pending requests.'], 403);
        }

        if (!$manualAttendanceRequest->isPending()) {
            return response()->json(['message' => 'Only pending requests can be cancelled.'], 422);
        }

        $manualAttendanceRequest->delete();

        return response()->json(['message' => 'Offline attendance request cancelled.']);
    }

    /** Supervisor / WSPO: approve (credit DTR) or reject. */
    public function decide(Request $request, ManualAttendanceRequest $manualAttendanceRequest)
    {
        SuperAdminAudit::denyMutation($request);

        $reviewer = $request->user()->loadMissing('profile');
        if (!in_array($reviewer->role, ['Supervisor', 'WSPO Staff'], true)) {
            return response()->json(['message' => 'Only a supervisor or WSPO staff can decide this request.'], 403);
        }

        $manualAttendanceRequest->load(['student.profile', 'shifts']);
        $student = $manualAttendanceRequest->student;
        if (!$student) {
            return response()->json(['message' => 'Student account was not found.'], 404);
        }

        if (!$this->canReviewStudent($reviewer, $student)) {
            return response()->json(['message' => 'You can only review offline attendance for students in your scope.'], 403);
        }

        if (!$manualAttendanceRequest->isPending()) {
            return response()->json(['message' => 'This request was already decided.'], 422);
        }

        $validated = $request->validate([
            'status' => 'required|in:Approved,Rejected',
            'decision_note' => 'nullable|string|max:1000',
        ]);

        if ($validated['status'] === ManualAttendanceRequest::REJECTED) {
            $manualAttendanceRequest->update([
                'status' => ManualAttendanceRequest::REJECTED,
                'decision_note' => trim((string) ($validated['decision_note'] ?? '')) ?: null,
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
            ]);

            Notification::create([
                'user_id' => $student->id,
                'title' => 'Offline attendance declined',
                'message' => 'Your offline manual attendance request was declined by your supervisor.',
            ]);

            return response()->json([
                'message' => 'Offline attendance request declined.',
                'request' => $this->serialize($manualAttendanceRequest->fresh(['shifts', 'student.profile', 'reviewer:id,name']), true),
            ]);
        }

        $noteBase = trim((string) ($manualAttendanceRequest->reason ?: ManualAttendanceRequest::DEFAULT_REASON));
        $createdIds = [];

        try {
            DB::transaction(function () use ($manualAttendanceRequest, $student, $reviewer, $validated, $noteBase, &$createdIds) {
                foreach ($manualAttendanceRequest->shifts as $index => $shift) {
                    $date = $shift->work_date->toDateString();
                    $created = ManualDtrEntry::createClosedShift(
                        $student,
                        $date,
                        $shift->time_in,
                        $shift->time_out,
                        $noteBase,
                        'accepted',
                    );

                    if (!$created['ok']) {
                        throw new \RuntimeException(
                            'Shift '.($index + 1).' ('.$date.' '.$shift->time_in.'–'.$shift->time_out.'): '.$created['message']
                        );
                    }

                    $shift->update(['attendance_id' => $created['attendance']->id]);
                    $createdIds[] = $created['attendance']->id;
                }

                $manualAttendanceRequest->update([
                    'status' => ManualAttendanceRequest::APPROVED,
                    'decision_note' => trim((string) ($validated['decision_note'] ?? '')) ?: null,
                    'reviewed_by' => $reviewer->id,
                    'reviewed_at' => now(),
                ]);
            });
        } catch (\RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        Notification::create([
            'user_id' => $student->id,
            'title' => 'Offline attendance approved',
            'message' => 'Your offline manual attendance was approved. '
                .count($createdIds).(count($createdIds) === 1 ? ' shift was' : ' shifts were')
                .' credited on your DTR.',
        ]);

        return response()->json([
            'message' => 'Offline attendance approved. Hours were credited on the student DTR.',
            'request' => $this->serialize($manualAttendanceRequest->fresh(['shifts', 'student.profile', 'reviewer:id,name']), true),
            'attendance_ids' => $createdIds,
        ]);
    }

    private function canReviewStudent(User $actor, User $student): bool
    {
        if ($actor->role === 'WSPO Staff') {
            return true;
        }

        return app(UserController::class)->supervisorCanAccessStudent($actor, $student);
    }

    private function notifyReviewers(User $student, string $title, string $message): void
    {
        $accounts = app(UserController::class);
        $reviewers = User::query()
            ->whereIn('role', ['Supervisor', 'WSPO Staff'])
            ->with('profile')
            ->get()
            ->filter(function (User $reviewer) use ($accounts, $student) {
                if ($reviewer->role === 'WSPO Staff') {
                    return true;
                }

                return $accounts->supervisorCanAccessStudent($reviewer, $student);
            });

        foreach ($reviewers as $reviewer) {
            Notification::create([
                'user_id' => $reviewer->id,
                'title' => $title,
                'message' => $message,
            ]);
        }
    }

    private function serialize(ManualAttendanceRequest $row, bool $includeStudent = false): array
    {
        $payload = [
            'id' => $row->id,
            'user_id' => $row->user_id,
            'reason' => $row->reason,
            'status' => $row->status,
            'decision_note' => $row->decision_note,
            'reviewed_by' => $row->reviewer?->name,
            'reviewed_at' => $row->reviewed_at,
            'created_at' => $row->created_at,
            'updated_at' => $row->updated_at,
            'shifts' => $row->shifts->map(fn (ManualAttendanceRequestShift $shift) => [
                'id' => $shift->id,
                'date' => $shift->work_date?->toDateString(),
                'time_in' => $shift->time_in,
                'time_out' => $shift->time_out,
                'sort_order' => (int) $shift->sort_order,
                'attendance_id' => $shift->attendance_id,
            ])->values()->all(),
        ];

        if ($includeStudent) {
            $payload['student_name'] = $row->student?->name;
            $payload['student_id_number'] = $row->student?->profile?->student_id_number;
            $payload['assigned_office'] = $row->student?->profile?->assigned_office;
            $payload['year_level'] = $row->student?->profile?->year_level;
        }

        return $payload;
    }
}
