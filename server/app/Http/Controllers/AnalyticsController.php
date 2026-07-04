<?php

namespace App\Http\Controllers;

use App\Models\Application;
use App\Models\Attendance;
use App\Models\DisciplinaryRecord;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    public function getDashboardStats()
    {
        $totalStudents = User::where('role', 'Student')->count();
        $pendingApps = Application::where('status', 'Pending')->count();

        $totalHoursRendered = (float) Attendance::selectRaw(
            'SUM(COALESCE(computed_hours, rendered_hours, 0)) as total'
        )->value('total');

        $anomaliesCount = Attendance::where('is_anomaly', true)->count();
        $activePenalties = DisciplinaryRecord::where('status', 'Active')->count();

        $departmentWorkload = Attendance::query()
            ->join('users', 'attendances.user_id', '=', 'users.id')
            ->leftJoin('user_profiles', 'users.id', '=', 'user_profiles.user_id')
            ->where('users.role', 'Student')
            ->select(
                DB::raw("COALESCE(user_profiles.assigned_office, 'Unassigned') as department"),
                DB::raw('SUM(COALESCE(attendances.computed_hours, attendances.rendered_hours, 0)) as total_hours')
            )
            ->groupBy('department')
            ->orderByDesc('total_hours')
            ->get()
            ->map(fn ($row) => [
                'department' => $row->department,
                'total_hours' => round((float) $row->total_hours, 2),
            ]);

        return response()->json([
            'summary' => [
                'total_students' => $totalStudents,
                'pending_applications' => $pendingApps,
                'total_hours_rendered' => round($totalHoursRendered, 2),
                'active_anomalies' => $anomaliesCount,
                'active_penalties' => $activePenalties,
            ],
            'department_workload' => $departmentWorkload,
        ]);
    }

    public function exportAttendance()
    {
        $attendances = Attendance::with('user:id,name')->orderByDesc('time_in')->get();

        $filename = 'attendance_report_' . date('Y-m-d') . '.csv';
        $headers = [
            'Content-type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=$filename",
            'Pragma' => 'no-cache',
            'Cache-Control' => 'must-revalidate, post-check=0, pre-check=0',
            'Expires' => '0',
        ];

        $callback = function () use ($attendances) {
            $file = fopen('php://output', 'w');
            fputcsv($file, ['Student Name', 'Clock In', 'Clock Out', 'Type', 'Hours Computed', 'Anomaly Flag']);

            foreach ($attendances as $record) {
                $hours = $record->computed_hours > 0
                    ? $record->computed_hours
                    : ($record->rendered_hours ?? 0);

                fputcsv($file, [
                    $record->user->name ?? 'Unknown',
                    $record->time_in,
                    $record->time_out ?? 'Ongoing',
                    $record->attendance_type ?? 'Regular',
                    $hours,
                    $record->is_anomaly ? 'YES' : 'NO',
                ]);
            }

            fclose($file);
        };

        return response()->stream($callback, 200, $headers);
    }
}
