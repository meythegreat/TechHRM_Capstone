<?php

namespace App\Http\Controllers;

use App\Models\Application;
use App\Models\Notification;
use App\Models\StaffingRequest;
use App\Models\User;
use App\Services\DepartmentAssignmentNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class StaffingRequestController extends Controller
{
    public function index(Request $request)
    {
        $query = StaffingRequest::with('requester:id,name')->latest();
        if ($request->user()->role === 'Supervisor') {
            $query->where('requested_by', $request->user()->id);
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

    public function store(Request $request)
    {
        $department = $request->user()->profile?->assigned_office;
        abort_unless($department, 422, 'Your supervisor account must have an assigned office before requesting a student.');

        $validated = $request->validate([
            'duty_type' => 'required|in:Clerical,Janitorial,Request',
            'duty_request' => 'required_if:duty_type,Request|nullable|string|max:1000',
            'quantity' => 'required|integer|min:1|max:50',
            'requested_genders' => 'required|array',
            'requested_genders.*' => 'required|in:Male,Female',
        ]);

        abort_unless(
            count($validated['requested_genders']) === (int) $validated['quantity'],
            422,
            'Choose Male or Female for each working student needed.'
        );

        $staffingRequest = StaffingRequest::create([
            'requested_by' => $request->user()->id,
            'department' => $department,
            'duty_type' => $validated['duty_type'],
            'duty_request' => $validated['duty_type'] === 'Request' ? $validated['duty_request'] : null,
            'quantity' => $validated['quantity'],
            'requested_genders' => array_values($validated['requested_genders']),
            'assigned_student_ids' => [],
        ]);

        $dutyLabel = $this->dutyLabel($staffingRequest);
        $countLabel = $validated['quantity'] === 1 ? '1 working student' : "{$validated['quantity']} working students";
        $genderLabel = $this->genderSummary($validated['requested_genders']);

        $this->notifyCoordinators(
            'Working Student Requested',
            "{$request->user()->name} requested {$countLabel} ({$genderLabel}) for {$department} ({$dutyLabel}). Assign the working student who will be sent to that office."
        );

        return response()->json(['message' => 'Staffing request sent to WSPO.', 'request' => $staffingRequest], 201);
    }

    public function updateStatus(Request $request, StaffingRequest $staffingRequest)
    {
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
        if ($staffingRequest->duty_type === 'Request' && $staffingRequest->duty_request) {
            return $staffingRequest->duty_request;
        }

        return (string) $staffingRequest->duty_type;
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
