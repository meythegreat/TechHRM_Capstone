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

        // Find the active shift
        $activeShift = Attendance::where('user_id', $user->id)
            ->whereNull('time_out')
            ->first();

        if (!$activeShift) {
            return response()->json(['message' => 'No active shift found. Please clock in first.'], 422);
        }

        $timeOut = now();
        $timeIn = Carbon::parse($activeShift->time_in);

        // Calculate total hours rendered (in decimal form)
        $totalMinutes = $timeOut->diffInMinutes($timeIn);
        $renderedHours = round($totalMinutes / 60, 2);

        $activeShift->update([
            'time_out' => $timeOut,
            'rendered_hours' => $renderedHours,
        ]);

        // Accounting: Log the activity
        DB::table('logs')->insert([
            'user_id' => $user->id,
            'activity' => "Clocked Out ({$renderedHours} hrs rendered)",
            'created_at' => now(),
        ]);

        return response()->json(['message' => 'Successfully clocked out!', 'attendance' => $activeShift]);
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
