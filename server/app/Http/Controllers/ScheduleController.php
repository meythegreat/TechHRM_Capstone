<?php

namespace App\Http\Controllers;

use App\Models\Schedule;
use Illuminate\Http\Request;
use Carbon\Carbon;

class ScheduleController extends Controller
{
    // 1. For the STUDENT Dashboard (Shows only their own schedule)
    public function mySchedule(Request $request)
    {
        $schedules = Schedule::where('user_id', $request->user()->id)->get();
        return response()->json($schedules);
    }

    // 2. For the ADMIN Dashboard (Filtered by Role!)
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Schedule::with('user:id,name');

        // IF THE USER IS A SUPERVISOR: Strict Department Filter
        if ($user->role === 'Supervisor') {
            $myDepartment = $user->profile->assigned_office ?? 'Unassigned';
            $query->where('department', $myDepartment);
        }

        $schedules = $query->orderBy('day')->get();
        return response()->json($schedules);
    }

    // 3. For Assigning a New Shift (WITH SMART OVERLAP PREVENTION)
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

        // --- SMART OVERLAP CHECK ---
        // 1. Get the Start and End time of the NEW shift
        $newTimes = explode(' - ', $validated['time']);
        $newStart = Carbon::parse($newTimes[0]);
        $newEnd = Carbon::parse($newTimes[1]);

        // Handle overnight shifts just in case
        if ($newEnd->lt($newStart)) {
            $newEnd->addDay();
        }

        // 2. Fetch all shifts for this student on this specific day
        $existingShifts = Schedule::where('user_id', $validated['user_id'])
            ->where('day', $validated['day'])
            ->get();

        // 3. Loop through them and check for intersecting times
        foreach ($existingShifts as $shift) {
            $existingTimes = explode(' - ', $shift->time);

            if (count($existingTimes) === 2) {
                $existingStart = Carbon::parse($existingTimes[0]);
                $existingEnd = Carbon::parse($existingTimes[1]);

                if ($existingEnd->lt($existingStart)) {
                    $existingEnd->addDay();
                }

                // Mathematical overlap formula: (Start A < End B) AND (End A > Start B)
                if ($newStart->lt($existingEnd) && $newEnd->gt($existingStart)) {
                    return response()->json([
                        'message' => "Conflict! This student is already scheduled on {$shift->day} from {$shift->time} in the {$shift->department}."
                    ], 422);
                }
            }
        }
        // --- END SMART CHECK ---

        // If no overlap is found, save the shift!
        $schedule = Schedule::create($validated);

        return response()->json([
            'message' => 'Schedule assigned successfully!',
            'schedule' => $schedule
        ]);
    }

    // 4. For Removing a Shift
    public function destroy(int $id)
    {
        $schedule = Schedule::findOrFail($id);
        $schedule->delete();

        return response()->json([
            'message' => 'Schedule removed successfully!'
        ]);
    }

    // 5. For Students Requesting a Schedule Change
    public function requestEdit(Request $request, $id)
    {
        $validated = $request->validate([
            'note' => 'required|string|max:500'
        ]);

        // Ensure the student actually owns this shift before they can request an edit
        $schedule = Schedule::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        $schedule->update([
            'edit_request_note' => $validated['note'],
            'edit_request_status' => 'pending'
        ]);

        return response()->json(['message' => 'Edit request sent to your Supervisor!']);
    }

    // Clear the pending edit request badge
    public function resolveRequest($id)
    {
        $schedule = Schedule::findOrFail($id);
        $schedule->update([
            'edit_request_status' => 'none',
            'edit_request_note' => null
        ]);

        return response()->json(['message' => 'Student request acknowledged and cleared.']);
    }
}
