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
        $activeNow = Attendance::whereNull('time_out')->count()
            + $this->onlineStaff()->count()
            + $this->signedInStudents($request->user())->count();
        $totalHoursRendered = Attendance::whereNotNull('time_out')->sum('rendered_hours');

        $hourlyRate = 28; // Standard hourly rate equivalent
        $estimatedEquivalentValue = $totalHoursRendered * $hourlyRate;

        // 2. Department Workforce Distribution
        // <-- FIXED: Changed from Profile to UserProfile
        $deptStats = UserProfile::whereNotNull('assigned_office')
            ->selectRaw('assigned_office as department, count(*) as student_count')
            ->groupBy('assigned_office')
            ->orderByDesc('student_count')
            ->take(6) // Top 6 departments
            ->get();

        // 3. Recent Activity (Last 5 clock-ins/outs globally)
        $recentActivity = Attendance::query()
            ->visibleTo('Super Admin')
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get();

        return response()->json([
            'total_students' => $totalStudents,
            'active_now' => $activeNow,
            'total_hours' => round($totalHoursRendered, 2),
            'estimated_equivalent_value' => round($estimatedEquivalentValue, 2),
            'department_stats' => $deptStats,
            'recent_activity' => $recentActivity
        ]);
    }

    public function enrolledRoster()
    {
        $students = User::with('profile')
            ->where('role', 'Student')
            ->orderBy('name')
            ->get()
            ->groupBy(fn (User $user) => $user->profile?->assigned_office ?: 'Unassigned')
            ->sortKeys();

        return response()->json($students->map(function ($group, $office) {
            return [
                'office' => $office,
                'students' => $group->map(fn (User $user) => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'profile_picture' => $user->profile_picture,
                    'student_id_number' => $user->profile?->student_id_number,
                    'course' => $user->profile?->course,
                    'year_level' => $user->profile?->year_level,
                ])->values(),
            ];
        })->values());
    }

    public function activeNow(Request $request)
    {
        $viewer = $request->user()->loadMissing('profile');
        $students = Attendance::query()
            ->visibleTo($viewer->role)
            ->whereNull('time_out')
            ->when($viewer->role === 'Supervisor', function ($query) use ($viewer) {
                $areas = app(UserController::class)->supervisedOfficeAreas($viewer);
                if ($areas === []) {
                    $query->whereRaw('0 = 1');
                    return;
                }

                $query->whereHas('user.profile', function ($profile) use ($areas) {
                    $profile->whereIn('assigned_office', $areas);
                });
            })
            ->orderByDesc('time_in')
            ->get();

        $sessionTokens = $this->openSessionTokens($students->pluck('user_id'));
        $students->each(function (Attendance $record) use ($sessionTokens) {
            $record->setAttribute('device', $this->deviceLabel($sessionTokens->get($record->user_id, collect())));
        });

        $staff = $this->onlineStaff()->map(function (User $user) {
            $token = $user->tokens->sortByDesc(fn ($token) => $token->last_used_at ?? $token->created_at)->first();
            $departments = $user->profile?->supervised_departments;
            $office = is_array($departments) && count($departments) > 0
                ? implode(', ', $departments)
                : ($user->profile?->assigned_office ?: ($user->role === 'Supervisor' ? 'Unassigned' : 'WSPO Coordinator'));

            return [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role === 'Supervisor' ? 'Supervisor' : 'Coordinator',
                'profile_picture' => $user->profile_picture,
                'office' => $office,
                'device' => $this->deviceLabel($user->tokens),
                'online_since' => optional($token?->last_used_at ?? $token?->created_at)->toIso8601String(),
            ];
        })->values();

        $signedIn = $this->signedInStudents($viewer)->map(function (User $user) {
            $token = $user->tokens->sortByDesc(fn ($token) => $token->last_used_at ?? $token->created_at)->first();

            return [
                'id' => $user->id,
                'name' => $user->name,
                'profile_picture' => $user->profile_picture,
                'office' => $user->profile?->assigned_office ?: 'Unassigned',
                'device' => $this->deviceLabel($user->tokens),
                'online_since' => optional($token?->last_used_at ?? $token?->created_at)->toIso8601String(),
            ];
        })->values();

        return response()->json([
            'students' => $students,
            'signed_in' => $signedIn,
            'staff' => $staff,
        ]);
    }

    /** Students with a live login who are not currently clocked in. */
    private function signedInStudents(User $viewer)
    {
        $now = now();
        $query = User::with(['profile', 'tokens' => function ($tokens) use ($now) {
            $this->openSessions($tokens, $now);
        }])
            ->where('role', 'Student')
            ->whereHas('tokens', function ($tokens) use ($now) {
                $this->openSessions($tokens, $now);
            })
            ->whereDoesntHave('attendances', function ($attendance) {
                $attendance->whereNull('time_out');
            });

        if ($viewer->role === 'Supervisor') {
            $areas = app(UserController::class)->supervisedOfficeAreas($viewer);
            if ($areas === []) {
                $query->whereRaw('0 = 1');
            } else {
                $query->whereHas('profile', function ($profile) use ($areas) {
                    $profile->whereIn('assigned_office', $areas);
                });
            }
        }

        return $query->orderBy('name')->get();
    }

    private function openSessions($query, $now): void
    {
        $query->where(function ($expiry) use ($now) {
            $expiry->whereNull('expires_at')->orWhere('expires_at', '>', $now);
        });
    }

    private function openSessionTokens($userIds)
    {
        $ids = collect($userIds)->filter()->unique()->values();
        if ($ids->isEmpty()) {
            return collect();
        }

        $now = now();

        return \Laravel\Sanctum\PersonalAccessToken::query()
            ->where('tokenable_type', (new User)->getMorphClass())
            ->whereIn('tokenable_id', $ids)
            ->tap(fn ($query) => $this->openSessions($query, $now))
            ->get()
            ->groupBy('tokenable_id');
    }

    /** Web logins are desktop. The mobile app issues a separate session name. */
    private function deviceLabel($tokens): ?string
    {
        $labels = collect($tokens)
            ->sortByDesc(fn ($token) => $token->last_used_at ?? $token->created_at)
            ->map(function ($token) {
                return match ($token->name) {
                    'mobile-auth-token' => 'Mobile',
                    'auth_token' => 'Desktop',
                    default => null,
                };
            })
            ->filter()
            ->unique()
            ->values();

        return $labels->isEmpty() ? null : $labels->implode(' · ');
    }

    /** Supervisors and WSPO coordinators with a session that has not expired or been logged out. */
    private function onlineStaff()
    {
        $now = now();

        return User::with(['profile', 'tokens' => function ($query) use ($now) {
            $this->openSessions($query, $now);
        }])
            ->where(function ($query) {
                $query->where('role', 'Supervisor')
                    ->orWhere('role', 'WSPO Staff');
            })
            ->whereHas('tokens', function ($query) use ($now) {
                $this->openSessions($query, $now);
            })
            ->orderBy('name')
            ->get()
            ->filter(fn (User $user) => $user->role === 'Supervisor' || $this->isCoordinator($user))
            ->values();
    }

    private function isCoordinator(User $user): bool
    {
        if ($user->role !== 'WSPO Staff') {
            return false;
        }

        $position = trim((string) ($user->profile?->assigned_office ?? ''));

        return $position === ''
            || strcasecmp($position, 'WSPO Coordinator') === 0
            || strcasecmp($position, 'WSPO') === 0;
    }
}
