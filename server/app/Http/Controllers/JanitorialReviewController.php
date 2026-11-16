<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\JanitorialGroup;
use App\Models\Notification;
use App\Models\User;
use App\Support\CleaningProof;
use App\Support\DutyHours;
use App\Support\HourLimits;
use Carbon\Carbon;
use Illuminate\Http\Request;

class JanitorialReviewController extends Controller
{
    public function index(Request $request)
    {
        $supervisor = $request->user();
        $groupIds = $this->supervisedGroupIds($supervisor);
        if ($groupIds === []) {
            return response()->json(['entries' => []]);
        }

        $entries = Attendance::query()
            ->with(['user.profile:id,user_id,student_id_number', 'janitorialGroup:id,name,department,area'])
            ->whereIn('janitorial_group_id', $groupIds)
            ->where(function ($query) {
                $query->whereNotNull('time_out')
                    ->orWhereNotNull('cleaning_before_path')
                    ->orWhereNotNull('cleaning_after_path');
            })
            ->orderByRaw('CASE WHEN time_out IS NULL THEN 0 ELSE 1 END')
            ->orderByDesc('id')
            ->limit(40)
            ->get()
            ->map(fn (Attendance $row) => $this->present($row));

        return response()->json(['entries' => $entries]);
    }

    public function decide(Request $request, Attendance $attendance)
    {
        $supervisor = $request->user();
        if (! $this->supervises($supervisor, $attendance)) {
            return response()->json(['message' => 'Only this roster\'s janitorial supervisor can review these photos.'], 403);
        }

        if (! CleaningProof::isJanitorialAttendance($attendance)) {
            return response()->json(['message' => 'This is not a janitorial entry.'], 422);
        }

        $decision = $request->input('status');
        if (! in_array($decision, ['accepted', 'rejected'], true)) {
            return response()->json(['message' => 'Choose accepted or rejected.'], 422);
        }

        $current = strtolower((string) $attendance->status);
        if (in_array($current, ['accepted', 'approved', 'rejected'], true)) {
            return response()->json(['message' => 'This decision is final and cannot be changed.'], 422);
        }

        if ($decision === 'accepted' && ! $attendance->time_out) {
            return response()->json(['message' => 'The student must clock out, with a final surroundings photo, before this entry can be accepted.'], 422);
        }

        if ($decision === 'accepted' && ! CleaningProof::hasCompleteProof($attendance)) {
            return response()->json(['message' => 'Both the clock-in and clock-out surroundings photos are required before this entry can be accepted.'], 422);
        }

        if ($decision === 'accepted' && (! $attendance->cleaning_before_captured_at || ! $attendance->cleaning_after_captured_at)) {
            return response()->json(['message' => 'Each photo needs a capture time before this entry can be accepted.'], 422);
        }

        if ($decision === 'accepted') {
            $timeIn = Carbon::parse($attendance->time_in);
            $creditedEnd = DutyHours::janitorialCreditedEnd($timeIn);
            $fit = HourLimits::fitHours(
                (int) $attendance->user_id,
                DutyHours::JANITORIAL_FIXED_HOURS,
                $timeIn,
                (int) $attendance->id,
            );
            if ($fit['allowed'] + 0.001 < DutyHours::JANITORIAL_FIXED_HOURS) {
                return response()->json([
                    'message' => $fit['denial']
                        ?? $fit['message']
                        ?? 'This student does not have 4 hours left under the weekly or monthly limit.',
                ], 422);
            }

            $actualOut = Carbon::parse($attendance->time_out)->timezone(config('app.timezone'))->format('g:i A');
            $task = trim((string) ($attendance->task_description ?? ''));
            $note = 'Accepted janitorial duty. Actual clock-out was '.$actualOut
                .'. DTR clock-out is exactly '.DutyHours::JANITORIAL_FIXED_HOURS.' hours after clock-in.';
            $attendance->update([
                'time_out' => $creditedEnd,
                'computed_hours' => DutyHours::JANITORIAL_FIXED_HOURS,
                'rendered_hours' => DutyHours::JANITORIAL_FIXED_HOURS,
                'status' => 'accepted',
                'task_description' => $task === '' ? $note : ($task.' '.$note),
            ]);
        } else {
            $attendance->update([
                'computed_hours' => 0,
                'rendered_hours' => 0,
                'status' => 'rejected',
            ]);
        }

        $when = Carbon::parse($attendance->time_in)->timezone(config('app.timezone'))->format('M j');
        $verb = $decision === 'accepted' ? 'accepted' : 'declined';
        Notification::create([
            'user_id' => $attendance->user_id,
            'title' => 'Janitorial entry '.$verb,
            'message' => $decision === 'accepted'
                ? 'Your janitorial supervisor accepted the '.$when.' entry. '.DutyHours::JANITORIAL_FIXED_HOURS.' hours were recorded from your clock-in.'
                : 'Your janitorial supervisor declined the '.$when.' entry after reviewing the surroundings photos and their timestamps.',
        ]);

        return response()->json([
            'message' => 'Janitorial entry '.$verb.'.',
            'entry' => $this->present($attendance->fresh()->load(['user.profile:id,user_id,student_id_number', 'janitorialGroup:id,name,department,area'])),
        ]);
    }

    /**
     * @return list<int>
     */
    private function supervisedGroupIds(User $user): array
    {
        if ($user->role !== 'Student') {
            return [];
        }

        return JanitorialGroup::query()
            ->where('supervisor_user_id', $user->id)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function supervises(User $user, Attendance $attendance): bool
    {
        $groupId = (int) ($attendance->janitorial_group_id ?? 0);
        if ($groupId <= 0 || $user->role !== 'Student') {
            return false;
        }

        return JanitorialGroup::query()
            ->where('id', $groupId)
            ->where('supervisor_user_id', $user->id)
            ->exists();
    }

    private function present(Attendance $row): array
    {
        $proof = CleaningProof::status($row);

        return [
            'id' => (int) $row->id,
            'student_name' => $row->user?->name,
            'student_id_number' => $row->user?->profile?->student_id_number,
            'group_name' => $row->janitorialGroup?->name,
            'department' => $row->janitorialGroup?->department,
            'area' => $row->janitorial_area ?: $row->janitorialGroup?->area,
            'time_in' => optional($row->time_in)?->toIso8601String(),
            'time_out' => optional($row->time_out)?->toIso8601String(),
            'status' => $row->status,
            'rendered_hours' => (float) ($row->rendered_hours ?? 0),
            'before_path' => $proof['before_path'],
            'after_path' => $proof['after_path'],
            'before_captured_at' => $proof['before_captured_at'],
            'after_captured_at' => $proof['after_captured_at'],
        ];
    }
}
