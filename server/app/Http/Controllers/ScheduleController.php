<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Schedule;

class ScheduleController extends Controller
{
    public function mySchedule(Request $request)
    {
        // Fetch schedules belonging to the logged-in user, ordered by creation (or day)
        $schedules = Schedule::where('user_id', $request->user()->id)->get();

        return response()->json($schedules);
    }
}
