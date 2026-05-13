<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog; // Change to App\Models\Log if your model is just named "Log"
use Illuminate\Http\Request;

class LogController extends Controller
{
    /**
     * Display a listing of the system logs.
     */
    public function index()
    {
        // Fetch all logs, eager load the 'user' relationship, and sort by newest first
        $logs = ActivityLog::with('user')->latest()->get();

        return response()->json($logs);
    }
}
