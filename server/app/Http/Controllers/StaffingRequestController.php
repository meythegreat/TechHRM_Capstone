<?php

namespace App\Http\Controllers;

use App\Models\Application;
use App\Support\SuperAdminAudit;
use App\Models\Notification;
use App\Models\StaffingRequest;
use App\Models\User;
use App\Services\DepartmentAssignmentNotifier;
use App\Support\InfractionEscalation;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class StaffingRequestController extends Controller
{
    public function index(Request $request)
    {
        $query = StaffingRequest::with('requester:id,name')->latest();
        if ($request->user()->role === 'Supervisor') {
            $query->where('requested_by', $request->user()->id);
        } else {
            // Draft Extra Service letters stay with the supervisor until the signed scan is attached.
            $query->where('status', '!=', 'Draft');
        }

        $requests = $query->get();
        $studentIds = $requests->flatMap(fn ($item) => $item->assigned_student_ids ?? [])->unique()->filter()->values();
        $students = $studentIds->isEmpty()
            ? collect()
            : User::with('profile:id,user_id,gender')->where('role', 'Student')->whereIn('id', $studentIds)->get(['id', 'name']);
        $genders = $this->genderMapForUsers($students);

        $requests->each(function (StaffingRequest $item) use ($students, $genders) {
            $item->setAttribute(
                'assigned_students',
                $students->whereIn('id', $item->assigned_student_ids ?? [])->values()->map(function ($student) use ($genders) {
                    return [
                        'id' => $student->id,
                        'name' => $student->name,
                        'gender' => $genders[$student->id] ?? null,
                    ];
                })
            );
            $item->setAttribute('gender_summary', $this->genderSummary($item->requested_genders ?? []));
        });

        return response()->json($requests);
    }

    public function candidates()
    {
        $students = User::with('profile:id,user_id,assigned_office,gender')
            ->where('role', 'Student')
            ->orderBy('name')
            ->get(['id', 'name']);
        $genders = $this->genderMapForUsers($students);

        return response()->json($students->map(function ($student) use ($genders) {
            return [
                'id' => $student->id,
                'name' => $student->name,
                'gender' => $genders[$student->id] ?? null,
                'profile' => [
                    'assigned_office' => $student->profile?->assigned_office,
                    'gender' => $genders[$student->id] ?? null,
                ],
            ];
        })->values());
    }

    public function signatories()
    {
        return response()->json([
            'coordinator' => $this->coordinatorName(),
        ]);
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

    public function store(Request $request)
    {
        $department = $request->user()->profile?->assigned_office;
        abort_unless($department, 422, 'Your supervisor account must have an assigned office before requesting a student.');

        $genders = $this->normalizeRequestedGenders($request->input('requested_genders'));
        $request->merge(['requested_genders' => $genders]);

        $isExtraService = $request->input('duty_type') === 'Request';
        $asDraft = $isExtraService && filter_var($request->input('as_draft'), FILTER_VALIDATE_BOOLEAN);

        $validated = $request->validate([
            'duty_type' => 'required|in:Clerical,Janitorial,Request',
            'duty_request' => 'nullable|string|max:1000',
            'event_title' => ($isExtraService ? 'required' : 'nullable') . '|string|max:255',
            'duty_period' => ($isExtraService ? 'required' : 'nullable') . '|string|max:2000',
            'duty_start_date' => ($isExtraService ? 'required' : 'nullable') . '|date',
            'duty_end_date' => ($isExtraService ? 'required' : 'nullable') . '|date|after_or_equal:duty_start_date',
            'hours_per_day' => ($isExtraService ? 'required' : 'nullable') . '|numeric|min:0.5|max:12',
            'reason' => ($isExtraService ? 'required' : 'nullable') . '|string|max:2000',
            'quantity' => 'required|integer|min:1|max:50',
            'requested_genders' => 'required|array',
            'requested_genders.*' => 'required|in:Male,Female',
            'approval_letter' => ($isExtraService && !$asDraft ? 'required' : 'nullable') . '|file|mimes:pdf,jpg,jpeg,png|max:4096',
            'as_draft' => 'nullable|boolean',
        ]);

        abort_unless(
            count($validated['requested_genders']) === (int) $validated['quantity'],
            422,
            'Choose Male or Female for each working student needed.'
        );

        $reason = $isExtraService
            ? trim((string) ($validated['reason'] ?? ''))
            : null;
        $dutyRequest = $isExtraService
            ? ($reason ?: ($validated['duty_request'] ?? null))
            : null;

        $approvalPath = null;
        if ($isExtraService && !$asDraft && $request->hasFile('approval_letter')) {
            $approvalPath = $request->file('approval_letter')->store('staffing-approvals', 'local');
        }

        $staffingRequest = StaffingRequest::create([
            'requested_by' => $request->user()->id,
            'department' => $department,
            'duty_type' => $validated['duty_type'],
            'duty_request' => $dutyRequest,
            'event_title' => $isExtraService ? ($validated['event_title'] ?? null) : null,
            'duty_period' => $isExtraService ? ($validated['duty_period'] ?? null) : null,
            'duty_start_date' => $isExtraService ? ($validated['duty_start_date'] ?? null) : null,
            'duty_end_date' => $isExtraService ? ($validated['duty_end_date'] ?? null) : null,
            'hours_per_day' => $isExtraService ? ($validated['hours_per_day'] ?? null) : null,
            'reason' => $reason,
            'approval_letter_path' => $approvalPath,
            'quantity' => $validated['quantity'],
            'requested_genders' => array_values($validated['requested_genders']),
            'assigned_student_ids' => [],
            'status' => $asDraft ? 'Draft' : 'Pending',
        ]);

        if ($asDraft) {
            return response()->json([
                'message' => 'Extra Service draft saved. Print the letter, collect signatures, then attach the signed scan to send it to WSPO.',
                'request' => $staffingRequest,
            ], 201);
        }

        $dutyLabel = $this->dutyLabel($staffingRequest);
        $countLabel = $validated['quantity'] === 1 ? '1 working student' : "{$validated['quantity']} working students";
        $genderLabel = $this->genderSummary($validated['requested_genders']);
        $eventNote = $isExtraService && !empty($validated['event_title'])
            ? " Event: {$validated['event_title']}."
            : '';

        $this->notifyCoordinators(
            'Working Student Requested',
            "{$request->user()->name} requested {$countLabel} ({$genderLabel}) for {$department} ({$dutyLabel}).{$eventNote} Assign the working student who will be sent to that office."
        );

        return response()->json(['message' => 'Staffing request sent to WSPO.', 'request' => $staffingRequest], 201);
    }

    public function saveDraft(Request $request, StaffingRequest $staffingRequest)
    {
        abort_unless((int) $staffingRequest->requested_by === (int) $request->user()->id, 403);
        abort_unless($staffingRequest->status === 'Draft', 422, 'Only draft Extra Service requests can be updated this way.');
        abort_unless($staffingRequest->duty_type === 'Request', 422, 'Only Extra Service drafts can be updated.');

        $genders = $this->normalizeRequestedGenders($request->input('requested_genders'));
        $request->merge(['requested_genders' => $genders]);

        $validated = $request->validate([
            'event_title' => 'required|string|max:255',
            'duty_period' => 'required|string|max:2000',
            'duty_start_date' => 'required|date',
            'duty_end_date' => 'required|date|after_or_equal:duty_start_date',
            'hours_per_day' => 'required|numeric|min:0.5|max:12',
            'reason' => 'required|string|max:2000',
            'quantity' => 'required|integer|min:1|max:50',
            'requested_genders' => 'required|array',
            'requested_genders.*' => 'required|in:Male,Female',
        ]);

        abort_unless(
            count($validated['requested_genders']) === (int) $validated['quantity'],
            422,
            'Choose Male or Female for each working student needed.'
        );

        $reason = trim((string) $validated['reason']);
        $staffingRequest->update([
            'event_title' => $validated['event_title'],
            'duty_period' => $validated['duty_period'],
            'duty_start_date' => $validated['duty_start_date'],
            'duty_end_date' => $validated['duty_end_date'],
            'hours_per_day' => $validated['hours_per_day'],
            'reason' => $reason,
            'duty_request' => $reason,
            'quantity' => $validated['quantity'],
            'requested_genders' => array_values($validated['requested_genders']),
        ]);

        return response()->json([
            'message' => 'Draft updated.',
            'request' => $staffingRequest->fresh(),
        ]);
    }

    public function finalize(Request $request, StaffingRequest $staffingRequest)
    {
        abort_unless((int) $staffingRequest->requested_by === (int) $request->user()->id, 403);
        abort_unless($staffingRequest->status === 'Draft', 422, 'Only draft requests can be finalized.');
        abort_unless($staffingRequest->duty_type === 'Request', 422, 'Only Extra Service drafts can be finalized.');

        $genders = $this->normalizeRequestedGenders($request->input('requested_genders'));
        if ($genders !== []) {
            $request->merge(['requested_genders' => $genders]);
        }

        $validated = $request->validate([
            'event_title' => 'sometimes|required|string|max:255',
            'duty_period' => 'sometimes|required|string|max:2000',
            'duty_start_date' => 'sometimes|required|date',
            'duty_end_date' => 'sometimes|required|date|after_or_equal:duty_start_date',
            'hours_per_day' => 'sometimes|required|numeric|min:0.5|max:12',
            'reason' => 'sometimes|required|string|max:2000',
            'quantity' => 'sometimes|required|integer|min:1|max:50',
            'requested_genders' => 'sometimes|required|array',
            'requested_genders.*' => 'required|in:Male,Female',
            'approval_letter' => 'required|file|mimes:pdf,jpg,jpeg,png|max:4096',
        ]);

        if (isset($validated['quantity'], $validated['requested_genders'])) {
            abort_unless(
                count($validated['requested_genders']) === (int) $validated['quantity'],
                422,
                'Choose Male or Female for each working student needed.'
            );
        }

        $path = $request->file('approval_letter')->store('staffing-approvals', 'local');
        $reason = array_key_exists('reason', $validated)
            ? trim((string) $validated['reason'])
            : $staffingRequest->reason;

        $staffingRequest->update(array_filter([
            'event_title' => $validated['event_title'] ?? null,
            'duty_period' => $validated['duty_period'] ?? null,
            'duty_start_date' => $validated['duty_start_date'] ?? null,
            'duty_end_date' => $validated['duty_end_date'] ?? null,
            'hours_per_day' => $validated['hours_per_day'] ?? null,
            'reason' => $reason,
            'duty_request' => $reason,
            'quantity' => $validated['quantity'] ?? null,
            'requested_genders' => isset($validated['requested_genders'])
                ? array_values($validated['requested_genders'])
                : null,
            'approval_letter_path' => $path,
            'status' => 'Pending',
        ], fn ($value) => $value !== null));

        $staffingRequest = $staffingRequest->fresh();
        $dutyLabel = $this->dutyLabel($staffingRequest);
        $countLabel = (int) $staffingRequest->quantity === 1
            ? '1 working student'
            : "{$staffingRequest->quantity} working students";
        $genderLabel = $this->genderSummary($staffingRequest->requested_genders ?? []);
        $eventNote = $staffingRequest->event_title ? " Event: {$staffingRequest->event_title}." : '';

        $this->notifyCoordinators(
            'Working Student Requested',
            "{$request->user()->name} requested {$countLabel} ({$genderLabel}) for {$staffingRequest->department} ({$dutyLabel}).{$eventNote} Assign the working student who will be sent to that office."
        );

        return response()->json([
            'message' => 'Staffing request sent to WSPO.',
            'request' => $staffingRequest,
        ]);
    }

    public function updateStatus(Request $request, StaffingRequest $staffingRequest)
    {
        SuperAdminAudit::denyMutation($request);
        $validated = $request->validate([
            'status' => 'required|in:Pending,Approved,Fulfilled,Declined',
            'student_ids' => 'required_if:status,Approved,Fulfilled|array',
            'student_ids.*' => 'integer|distinct|exists:users,id',
        ]);

        if (in_array($validated['status'], ['Approved', 'Fulfilled'], true)) {
            $studentIds = $validated['student_ids'] ?? [];
            abort_unless(
                count($studentIds) === (int) $staffingRequest->quantity,
                422,
                "Select exactly {$staffingRequest->quantity} working student(s) to send to this office."
            );

            $students = User::with('profile')->where('role', 'Student')->whereIn('id', $studentIds)->get();
            abort_unless($students->count() === count($studentIds), 422, 'Select working students only.');
            $this->assertGendersMatch($staffingRequest, $students);

            $staffingRequest->update([
                'status' => $validated['status'],
                'assigned_student_ids' => $students->pluck('id')->values()->all(),
            ]);

            $this->placeAssignedStudents($staffingRequest, $students);
        } else {
            $staffingRequest->update(['status' => $validated['status']]);
        }

        return response()->json(['message' => 'Staffing request updated.', 'request' => $staffingRequest->fresh()]);
    }

    private function placeAssignedStudents(StaffingRequest $staffingRequest, $students): void
    {
        $dutyRequest = $staffingRequest->duty_type === 'Request' ? $staffingRequest->duty_request : null;
        $dutyLabel = $this->dutyLabel($staffingRequest);
        $studentNames = $students->pluck('name')->join(', ');
        $office = $staffingRequest->department;
        $genderLabel = $this->genderSummary($staffingRequest->requested_genders ?? []);

        foreach ($students as $student) {
            $previousOffice = trim((string) $student->profile?->assigned_office);
            $student->profile()->updateOrCreate(['user_id' => $student->id], [
                'assigned_office' => $office,
                'duty_type' => $staffingRequest->duty_type,
                'duty_request' => $dutyRequest,
            ]);

            Notification::create([
                'user_id' => $student->id,
                'title' => 'Office Assignment Confirmed',
                'message' => "You have been assigned to {$office} as a working student for {$dutyLabel}.",
            ]);

            app(DepartmentAssignmentNotifier::class)->notify($student, $office, $dutyLabel);
            app(InfractionEscalation::class)->recordDepartmentReplacement(
                $student->id,
                $previousOffice,
                $office,
                request()->user()?->id,
                'staffing_request'
            );
        }

        $assignmentNote = $genderLabel
            ? "{$studentNames} will be sent to {$office} for {$dutyLabel} ({$genderLabel})."
            : "{$studentNames} will be sent to {$office} for {$dutyLabel}.";

        $this->notifyCoordinators('Working Student Assigned', $assignmentNote);
    }

    private function assertGendersMatch(StaffingRequest $staffingRequest, Collection $students): void
    {
        $requested = $staffingRequest->requested_genders ?? [];
        if ($requested === []) {
            return;
        }

        $genders = $this->genderMapForUsers($students);
        $selected = [];
        foreach ($students as $student) {
            $gender = $genders[$student->id] ?? null;
            abort_unless($gender, 422, "{$student->name} has no recorded gender and cannot be assigned to this request.");
            $selected[] = $gender;
        }

        abort_unless(
            $this->genderCounts($selected) === $this->genderCounts($requested),
            422,
            'Selected students must match the requested genders: ' . $this->genderSummary($requested) . '.'
        );
    }

    private function genderMapForUsers(Collection $students): array
    {
        if ($students->isEmpty()) {
            return [];
        }

        $fromApplications = Application::query()
            ->whereIn('user_id', $students->pluck('id'))
            ->whereIn('gender', ['Male', 'Female'])
            ->orderByDesc('id')
            ->get(['user_id', 'gender'])
            ->unique('user_id')
            ->pluck('gender', 'user_id');

        $map = [];
        foreach ($students as $student) {
            $profileGender = $student->profile?->gender;
            $map[$student->id] = in_array($profileGender, ['Male', 'Female'], true)
                ? $profileGender
                : ($fromApplications[$student->id] ?? null);
        }

        return $map;
    }

    private function genderCounts(array $genders): array
    {
        return [
            'Male' => count(array_filter($genders, fn ($gender) => $gender === 'Male')),
            'Female' => count(array_filter($genders, fn ($gender) => $gender === 'Female')),
        ];
    }

    private function genderSummary(array $genders): string
    {
        $counts = $this->genderCounts($genders);
        $parts = [];
        if ($counts['Male'] > 0) {
            $parts[] = $counts['Male'] === 1 ? '1 Male' : "{$counts['Male']} Male";
        }
        if ($counts['Female'] > 0) {
            $parts[] = $counts['Female'] === 1 ? '1 Female' : "{$counts['Female']} Female";
        }

        return implode(' and ', $parts);
    }

    private function dutyLabel(StaffingRequest $staffingRequest): string
    {
        if ($staffingRequest->duty_type === 'Request') {
            if ($staffingRequest->event_title) {
                return (string) $staffingRequest->event_title;
            }
            if ($staffingRequest->duty_request) {
                return (string) $staffingRequest->duty_request;
            }

            return 'Extra Service';
        }

        return (string) $staffingRequest->duty_type;
    }

    /** @return list<string> */
    private function normalizeRequestedGenders(mixed $raw): array
    {
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $raw = $decoded;
            } else {
                $raw = array_filter(array_map('trim', explode(',', $raw)));
            }
        }

        if (!is_array($raw)) {
            return [];
        }

        return array_values(array_map('strval', $raw));
    }

    private function notifyCoordinators(string $title, string $message): void
    {
        $coordinators = User::whereIn('role', ['WSPO Staff', 'Super Admin'])->get(['id']);
        foreach ($coordinators as $coordinator) {
            Notification::create([
                'user_id' => $coordinator->id,
                'title' => $title,
                'message' => $message,
            ]);
        }
    }
}
