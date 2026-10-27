<?php

namespace App\Http\Controllers;

use App\Models\ExtraHoursRequest;
use App\Models\Notification;
use App\Models\SemesterTerm;
use App\Models\User;
use App\Services\StaffNotifier;
use App\Support\HourLimits;
use App\Support\SuperAdminAudit;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ExtraHoursController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);

        $query = ExtraHoursRequest::query()
            ->with([
                'requester:id,name',
                'reviewer:id,name',
                'students:id,name',
                'students.profile:id,user_id,student_id_number,assigned_office,gender',
            ])
            ->orderByRaw("CASE status WHEN 'Draft' THEN 0 WHEN 'Pending' THEN 1 WHEN 'Approved' THEN 2 ELSE 3 END")
            ->orderByDesc('updated_at');

        // Supervisors only see their own letters. WSPO Coordinator is also a
        // department supervisor for WSPO-placed students, but must still review
        // campus-wide Extra Hours submissions — do not scope them to requested_by.
        if ($user->role === 'Supervisor') {
            $query->where('requested_by', $user->id);
        } elseif ($user->role === 'WSPO Staff' || $user->role === 'Super Admin') {
            $query->where('status', '!=', ExtraHoursRequest::DRAFT);
        } else {
            return response()->json(['message' => 'Not allowed.'], 403);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $rows = $query->limit(100)->get()->map(fn (ExtraHoursRequest $row) => $this->serialize($row));

        return response()->json(['requests' => $rows]);
    }

    public function candidates(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);

        $query = User::query()
            ->with('profile:id,user_id,student_id_number,assigned_office,gender')
            ->where('role', 'Student')
            ->orderBy('name');

        if ($user->role === 'Supervisor' || $accounts->isWspoDepartmentSupervisor($user)) {
            $areas = $accounts->supervisedOfficeAreas($user);
            if ($areas === []) {
                return response()->json(['students' => []]);
            }
            $query->whereHas('profile', fn ($profile) => $profile->whereIn('assigned_office', $areas));
        } elseif (!in_array($user->role, ['WSPO Staff', 'Super Admin'], true)) {
            return response()->json(['message' => 'Not allowed.'], 403);
        }

        $students = $query->get(['id', 'name'])->map(function (User $student) {
            return [
                'id' => $student->id,
                'name' => $student->name,
                'gender' => $student->profile?->gender,
                'student_id_number' => $student->profile?->student_id_number,
                'assigned_office' => $student->profile?->assigned_office,
            ];
        })->values();

        return response()->json(['students' => $students]);
    }

    public function signatories()
    {
        return response()->json([
            'coordinator' => $this->coordinatorName(),
            'president' => 'GEORGE O. CORTEL, MBA, Ph.D.',
        ]);
    }

    public function meta()
    {
        $semester = SemesterTerm::current();
        $settings = \App\Models\CampusSetting::current();

        return response()->json([
            'semester' => $semester?->toPayload(),
            'period_label' => $this->defaultPeriodLabel($semester),
            'weekly_standard' => (float) $settings->weekly_standard_hours,
            'weekly_extended' => (float) $settings->weekly_extended_hours,
            'monthly_max' => (float) $settings->monthly_max_hours,
        ]);
    }

    public function store(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $user = $request->user()->loadMissing('profile');
        abort_unless(
            $user->role === 'Supervisor' || app(UserController::class)->isWspoDepartmentSupervisor($user),
            403,
            'Only supervisors can create Extra Hours requests.'
        );

        $department = trim((string) ($user->profile?->assigned_office ?? ''));
        abort_unless($department !== '', 422, 'Your supervisor account must have an assigned office before requesting Extra Hours.');

        $asDraft = filter_var($request->input('as_draft'), FILTER_VALIDATE_BOOLEAN);
        $validated = $this->validatePayload($request, requireLetter: !$asDraft);
        $students = $this->assertStudentsInScope($user, $validated['student_ids']);

        $path = null;
        if (!$asDraft && $request->hasFile('approval_letter')) {
            $path = $request->file('approval_letter')->store('extra-hours-approvals', 'local');
        }

        $row = DB::transaction(function () use ($user, $department, $validated, $asDraft, $path, $students) {
            $row = ExtraHoursRequest::create([
                'requested_by' => $user->id,
                'department' => $department,
                'requester_title' => $validated['requester_title'] ?? null,
                'duty_description' => $validated['duty_description'],
                'period_label' => $validated['period_label'],
                'period_start' => $validated['period_start'],
                'period_end' => $validated['period_end'],
                'approved_hours' => (float) (\App\Models\CampusSetting::current()->weekly_extended_hours ?: 25),
                'status' => $asDraft ? ExtraHoursRequest::DRAFT : ExtraHoursRequest::PENDING,
                'approval_letter_path' => $path,
            ]);
            $row->students()->sync($students->pluck('id')->all());

            return $row->load(['requester:id,name', 'students.profile']);
        });

        if ($asDraft) {
            return response()->json([
                'message' => 'Extra Hours draft saved. Print the letter, collect signatures, then attach the signed scan to send it to WSPO.',
                'request' => $this->serialize($row),
            ], 201);
        }

        $this->notifyPending($row);

        return response()->json([
            'message' => 'Extra Hours request sent to WSPO with the signed approval letter.',
            'request' => $this->serialize($row),
        ], 201);
    }

    public function saveDraft(Request $request, ExtraHoursRequest $extraHoursRequest)
    {
        SuperAdminAudit::denyMutation($request);
        abort_unless((int) $extraHoursRequest->requested_by === (int) $request->user()->id, 403);
        abort_unless($extraHoursRequest->status === ExtraHoursRequest::DRAFT, 422, 'Only draft Extra Hours requests can be updated this way.');

        $validated = $this->validatePayload($request, requireLetter: false);
        $students = $this->assertStudentsInScope($request->user()->loadMissing('profile'), $validated['student_ids']);

        $extraHoursRequest->update([
            'requester_title' => $validated['requester_title'] ?? null,
            'duty_description' => $validated['duty_description'],
            'period_label' => $validated['period_label'],
            'period_start' => $validated['period_start'],
            'period_end' => $validated['period_end'],
        ]);
        $extraHoursRequest->students()->sync($students->pluck('id')->all());

        return response()->json([
            'message' => 'Extra Hours draft updated.',
            'request' => $this->serialize($extraHoursRequest->fresh(['requester:id,name', 'students.profile'])),
        ]);
    }

    public function destroy(Request $request, ExtraHoursRequest $extraHoursRequest)
    {
        SuperAdminAudit::denyMutation($request);
        abort_unless((int) $extraHoursRequest->requested_by === (int) $request->user()->id, 403);
        abort_unless(
            $extraHoursRequest->status === ExtraHoursRequest::DRAFT,
            422,
            'Only draft Extra Hours requests can be deleted.'
        );

        if ($extraHoursRequest->approval_letter_path) {
            Storage::disk('local')->delete($extraHoursRequest->approval_letter_path);
        }

        $extraHoursRequest->students()->detach();
        $extraHoursRequest->delete();

        return response()->json(['message' => 'Extra Hours draft deleted.']);
    }

    public function finalize(Request $request, ExtraHoursRequest $extraHoursRequest)
    {
        SuperAdminAudit::denyMutation($request);
        abort_unless((int) $extraHoursRequest->requested_by === (int) $request->user()->id, 403);
        abort_unless($extraHoursRequest->status === ExtraHoursRequest::DRAFT, 422, 'Only draft Extra Hours requests can be finalized.');

        $validated = $this->validatePayload($request, requireLetter: true);
        $students = $this->assertStudentsInScope($request->user()->loadMissing('profile'), $validated['student_ids']);

        $path = $request->file('approval_letter')->store('extra-hours-approvals', 'local');
        if ($extraHoursRequest->approval_letter_path) {
            Storage::disk('local')->delete($extraHoursRequest->approval_letter_path);
        }

        $extraHoursRequest->update([
            'requester_title' => $validated['requester_title'] ?? null,
            'duty_description' => $validated['duty_description'],
            'period_label' => $validated['period_label'],
            'period_start' => $validated['period_start'],
            'period_end' => $validated['period_end'],
            'approval_letter_path' => $path,
            'status' => ExtraHoursRequest::PENDING,
        ]);
        $extraHoursRequest->students()->sync($students->pluck('id')->all());

        $row = $extraHoursRequest->fresh(['requester:id,name', 'students.profile']);
        $this->notifyPending($row);

        return response()->json([
            'message' => 'Extra Hours request sent to WSPO with the signed approval letter.',
            'request' => $this->serialize($row),
        ]);
    }

    public function decide(Request $request, ExtraHoursRequest $extraHoursRequest)
    {
        SuperAdminAudit::denyMutation($request);
        $reviewer = $this->assertCanReview($request);
        if ($reviewer instanceof \Illuminate\Http\JsonResponse) {
            return $reviewer;
        }

        abort_unless(
            in_array($extraHoursRequest->status, [ExtraHoursRequest::PENDING, ExtraHoursRequest::APPROVED, ExtraHoursRequest::REJECTED], true),
            422,
            'Only submitted Extra Hours requests can be reviewed.'
        );

        $settings = \App\Models\CampusSetting::current();
        $validated = $request->validate([
            'status' => 'required|in:Approved,Rejected',
            'decision_note' => 'nullable|string|max:1000',
        ]);

        $extraHoursRequest->update([
            'status' => $validated['status'],
            'decision_note' => trim((string) ($validated['decision_note'] ?? '')) ?: null,
            'reviewed_by' => $reviewer->id,
            'reviewed_at' => now(),
            'approved_hours' => (float) $settings->weekly_extended_hours,
        ]);

        $row = $extraHoursRequest->fresh(['requester:id,name', 'reviewer:id,name', 'students.profile']);
        $hoursLabel = HourLimits::hoursLabel((float) $settings->weekly_extended_hours);

        foreach ($row->students as $student) {
            if ($validated['status'] === ExtraHoursRequest::APPROVED) {
                Notification::create([
                    'user_id' => $student->id,
                    'title' => 'Extra Hours approved',
                    'message' => 'You may work up to ' . $hoursLabel
                        . ' hours per week for ' . $row->period_label . '.',
                ]);
            } else {
                Notification::create([
                    'user_id' => $student->id,
                    'title' => 'Extra Hours declined',
                    'message' => 'The Extra Hours request for ' . $row->period_label . ' was declined.',
                ]);
            }
        }

        if ($row->requested_by) {
            Notification::create([
                'user_id' => $row->requested_by,
                'title' => $validated['status'] === ExtraHoursRequest::APPROVED
                    ? 'Extra Hours request approved'
                    : 'Extra Hours request declined',
                'message' => 'Your Extra Hours letter for ' . $row->department
                    . ' (' . $row->period_label . ') was '
                    . strtolower($validated['status']) . '.',
            ]);
        }

        return response()->json([
            'message' => $validated['status'] === ExtraHoursRequest::APPROVED
                ? 'Extra Hours approved. Listed students may work up to ' . $hoursLabel . ' hours/week during the period.'
                : 'Extra Hours request declined.',
            'request' => $this->serialize($row),
        ]);
    }

    private function validatePayload(Request $request, bool $requireLetter): array
    {
        $semester = SemesterTerm::current();
        $defaultStart = $semester?->starts_on?->toDateString() ?: Carbon::now()->toDateString();
        $defaultEnd = $semester?->ends_on?->toDateString() ?: Carbon::now()->endOfMonth()->toDateString();

        $request->merge([
            'period_start' => $request->input('period_start') ?: $defaultStart,
            'period_end' => $request->input('period_end') ?: $defaultEnd,
            'period_label' => trim((string) $request->input('period_label')) ?: $this->defaultPeriodLabel($semester),
        ]);

        return $request->validate([
            'student_ids' => 'required|array|min:1|max:20',
            'student_ids.*' => 'required|integer|distinct|exists:users,id',
            'duty_description' => 'required|string|max:2000',
            'period_label' => 'required|string|max:255',
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
            'requester_title' => 'nullable|string|max:255',
            'approval_letter' => ($requireLetter ? 'required' : 'nullable') . '|file|mimes:pdf,jpg,jpeg,png|max:4096',
            'as_draft' => 'nullable|boolean',
        ]);
    }

    private function assertStudentsInScope(User $actor, array $studentIds)
    {
        $accounts = app(UserController::class);
        $students = User::with('profile')->where('role', 'Student')->whereIn('id', $studentIds)->get();
        abort_unless($students->count() === count(array_unique($studentIds)), 422, 'One or more selected students were not found.');

        if ($actor->role === 'Supervisor' || $accounts->isWspoDepartmentSupervisor($actor)) {
            foreach ($students as $student) {
                abort_unless(
                    $accounts->supervisorCanAccessStudent($actor, $student),
                    403,
                    'You can only request Extra Hours for students assigned to your office.'
                );
            }
        }

        return $students;
    }

    private function assertCanReview(Request $request): User|\Illuminate\Http\JsonResponse
    {
        $user = $request->user()->loadMissing('profile');

        // Supervisors create/print letters; only WSPO records the campus approval after the signed scan.
        if ($user->role === 'WSPO Staff') {
            return $user;
        }

        return response()->json(['message' => 'Only WSPO staff can record Extra Hours approval after the signed letter is submitted.'], 403);
    }

    private function notifyPending(ExtraHoursRequest $row): void
    {
        $names = $row->students->pluck('name')->filter()->values();
        $nameLabel = $names->count() <= 3
            ? $names->implode(', ')
            : $names->take(2)->implode(', ') . ', and ' . ($names->count() - 2) . ' more';

        app(StaffNotifier::class)->notify(
            'Extra Hours letter submitted',
            $row->requester?->name . ' submitted a signed Extra Hours letter for '
                . $nameLabel . ' (' . $row->department . ') covering ' . $row->period_label
                . '. Confirm approval so they may work up to '
                . HourLimits::hoursLabel((float) $row->approved_hours) . ' hours/week.',
            [(int) $row->requested_by]
        );
    }

    private function serialize(ExtraHoursRequest $row): array
    {
        return [
            'id' => $row->id,
            'department' => $row->department,
            'requester_title' => $row->requester_title,
            'duty_description' => $row->duty_description,
            'period_label' => $row->period_label,
            'period_start' => $row->period_start?->toDateString(),
            'period_end' => $row->period_end?->toDateString(),
            'approved_hours' => (float) $row->approved_hours,
            'status' => $row->status,
            'approval_letter_path' => $row->approval_letter_path,
            'decision_note' => $row->decision_note,
            'requested_by' => $row->requester?->name,
            'requested_by_id' => $row->requested_by,
            'reviewed_by' => $row->reviewer?->name,
            'reviewed_at' => $row->reviewed_at,
            'students' => $row->students->map(fn (User $student) => [
                'id' => $student->id,
                'name' => $student->name,
                'gender' => $student->profile?->gender,
                'student_id_number' => $student->profile?->student_id_number,
                'assigned_office' => $student->profile?->assigned_office,
            ])->values(),
            'created_at' => $row->created_at,
            'updated_at' => $row->updated_at,
        ];
    }

    private function defaultPeriodLabel(?SemesterTerm $semester): string
    {
        if (!$semester) {
            $year = (int) Carbon::now()->format('Y');

            return '1st Semester of Academic Year ' . $year . '-' . ($year + 1);
        }

        $startYear = (int) $semester->starts_on->format('Y');
        $label = trim((string) $semester->label) ?: 'Semester';

        return $label . ' of Academic Year ' . $startYear . '-' . ($startYear + 1);
    }

    private function coordinatorName(): string
    {
        $explicit = User::query()
            ->where('role', 'WSPO Staff')
            ->whereHas('profile', fn ($profile) => $profile->where('assigned_office', 'WSPO Coordinator'))
            ->orderBy('name')
            ->value('name');

        if ($explicit) {
            return trim((string) $explicit);
        }

        $legacy = User::query()
            ->where('role', 'WSPO Staff')
            ->whereHas('profile', function ($profile) {
                $profile->where(function ($query) {
                    $query->where('assigned_office', 'WSPO')
                        ->orWhereNull('assigned_office')
                        ->orWhere('assigned_office', '');
                });
            })
            ->orderBy('name')
            ->value('name');

        return trim((string) $legacy);
    }
}
