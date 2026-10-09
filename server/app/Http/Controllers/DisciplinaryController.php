<?php

namespace App\Http\Controllers;

use App\Models\DisciplinaryRecord;
use App\Models\Notification;
use App\Models\StudentAward;
use App\Models\StudentPerformanceReview;
use App\Models\User;
use App\Services\DepartmentAssignmentNotifier;
use App\Support\OffenseCatalog;
use App\Support\SuperAdminAudit;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DisciplinaryController extends Controller
{
    public function index(Request $request)
    {
        if ($request->user()->role === 'Super Admin') {
            $query = DisciplinaryRecord::with([
                'student' => fn ($relation) => $relation->withTrashed()->select('id', 'name', 'deleted_at')->with('profile:id,user_id,assigned_office'),
                'issuer:id,name',
                'reporter:id,name',
            ]);
        } else {
            $query = DisciplinaryRecord::with(['student:id,name', 'issuer:id,name', 'reporter:id,name'])
                ->whereHas('student');
        }

        if ($request->user()->role === 'Supervisor') {
            $request->user()->loadMissing('profile');
            $departments = $this->supervisedDepartments($request->user());
            $query->whereHas('student.profile', function ($q) use ($departments) {
                $q->whereIn('assigned_office', $departments);
            });
        }

        return $query
            ->latest()
            ->get();
    }

    public function store(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $canSetPenalties = $this->isCoordinator($request->user());

        $validated = $request->validate([
            'student_id' => 'required_without:user_id|exists:users,id',
            'user_id' => 'required_without:student_id|exists:users,id',
            'violation_type' => ['required', 'string', Rule::in(OffenseCatalog::names())],
            'incident_date' => 'nullable|date',
            'description' => 'required|string',
            'penalty_hours' => 'nullable|numeric|min:0',
            'penalty' => 'nullable|string|max:255',
            'deduction_amount' => 'nullable|numeric|min:0',
        ]);

        $studentId = $validated['student_id'] ?? $validated['user_id'];

        $attributes = [
            'student_id' => $studentId,
            'issued_by' => $request->user()->id,
            'violation_type' => $validated['violation_type'],
            'offense_level' => OffenseCatalog::levelFor($validated['violation_type']),
            'incident_date' => $validated['incident_date'] ?? now()->toDateString(),
            'description' => $validated['description'],
            'penalty_hours' => 0,
            'penalty' => 'Pending',
            'deduction_amount' => 0,
            'status' => 'Active',
        ];

        if ($canSetPenalties) {
            $decision = $this->validateDecision($request);
            $attributes = array_merge($attributes, $this->decisionAttributes($decision));
        }

        $record = DisciplinaryRecord::create($attributes);
        $this->notifyStudentOfDecision($record);

        if (!$canSetPenalties) {
            $student = User::find($studentId);
            $this->notifyCoordinators(
                'Infraction Reported',
                ($student?->name ?? 'A working student') . " was reported for {$record->violation_type}. Decide the penalty in Compliance."
            );
        }

        return response()->json(['message' => 'Disciplinary action logged successfully!', 'record' => $record], 201);
    }

    /** Coordinator sets the penalty on a reported infraction, or changes an open case. */
    public function decide(Request $request, $id)
    {
        SuperAdminAudit::denyMutation($request);
        if (!$this->isCoordinator($request->user())) {
            return response()->json(['message' => 'Only the WSPO coordinator can decide an infraction.'], 403);
        }

        $record = DisciplinaryRecord::findOrFail($id);

        if (in_array($record->status, ['Resolved', 'Dismissed'], true)) {
            return response()->json(['message' => 'This infraction is already closed.'], 422);
        }

        $decision = $this->validateDecision($request);

        $record->update($this->decisionAttributes($decision));
        $this->notifyStudentOfDecision($record->fresh());

        return response()->json(['message' => 'Infraction decision saved.', 'record' => $record->fresh()]);
    }

    public function resolve(Request $request, $id)
    {
        SuperAdminAudit::denyMutation($request);
        $record = DisciplinaryRecord::findOrFail($id);
        $user = $request->user();

        if ($record->status === 'Pending Appeal' && !$this->isCoordinator($user)) {
            return response()->json(['message' => 'Only the WSPO coordinator can decide an appeal.'], 403);
        }

        $rules = [
            'status' => 'required|in:Resolved,Dismissed',
            'resolution_remarks' => 'required_without:resolution_notes|string',
            'resolution_notes' => 'required_without:resolution_remarks|string',
        ];

        if ($this->isCoordinator($user)) {
            $rules['penalty_hours'] = 'nullable|numeric|min:0';
            $rules['deduction_amount'] = 'nullable|numeric|min:0';
            $rules['penalty'] = 'nullable|string|max:255';
        }

        $validated = $request->validate($rules);

        $updates = [
            'status' => $validated['status'],
            'resolution_remarks' => $validated['resolution_remarks'] ?? $validated['resolution_notes'],
            'resolved_at' => Carbon::now(),
        ];

        if ($validated['status'] === 'Dismissed') {
            $updates['penalty'] = 'Dismissed';
            $updates['penalty_hours'] = 0;
            $updates['deduction_amount'] = 0;
            $updates['suspension_length'] = null;
            $updates['suspension_ends_at'] = null;
            $updates['suspension_reason'] = null;
        } elseif ($this->isCoordinator($user)) {
            if (array_key_exists('penalty_hours', $validated)) {
                $updates['penalty_hours'] = (float) ($validated['penalty_hours'] ?? 0);
            }
            if (array_key_exists('deduction_amount', $validated)) {
                $updates['deduction_amount'] = (float) ($validated['deduction_amount'] ?? 0);
            }
            if (!empty($validated['penalty'])) {
                $updates['penalty'] = $validated['penalty'];
            }
        }

        $record->update($updates);

        return response()->json(['message' => 'Case officially closed.']);
    }

    public function myRecords(Request $request)
    {
        return DisciplinaryRecord::with(['issuer:id,name', 'reporter:id,name'])
            ->where('student_id', $request->user()->id)
            ->latest()
            ->get();
    }

    public function submitAppeal(Request $request, $id)
    {
        $record = DisciplinaryRecord::where('id', $id)
            ->where('student_id', $request->user()->id)
            ->firstOrFail();

        if ($record->penalty === 'Pending') {
            return response()->json(['message' => 'This infraction is still waiting for a coordinator decision.'], 422);
        }

        if (!in_array($record->status, ['Active', 'Resolved'], true)) {
            return response()->json(['message' => 'This record cannot be appealed in its current status.'], 422);
        }

        $validated = $request->validate([
            'appeal_notes' => 'required_without:student_appeal|string',
            'student_appeal' => 'required_without:appeal_notes|string',
        ]);

        $record->update([
            'appeal_notes' => $validated['appeal_notes'] ?? $validated['student_appeal'],
            'status' => 'Pending Appeal',
        ]);

        $studentName = $request->user()->name;
        $this->notifyCoordinators(
            'Disciplinary Appeal Submitted',
            "{$studentName} appealed a {$record->violation_type} record. Please review and decide the case in Compliance."
        );

        return response()->json(['message' => 'Appeal submitted to the WSPO coordinator.']);
    }

    /** Offense list and the performance outcomes used by supervisors and the coordinator. */
    public function catalog()
    {
        $grouped = OffenseCatalog::grouped();

        return response()->json([
            'minor' => $grouped['minor'],
            'major' => $grouped['major'],
            'ratings' => OffenseCatalog::RATINGS,
            'school_year' => OffenseCatalog::currentSchoolYear(),
            'departments' => \App\Models\Office::names(),
        ]);
    }

    public function performanceIndex(Request $request)
    {
        $query = StudentPerformanceReview::with([
            'student' => fn ($relation) => $this->studentRelation($relation, $request->user()),
            'recorder:id,name',
        ])->latest();

        $this->limitToVisibleStudents($query, $request->user());

        return $query->get();
    }

    public function storePerformance(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $validated = $request->validate([
            'student_id' => 'required|exists:users,id',
            'school_year' => ['required', 'regex:/^\d{4}-\d{4}$/'],
            'rating' => ['required', Rule::in(array_keys(OffenseCatalog::RATINGS))],
            'target_department' => ['exclude_unless:rating,bad', 'required', 'string', Rule::in(\App\Models\Office::names())],
            'notes' => 'nullable|string|max:2000',
        ]);

        $student = $this->visibleStudent($request, (int) $validated['student_id']);
        if (!$student) {
            return response()->json(['message' => 'That working student is outside your department.'], 403);
        }

        $rating = OffenseCatalog::RATINGS[$validated['rating']];
        $review = StudentPerformanceReview::updateOrCreate(
            [
                'student_id' => $student->id,
                'school_year' => $validated['school_year'],
            ],
            [
                'recorded_by' => $request->user()->id,
                'rating' => $validated['rating'],
                'outcome' => $rating['outcome'],
                'target_department' => $rating['outcome'] === 'reassign' ? $validated['target_department'] : null,
                'notes' => $validated['notes'] ?? null,
            ]
        );

        $actor = $request->user();
        if ($rating['outcome'] === 'reassign' && $this->isCoordinator($actor)) {
            $this->reassignStudent($student, $validated['target_department']);
        } elseif (!$this->isCoordinator($actor)) {
            $this->notifyCoordinators(
                $rating['outcome'] === 'reassign' ? 'Reassignment Recommended' : 'Performance Review Recorded',
                $rating['outcome'] === 'reassign'
                    ? "{$student->name} was marked for reassignment to {$validated['target_department']} for {$validated['school_year']}. Review it in Compliance."
                    : "{$student->name} was marked {$rating['label']} ({$rating['outcome_label']}) for {$validated['school_year']}."
            );
        } else {
            app(DepartmentAssignmentNotifier::class)->notifyMessage(
                trim((string) $student->profile?->assigned_office),
                'Performance Review Recorded',
                "{$student->name} was marked {$rating['label']} ({$rating['outcome_label']}) for {$validated['school_year']}.",
                $actor->id
            );
        }

        return response()->json([
            'message' => $rating['outcome_label'] . ' recorded for ' . $validated['school_year'] . '.',
            'review' => $review->load(['student:id,name', 'recorder:id,name']),
        ], 201);
    }

    public function awardsIndex(Request $request)
    {
        $query = StudentAward::with([
            'student' => fn ($relation) => $this->studentRelation($relation, $request->user()),
            'awarder:id,name',
        ])->latest();

        $this->limitToVisibleStudents($query, $request->user());

        return $query->get();
    }

    public function storeAward(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        if (!$this->isCoordinator($request->user())) {
            return response()->json(['message' => 'Only the WSPO coordinator records year-end awards.'], 403);
        }

        $validated = $request->validate([
            'student_id' => 'required|exists:users,id',
            'school_year' => ['required', 'regex:/^\d{4}-\d{4}$/'],
            'title' => 'nullable|string|max:255',
            'citation' => 'nullable|string|max:2000',
        ]);

        $student = User::where('role', 'Student')->find($validated['student_id']);
        if (!$student) {
            return response()->json(['message' => 'Choose a working student.'], 422);
        }

        $award = StudentAward::updateOrCreate(
            [
                'student_id' => $student->id,
                'school_year' => $validated['school_year'],
                'title' => trim($validated['title'] ?? '') ?: 'Best Performing Student',
            ],
            [
                'awarded_by' => $request->user()->id,
                'citation' => $validated['citation'] ?? null,
            ]
        );

        $student->loadMissing('profile');
        $office = trim((string) $student->profile?->assigned_office);
        if ($office !== '') {
            app(DepartmentAssignmentNotifier::class)->notifyMessage(
                $office,
                'Year-end Award Recorded',
                "{$student->name} received {$award->title} for {$award->school_year}.",
                $request->user()->id
            );
        }

        return response()->json([
            'message' => 'Year-end award recorded.',
            'award' => $award->load(['student:id,name', 'awarder:id,name']),
        ], 201);
    }

    private function validateDecision(Request $request): array
    {
        return $request->validate([
            'penalty' => 'required|in:Suspension,DTR Deduction,Dismissed',
            'penalty_hours' => 'exclude_unless:penalty,DTR Deduction|required|numeric|min:0.5',
            'resolution_remarks' => 'nullable|string',
            'suspension_span' => 'exclude_unless:penalty,Suspension|required|in:days,2 weeks,3 weeks,1 month',
            'suspension_days' => 'exclude_unless:suspension_span,days|required|integer|min:1|max:7',
            'suspension_reason' => 'exclude_unless:penalty,Suspension|required|string|min:3',
        ]);
    }

    private function decisionAttributes(array $decision): array
    {
        $penalty = $decision['penalty'];

        $clearedSuspension = [
            'suspension_length' => null,
            'suspension_ends_at' => null,
            'suspension_reason' => null,
        ];

        if ($penalty === 'Dismissed') {
            return array_merge($clearedSuspension, [
                'penalty' => 'Dismissed',
                'penalty_hours' => 0,
                'deduction_amount' => 0,
                'status' => 'Dismissed',
                'resolved_at' => Carbon::now(),
                'resolution_remarks' => $decision['resolution_remarks']
                    ?? 'Dismissed by the WSPO coordinator. No penalty applied.',
            ]);
        }

        if ($penalty === 'Suspension') {
            [$length, $endsAt] = $this->suspensionWindow($decision);

            return [
                'penalty' => 'Suspension',
                'penalty_hours' => 0,
                'deduction_amount' => 0,
                'suspension_length' => $length,
                'suspension_ends_at' => $endsAt,
                'suspension_reason' => trim($decision['suspension_reason']),
                'status' => 'Active',
                'resolved_at' => null,
                'resolution_remarks' => null,
            ];
        }

        return array_merge($clearedSuspension, [
            'penalty' => 'DTR Deduction',
            'penalty_hours' => (float) $decision['penalty_hours'],
            'deduction_amount' => 0,
            'status' => 'Active',
            'resolved_at' => null,
            'resolution_remarks' => null,
        ]);
    }

    /** @return array{0: string, 1: Carbon} */
    private function suspensionWindow(array $decision): array
    {
        $start = Carbon::now();

        return match ($decision['suspension_span']) {
            'days' => [
                ((int) $decision['suspension_days']) === 1 ? '1 day' : ((int) $decision['suspension_days']) . ' days',
                $start->copy()->addDays((int) $decision['suspension_days']),
            ],
            '2 weeks' => ['2 weeks', $start->copy()->addWeeks(2)],
            '3 weeks' => ['3 weeks', $start->copy()->addWeeks(3)],
            default => ['1 month', $start->copy()->addMonth()],
        };
    }

    private function notifyStudentOfDecision(DisciplinaryRecord $record): void
    {
        if ($record->penalty === 'Pending') {
            Notification::create([
                'user_id' => $record->student_id,
                'title' => 'Infraction Reported',
                'message' => "A {$record->violation_type} report was filed. The WSPO coordinator will decide the penalty.",
            ]);
            return;
        }

        $message = match ($record->penalty) {
            'Suspension' => $record->suspensionNotice() . " This is for {$record->violation_type}.",
            'DTR Deduction' => number_format((float) $record->penalty_hours, 2) . " duty hours were deducted from your DTR for {$record->violation_type}.",
            'Dismissed' => "The {$record->violation_type} infraction was dismissed. No penalty was applied.",
            default => "A decision was recorded on your {$record->violation_type} infraction.",
        };

        Notification::create([
            'user_id' => $record->student_id,
            'title' => 'Infraction Decision',
            'message' => $message,
        ]);
    }

    private function studentRelation($relation, User $user)
    {
        if ($user->role === 'Super Admin') {
            $relation->withTrashed();
        }

        return $relation->select('id', 'name', 'deleted_at');
    }

    private function limitToVisibleStudents($query, User $user): void
    {
        if ($user->role === 'Supervisor') {
            $user->loadMissing('profile');
            $departments = $this->supervisedDepartments($user);
            $query->whereHas('student.profile', function ($q) use ($departments) {
                $q->whereIn('assigned_office', $departments);
            });
            return;
        }

        if ($user->role !== 'Super Admin') {
            $query->whereHas('student');
        }
    }

    private function visibleStudent(Request $request, int $studentId): ?User
    {
        $student = User::with('profile')->where('role', 'Student')->find($studentId);
        if (!$student || $request->user()->role !== 'Supervisor') {
            return $student;
        }

        $request->user()->loadMissing('profile');
        $office = trim((string) $student->profile?->assigned_office);

        return in_array($office, $this->supervisedDepartments($request->user()), true) ? $student : null;
    }

    private function reassignStudent(User $student, string $department): void
    {
        $student->loadMissing('profile');
        $previous = trim((string) $student->profile?->assigned_office);
        if ($previous === $department) {
            return;
        }

        $student->profile()->updateOrCreate(
            ['user_id' => $student->id],
            ['assigned_office' => $department]
        );

        Notification::create([
            'user_id' => $student->id,
            'title' => 'Office Assignment Updated',
            'message' => "You have been reassigned to {$department}.",
        ]);

        app(DepartmentAssignmentNotifier::class)->notify(
            $student->fresh(['profile']),
            $department,
            $student->profile?->duty_type
        );
    }

    private function isCoordinator(?User $user): bool
    {
        return $user && in_array($user->role, ['WSPO Staff', 'Super Admin'], true);
    }

    private function supervisedDepartments(User $user): array
    {
        $configured = $user->profile?->supervised_departments;
        $departments = is_array($configured) ? $configured : [];

        if ($departments === [] && $user->profile?->assigned_office) {
            $departments[] = $user->profile->assigned_office;
        }

        return array_values(array_unique(array_filter(array_map('trim', $departments))));
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
