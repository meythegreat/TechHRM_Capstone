<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Support\CleaningProof;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CleaningProofController extends Controller
{
    /**
     * Student: upload a live-camera before/after cleaning photo for an open shift.
     */
    public function store(Request $request, $id)
    {
        $validated = $request->validate([
            'phase' => 'required|in:before,after',
            'photo' => 'required|file|mimes:jpeg,jpg,png,webp|max:5120',
            'capture_source' => 'required|in:live_camera',
            'captured_at' => 'required|date',
        ]);

        $attendance = Attendance::query()
            ->where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        try {
            $result = CleaningProof::store(
                $attendance,
                (string) $validated['phase'],
                $request->file('photo'),
                (string) $validated['capture_source'],
                Carbon::parse($validated['captured_at']),
            );
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages([
                'photo' => [$e->getMessage()],
            ]);
        }

        $fresh = $result['attendance'];

        return response()->json([
            'message' => ucfirst($result['phase']).' cleaning photo saved.',
            'phase' => $result['phase'],
            'path' => $result['path'],
            'captured_at' => $result['captured_at'],
            'cleaning_proof' => CleaningProof::status($fresh),
            'attendance' => $fresh,
        ], 201);
    }

    /**
     * Student or staff: proof status for one attendance row.
     */
    public function show(Request $request, $id)
    {
        $attendance = Attendance::query()->findOrFail($id);
        $user = $request->user();

        $isOwner = (int) $attendance->user_id === (int) $user->id;
        $isStaff = in_array($user->role, ['Super Admin', 'WSPO Staff', 'Supervisor'], true);
        $isJanitorialLead = (int) ($attendance->janitorial_group_id ?? 0) > 0
            && \App\Models\JanitorialGroup::query()
                ->where('id', $attendance->janitorial_group_id)
                ->where('supervisor_user_id', $user->id)
                ->exists();
        if (! $isOwner && ! $isStaff && ! $isJanitorialLead) {
            abort(403, 'You do not have permission to view this cleaning proof.');
        }

        return response()->json([
            'attendance_id' => (int) $attendance->id,
            'cleaning_proof' => CleaningProof::status($attendance),
        ]);
    }
}
