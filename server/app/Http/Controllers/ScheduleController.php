<?php

namespace App\Http\Controllers;

use App\Models\Schedule;
use Illuminate\Http\Request;

class ScheduleController extends Controller
{
    // 1. For the STUDENT Dashboard (Shows only their own schedule)
    public function mySchedule(Request $request)
    {
        $schedules = Schedule::where('user_id', $request->user()->id)->get();
        return response()->json($schedules);
    }

    // 2. For the ADMIN Dashboard (Shows ALL schedules + the student's name)
    public function index()
    {
        $schedules = Schedule::with('user:id,name')->orderBy('day')->get();
        return response()->json($schedules);
    }

    // 3. For Assigning a New Shift
    public function store(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'day' => 'required|string',
            'time' => 'required|string',
            'duty_type' => 'required|string',
            'department' => 'required|string',
            'supervisor' => 'required|string',
        ]);

        $schedule = Schedule::create($validated);

        return response()->json([
            'message' => 'Schedule assigned successfully!',
            'schedule' => $schedule
        ]);
    }

    // 4. For Removing a Shift
    public function destroy($id)
    {
        $schedule = Schedule::findOrFail($id);
        $schedule->delete();

        return response()->json([
            'message' => 'Schedule removed successfully!'
        ]);
    }
}
