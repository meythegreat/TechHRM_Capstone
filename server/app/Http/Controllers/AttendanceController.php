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

        return response()->json($history);
    }

    // 4. Admin View: Get EVERYONE'S attendance
    // Fetch all attendance records for the Admin/Supervisor Dashboard
    public function index(Request $request)
    {
        $user = $request->user();

        // Eager load the student's user account and their specific profile
        $query = \App\Models\Attendance::with(['user.profile'])
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
        $attendances = Attendance::with('user.profile')->orderBy('time_in', 'desc')->get();

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
        $query = \App\Models\Attendance::with('user.profile')->orderBy('time_in', 'desc');

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

    // Approve a student's timesheet
    public function approve($id)
    {
        $attendance = \App\Models\Attendance::findOrFail($id);
        $attendance->update([
            'status' => 'approved'
        ]);

        // --- NEW: NOTIFY THE STUDENT ---
        \App\Models\Notification::create([
            'user_id' => $attendance->user_id,
            'title' => 'Timesheet Approved',
            'message' => 'Your timesheet for ' . \Carbon\Carbon::parse($attendance->time_in)->format('M d') . ' has been approved by your supervisor.'
        ]);

        return response()->json(['message' => 'Timesheet approved successfully!']);
    }
}
