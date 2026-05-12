<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LogController extends Controller
{
    public function index()
    {
        // Join the logs table with the users table to get the user's name
        $logs = DB::table('logs')
            ->join('users', 'logs.user_id', '=', 'users.id')
            ->select('logs.id', 'logs.activity', 'logs.created_at', 'users.fullname', 'users.username')
            ->orderBy('logs.created_at', 'desc')
            ->get();

        return response()->json($logs);
    }
}
