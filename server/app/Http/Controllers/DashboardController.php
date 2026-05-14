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
        if ($user->role === 'Supervisor' && $user->department_id) {
            $departmentId = $user->department_id;

            $studentsQuery->whereHas('profile', function($q) use ($departmentId) {
                 $q->where('department_id', $departmentId); // Or assigned_office
            });

            $attendanceQuery->whereHas('user.profile', function($q) use ($departmentId) {
                 $q->where('department_id', $departmentId);
            });
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
