<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\JanitorialGroup;
use App\Models\Notification;
use App\Support\CleaningProof;
use App\Support\DutyHours;
use App\Support\HourLimits;
use Carbon\Carbon;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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
     * Janitorial duty without a code. The before photo starts clock-in.
     * The after photo ends clock-out. A supervisor code remains a separate option.
     */
    public function janitorial(Request $request)
    {
        $validated = $request->validate([
            'phase' => 'required|in:before,after',
            'photo' => 'required|file|mimes:jpeg,jpg,png,webp|max:5120',
            'capture_source' => 'required|in:live_camera',
            'captured_at' => 'required|date',
            'group_id' => 'nullable|integer|exists:janitorial_groups,id',
        ]);

        $user = $request->user()->loadMissing('profile');
        if ($user->role !== 'Student') {
            return response()->json(['message' => 'Only a working student can record janitorial photos.'], 403);
        }

        $capturedAt = Carbon::parse($validated['captured_at']);
        if ($capturedAt->greaterThan(now()->addMinutes(2))) {
            return response()->json(['message' => 'The photo time cannot be in the future.'], 422);
        }

        try {
            if ($validated['phase'] === 'before') {
                return $this->startJanitorialFromPhoto($request, $user, $capturedAt, $validated['group_id'] ?? null);
            }

            return $this->finishJanitorialFromPhoto($request, $user, $capturedAt);
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages([
                'photo' => [$e->getMessage()],
            ]);
        }
    }

    private function startJanitorialFromPhoto(Request $request, $user, Carbon $capturedAt, $groupId)
    {
        $suspension = \App\Models\DisciplinaryRecord::activeSuspension($user->id);
        if ($suspension) {
            return response()->json(['message' => $suspension->suspensionNotice()], 403);
        }

        $open = Attendance::query()
            ->where('user_id', $user->id)
            ->whereNull('time_out')
            ->whereNull('rendered_hour_event_id')
            ->first();
        if ($open) {
            return response()->json(['message' => 'You are already clocked in. Finish that shift before starting janitorial duty.'], 422);
        }

        $group = $this->memberGroup($user->id, $groupId ? (int) $groupId : null);
        if ($group instanceof \Illuminate\Http\JsonResponse) {
            return $group;
        }

        if (! \App\Models\JanitorialLeader::isOnDuty((int) $group->supervisor_user_id)) {
            return response()->json([
                'message' => 'Your janitorial leader is marked absent. Submit offline attendance with your time in and before and after photos that show the date and time.',
            ], 422);
        }

        if ($limitDenial = HourLimits::jsonDenial($user->id, $capturedAt)) {
            return $limitDenial;
        }

        try {
            $attendance = Cache::lock('attendance-open:'.$user->id, 10)->block(5, function () use ($user, $capturedAt, $group, $request) {
                $stillOpen = Attendance::query()
                    ->where('user_id', $user->id)
                    ->whereNull('time_out')
                    ->whereNull('rendered_hour_event_id')
                    ->first();
                if ($stillOpen) {
                    return null;
                }

                $attendance = Attendance::create([
                    'user_id' => $user->id,
                    'time_in' => $capturedAt,
                    'attendance_type' => 'Janitorial',
                    'work_type' => 'Janitorial',
                    'janitorial_group_id' => $group->id,
                    'janitorial_area' => $group->area,
                    'check_in_method' => 'photo',
                    'code_owner_id' => $group->supervisor_user_id,
                    'task_description' => 'Janitorial duty — '.$group->area.'. Clock-in is the surroundings photo.',
                    'status' => 'pending',
                    'rendered_hours' => 0,
                    'computed_hours' => 0,
                    'is_anomaly' => false,
                    'anomaly_reason' => null,
                ]);

                CleaningProof::store(
                    $attendance,
                    CleaningProof::PHASE_BEFORE,
                    $request->file('photo'),
                    CleaningProof::CAPTURE_SOURCE_LIVE_CAMERA,
                    $capturedAt,
                );

                return $attendance->fresh();
            });
        } catch (LockTimeoutException) {
            return response()->json(['message' => 'Clock-in is busy. Wait a moment and try again.'], 429);
        }

        if (! $attendance) {
            return response()->json(['message' => 'You are already clocked in. Finish that shift before starting janitorial duty.'], 422);
        }

        Notification::create([
            'user_id' => $group->supervisor_user_id,
            'title' => 'Janitorial photo clock-in',
            'message' => $user->name.' started janitorial duty at '.$group->area.' with a surroundings photo.',
        ]);

        return response()->json([
            'message' => 'Clock-in started with your surroundings photo. Take one last photo when you finish. No code is required. Your janitorial supervisor reviews it first, and the immediate supervisor has the final say. If accepted, it is recorded as up to '
                .DutyHours::JANITORIAL_FIXED_HOURS.' hours from this photo.',
            'attendance' => $attendance,
            'cleaning_proof' => CleaningProof::status($attendance),
            'hour_limits' => HourLimits::status($user->id, $capturedAt),
        ], 201);
    }

    private function finishJanitorialFromPhoto(Request $request, $user, Carbon $capturedAt)
    {
        $attendance = Attendance::query()
            ->where('user_id', $user->id)
            ->whereNull('time_out')
            ->whereNull('rendered_hour_event_id')
            ->where(function ($query) {
                $query->where('attendance_type', 'Janitorial')
                    ->orWhere('work_type', 'Janitorial')
                    ->orWhereNotNull('janitorial_group_id');
            })
            ->first();

        if (! $attendance) {
            return response()->json(['message' => 'Take the first surroundings photo before the closing photo.'], 422);
        }

        if ($attendance->check_in_method !== 'photo') {
            return response()->json(['message' => 'This shift was started with your supervisor\'s code. Clock out with that code after both photos.'], 422);
        }

        $timeIn = Carbon::parse($attendance->time_in);
        if ($capturedAt->lessThanOrEqualTo($timeIn)) {
            return response()->json(['message' => 'The closing photo must be after the clock-in photo.'], 422);
        }

        $stored = CleaningProof::store(
            $attendance,
            CleaningProof::PHASE_AFTER,
            $request->file('photo'),
            CleaningProof::CAPTURE_SOURCE_LIVE_CAMERA,
            $capturedAt,
        );

        $stored['attendance']->update([
            'time_out' => $capturedAt,
            'rendered_hours' => 0,
            'computed_hours' => 0,
            'status' => 'pending',
        ]);
        $fresh = $stored['attendance']->fresh();

        if ($fresh->code_owner_id) {
            Notification::create([
                'user_id' => $fresh->code_owner_id,
                'title' => 'Janitorial photo clock-out',
                'message' => $user->name.' finished janitorial duty with a closing photo. Accept or decline the entry.',
            ]);
        }

        return response()->json([
            'message' => 'Clock-out saved at the time of this photo. Your janitorial supervisor reviews it first. The immediate supervisor has the final say before up to '
                .DutyHours::JANITORIAL_FIXED_HOURS.' hours are recorded from the first photo.',
            'attendance' => $fresh,
            'cleaning_proof' => CleaningProof::status($fresh),
        ], 201);
    }

    /**
     * @return JanitorialGroup|\Illuminate\Http\JsonResponse
     */
    private function memberGroup(int $userId, ?int $groupId)
    {
        $groups = JanitorialGroup::query()
            ->whereHas('members', fn ($members) => $members->where('users.id', $userId))
            ->orderBy('area')
            ->get();

        if ($groups->isEmpty()) {
            return response()->json(['message' => 'You must be a member of a janitorial group before using photo clock-in.'], 422);
        }

        if ($groupId) {
            $group = $groups->firstWhere('id', $groupId);
            if (! $group) {
                return response()->json(['message' => 'Choose a janitorial group you belong to.'], 422);
            }

            return $group;
        }

        if ($groups->count() === 1) {
            return $groups->first();
        }

        return response()->json(['message' => 'Choose which janitorial group this photo is for.'], 422);
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
