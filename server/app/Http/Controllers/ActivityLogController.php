<?php
namespace App\Http\Controllers;
use App\Models\ActivityLog;

class ActivityLogController extends Controller
{
    public function index()
    {
        $logs = ActivityLog::orderBy('created_at', 'desc')->paginate(15);
        return response()->json($logs);
    }
}
