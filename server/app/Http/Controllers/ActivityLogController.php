<?php
namespace App\Http\Controllers;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $query = ActivityLog::query()->latest();

        if ($request->user()->role === 'Super Admin') {
            $query->with(['admin' => function ($relation) {
                $relation->withTrashed()->select('id', 'name', 'role', 'deleted_at');
            }]);
        } else {
            $query->whereHas('admin')->with('admin:id,name,role');
        }

        $logs = $query->paginate(15);
        $logs->getCollection()->transform(function (ActivityLog $log) {
            $log->setAttribute('account_deleted', $log->admin === null || $log->admin->trashed());

            return $log;
        });

        return response()->json($logs);
    }
}
