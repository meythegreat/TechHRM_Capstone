<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Attendance;
use Carbon\Carbon;

class DashboardController extends Controller
{
    public function getStats(Request $request)
    {
        $user = $request->user();

        // Default queries (For Super Admin & WSPO Staff who see everything)
        $studentsQuery = User::where('role', 'Student');
        $attendanceQuery = Attendance::query();

        // If it's a Supervisor, strictly filter by their department!
        // (Assuming you linked Supervisors to departments in their profile or column)
        if ($user->role === 'Supervisor') {
            $department = $user->profile?->assigned_office;
            $studentsQuery->whereHas('profile', fn ($q) => $q->where('assigned_office', $department));
            $attendanceQuery->whereHas('user.profile', fn ($q) => $q->where('assigned_office', $department));
        }

        $activeStudents = $studentsQuery->count();

        // Get hours logged strictly for this week
        $startOfWeek = Carbon::now()->startOfWeek();
        $endOfWeek = Carbon::now()->endOfWeek();

        $totalHoursThisWeek = $attendanceQuery
            ->whereBetween('time_in', [$startOfWeek, $endOfWeek])
            ->sum('rendered_hours');

        return response()->json([
            'activeStudents' => $activeStudents,
            'pendingApprovals' => 0, // We can build the approval system later!
            'totalHoursThisWeek' => round($totalHoursThisWeek, 2)
        ]);
    }
}
