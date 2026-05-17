<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Attendance;
use App\Models\UserProfile; // <-- FIXED: Changed from Profile to UserProfile

class AdminController extends Controller
{
    public function getStats(Request $request)
    {
        // 1. Global Campus Stats
        $totalStudents = User::where('role', 'Student')->count();
        $activeNow = Attendance::whereNull('time_out')->count();
        $totalHoursRendered = Attendance::whereNotNull('time_out')->sum('rendered_hours');

        $hourlyRate = 28; // Standard rate
        $estimatedPayroll = $totalHoursRendered * $hourlyRate;

        // 2. Department Workforce Distribution
        // <-- FIXED: Changed from Profile to UserProfile
        $deptStats = UserProfile::whereNotNull('assigned_office')
            ->selectRaw('assigned_office as department, count(*) as student_count')
            ->groupBy('assigned_office')
            ->orderByDesc('student_count')
            ->take(6) // Top 6 departments
            ->get();

        // 3. Recent Activity (Last 5 clock-ins/outs globally)
        $recentActivity = Attendance::with('user.profile')
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get();

        return response()->json([
            'total_students' => $totalStudents,
            'active_now' => $activeNow,
            'total_hours' => round($totalHoursRendered, 2),
            'estimated_payroll' => round($estimatedPayroll, 2),
            'department_stats' => $deptStats,
            'recent_activity' => $recentActivity
        ]);
    }
}
