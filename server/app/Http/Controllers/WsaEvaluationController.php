<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Models\SemesterTerm;
use App\Models\User;
use App\Models\WsaEvaluation;
use App\Support\SuperAdminAudit;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class WsaEvaluationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);
        $query = WsaEvaluation::query()
            ->with([
                'submitter:id,name',
                'reviewer:id,name',
                'student:id,name',
                'student.profile:id,user_id,student_id_number,assigned_office',
            ])
            ->orderByRaw("CASE status WHEN 'Pending' THEN 0 WHEN 'Draft' THEN 1 WHEN 'Approved' THEN 2 ELSE 3 END")
            ->orderByDesc('evaluated_on')
            ->orderByDesc('id');

        if ($accounts->canFileEvaluation($user)) {
            $departments = $accounts->supervisedDepartments($user);
            $query->whereIn('department', $departments === [] ? ['__none__'] : $departments)
                ->where(function ($rows) use ($user) {
                    $rows->where('status', '!=', WsaEvaluation::DRAFT)
                        ->orWhere('submitted_by', $user->id);
                });
        } elseif ($accounts->canReviewEvaluation($user)) {
            $query->where('status', '!=', WsaEvaluation::DRAFT);
        } else {
            return response()->json(['message' => 'Not allowed.'], 403);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }

        return response()->json([
            'evaluations' => $query->limit(100)->get()->map(fn (WsaEvaluation $row) => $this->serialize($row)),
        ]);
    }

    public function meta(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);
        abort_unless($accounts->canFileEvaluation($user) || $accounts->canReviewEvaluation($user), 403);

        $semester = SemesterTerm::current();
        $today = Carbon::today();

        return response()->json([
            'can_file' => $accounts->canFileEvaluation($user),
            'can_review' => $accounts->canReviewEvaluation($user),
            'can_decide' => $user->role === 'WSPO Staff' && $accounts->canManageWorkSchedules($user),
            'user_id' => $user->id,
            'departments' => $accounts->canFileEvaluation($user) ? $accounts->supervisedDepartments($user) : [],
            'semester' => $semester?->label,
            'school_year' => $semester ? $this->schoolYear($semester) : null,
            'semester_school_year' => $semester
                ? trim((string) $semester->label).' / A.Y. '.$this->schoolYear($semester)
                : null,
            'evaluated_on' => $today->toDateString(),
            'evaluated_on_label' => $today->format('F j, Y'),
            'standards' => WsaEvaluation::STANDARDS,
            'ratings' => WsaEvaluation::RATINGS,
            'recommendations' => WsaEvaluation::RECOMMENDATIONS,
            'intro' => 'A performance evaluation is an important part of maintaining a motivated and skilled workforce. The immediate supervisor is requested to evaluate and assess their student assistants on a regular monthly basis to receive feedback on the quality of work rendered. Thank you for your time.',
            'legend' => 'Outstanding — Performance is consistently superior. Very Good — Often exceeds standards. Good — Fully meets standards. Fair — Need improvements; more is expected. Poor — Never meets standards.',
        ]);
    }

    public function candidates(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);
        abort_unless($accounts->canFileEvaluation($user), 403, 'Only a department supervisor or secretary can choose a student assistant.');

        $department = $this->resolveDepartment($user, $request->input('department'));
        $areas = $accounts->areasForDepartment($department);
        $query = User::query()->with('profile:id,user_id,student_id_number,assigned_office')->orderBy('name');
        $accounts->constrainPlacedIn($query, $areas);

        $students = $query->get(['id', 'name'])->map(function (User $student) use ($accounts) {
            return [
                'id' => $student->id,
                'name' => $student->name,
                'student_id_number' => $student->profile?->student_id_number,
                'assigned_office' => $accounts->placementOffice($student),
            ];
        })->values();

        return response()->json([
            'department' => $department,
            'students' => $students,
        ]);
    }

    public function store(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $user = $request->user()->loadMissing('profile');
        abort_unless(
            app(UserController::class)->canFileEvaluation($user),
            403,
            'Only a department supervisor or secretary can file an evaluation.'
        );

        $asDraft = filter_var($request->input('as_draft'), FILTER_VALIDATE_BOOLEAN);
        $payload = $this->validatedPayload($request, $user);
        if (! $asDraft) {
            $this->assertSignatureProof($request, null);
        }
        $this->assertMonthlyUnique($payload['student'], $payload['department'], $payload['evaluated_on']);

        $row = WsaEvaluation::create([
            ...$payload['attributes'],
            'submitted_by' => $user->id,
            'student_id' => $payload['student']->id,
            'status' => $asDraft ? WsaEvaluation::DRAFT : WsaEvaluation::PENDING,
        ]);
        $this->storeSignatures($request, $row);

        $row = $row->fresh(['submitter:id,name', 'student.profile', 'reviewer:id,name']);
        if (! $asDraft) {
            $this->notifyCoordinator($row);
        }

        return response()->json([
            'message' => $asDraft
                ? 'Evaluation draft saved. Print it on long coupon paper, collect a signature, then submit it to the WSPO coordinator.'
                : 'Evaluation submitted to the WSPO coordinator.',
            'evaluation' => $this->serialize($row),
        ], 201);
    }

    public function saveDraft(Request $request, WsaEvaluation $wsaEvaluation)
    {
        SuperAdminAudit::denyMutation($request);
        $this->assertDraftOwner($request, $wsaEvaluation);
        $payload = $this->validatedPayload($request, $request->user()->loadMissing('profile'));
        $this->assertMonthlyUnique($payload['student'], $payload['department'], $payload['evaluated_on'], $wsaEvaluation->id);

        $wsaEvaluation->update($payload['attributes'] + ['student_id' => $payload['student']->id]);
        $this->storeSignatures($request, $wsaEvaluation);

        return response()->json([
            'message' => 'Evaluation draft updated.',
            'evaluation' => $this->serialize($wsaEvaluation->fresh(['submitter:id,name', 'student.profile', 'reviewer:id,name'])),
        ]);
    }

    public function finalize(Request $request, WsaEvaluation $wsaEvaluation)
    {
        SuperAdminAudit::denyMutation($request);
        $this->assertDraftOwner($request, $wsaEvaluation);
        $payload = $this->validatedPayload($request, $request->user()->loadMissing('profile'));
        $this->assertSignatureProof($request, $wsaEvaluation);
        $this->assertMonthlyUnique($payload['student'], $payload['department'], $payload['evaluated_on'], $wsaEvaluation->id);

        $wsaEvaluation->update($payload['attributes'] + [
            'student_id' => $payload['student']->id,
            'status' => WsaEvaluation::PENDING,
            'decision_note' => null,
            'reviewed_by' => null,
            'reviewed_at' => null,
        ]);
        $this->storeSignatures($request, $wsaEvaluation);

        $row = $wsaEvaluation->fresh(['submitter:id,name', 'student.profile', 'reviewer:id,name']);
        $this->notifyCoordinator($row);

        return response()->json([
            'message' => 'Evaluation submitted to the WSPO coordinator.',
            'evaluation' => $this->serialize($row),
        ]);
    }

    public function destroy(Request $request, WsaEvaluation $wsaEvaluation)
    {
        SuperAdminAudit::denyMutation($request);
        $this->assertDraftOwner($request, $wsaEvaluation);
        $this->deleteSignature($wsaEvaluation->evaluated_signature_path);
        $this->deleteSignature($wsaEvaluation->attested_signature_path);
        $wsaEvaluation->delete();

        return response()->json(['message' => 'Evaluation draft deleted.']);
    }

    public function decide(Request $request, WsaEvaluation $wsaEvaluation)
    {
        SuperAdminAudit::denyMutation($request);
        $reviewer = $request->user()->loadMissing('profile');
        $accounts = app(UserController::class);
        abort_unless(
            $reviewer->role === 'WSPO Staff' && $accounts->canManageWorkSchedules($reviewer),
            403,
            'Only the WSPO coordinator can approve an evaluation.'
        );
        abort_unless(
            $wsaEvaluation->status === WsaEvaluation::PENDING,
            422,
            'Only a submitted evaluation can be approved or returned.'
        );

        $validated = $request->validate([
            'status' => 'required|in:Approved,Rejected',
            'decision_note' => 'nullable|string|max:1000',
        ]);

        $wsaEvaluation->update([
            'status' => $validated['status'],
            'decision_note' => trim((string) ($validated['decision_note'] ?? '')) ?: null,
            'reviewed_by' => $reviewer->id,
            'reviewed_at' => now(),
        ]);

        $row = $wsaEvaluation->fresh(['submitter:id,name', 'student.profile', 'reviewer:id,name']);
        $studentName = $row->student?->name ?: 'the student assistant';
        $approved = $validated['status'] === WsaEvaluation::APPROVED;

        if ($row->submitted_by) {
            Notification::create([
                'user_id' => $row->submitted_by,
                'title' => $approved ? 'Evaluation approved' : 'Evaluation returned',
                'message' => 'The WSPO coordinator '.($approved ? 'approved' : 'returned').' the evaluation for '
                    .$studentName.' ('.$row->department.').',
            ]);
        }

        if ($row->student_id) {
            Notification::create([
                'user_id' => $row->student_id,
                'title' => $approved ? 'Performance evaluation approved' : 'Performance evaluation returned',
                'message' => 'Your '.$row->semester_label.' evaluation for '.$row->department
                    .' was '.($approved ? 'approved' : 'returned').' by the WSPO coordinator.',
            ]);
        }

        return response()->json([
            'message' => $approved ? 'Evaluation approved.' : 'Evaluation returned to the office.',
            'evaluation' => $this->serialize($row),
        ]);
    }

    private function assertDraftOwner(Request $request, WsaEvaluation $evaluation): void
    {
        $user = $request->user()->loadMissing('profile');
        abort_unless(app(UserController::class)->canFileEvaluation($user), 403);
        abort_unless((int) $evaluation->submitted_by === (int) $user->id, 403, 'Only the person who started this draft can change it.');
        abort_unless($evaluation->status === WsaEvaluation::DRAFT, 422, 'Only a draft evaluation can be changed.');
    }

    /**
     * @return array{student: User, department: string, evaluated_on: Carbon, attributes: array<string, mixed>}
     */
    private function validatedPayload(Request $request, User $actor): array
    {
        if (is_string($request->input('ratings'))) {
            $decoded = json_decode($request->input('ratings'), true);
            $request->merge(['ratings' => is_array($decoded) ? $decoded : []]);
        }

        $validated = $request->validate([
            'department' => 'nullable|string|max:120',
            'student_id' => 'required|integer|exists:users,id',
            'ratings' => 'required|array',
            'comments' => 'nullable|string|max:2000',
            'recommendation' => 'required|in:'.implode(',', WsaEvaluation::RECOMMENDATIONS),
            'evaluated_by_name' => 'required|string|max:255',
            'attested_by_name' => 'required|string|max:255',
            'evaluated_signature' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:4096',
            'attested_signature' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:4096',
            'signature_proof' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:4096',
        ]);

        $ratings = [];
        foreach (WsaEvaluation::standardIds() as $id) {
            $score = $validated['ratings'][$id] ?? null;
            if (! is_string($score) || ! in_array($score, WsaEvaluation::RATINGS, true)) {
                abort(422, 'Choose one rating for every performance standard.');
            }
            $ratings[$id] = $score;
        }

        $semester = SemesterTerm::current();
        abort_unless($semester !== null, 422, 'The WSPO office has not set the semester yet.');

        $department = $this->resolveDepartment($actor, $validated['department'] ?? null);
        $accounts = app(UserController::class);
        $studentQuery = User::query()->with('profile');
        $accounts->constrainPlacedIn($studentQuery, $accounts->areasForDepartment($department));
        $student = $studentQuery->whereKey($validated['student_id'])->first();
        abort_unless($student !== null, 422, 'Choose one student assistant from this office or department.');

        $today = Carbon::today();

        return [
            'student' => $student,
            'department' => $department,
            'evaluated_on' => $today,
            'attributes' => [
                'department' => $department,
                'semester_label' => trim((string) $semester->label),
                'school_year' => $this->schoolYear($semester),
                'evaluated_on' => $today->toDateString(),
                'ratings' => $ratings,
                'comments' => trim((string) ($validated['comments'] ?? '')) ?: null,
                'recommendation' => $validated['recommendation'],
                'evaluated_by_name' => mb_strtoupper(trim($validated['evaluated_by_name']), 'UTF-8'),
                'attested_by_name' => mb_strtoupper(trim($validated['attested_by_name']), 'UTF-8'),
            ],
        ];
    }

    private function resolveDepartment(User $actor, mixed $requested): string
    {
        $departments = app(UserController::class)->supervisedDepartments($actor);
        abort_unless($departments !== [], 422, 'Your account has no assigned office or department.');

        $requested = trim((string) $requested);
        if ($requested === '') {
            abort_unless(count($departments) === 1, 422, 'Select one office or department.');

            return $departments[0];
        }

        abort_unless(
            in_array($requested, $departments, true),
            403,
            'You can only evaluate student assistants in your office or department.'
        );

        return $requested;
    }

    private function assertMonthlyUnique(User $student, string $department, Carbon $day, ?int $ignoreId = null): void
    {
        $exists = WsaEvaluation::query()
            ->where('student_id', $student->id)
            ->where('department', $department)
            ->whereIn('status', [WsaEvaluation::DRAFT, WsaEvaluation::PENDING, WsaEvaluation::APPROVED])
            ->whereDate('evaluated_on', '>=', $day->copy()->startOfMonth()->toDateString())
            ->whereDate('evaluated_on', '<=', $day->copy()->endOfMonth()->toDateString())
            ->when($ignoreId, fn ($query) => $query->whereKeyNot($ignoreId))
            ->exists();

        abort_if(
            $exists,
            422,
            'This office already has an evaluation for '.$student->name.' this month. Open that form instead of starting another.'
        );
    }

    private function assertSignatureProof(Request $request, ?WsaEvaluation $existing): void
    {
        $hasFile = $request->hasFile('signature_proof')
            || $request->hasFile('evaluated_signature')
            || $request->hasFile('attested_signature');
        $hasStored = $existing && ($existing->evaluated_signature_path || $existing->attested_signature_path);
        abort_unless(
            $hasFile || $hasStored,
            422,
            'Upload the signed evaluation form before sending this to the WSPO coordinator.'
        );
    }

    private function storeSignatures(Request $request, WsaEvaluation $evaluation): void
    {
        $file = $request->file('signature_proof')
            ?: $request->file('evaluated_signature')
            ?: $request->file('attested_signature');
        if (! $file) {
            return;
        }

        $this->deleteSignature($evaluation->evaluated_signature_path);
        $this->deleteSignature($evaluation->attested_signature_path);
        $evaluation->update([
            'evaluated_signature_path' => $file->store('evaluation-signatures', 'local'),
            'evaluated_signature_name' => $file->getClientOriginalName(),
            'attested_signature_path' => null,
            'attested_signature_name' => null,
        ]);
    }

    private function deleteSignature(?string $path): void
    {
        if ($path && Storage::disk('local')->exists($path)) {
            Storage::disk('local')->delete($path);
        }
    }

    private function notifyCoordinator(WsaEvaluation $row): void
    {
        $accounts = app(UserController::class);
        $recipients = User::query()->where('role', 'WSPO Staff')->with('profile')->get()
            ->filter(fn (User $user) => $user->role === 'WSPO Staff' && $accounts->canManageWorkSchedules($user));

        $studentName = $row->student?->name ?: 'a student assistant';
        foreach ($recipients as $recipient) {
            if ((int) $recipient->id === (int) $row->submitted_by) {
                continue;
            }
            Notification::create([
                'user_id' => $recipient->id,
                'title' => 'Evaluation submitted',
                'message' => ($row->submitter?->name ?: 'An office').' submitted a WSA Evaluation Form for '
                    .$studentName.' ('.$row->department.'). Review the signature proof and approve it.',
            ]);
        }
    }

    private function schoolYear(SemesterTerm $semester): string
    {
        $year = (int) $semester->starts_on->format('Y');
        $month = (int) $semester->starts_on->format('n');
        if ($month <= 5) {
            return ($year - 1).'-'.$year;
        }

        return $year.'-'.($year + 1);
    }

    private function serialize(WsaEvaluation $row): array
    {
        return [
            'id' => $row->id,
            'department' => $row->department,
            'semester_label' => $row->semester_label,
            'school_year' => $row->school_year,
            'semester_school_year' => $row->semester_label.' / A.Y. '.$row->school_year,
            'evaluated_on' => $row->evaluated_on?->toDateString(),
            'evaluated_on_label' => $row->evaluated_on?->format('F j, Y'),
            'ratings' => $row->ratings ?? [],
            'comments' => $row->comments,
            'recommendation' => $row->recommendation,
            'evaluated_by_name' => $row->evaluated_by_name,
            'attested_by_name' => $row->attested_by_name,
            'evaluated_signature_path' => $row->evaluated_signature_path,
            'evaluated_signature_name' => $row->evaluated_signature_name,
            'attested_signature_path' => $row->attested_signature_path,
            'attested_signature_name' => $row->attested_signature_name,
            'status' => $row->status,
            'decision_note' => $row->decision_note,
            'submitted_by' => $row->submitter?->name,
            'submitted_by_id' => $row->submitted_by,
            'reviewed_by' => $row->reviewer?->name,
            'reviewed_at' => $row->reviewed_at,
            'student' => $row->student ? [
                'id' => $row->student->id,
                'name' => $row->student->name,
                'student_id_number' => $row->student->profile?->student_id_number,
                'assigned_office' => $row->student->profile?->assigned_office,
            ] : null,
        ];
    }
};
