<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use App\Models\Schedule;

class AttendanceController extends Controller
{
    // 1. Clock In
    public function clockIn(Request $request)
    {
        $user = $request->user();

        // 1. PREVENT DOUBLE CLOCK-INS
        $activeRecord = \App\Models\Attendance::where('user_id', $user->id)
            ->whereNull('time_out')
            ->first();

        if ($activeRecord) {
            return response()->json(['message' => 'You are already clocked in!'], 422);
        }

        $suspension = \App\Models\DisciplinaryRecord::activeSuspension($user->id);
        if ($suspension) {
            return response()->json([
                'message' => $suspension->suspensionNotice(),
            ], 403);
        }

        // --- 2. SMART SCHEDULE CHECK ---
        $now = Carbon::now();
        $currentDay = $now->format('l'); // Gets 'Monday', 'Tuesday', etc.

        // Fetch all shifts assigned to this student for TODAY
        $todaysShifts = Schedule::where('user_id', $user->id)
            ->where('day', $currentDay)
            ->get();

        $hasValidShift = false;
        $gracePeriodMinutes = 30; // Allow students to clock in 30 minutes early

        foreach ($todaysShifts as $shift) {
            $times = explode(' - ', $shift->time);

            if (count($times) === 2) {
                // Parse the shift times assuming they are for today
                $shiftStart = Carbon::parse($times[0]);
                $shiftEnd = Carbon::parse($times[1]);

                // Handle overnight shifts (e.g., 10:00 PM to 2:00 AM)
                if ($shiftEnd->lt($shiftStart)) {
                    $shiftEnd->addDay();
                }

                // Check if right NOW is between (Start Time - 30 mins) and (End Time)
                if ($now->between($shiftStart->copy()->subMinutes($gracePeriodMinutes), $shiftEnd)) {
                    $hasValidShift = true;
                    break;
                }
            }
        }

        // If the loop finishes and no valid shift was found, reject them!
        if (!$hasValidShift) {
            return response()->json([
                'message' => "Access Denied: You do not have an active shift scheduled right now."
            ], 403);
        }
        // --- END SMART CHECK ---

        // 3. IF THEY PASS THE CHECK, SAVE THE ATTENDANCE
        $attendance = \App\Models\Attendance::create([
            'user_id' => $user->id,
            'time_in' => $now,
            'work_type' => $request->work_type ?? 'Unspecified',
        ]);

        return response()->json([
            'message' => 'Successfully clocked in! Have a great shift.',
            'record' => $attendance
        ]);
    }

    // 2. Clock Out
    public function clockOut(Request $request)
    {
        $validated = $request->validate([
            'task_description' => 'required|string'
        ]);

        $user = $request->user();

        // Find the active attendance record
        $attendance = \App\Models\Attendance::where('user_id', $user->id)
            ->whereNull('time_out')
            ->latest('time_in')
            ->first();

        if (!$attendance) {
            return response()->json(['message' => 'No active clock-in found.'], 400);
        }

        // Calculate hours and update
        $timeOut = \Carbon\Carbon::now();
        $timeIn = \Carbon\Carbon::parse($attendance->time_in);
        $hours = $timeIn->diffInMinutes($timeOut) / 60;

        $attendance->update([
            'time_out' => $timeOut,
            'task_description' => $validated['task_description'],
            'rendered_hours' => round($hours, 2)
        ]);

        // FIX: Return a structured JSON response with a 'message' key!
        return response()->json([
            'message' => 'Successfully clocked out!',
            'data' => $attendance
        ]);
    }

    // 3. Get the logged-in student's personal attendance history
    public function myHistory(Request $request)
    {
        $query = \App\Models\Attendance::where('user_id', $request->user()->id);

        // If the frontend sends a start date, filter it
        if ($request->has('start') && $request->start != '') {
            $query->whereDate('time_in', '>=', $request->start);
        }

        // If the frontend sends an end date, filter it
        if ($request->has('end') && $request->end != '') {
            $query->whereDate('time_in', '<=', $request->end);
        }

        $history = $query->orderBy('time_in', 'desc')->get();

        return response()->json([
            'history' => $history,
            'duty_deduction_hours' => \App\Models\DisciplinaryRecord::dutyDeductionHours(
                $request->user()->id,
                $request->filled('start') ? $request->start : null,
                $request->filled('end') ? $request->end : null,
            ),
        ]);
    }

