<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AttendanceController extends Controller
{
    // 1. Clock In
    public function clockIn(Request $request)
    {
        $user = $request->user();

        // Check if the user already has an active shift (clocked in, but hasn't clocked out)
        $activeShift = Attendance::where('user_id', $user->id)
            ->whereNull('time_out')
            ->first();

        if ($activeShift) {
            return response()->json(['message' => 'You are already clocked in.'], 422);
        }

        $attendance = Attendance::create([
            'user_id' => $user->id,
            'time_in' => now(),
            'status' => 'Present',
        ]);

        // Accounting: Log the activity
        DB::table('logs')->insert([
            'user_id' => $user->id,
            'activity' => "Clocked In",
            'created_at' => now(),
        ]);

        return response()->json(['message' => 'Successfully clocked in!', 'attendance' => $attendance]);
    }

    // 2. Clock Out
    public function clockOut(Request $request)
    {
        $user = $request->user();

        // 1. Find the active attendance record (where time_out is still null)
        $attendance = \App\Models\Attendance::where('user_id', $user->id) // Adjust model name if needed
            ->whereNull('time_out')
            ->first();

        if (!$attendance) {
            return response()->json(['message' => 'No active time-in record found.'], 400);
        }

        // 2. Capture the exact current time using your 'Asia/Manila' timezone
        $now = now();

        // 3. Parse the Time In from the database
        $timeIn = \Carbon\Carbon::parse($attendance->time_in);

        // 4. THE FIX: Calculate total minutes strictly from Time In -> Time Out
        // By doing it in minutes first and dividing by 60, we get accurate decimals
        $totalMinutes = $timeIn->diffInMinutes($now);
        $renderedHours = round($totalMinutes / 60, 2);

        // 5. Save the final data
        $attendance->update([
            'time_out' => $now,
            'rendered_hours' => $renderedHours,
            // 'status' => 'Completed' // (Optional depending on your logic)
        ]);

        return response()->json([
            'message' => 'Clocked out successfully!',
            'rendered_hours' => $renderedHours
        ]);
    }

    // 3. Get the logged-in student's personal attendance history
    public function myHistory(Request $request)
    {
        $history = Attendance::where('user_id', $request->user()->id)
            ->orderBy('time_in', 'desc')
            ->get();

        return response()->json($history);
    }

    // 4. Admin View: Get EVERYONE'S attendance
    public function index()
    {
        // Eager load the user data so admins can see who the record belongs to
        $attendances = Attendance::with('user')->orderBy('time_in', 'desc')->get();
        return response()->json($attendances);
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
}
