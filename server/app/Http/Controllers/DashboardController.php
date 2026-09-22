<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Attendance;
use App\Models\ActivityLog;
use App\Models\DisciplinaryRecord;
use App\Models\Schedule;
use App\Models\Task;
use Carbon\Carbon;

class DashboardController extends Controller
{
    public function getStats(Request $request)
    {
        $user = $request->user()->loadMissing('profile');

        // Default queries (For Super Admin & WSPO Staff who see everything)
        $studentsQuery = User::where('role', 'Student');
        $attendanceQuery = Attendance::query();

        // Supervisors only see working students assigned to their supervised departments.
        if ($user->role === 'Supervisor') {
            $areas = $this->supervisedDepartmentAreas($user);

            if ($areas === []) {
                $studentsQuery->whereRaw('0 = 1');
                $attendanceQuery->whereRaw('0 = 1');
            } else {
                $studentsQuery->whereHas('profile', function ($q) use ($areas) {
                    $q->whereIn('assigned_office', $areas);
                });
                $attendanceQuery->whereHas('user.profile', function ($q) use ($areas) {
                    $q->whereIn('assigned_office', $areas);
                });
            }
        }

        $activeStudents = $studentsQuery->count();

        // Get hours logged strictly for this week
        $startOfWeek = Carbon::now()->startOfWeek();
        $endOfWeek = Carbon::now()->endOfWeek();

        $totalHoursThisWeek = (clone $attendanceQuery)
            ->whereBetween('time_in', [$startOfWeek, $endOfWeek])
            ->sum('rendered_hours');

        $activityQuery = ActivityLog::query()
            ->whereHas('admin', function ($q) {
                $q->where('role', 'Student');
            })
            ->where(function ($q) {
                $q->whereIn('action', ['System Login', 'System Logout'])
                    ->orWhere('action', 'not like', '%Attendance%');
            })
            ->with(['admin:id,name,role', 'admin.profile']);

        $recentAttendanceQuery = (clone $attendanceQuery)
            ->with(['user:id,name,role', 'user.profile'])
            ->whereHas('user', function ($q) {
                $q->where('role', 'Student');
            });

        if ($user->role === 'Supervisor') {
            $areas = $this->supervisedDepartmentAreas($user);
            if ($areas === []) {
                $activityQuery->whereRaw('0 = 1');
            } else {
                $activityQuery->whereHas('admin.profile', function ($q) use ($areas) {
                    $q->whereIn('assigned_office', $areas);
                });
            }
        }

        $sessionActivity = $activityQuery
            ->latest()
            ->take(10)
            ->get()
            ->map(function (ActivityLog $log) {
                return [
                    'id' => 'log-'.$log->id,
                    'student_name' => $log->admin_name ?: ($log->admin?->name ?? 'Student'),
                    'action' => $log->action,
                    'description' => $log->description,
                    'office' => $log->admin?->profile?->assigned_office,
                    'created_at' => $log->created_at,
                ];
            });

        $attendanceActivity = $recentAttendanceQuery
            ->orderByDesc('updated_at')
            ->take(10)
            ->get()
            ->map(function (Attendance $record) {
                $clockedOut = $record->time_out !== null;

                return [
                    'id' => 'attendance-'.$record->id.'-'.($clockedOut ? 'out' : 'in'),
                    'student_name' => $record->user?->name ?? 'Student',
                    'action' => $clockedOut ? 'Clocked Out' : 'Clocked In',
                    'description' => $clockedOut
                        ? 'clocked out of their shift.'
                        : 'clocked in for their shift.',
                    'office' => $record->user?->profile?->assigned_office,
                    'created_at' => $record->updated_at,
                ];
            });

        $recentStudentActivity = $sessionActivity
            ->concat($attendanceActivity)
            ->sortByDesc(function (array $item) {
                return Carbon::parse($item['created_at'])->timestamp;
            })
            ->take(10)
            ->values();

        return response()->json([
            'activeStudents' => $activeStudents,
            'pendingApprovals' => 0, // We can build the approval system later!
            'totalHoursThisWeek' => round($totalHoursThisWeek, 2),
            'recentStudentActivity' => $recentStudentActivity,
        ]);
    }