    /** Official monthly DTR for one working student. Supervisors only see students in their departments. */
    public function studentHistory(Request $request, $id)
    {
        $actor = $request->user()->loadMissing('profile');
        if (!in_array($actor->role, ['Supervisor', 'WSPO Staff', 'Super Admin'], true)) {
            return response()->json(['message' => 'You cannot view a student DTR.'], 403);
        }

        $studentQuery = \App\Models\User::with('profile')->where('role', 'Student');
        if ($actor->role === 'Super Admin') {
            $studentQuery->withTrashed();
        }
        $student = $studentQuery->findOrFail($id);

        if ($actor->role === 'Supervisor' && !app(\App\Http\Controllers\UserController::class)->supervisorCanAccessStudent($actor, $student)) {
            return response()->json(['message' => 'You can only view DTRs for working students in your department.'], 403);
        }

        $query = \App\Models\Attendance::where('user_id', $student->id);

        if ($request->filled('start')) {
            $query->whereDate('time_in', '>=', $request->start);
        }
        if ($request->filled('end')) {
            $query->whereDate('time_in', '<=', $request->end);
        }

        $office = $student->profile?->assigned_office;
        $supervisors = app(\App\Http\Controllers\UserController::class)->supervisorNamesForOffice($office);

        return response()->json([
            'student' => [
                'id' => $student->id,
                'name' => $student->name,
                'profile' => $student->profile,
                'department_supervisors' => $supervisors,
                'account_deleted' => $student->trashed(),
            ],
            'history' => $query->orderBy('time_in', 'desc')->get(),
            'duty_deduction_hours' => \App\Models\DisciplinaryRecord::dutyDeductionHours(
                $student->id,
                $request->filled('start') ? $request->start : null,
                $request->filled('end') ? $request->end : null,
            ),
        ]);
    }

    // 4. Admin View: Get EVERYONE'S attendance
    // Fetch all attendance records for the Admin/Supervisor Dashboard
    public function index(Request $request)
    {
        $user = $request->user();

        $query = \App\Models\Attendance::query()
            ->visibleTo($user->role)
            ->orderBy('created_at', 'desc');

        // MULTI-TENANT CHECK: If Supervisor, lock down to their department
        if ($user->role === 'Supervisor') {
            $myDepartment = $user->profile->assigned_office ?? 'Unassigned';

            // Only fetch attendance where the student's assigned_office matches the supervisor's
            $query->whereHas('user.profile', function($q) use ($myDepartment) {
                $q->where('assigned_office', $myDepartment);
            });
        }

        // Optional: Filter by specific date if passed from React
        if ($request->has('date') && $request->date !== '') {
            $query->whereDate('time_in', $request->date);
        }

        $records = $query->get();
        return response()->json($records);
    }

    // 5. Admin View: Export to CSV (Excel)
    public function export(Request $request)
    {
        $fileName = 'WSPO_Timesheet_Export_' . date('Y-m-d') . '.csv';

        // Eager load the user AND their student profile for complete data
        $attendances = Attendance::query()->visibleTo($request->user()->role)->orderBy('time_in', 'desc')->get();

        $headers = array(
            "Content-type"        => "text/csv",
            "Content-Disposition" => "attachment; filename=$fileName",
            "Pragma"              => "no-cache",
            "Cache-Control"       => "must-revalidate, post-check=0, pre-check=0",
            "Expires"             => "0"
        );

        $columns = ['Student Name', 'Student ID', 'Assigned Office', 'Time In', 'Time Out', 'Rendered Hours', 'Status'];

        $callback = function () use ($attendances, $columns) {
            $file = fopen('php://output', 'w');

            // Add University & Office Headers
            fputcsv($file, ['Filamer Christian University, Inc.']);
            fputcsv($file, ['Working Students Program Office - TechHRM System']);
            fputcsv($file, ['Generated on: ' . now()->format('F j, Y, g:i a')]);
            fputcsv($file, []); // Blank row for spacing

            // Add Table Columns
            fputcsv($file, $columns);

            // Populate Data
            foreach ($attendances as $record) {
                $row['Student Name'] = $record->user->fullname;
                $row['Student ID'] = $record->user->profile->student_id_number ?? 'N/A';
                $row['Assigned Office'] = $record->user->profile->assigned_office ?? 'N/A';
                $row['Time In'] = $record->time_in;
                $row['Time Out'] = $record->time_out ?? 'Active Shift';
                $row['Rendered Hours'] = $record->rendered_hours ?? '-';
                $row['Status'] = $record->status;

                fputcsv($file, array(
                    $row['Student Name'],
                    $row['Student ID'],
                    $row['Assigned Office'],
                    $row['Time In'],
                    $row['Time Out'],
                    $row['Rendered Hours'],
                    $row['Status']
                ));
            }

            fclose($file);
        };

        // Accounting: Log the export activity
        DB::table('logs')->insert([
            'user_id' => $request->user()->id,
            'activity' => "Exported Timesheet Records to Excel/CSV",
            'created_at' => now(),
        ]);

        return response()->stream($callback, 200, $headers);
    }

