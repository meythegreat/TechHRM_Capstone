<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\JanitorialGroup;
use App\Models\ManualAttendanceRequest;
use App\Models\Notification;
use App\Models\User;
use App\Support\CleaningProof;
use App\Support\DutyHours;
use App\Support\HourLimits;
use App\Support\JanitorialApproval;
use App\Support\ManualDtrEntry;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class JanitorialReviewController extends Controller
{
    public function index(Request $request)
    {
        $supervisor = $request->user();
        $groupIds = $this->ledGroupIds($supervisor);
        if ($groupIds === []) {
            return response()->json(['entries' => []]);
        }

        $entries = Attendance::query()
            ->with([
                'user.profile:id,user_id,student_id_number',
                'janitorialGroup.immediateSupervisor:id,name',
            ])
            ->whereIn('janitorial_group_id', $groupIds)
            ->where('user_id', '!=', $supervisor->id)
            ->where(function ($query) {
                $query->where('janitorial_supervision', false)->orWhereNull('janitorial_supervision');
            })
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

    public function finalIndex(Request $request)
    {
        $actor = $request->user()->loadMissing('profile');
        $groups = JanitorialGroup::query()->with('immediateSupervisor:id,name')->get();
        $mine = $groups->filter(fn (JanitorialGroup $group) => JanitorialApproval::isImmediateSupervisor($actor, $group));
        $cover = $groups->filter(function (JanitorialGroup $group) use ($actor) {
            return ! JanitorialApproval::isImmediateSupervisor($actor, $group)
                && JanitorialApproval::isDeanOrPersonInCharge($actor, (string) $group->department);
        });

        $reports = $mine->isNotEmpty() ? $this->upcomingAbsences((int) $actor->id) : [];
        $absences = array_column($reports, 'date');

        if ($mine->isEmpty() && $cover->isEmpty()) {
            return response()->json([
                'entries' => [],
                'requests' => [],
                'is_immediate_supervisor' => false,
                'absences' => [],
                'reports' => [],
            ]);
        }

        $mineIds = $mine->pluck('id')->map(fn ($id) => (int) $id)->all();
        $coverIds = $cover->pluck('id')->map(fn ($id) => (int) $id)->all();
        $candidateIds = array_values(array_unique(array_merge($mineIds, $coverIds)));

        $entries = Attendance::query()
            ->with([
                'user.profile:id,user_id,student_id_number',
                'janitorialGroup.immediateSupervisor:id,name',
            ])
            ->whereIn('janitorial_group_id', $candidateIds)
            ->orderByDesc('id')
            ->limit(80)
            ->get()
            ->filter(function (Attendance $row) use ($actor, $mineIds, $coverIds) {
                return $this->visibleToFinalReviewer($row, $actor, $mineIds, $coverIds);
            })
            ->take(40)
            ->map(function (Attendance $row) use ($actor, $mineIds) {
                $presented = $this->present($row);
                $presented['decision_role'] = in_array((int) $row->janitorial_group_id, $mineIds, true)
                    ? 'immediate'
                    : 'cover';

                return $presented;
            })
            ->values();

        $requests = ManualAttendanceRequest::query()
            ->with([
                'student:id,name',
                'student.profile:id,user_id,student_id_number,assigned_office',
                'shifts',
                'reviewer:id,name',
            ])
            ->where('request_type', ManualAttendanceRequest::TYPE_JANITORIAL)
            ->whereHas('shifts', fn ($shifts) => $shifts->whereIn('janitorial_group_id', $candidateIds))
            ->orderByDesc('id')
            ->limit(40)
            ->get()
            ->filter(function (ManualAttendanceRequest $row) use ($actor, $mineIds, $coverIds) {
                return $this->offlineVisible($row, $actor, $mineIds, $coverIds);
            })
            ->take(20)
            ->map(function (ManualAttendanceRequest $row) use ($mineIds) {
                $groupId = (int) ($row->shifts->first()?->janitorial_group_id ?? 0);

                return $this->presentOffline($row, in_array($groupId, $mineIds, true) ? 'immediate' : 'cover');
            })
            ->values();

        return response()->json([
            'entries' => $entries,
            'requests' => $requests,
            'is_immediate_supervisor' => $mine->isNotEmpty(),
            'absences' => $absences,
            'reports' => $reports,
        ]);
    }

    public function informAbsence(Request $request)
    {
        $actor = $request->user()->loadMissing('profile');
        $groups = JanitorialGroup::query()
            ->where('immediate_supervisor_user_id', $actor->id)
            ->get();
        if ($groups->isEmpty()) {
            return response()->json(['message' => 'Only an assigned immediate supervisor can report a janitorial absence.'], 403);
        }

        $validated = $request->validate([
            'absent_on' => 'nullable|date',
            'dates' => 'nullable|array|max:31',
            'dates.*' => 'date',
            'absent' => 'required|boolean',
            'reason' => 'nullable|string|max:500',
        ]);
        $today = Carbon::today();
        $dates = collect($validated['dates'] ?? [])
            ->push($validated['absent_on'] ?? null)
            ->filter(fn ($value) => is_string($value) && trim($value) !== '')
            ->map(fn ($value) => Carbon::parse($value)->startOfDay())
            ->unique(fn (Carbon $date) => $date->toDateString())
            ->sortBy(fn (Carbon $date) => $date->timestamp)
            ->values();

        if ($dates->isEmpty()) {
            return response()->json(['message' => 'Choose at least one date.'], 422);
        }

        $reason = trim((string) ($validated['reason'] ?? ''));
        $hasReason = Schema::hasColumn('janitorial_immediate_absences', 'reason');

        if ($request->boolean('absent')) {
            if ($reason === '') {
                return response()->json(['message' => 'Add a reason for the absence.'], 422);
            }
            $tooSoon = $dates->first(fn (Carbon $date) => $date->lessThanOrEqualTo($today));
            if ($tooSoon) {
                return response()->json([
                    'message' => 'Report the absence before the day you will be out. The department supervisor can give the final say only for a date you reported in advance.',
                ], 422);
            }

            foreach ($dates as $date) {
                $values = ['updated_at' => now(), 'created_at' => now()];
                if ($hasReason) {
                    $values['reason'] = $reason;
                }
                DB::table('janitorial_immediate_absences')->updateOrInsert(
                    ['user_id' => $actor->id, 'absent_on' => $date->toDateString()],
                    $values,
                );
            }
            $this->notifyCover($actor, $groups, $dates->all(), true, $reason);
            $label = $dates->map(fn (Carbon $date) => $date->toFormattedDateString())->implode(', ');
            $message = 'Absence reported for '.$label.'. The department supervisor can give the final say on those days. Leave itself stays on the department’s manual application.';
        } else {
            $past = $dates->first(fn (Carbon $date) => $date->lt($today));
            if ($past) {
                return response()->json(['message' => 'A past absence report cannot be removed.'], 422);
            }
            foreach ($dates as $date) {
                DB::table('janitorial_immediate_absences')
                    ->where('user_id', $actor->id)
                    ->whereDate('absent_on', $date->toDateString())
                    ->delete();
            }
            $this->notifyCover($actor, $groups, $dates->all(), false);
            $label = $dates->map(fn (Carbon $date) => $date->toFormattedDateString())->implode(', ');
            $message = 'Absence report removed for '.$label.'.';
        }

        $reports = $this->upcomingAbsences((int) $actor->id);

        return response()->json([
            'message' => $message,
            'absences' => array_column($reports, 'date'),
            'reports' => $reports,
        ]);
    }

    public function supervisionPhoto(Request $request)
    {
        $validated = $request->validate([
            'photo' => 'required|file|mimes:jpeg,jpg,png,webp|max:5120',
            'capture_source' => 'required|in:live_camera',
            'captured_at' => 'required|date',
            'group_id' => 'required|integer|exists:janitorial_groups,id',
        ]);

        $user = $request->user()->loadMissing('profile');
        if ($user->role !== 'Student') {
            return response()->json(['message' => 'Only a janitorial supervisor can submit a supervising photo.'], 403);
        }

        $group = JanitorialGroup::query()->findOrFail((int) $validated['group_id']);
        if (! JanitorialApproval::isJanitorialSupervisor($user, $group)) {
            return response()->json(['message' => 'Choose one of the areas assigned to you.'], 403);
        }
        if (! $group->immediate_supervisor_user_id) {
            return response()->json(['message' => 'This group has no immediate supervisor yet, so supervising hours cannot be submitted.'], 422);
        }
        if (! \App\Models\JanitorialLeader::isOnDuty((int) $user->id)) {
            return response()->json(['message' => 'You are marked absent, so supervising hours cannot be submitted.'], 422);
        }

        $capturedAt = Carbon::parse($validated['captured_at']);
        if ($capturedAt->greaterThan(now()->addMinutes(2))) {
            return response()->json(['message' => 'The photo time cannot be in the future.'], 422);
        }

        $dayStart = $capturedAt->copy()->startOfDay();
        $dayEnd = $capturedAt->copy()->endOfDay();
        $existing = Attendance::query()
            ->where('user_id', $user->id)
            ->where('janitorial_supervision', true)
            ->whereBetween('time_in', [$dayStart, $dayEnd])
            ->where('status', '!=', 'rejected')
            ->exists();
        if ($existing) {
            return response()->json(['message' => 'Supervising hours are already submitted for this day. One person is credited once, even across 3 areas.'], 422);
        }

        $windowEnd = $capturedAt->copy()->addMinutes((int) round(DutyHours::JANITORIAL_FIXED_HOURS * 60));
        if (ManualDtrEntry::overlaps((int) $user->id, $capturedAt, $windowEnd)) {
            return response()->json(['message' => 'Those 4 supervising hours overlap another duty entry. Clock out of the other duty first, or take the photo at a free time.'], 422);
        }

        if ($limitDenial = HourLimits::jsonDenial($user->id, $capturedAt)) {
            return $limitDenial;
        }

        $attendance = Attendance::create([
            'user_id' => $user->id,
            'time_in' => $capturedAt,
            'time_out' => $windowEnd,
            'attendance_type' => 'Janitorial',
            'work_type' => 'Janitorial Supervision',
            'janitorial_group_id' => $group->id,
            'janitorial_area' => $group->area,
            'check_in_method' => 'photo',
            'task_description' => 'Janitorial supervising at '.$group->area.'. The presence photo is waiting for the immediate supervisor.',
            'status' => JanitorialApproval::AWAITING_FINAL,
            'rendered_hours' => 0,
            'computed_hours' => 0,
            'janitorial_supervision' => true,
            'is_anomaly' => false,
            'anomaly_reason' => null,
        ]);

        $extension = strtolower($request->file('photo')->getClientOriginalExtension() ?: 'jpg');
        if (! in_array($extension, ['jpg', 'jpeg', 'png', 'webp'], true)) {
            $extension = 'jpg';
        }
        $stored = $request->file('photo')->storeAs(
            'cleaning-proofs/'.$attendance->id,
            'presence-'.now()->format('YmdHis').'.'.$extension,
            'local',
        );
        if (! is_string($stored) || $stored === '') {
            $attendance->delete();

            return response()->json(['message' => 'Could not store the presence photo.'], 500);
        }

        $attendance->update([
            'cleaning_before_path' => $stored,
            'cleaning_before_captured_at' => $capturedAt,
        ]);

        Notification::create([
            'user_id' => $group->immediate_supervisor_user_id,
            'title' => 'Janitorial supervising photo',
            'message' => $user->name.' submitted an on-the-spot photo at '.$group->area.'. Accept it to record '.DutyHours::JANITORIAL_FIXED_HOURS.' supervising hours.',
        ]);

        return response()->json([
            'message' => 'Presence photo saved. '.DutyHours::JANITORIAL_FIXED_HOURS.' supervising hours are recorded on your DTR after the immediate supervisor accepts it.',
            'attendance' => $attendance->fresh(),
        ], 201);
    }

    public function decide(Request $request, Attendance $attendance)
    {
        $actor = $request->user()->loadMissing('profile');
        $group = $attendance->janitorialGroup;
        if (! $group || ! CleaningProof::isJanitorialAttendance($attendance)) {
            return response()->json(['message' => 'This is not a janitorial entry.'], 422);
        }

        $decision = $request->input('status');
        if (! in_array($decision, ['accepted', 'rejected'], true)) {
            return response()->json(['message' => 'Choose accepted or rejected.'], 422);
        }

        $isLeader = JanitorialApproval::isJanitorialSupervisor($actor, $group)
            && (int) $attendance->user_id !== (int) $actor->id
            && ! $attendance->janitorial_supervision;
        $isImmediate = JanitorialApproval::isImmediateSupervisor($actor, $group);
        $dutyDate = Carbon::parse($attendance->time_in ?? now());
        $onBehalf = ! $isImmediate && JanitorialApproval::canCover($actor, $group, $dutyDate);

        if ($isLeader) {
            return $this->leaderDecision($request, $attendance, $actor, $group, $decision);
        }

        if ($isImmediate || $onBehalf) {
            return $this->finalDecision($request, $attendance, $actor, $group, $decision, $onBehalf);
        }

        return response()->json([
            'message' => 'The janitorial supervisor records the first decision. The immediate supervisor has the final say. A department dean or person-in-charge can decide only after that immediate supervisor reports an absence in advance.',
        ], 403);
    }

    private function leaderDecision(Request $request, Attendance $attendance, User $actor, JanitorialGroup $group, string $decision)
    {
        if (JanitorialApproval::isFinal((string) $attendance->status) || JanitorialApproval::awaitingFinal((string) $attendance->status)) {
            return response()->json(['message' => 'You already recorded a decision. The immediate supervisor has the final say.'], 422);
        }

        $validated = $request->validate([
            'deducted_hours' => 'nullable|numeric|min:0|max:'.DutyHours::JANITORIAL_FIXED_HOURS,
            'remarks' => 'nullable|string|max:1000',
        ]);

        if ($decision === 'accepted' && ! $attendance->time_out) {
            return response()->json(['message' => 'The student must clock out, with a final surroundings photo, before you can approve this entry.'], 422);
        }
        if ($decision === 'accepted' && ! CleaningProof::hasCompleteProof($attendance)) {
            return response()->json(['message' => 'Both the clock-in and clock-out surroundings photos are required before you can approve this entry.'], 422);
        }
        if ($decision === 'accepted' && (! $attendance->cleaning_before_captured_at || ! $attendance->cleaning_after_captured_at)) {
            return response()->json(['message' => 'Each photo needs a capture time before you can approve this entry.'], 422);
        }

        $deducted = $decision === 'accepted' ? round((float) ($validated['deducted_hours'] ?? 0), 2) : 0.0;
        $remarks = trim((string) ($validated['remarks'] ?? ''));
        $approved = $decision === 'accepted';

        $attendance->update([
            'status' => $approved ? JanitorialApproval::RECOMMENDED : JanitorialApproval::LEADER_DECLINED,
            'janitorial_leader_decision' => $approved ? 'approved' : 'declined',
            'janitorial_deducted_hours' => $deducted,
            'janitorial_leader_remarks' => $remarks !== '' ? $remarks : null,
            'janitorial_leader_reviewed_by' => $actor->id,
            'janitorial_leader_reviewed_at' => now(),
            'rendered_hours' => 0,
            'computed_hours' => 0,
        ]);

        $when = Carbon::parse($attendance->time_in)->timezone(config('app.timezone'))->format('M j');
        $hours = JanitorialApproval::creditedHours($deducted);
        Notification::create([
            'user_id' => $attendance->user_id,
            'title' => 'Janitorial supervisor recorded a decision',
            'message' => $approved
                ? 'Your janitorial supervisor approved the '.$when.' entry'
                    .($deducted > 0 ? ' and deducted '.$deducted.' duty hours ('.$hours.' would be recorded)' : '')
                    .'. The immediate supervisor still has the final say.'
                : 'Your janitorial supervisor declined the '.$when.' entry. The immediate supervisor still has the final say.',
        ]);

        if ($group->immediate_supervisor_user_id) {
            Notification::create([
                'user_id' => $group->immediate_supervisor_user_id,
                'title' => 'Janitorial decision needs your final say',
                'message' => $actor->name.' '.($approved ? 'approved' : 'declined').' a '.$when.' janitorial entry'
                    .($remarks !== '' ? '. Note: '.$remarks : '.')
                    .' You have the final say.',
            ]);
        }

        return response()->json([
            'message' => $approved
                ? 'Your approval was recorded. It is not final until the immediate supervisor decides.'
                : 'Your decline was recorded. It is not final until the immediate supervisor decides.',
            'entry' => $this->present($attendance->fresh()->load([
                'user.profile:id,user_id,student_id_number',
                'janitorialGroup.immediateSupervisor:id,name',
            ])),
        ]);
    }

    private function finalDecision(
        Request $request,
        Attendance $attendance,
        User $actor,
        JanitorialGroup $group,
        string $decision,
        bool $onBehalf,
    ) {
        if (JanitorialApproval::isFinal((string) $attendance->status)) {
            return response()->json(['message' => 'This decision is final and cannot be changed.'], 422);
        }
        if (! JanitorialApproval::awaitingFinal((string) $attendance->status)) {
            return response()->json(['message' => 'The janitorial supervisor must record a decision before you can give the final say.'], 422);
        }
        if (! $group->immediate_supervisor_user_id) {
            return response()->json(['message' => 'Assign an immediate supervisor before this entry can be confirmed.'], 422);
        }

        $supervision = (bool) $attendance->janitorial_supervision || CleaningProof::isSupervision($attendance);
        if ($decision === 'accepted' && ! $supervision) {
            if (! $attendance->time_out) {
                return response()->json(['message' => 'The student must clock out before this entry can be accepted.'], 422);
            }
            if (! CleaningProof::hasCompleteProof($attendance) || ! $attendance->cleaning_before_captured_at || ! $attendance->cleaning_after_captured_at) {
                return response()->json(['message' => 'Both surroundings photos and their capture times are required before this entry can be accepted.'], 422);
            }
        }
        if ($decision === 'accepted' && $supervision && ! $attendance->cleaning_before_path) {
            return response()->json(['message' => 'A presence photo is required before supervising hours can be credited.'], 422);
        }

        $when = Carbon::parse($attendance->time_in)->timezone(config('app.timezone'))->format('M j');
        $who = $onBehalf
            ? 'The department dean or person-in-charge'
            : 'The immediate supervisor';

        if ($decision === 'rejected') {
            $update = [
                'computed_hours' => 0,
                'rendered_hours' => 0,
                'status' => 'rejected',
                'janitorial_final_by' => $actor->id,
                'janitorial_final_on_behalf' => $onBehalf,
            ];
            if ($supervision) {
                $update['time_out'] = Carbon::parse($attendance->time_in);
            }
            $attendance->update($update);
            Notification::create([
                'user_id' => $attendance->user_id,
                'title' => 'Janitorial entry declined',
                'message' => $who.' declined the '.$when.' entry. No hours were recorded.'
                    .($onBehalf ? ' This was on behalf of the immediate supervisor, who reported an absence.' : ''),
            ]);

            return response()->json([
                'message' => 'Janitorial entry declined.',
                'entry' => $this->present($attendance->fresh()->load([
                    'user.profile:id,user_id,student_id_number',
                    'janitorialGroup.immediateSupervisor:id,name',
                ])),
            ]);
        }

        $leaderApproved = $attendance->janitorial_leader_decision === 'approved';
        $hours = $supervision || ! $leaderApproved
            ? DutyHours::JANITORIAL_FIXED_HOURS
            : JanitorialApproval::creditedHours((float) ($attendance->janitorial_deducted_hours ?? 0));
        $deducted = $supervision || ! $leaderApproved
            ? 0.0
            : round((float) ($attendance->janitorial_deducted_hours ?? 0), 2);
        $note = $who.' accepted janitorial '.($supervision ? 'supervising' : 'duty').'.';
        if ($onBehalf) {
            $note .= ' This was on behalf of the immediate supervisor, who reported an absence.';
        }
        if ($deducted > 0) {
            $note .= ' The janitorial supervisor deducted '.$deducted.' hours.';
        }
        $note .= ' DTR records '.$hours.' hours from clock-in.';
        $remarks = trim((string) ($attendance->janitorial_leader_remarks ?? ''));
        if ($remarks !== '') {
            $note .= ' Janitorial supervisor note: '.$remarks;
        }

        $error = JanitorialApproval::credit($attendance, $hours, $note);
        if ($error) {
            return response()->json(['message' => $error], 422);
        }
        $attendance->update([
            'janitorial_final_by' => $actor->id,
            'janitorial_final_on_behalf' => $onBehalf,
        ]);

        Notification::create([
            'user_id' => $attendance->user_id,
            'title' => 'Janitorial entry accepted',
            'message' => $who.' accepted the '.$when.' entry. '.$hours.' hours were recorded from clock-in.'
                .($onBehalf ? ' This was on behalf of the immediate supervisor, who reported an absence.' : ''),
        ]);

        return response()->json([
            'message' => 'Janitorial entry accepted. '.$hours.' hours were recorded.',
            'entry' => $this->present($attendance->fresh()->load([
                'user.profile:id,user_id,student_id_number',
                'janitorialGroup.immediateSupervisor:id,name',
            ])),
        ]);
    }

    /**
     * @param  list<int>  $mineIds
     * @param  list<int>  $coverIds
     */
    private function visibleToFinalReviewer(Attendance $row, User $actor, array $mineIds, array $coverIds): bool
    {
        $groupId = (int) $row->janitorial_group_id;
        $awaiting = JanitorialApproval::awaitingFinal((string) $row->status);
        $decided = JanitorialApproval::isFinal((string) $row->status);
        if (! $awaiting && ! $decided) {
            return false;
        }

        if (in_array($groupId, $mineIds, true)) {
            return true;
        }

        if (! in_array($groupId, $coverIds, true) || ! $row->janitorialGroup) {
            return false;
        }

        $absent = JanitorialApproval::immediateSupervisorAbsentOn(
            (int) $row->janitorialGroup->immediate_supervisor_user_id,
            Carbon::parse($row->time_in ?? now()),
        );
        if ($awaiting && $absent) {
            return true;
        }

        return $decided && (int) $row->janitorial_final_by === (int) $actor->id;
    }

    /**
     * @param  list<int>  $mineIds
     * @param  list<int>  $coverIds
     */
    private function offlineVisible(ManualAttendanceRequest $row, User $actor, array $mineIds, array $coverIds): bool
    {
        $groupId = (int) ($row->shifts->first()?->janitorial_group_id ?? 0);
        $group = $groupId > 0 ? JanitorialGroup::query()->find($groupId) : null;
        if (! $group) {
            return false;
        }

        $awaiting = $row->status === ManualAttendanceRequest::RECOMMENDED;
        $decided = in_array($row->status, [ManualAttendanceRequest::APPROVED, ManualAttendanceRequest::REJECTED], true);
        if (in_array($groupId, $mineIds, true)) {
            return $awaiting || $decided;
        }
        if (! in_array($groupId, $coverIds, true)) {
            return false;
        }

        $dates = $row->shifts->map(fn ($shift) => Carbon::parse($shift->work_date));
        $absent = $dates->every(fn (Carbon $date) => JanitorialApproval::immediateSupervisorAbsentOn(
            (int) $group->immediate_supervisor_user_id,
            $date,
        ));
        if ($awaiting && $absent) {
            return true;
        }

        return $decided && (int) $row->reviewed_by === (int) $actor->id && $absent;
    }

    /**
     * @return list<int>
     */
    private function ledGroupIds(User $user): array
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

    /**
     * @param  \Illuminate\Support\Collection<int, JanitorialGroup>  $groups
     */
    /**
     * @param  list<Carbon>  $dates
     */
    private function notifyCover(User $actor, $groups, array $dates, bool $absent, string $reason = ''): void
    {
        $label = collect($dates)->map(fn (Carbon $date) => $date->toFormattedDateString())->implode(', ');
        $supervisors = User::query()->where('role', 'Supervisor')->with('profile')->get();
        $notified = [];
        foreach ($supervisors as $supervisor) {
            $matches = $groups->contains(fn (JanitorialGroup $group) => JanitorialApproval::isDeanOrPersonInCharge($supervisor, (string) $group->department));
            if (! $matches || isset($notified[$supervisor->id])) {
                continue;
            }
            $notified[$supervisor->id] = true;
            Notification::create([
                'user_id' => $supervisor->id,
                'title' => $absent ? 'Immediate supervisor will be absent' : 'Immediate supervisor absence cancelled',
                'message' => $absent
                    ? $actor->name.' will be absent on '.$label.' and cannot give the final say on janitorial duty. Reason: '.$reason.'. You may approve on their behalf on those days.'
                    : $actor->name.' removed the janitorial absence report for '.$label.'.',
            ]);
        }
    }

    /**
     * @return list<array{date: string, reason: string}>
     */
    private function upcomingAbsences(int $userId): array
    {
        if ($userId <= 0 || ! Schema::hasTable('janitorial_immediate_absences')) {
            return [];
        }

        $hasReason = Schema::hasColumn('janitorial_immediate_absences', 'reason');

        return DB::table('janitorial_immediate_absences')
            ->where('user_id', $userId)
            ->whereDate('absent_on', '>=', Carbon::today()->toDateString())
            ->orderBy('absent_on')
            ->get()
            ->map(fn ($row) => [
                'date' => Carbon::parse($row->absent_on)->toDateString(),
                'reason' => $hasReason ? trim((string) ($row->reason ?? '')) : '',
            ])
            ->values()
            ->all();
    }

    private function present(Attendance $row): array
    {
        $proof = CleaningProof::status($row);
        $deducted = round((float) ($row->janitorial_deducted_hours ?? 0), 2);
        $leaderApproved = $row->janitorial_leader_decision === 'approved';
        $preview = ($row->janitorial_supervision || $row->janitorial_leader_decision !== 'approved')
            ? DutyHours::JANITORIAL_FIXED_HOURS
            : JanitorialApproval::creditedHours($deducted);

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
            'supervision' => (bool) $row->janitorial_supervision,
            'leader_decision' => $row->janitorial_leader_decision,
            'deducted_hours' => $leaderApproved ? $deducted : 0,
            'leader_remarks' => $row->janitorial_leader_remarks,
            'credited_if_accepted' => $preview,
            'immediate_supervisor_name' => $row->janitorialGroup?->immediateSupervisor?->name,
            'final_on_behalf' => (bool) $row->janitorial_final_on_behalf,
        ];
    }

    private function presentOffline(ManualAttendanceRequest $row, string $role): array
    {
        $deducted = round((float) ($row->janitorial_deducted_hours ?? 0), 2);

        return [
            'id' => $row->id,
            'student_name' => $row->student?->name,
            'student_id_number' => $row->student?->profile?->student_id_number,
            'assigned_office' => $row->student?->profile?->assigned_office,
            'status' => $row->status,
            'reason' => $row->reason,
            'leader_decision' => $row->janitorial_leader_decision,
            'deducted_hours' => $row->janitorial_leader_decision === 'approved' ? $deducted : 0,
            'leader_remarks' => $row->janitorial_leader_remarks,
            'credited_if_accepted' => $row->janitorial_leader_decision === 'approved'
                ? JanitorialApproval::creditedHours($deducted)
                : DutyHours::JANITORIAL_FIXED_HOURS,
            'decision_role' => $role,
            'final_on_behalf' => (bool) $row->janitorial_final_on_behalf,
            'shifts' => $row->shifts->map(fn ($shift) => [
                'id' => $shift->id,
                'date' => optional($shift->work_date)?->toDateString(),
                'time_in' => $shift->time_in,
                'time_out' => $shift->time_out,
                'janitorial_area' => $shift->janitorial_area,
                'before_photo_path' => $shift->before_photo_path,
                'after_photo_path' => $shift->after_photo_path,
                'before_captured_at' => optional($shift->before_captured_at)?->toIso8601String(),
                'after_captured_at' => optional($shift->after_captured_at)?->toIso8601String(),
            ])->values()->all(),
        ];
    }
}
