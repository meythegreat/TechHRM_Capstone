<?php
namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Application;
use App\Models\Attendance;
use App\Models\Requirement;
use App\Models\User;
use App\Support\ActivityBreakdown;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $query = ActivityLog::query()->latest();
        $this->applyCategory($query, (string) $request->query('category', 'all'));
        $this->applyName($query, (string) $request->query('name', ''));

        if ($request->user()->role === 'Super Admin') {
            $query->with(['admin' => function ($relation) {
                $relation->withTrashed()->select('id', 'name', 'role', 'deleted_at');
            }]);
        } else {
            $query->where(function ($builder) {
                $builder->whereNull('admin_id')->orWhereHas('admin');
            })->with('admin:id,name,role');
        }

        $logs = $query->paginate(15);
        $logs->getCollection()->transform(function (ActivityLog $log) {
            $log->setAttribute(
                'account_deleted',
                $log->admin_id !== null && ($log->admin === null || $log->admin->trashed())
            );

            return $log;
        });

        app(ActivityBreakdown::class)->attach($logs->getCollection());

        return response()->json($logs);
    }

    public function people(Request $request)
    {
        $users = User::query()->orderBy('name');
        if ($request->user()->role === 'Super Admin') {
            $users->withTrashed();
        }

        $names = $users->pluck('name')
            ->merge(ActivityLog::query()->whereNotNull('admin_name')->distinct()->pluck('admin_name'))
            ->map(fn ($name) => trim((string) $name))
            ->filter()
            ->unique()
            ->sort()
            ->values();

        return response()->json($names);
    }

    private function applyCategory($query, string $category): void
    {
        match ($category) {
            'session' => $query->where(function ($builder) {
                $builder->where('action', 'like', '%Login%')
                    ->orWhere('action', 'like', '%Logout%');
            }),
            'attendance' => $query->where(function ($builder) {
                $builder->where('action', 'like', '%Attendance%')
                    ->orWhere('module', 'Attendance');
            }),
            'documents' => $query->where(function ($builder) {
                $builder->where('action', 'like', '%Requirement%')
                    ->orWhere('action', 'like', '%Application%')
                    ->orWhereIn('module', ['Requirement', 'Application']);
            }),
            'schedules' => $query->where(function ($builder) {
                $builder->where('action', 'like', '%Schedule%')
                    ->orWhere('module', 'Schedule');
            }),
            'accounts' => $query->where(function ($builder) {
                $builder->where('action', 'like', '%User%')
                    ->orWhere('action', 'like', '%Profile%')
                    ->orWhereIn('module', ['User', 'UserProfile', 'Profile']);
            }),
            default => null,
        };
    }

    private function applyName($query, string $name): void
    {
        $name = trim($name);
        if ($name === '') {
            return;
        }

        $like = '%'.addcslashes($name, '%_\\').'%';
        $userIds = User::withTrashed()->where('name', 'like', $like)->pluck('id');

        $query->where(function ($builder) use ($like, $userIds) {
            $builder->where('admin_name', 'like', $like);

            if ($userIds->isEmpty()) {
                return;
            }

            $builder->orWhereIn('admin_id', $userIds);

            $attendanceIds = Attendance::whereIn('user_id', $userIds)->pluck('id');
            if ($attendanceIds->isNotEmpty()) {
                $builder->orWhere(function ($inner) use ($attendanceIds) {
                    $inner->where('module', 'Attendance')->whereIn('record_id', $attendanceIds);
                });
            }

            $requirementIds = Requirement::whereIn('user_id', $userIds)->pluck('id');
            if ($requirementIds->isNotEmpty()) {
                $builder->orWhere(function ($inner) use ($requirementIds) {
                    $inner->where('module', 'Requirement')->whereIn('record_id', $requirementIds);
                });
            }

            $applicationIds = Application::whereIn('user_id', $userIds)->pluck('id');
            if ($applicationIds->isNotEmpty()) {
                $builder->orWhere(function ($inner) use ($applicationIds) {
                    $inner->where(function ($scope) {
                        $scope->where('module', 'Application')
                            ->orWhere('action', 'Submit Application');
                    })->whereIn('record_id', $applicationIds);
                });
            }

            foreach ($userIds as $id) {
                $builder->orWhere('new_values->user_id', $id)
                    ->orWhere('new_values->user_id', (string) $id)
                    ->orWhere('old_values->user_id', $id)
                    ->orWhere('old_values->user_id', (string) $id);
            }
        });
    }
}
