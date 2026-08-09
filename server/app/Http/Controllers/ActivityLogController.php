<?php
namespace App\Http\Controllers;
use App\Models\ActivityLog;

class ActivityLogController extends Controller
{
    public function index()
    {
        $logs = ActivityLog::with('admin:id,name,role')->latest()->paginate(15);
        return response()->json($logs);
    }
}