    /**
     * Logged-in working student's dashboard.
     * Hours come from completed attendance. Performance blends attendance quality,
     * task completion, and open disciplinary records.
     */
    public function studentOverview(Request $request)
    {
        $user = $request->user();
        $requiredHours = 100.0;

        $records = Attendance::where('user_id', $user->id)->get();
        $totalRendered = $records->sum(function (Attendance $record) {
            return $record->computed_hours > 0
                ? (float) $record->computed_hours
                : (float) ($record->rendered_hours ?? 0);
        });

        $openViolations = DisciplinaryRecord::where('student_id', $user->id)
            ->whereNotIn('status', ['Resolved', 'Dismissed'])
            ->get();

        $penaltyHours = (float) $openViolations->sum('penalty_hours');
        $creditedHours = max(0, $totalRendered - $penaltyHours);

        $completedShifts = $records->filter(fn (Attendance $record) => $record->time_out !== null);
        $tasks = Task::where('student_id', $user->id)->get();
        $hasActivity = $completedShifts->isNotEmpty() || $tasks->isNotEmpty() || $openViolations->isNotEmpty();

        $components = [];

        if ($completedShifts->isNotEmpty()) {
            $cleanShifts = $completedShifts->filter(fn (Attendance $record) => !$record->is_anomaly)->count();
            $components[] = [
                'score' => ($cleanShifts / $completedShifts->count()) * 100,
                'weight' => 50,
            ];
        }

        if ($tasks->isNotEmpty()) {
            $finished = $tasks->whereIn('status', ['Completed', 'Verified'])->count();
            $components[] = [
                'score' => ($finished / $tasks->count()) * 100,
                'weight' => 30,
            ];
        }

        if ($hasActivity) {
            $components[] = [
                'score' => max(0, 100 - ($openViolations->count() * 20) - min(30, $penaltyHours * 2)),
                'weight' => 20,
            ];
        }

        $weightTotal = array_sum(array_column($components, 'weight'));
        $performance = 0;
        if ($weightTotal > 0) {
            $weighted = 0;
            foreach ($components as $component) {
                $weighted += $component['score'] * $component['weight'];
            }
            $performance = (int) round($weighted / $weightTotal);
        }

        $dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        $todayIndex = Carbon::now()->dayOfWeek;

        $upcomingSchedules = Schedule::where('user_id', $user->id)
            ->get()
            ->map(function (Schedule $shift) use ($dayOrder, $todayIndex) {
                $parts = array_map('trim', explode(' - ', (string) $shift->time, 2));
                $dayIndex = array_search($shift->day, $dayOrder, true);
                $offset = $dayIndex === false ? 7 : (($dayIndex - $todayIndex + 7) % 7);

                return [
                    'id' => $shift->id,
                    'day' => $shift->day,
                    'time_start' => $parts[0] ?? (string) $shift->time,
                    'time_end' => $parts[1] ?? '',
                    'location' => $shift->department ?: ($shift->duty_type ?: 'Assigned duty'),
                    'sort' => $offset,
                ];
            })
            ->sortBy('sort')
            ->values()
            ->map(fn (array $shift) => [
                'id' => $shift['id'],
                'day' => $shift['day'],
                'time_start' => $shift['time_start'],
                'time_end' => $shift['time_end'],
                'location' => $shift['location'],
            ]);

        return response()->json([
            'total_hours_rendered' => round($creditedHours, 2),
            'logged_hours' => round($totalRendered, 2),
            'penalty_hours' => round($penaltyHours, 2),
            'required_hours' => $requiredHours,
            'performance_score' => $performance,
            'has_activity' => $hasActivity,
            'violations' => $openViolations->count(),
            'upcoming_schedules' => $upcomingSchedules,
        ]);
    }

    private function supervisedDepartmentAreas(User $user): array
    {
        $configured = $user->profile?->supervised_departments;
        $departments = is_array($configured) ? $configured : [];

        if ($departments === [] && $user->profile?->assigned_office) {
            $departments[] = $user->profile->assigned_office;
        }

        $departments = array_values(array_unique(array_filter(array_map('trim', $departments))));
        if ($departments === []) {
            return [];
        }

        $areas = [];
        foreach ($departments as $department) {
            $areas = array_merge($areas, $this->departmentAliases($department));
        }

        return array_values(array_unique($areas));
    }

    private function departmentAliases(string $department): array
    {
        $groups = [
            ['CCS', 'College of Computer Studies', 'College of Computer Studies (CCS)', 'CCS Office'],
            ['CBA', 'College of Business and Accountancy', 'College of Business Administration', 'Business Office'],
            ['CHTM', 'College of Hotel and Tourism Management', 'College of Hospitality and Tourism Management'],
            ['CCJE', 'College of Criminal Justice Education'],
            ['COE', 'College of Engineering'],
            ['CON', 'College of Nursing'],
            ['CTE', 'College of Teacher Education'],
            ['CAS', 'College of Arts and Sciences'],
            ['GS', 'Graduate School'],
            ['SHS', 'Senior High School Department'],
            ['JHS', 'Junior High School Department'],
            ['ES', 'Elementary Department'],
            ['PS', 'Pre-School Department'],
        ];

        $normalized = strtolower((string) preg_replace('/[^a-z0-9]/i', '', $department));
        foreach ($groups as $group) {
            $aliases = array_map(
                fn (string $name) => strtolower((string) preg_replace('/[^a-z0-9]/i', '', $name)),
                $group
            );
            if (in_array($normalized, $aliases, true)) {
                return $group;
            }
        }

        return array_values(array_unique([
            trim($department),
            trim((string) preg_replace('/\\s*\\([^)]*\\)/', '', $department)),
        ]));
    }
}