    public function allHistory(Request $request)
    {
        $user = $request->user();

        // Fetch attendances and include the user's name and profile data
        $query = \App\Models\Attendance::query()->visibleTo($user->role)->orderBy('time_in', 'desc');

        // If it is a Supervisor, strictly filter to show only their department's students
        if ($user->role === 'Supervisor' && $user->department_id) {
            $departmentId = $user->department_id;
            $query->whereHas('user.profile', function($q) use ($departmentId) {
                $q->where('department_id', $departmentId);
            });
        }

        // Return the paginated data!
        return response()->json($query->paginate(15));
    }

    // Accept or reject a student's timesheet after they have timed out (department supervisor only)
    public function approve(Request $request, $id)
    {
        $user = $request->user()->loadMissing('profile');

        $accounts = app(\App\Http\Controllers\UserController::class);
        if ($user->role !== 'Supervisor' && !$accounts->isWspoDepartmentSupervisor($user)) {
            return response()->json(['message' => 'Only department supervisors can accept or reject attendance.'], 403);
        }

        $decision = $request->input('status', 'accepted');
        if (!in_array($decision, ['accepted', 'rejected'], true)) {
            return response()->json(['message' => 'Choose accepted or rejected.'], 422);
        }

        $attendance = \App\Models\Attendance::with('user.profile')->findOrFail($id);
        if (!$attendance->time_out) {
            return response()->json(['message' => 'The student must time out for the day before this record can be accepted or rejected.'], 422);
        }

        if (!$attendance->user || !$accounts->supervisorCanAccessStudent($user, $attendance->user)) {
            return response()->json(['message' => 'You can only review attendance for students in your department.'], 403);
        }

        $attendance->update([
            'status' => $decision
        ]);

        $verb = $decision === 'accepted' ? 'accepted' : 'rejected';
        \App\Models\Notification::create([
            'user_id' => $attendance->user_id,
            'title' => 'Timesheet ' . ucfirst($verb),
            'message' => 'Your timesheet for ' . \Carbon\Carbon::parse($attendance->time_in)->format('M d') . ' has been ' . $verb . ' by your supervisor.'
        ]);

        return response()->json(['message' => 'Timesheet ' . $verb . ' successfully!']);
    }

    /** Supervisor records both time in and time out on a student's DTR. */
    public function storeManual(Request $request)
    {
        $supervisor = $this->departmentSupervisor($request);
        if ($supervisor instanceof \Illuminate\Http\JsonResponse) {
            return $supervisor;
        }

        $validated = $request->validate([
            'user_id' => 'required|integer',
            'date' => 'required|date_format:Y-m-d',
            'time_in' => ['required', 'regex:/^\d{2}:\d{2}$/'],
            'time_out' => ['required', 'regex:/^\d{2}:\d{2}$/'],
            'task_description' => 'nullable|string|max:1000',
        ]);

        $student = \App\Models\User::with('profile')->where('role', 'Student')->findOrFail($validated['user_id']);
        $accounts = app(\App\Http\Controllers\UserController::class);
        if (!$accounts->supervisorCanAccessStudent($supervisor, $student)) {
            return response()->json(['message' => $this->dtrAccessMessage($supervisor)], 403);
        }

        [$timeIn, $timeOut, $error] = $this->resolveManualTimes($validated['date'], $validated['time_in'], $validated['time_out']);
        if ($error) {
            return response()->json(['message' => $error], 422);
        }

        if ($this->manualTimesOverlap((int) $student->id, $timeIn, $timeOut)) {
            return response()->json(['message' => 'These times overlap another DTR entry for this student.'], 422);
        }

        $hours = round($timeIn->diffInMinutes($timeOut) / 60, 2);
        $note = trim((string) ($validated['task_description'] ?? ''));

        $attendance = \App\Models\Attendance::create([
            'user_id' => $student->id,
            'attendance_type' => 'Regular',
            'time_in' => $timeIn,
            'time_out' => $timeOut,
            'rendered_hours' => $hours,
            'computed_hours' => $hours,
            'work_type' => $student->profile?->duty_type ?: 'Manual Entry',
            'task_description' => $note !== '' ? $note : 'Manually entered by supervisor.',
            'status' => 'pending',
            'is_anomaly' => $hours > 8,
            'anomaly_reason' => $hours > 8 ? 'Extended continuous shifts (Exceeded 8 hours).' : null,
        ]);

        \App\Models\Notification::create([
            'user_id' => $student->id,
            'title' => 'DTR Times Entered',
            'message' => 'Your supervisor entered a time in and time out for ' . $timeIn->format('M d, Y') . '.',
        ]);

        return response()->json([
            'message' => 'Time in and time out saved on the DTR.',
            'record' => $attendance,
        ], 201);
    }

