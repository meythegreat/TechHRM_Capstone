<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Attendance;
use App\Models\ActivityLog;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;

class AdminDashboardController extends Controller
{
    public function getMetrics(): JsonResponse
    {
        $totalWorkingStudents = User::where('role', 'User')->count();


        // Temporarily hardcode this to 0 to bypass the missing column error
        $activeDeployments = User::where('role', 'User')
                         ->whereNotNull('department_id')
                         ->count();

        $presentToday = Attendance::whereDate('time_in', Carbon::today())->count();

        // Make sure the activity log is also temporarily an empty array if you haven't built it
        $recentActions = ActivityLog::latest()->take(5)->get();

        return response()->json([
            'total_students' => $totalWorkingStudents,
            'active_deployments' => $activeDeployments,
            'present_today' => $presentToday,
            'recent_actions' => $recentActions
        ]);
    }
}