    /** Supervisor corrects both time in and time out on an existing DTR row. */
    public function updateTimes(Request $request, $id)
    {
        $supervisor = $this->departmentSupervisor($request);
        if ($supervisor instanceof \Illuminate\Http\JsonResponse) {
            return $supervisor;
        }

        $validated = $request->validate([
            'date' => 'required|date_format:Y-m-d',
            'time_in' => ['required', 'regex:/^\d{2}:\d{2}$/'],
            'time_out' => ['required', 'regex:/^\d{2}:\d{2}$/'],
            'task_description' => 'nullable|string|max:1000',
        ]);

        $attendance = \App\Models\Attendance::with('user.profile')->findOrFail($id);
        $accounts = app(\App\Http\Controllers\UserController::class);
        if (!$attendance->user || !$accounts->supervisorCanAccessStudent($supervisor, $attendance->user)) {
            return response()->json(['message' => $this->dtrAccessMessage($supervisor)], 403);
        }

        [$timeIn, $timeOut, $error] = $this->resolveManualTimes($validated['date'], $validated['time_in'], $validated['time_out']);
        if ($error) {
            return response()->json(['message' => $error], 422);
        }

        if ($this->manualTimesOverlap((int) $attendance->user_id, $timeIn, $timeOut, (int) $attendance->id)) {
            return response()->json(['message' => 'These times overlap another DTR entry for this student.'], 422);
        }

        $hours = round($timeIn->diffInMinutes($timeOut) / 60, 2);
        $payload = [
            'time_in' => $timeIn,
            'time_out' => $timeOut,
            'rendered_hours' => $hours,
            'computed_hours' => $hours,
            'status' => 'pending',
            'is_anomaly' => $hours > 8,
            'anomaly_reason' => $hours > 8 ? 'Extended continuous shifts (Exceeded 8 hours).' : null,
        ];

        if ($request->exists('task_description')) {
            $note = trim((string) ($validated['task_description'] ?? ''));
            $payload['task_description'] = $note !== '' ? $note : 'Manually entered by supervisor.';
        }

        $attendance->update($payload);

        \App\Models\Notification::create([
            'user_id' => $attendance->user_id,
            'title' => 'DTR Times Updated',
            'message' => 'Your supervisor updated your time in and time out for ' . $timeIn->format('M d, Y') . '.',
        ]);

        return response()->json([
            'message' => 'Time in and time out updated. The entry is pending acceptance again.',
            'record' => $attendance->fresh(),
        ]);
    }

    private function departmentSupervisor(Request $request): \App\Models\User|\Illuminate\Http\JsonResponse
    {
        $user = $request->user()->loadMissing('profile');
        $accounts = app(\App\Http\Controllers\UserController::class);
        if ($user->role !== 'Supervisor' && !$accounts->isWspoDepartmentSupervisor($user)) {
            return response()->json(['message' => 'Only a department supervisor can enter time in and time out.'], 403);
        }

        return $user;
    }

    private function dtrAccessMessage(\App\Models\User $supervisor): string
    {
        if (app(\App\Http\Controllers\UserController::class)->isWspoDepartmentSupervisor($supervisor)) {
            return 'You can only enter times for working students assigned to your office.';
        }

        return 'You can only enter times for working students in your department.';
    }

    /** @return array{0: ?\Carbon\Carbon, 1: ?\Carbon\Carbon, 2: ?string} */
    private function resolveManualTimes(string $date, string $timeIn, string $timeOut): array
    {
        $start = \Carbon\Carbon::createFromFormat('Y-m-d H:i', $date . ' ' . $timeIn);
        $end = \Carbon\Carbon::createFromFormat('Y-m-d H:i', $date . ' ' . $timeOut);

        if (!$start || !$end) {
            return [null, null, 'Enter a valid time in and time out.'];
        }

        if ($end->lte($start)) {
            $end = $end->copy()->addDay();
        }

        if ($start->greaterThan(now())) {
            return [null, null, 'Time in cannot be in the future.'];
        }

        if ($end->greaterThan(now())) {
            return [null, null, 'Time out cannot be in the future.'];
        }

        $minutes = $start->diffInMinutes($end);
        if ($minutes < 1) {
            return [null, null, 'Time out must be after time in.'];
        }

        if ($minutes > 16 * 60) {
            return [null, null, 'A single duty entry cannot be longer than 16 hours.'];
        }

        return [$start, $end, null];
    }

    private function manualTimesOverlap(int $userId, \Carbon\Carbon $start, \Carbon\Carbon $end, ?int $ignoreId = null): bool
    {
        return \App\Models\Attendance::where('user_id', $userId)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->where('time_in', '<', $end)
            ->where(function ($query) use ($start) {
                $query->whereNull('time_out')->orWhere('time_out', '>', $start);
            })
            ->exists();
    }
}
