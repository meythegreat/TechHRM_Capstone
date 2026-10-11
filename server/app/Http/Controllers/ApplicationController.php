<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Support\AccountLogin;
use App\Support\SuperAdminAudit;
use App\Models\Application;
use App\Models\ApplicationStatusEvent;
use App\Models\Notification;
use App\Models\User;
use App\Models\UserProfile;
use App\Services\DepartmentAssignmentNotifier;
use App\Services\StaffNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class ApplicationController extends Controller
{
    // PUBLIC: Register a new applicant and submit their WSPO application.
    public function publicApply(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'required|string|max:255',
            'email' => ['required', 'string', 'email', 'max:255'],
            'age' => 'required|integer|min:16',
            'gender' => 'required|string|in:Male,Female,Prefer not to say',
            'address' => 'required|string',
            'contact_number' => 'required|string',
            'year_level' => 'required|string',
            'course' => 'nullable|string',
            'student_id_number' => 'nullable|string|max:50',
            'preferred_department' => 'nullable|string',
            'available_schedules' => 'nullable|array',
            'reason_for_applying' => 'nullable|string',
            'documents' => 'required|array|min:3|max:5',
            'documents.*' => 'file|mimes:pdf,jpg,jpeg,png|max:4096',
        ]);

        $this->assertStudentIdentityAvailable(
            $validated['email'],
            $validated['student_id_number'] ?? null
        );

        $application = DB::transaction(function () use ($request, $validated) {
            $application = Application::create([
                'user_id' => null,
                'first_name' => $validated['first_name'],
                'middle_name' => $validated['middle_name'] ?? null,
                'last_name' => $validated['last_name'],
                'age' => $validated['age'],
                'gender' => $validated['gender'],
                'address' => $validated['address'],
                'contact_number' => $validated['contact_number'],
                'year_level' => $validated['year_level'],
                'course' => $validated['course'] ?? null,
                'student_id_number' => $validated['student_id_number'] ?? null,
                'email' => $validated['email'],
                'preferred_department' => $validated['preferred_department'] ?? null,
                'available_schedules' => $validated['available_schedules'] ?? null,
                'reason_for_applying' => $validated['reason_for_applying'] ?? null,
                'status' => 'Pending',
                'source' => 'website',
                'tracking_code' => $this->makeTrackingCode(),
            ]);

            $this->storeApplicationDocuments($request, $application);
            $this->recordStatus($application, 'Pending', 'Application submitted');

            return $application;
        });

        $applicantName = $this->applicantName($application);
        $this->recordApplicationSubmission(null, $application, $applicantName);
        app(StaffNotifier::class)->notify(
            'New Signup',
            "{$applicantName} submitted a working-student application."
        );
        $this->notifyN8nApplicationStatus($application, 'Pending', [
            'event' => 'application_submitted',
            'submitted_at' => $application->created_at,
        ]);

        return response()->json([
            'message' => 'Application submitted. A username and password are issued only after placement is finalized. You will be able to sign in with that username or this email.',
            'tracking_code' => $application->tracking_code,
            'tracker' => $this->presentTracker($application),
        ], 201);
    }

    // 1. STUDENT: Submit Application
    public function store(Request $request)
    {
        if (Application::where('user_id', $request->user()->id)->exists()) {
            return response()->json(['message' => 'You have already submitted an application.'], 422);
        }

        $validated = $request->validate([
            'preferred_department' => 'required|string',
            'available_schedules' => 'required|array',
            'reason_for_applying' => 'required|string',
            'documents' => 'required|array|min:3|max:5',
            'documents.*' => 'file|mimes:pdf,jpg,jpeg,png|max:4096',
        ]);

        $application = Application::create([
            'user_id' => $request->user()->id,
            'preferred_department' => $validated['preferred_department'],
            'available_schedules' => $validated['available_schedules'],
            'reason_for_applying' => $validated['reason_for_applying'],
            'status' => 'Pending',
            'source' => 'portal',
            'tracking_code' => $this->makeTrackingCode(),
        ]);

        $this->storeApplicationDocuments($request, $application);
        $this->recordStatus($application, 'Pending', 'Application submitted');
        $this->recordApplicationSubmission($request->user(), $application);
        app(StaffNotifier::class)->notify(
            'New Signup',
            "{$request->user()->name} submitted a working-student application."
        );
        $this->notifyN8nApplicationStatus($application, 'Pending', [
            'event' => 'application_submitted',
            'submitted_at' => $application->created_at,
        ]);

        return response()->json(['message' => 'Application submitted successfully!', 'data' => $application->load('documents')], 201);
    }

    // 2. STUDENT: Check own application status
    public function myApplication(Request $request)
    {
        $application = Application::with(['documents', 'statusEvents', 'applicant.profile'])
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$application) {
            return response()->json(null, 404);
        }

        return response()->json($this->presentTracker($application, true));
    }

    // PUBLIC: Look up progress with the email and tracking code from submission.
    public function publicStatus(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'tracking_code' => 'required|string|max:20',
        ]);

        $code = strtoupper(trim($validated['tracking_code']));
        $application = Application::with(['statusEvents', 'applicant.profile'])
            ->where('tracking_code', $code)
            ->first();

        $emailMatches = $application
            && strcasecmp((string) $application->email, trim($validated['email'])) === 0;

        if (!$emailMatches) {
            return response()->json([
                'message' => 'No application matches that email and tracking code.',
            ], 404);
        }

        return response()->json($this->presentTracker($application));
    }

    // 3. COORDINATOR: View all applications
    public function index()
    {
        $with = ['applicant.profile', 'documents', 'statusEvents'];

        $active = Application::with($with)
            ->where('status', '!=', 'Rejected')
            ->orderBy('created_at', 'desc')
            ->get();

        $archive = Application::withTrashed()
            ->with($with)
            ->where(function ($query) {
                $query->where('status', 'Rejected')
                    ->orWhereNotNull('deleted_at');
            })
            ->orderByDesc('deleted_at')
            ->orderByDesc('updated_at')
            ->get();

        return response()->json([
            'data' => $active,
            'archive' => $archive,
        ]);
    }

    // 3. COORDINATOR: Update Workflow (Pending -> Interview -> Training -> Approved)
    public function updateStatus(Request $request, $id)
    {
        SuperAdminAudit::denyMutation($request);
        $application = Application::findOrFail($id);

        $request->validate([
            'status' => 'required|in:Pending,Interview,Training,For Result,Approved,Rejected',
            'rejection_reason' => 'required_if:status,Rejected|nullable|string|max:1000',
        ]);

        if ($request->status === 'Rejected') {
            $reason = trim((string) $request->input('rejection_reason'));
            $application->update(['status' => 'Rejected']);
            $this->recordStatus($application, 'Rejected', $reason);
            $this->notifyN8nApplicationStatus($application, 'Rejected', [
                'rejection_reason' => $reason,
            ]);

            return response()->json(['message' => 'Applicant declined. A rejection email has been sent, and their tracker now shows Not Approved.']);
        }

        $application->update([
            'status' => $request->status
        ]);

        $this->recordStatus($application, $request->status);
        $this->notifyN8nApplicationStatus($application, $request->status);

        return response()->json([
            'message' => 'Workflow status updated to ' . $request->status
        ]);
    }

    public function destroy(Request $request, $id)
    {
        SuperAdminAudit::denyMutation($request);
        $application = Application::findOrFail($id);

        if ($application->status === 'Approved') {
            return response()->json([
                'message' => 'Approved students cannot be deleted from Applications. Use User Management if you need to remove their account.',
            ], 422);
        }

        $this->purgeApplication($application);

        return response()->json(['message' => 'Applicant removed.']);
    }

    // 4. COORDINATOR: Final Placement/Matching
    public function assignPlacement(Request $request, $id)
    {
        SuperAdminAudit::denyMutation($request);
        $application = Application::findOrFail($id);

        $validated = $request->validate([
            'assigned_department' => 'required|string',
            'duty_type' => 'required|in:Clerical,Janitorial,Request',
            'duty_request' => 'required_if:duty_type,Request|nullable|string|max:1000',
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255',
            'age' => 'required|integer|min:16',
            'gender' => 'required|string|in:Male,Female,Prefer not to say',
            'address' => 'required|string',
            'contact_number' => 'required|string|max:50',
            'year_level' => 'required|string|max:50',
            'course' => 'required|string|max:255',
            'student_id_number' => 'required|string|max:50',
        ]);

        $applicant = $application->applicant;
        $this->assertStudentIdentityAvailable(
            $validated['email'],
            $validated['student_id_number'],
            $applicant?->id,
            $application->id
        );

        $tempPassword = 'FCU-' . strtoupper(Str::random(5)) . '!' . random_int(0, 9);
        $loginEmail = strtolower(trim($validated['email']));
        $loginUsername = ($applicant && !filter_var($applicant->username, FILTER_VALIDATE_EMAIL))
            ? $applicant->username
            : AccountLogin::generateUsername($validated['first_name'], $validated['last_name']);
        $middleInitial = $this->middleInitial($validated['middle_name'] ?? null);
        $storedMiddleName = $middleInitial !== '' ? $middleInitial : null;
        $studentName = $this->displayName(
            $validated['first_name'],
            $storedMiddleName,
            $validated['last_name']
        );
        $office = trim($validated['assigned_department']);
        if (!in_array($office, \App\Models\Office::names(), true)) {
            return response()->json(['message' => 'Choose an office from the current university office list.'], 422);
        }
        $dutyRequest = $validated['duty_type'] === 'Request' ? trim((string) ($validated['duty_request'] ?? '')) : null;
        $dutyLabel = $validated['duty_type'] === 'Request' ? (string) $dutyRequest : $validated['duty_type'];

        $applicant = DB::transaction(function () use ($application, $validated, $applicant, $tempPassword, $studentName, $office, $storedMiddleName, $dutyRequest, $loginEmail, $loginUsername) {
            $application->update([
                'first_name' => $validated['first_name'],
                'middle_name' => $storedMiddleName,
                'last_name' => $validated['last_name'],
                'email' => $loginEmail,
                'age' => $validated['age'],
                'gender' => $validated['gender'],
                'address' => $validated['address'],
                'contact_number' => $validated['contact_number'],
                'year_level' => $validated['year_level'],
                'course' => $validated['course'],
                'student_id_number' => $validated['student_id_number'],
                'assigned_department' => $office,
                'assigned_position' => null,
                'status' => 'Approved',
            ]);

            if (!$applicant) {
                $applicant = User::create([
                    'name' => $studentName,
                    'username' => $loginUsername,
                    'email' => $loginEmail,
                    'password' => $tempPassword,
                    'role' => 'Student',
                    'phone_number' => $validated['contact_number'],
                ]);
                $application->update(['user_id' => $applicant->id]);
            } else {
                $applicant->name = $studentName;
                $applicant->username = $loginUsername;
                $applicant->email = $loginEmail;
                $applicant->phone_number = $validated['contact_number'];
                $applicant->password = $tempPassword;
                $applicant->save();
            }

            $applicant->profile()->updateOrCreate(
                ['user_id' => $applicant->id],
                [
                    'assigned_office' => $office,
                    'duty_type' => $validated['duty_type'],
                    'duty_request' => $dutyRequest,
                    'gender' => in_array($validated['gender'], ['Male', 'Female'], true) ? $validated['gender'] : null,
                    'course' => $validated['course'],
                    'year_level' => $this->numericYearLevel($validated['year_level']),
                    'student_id_number' => $validated['student_id_number'],
                ]
            );

            return $applicant->fresh('profile');
        });

        Notification::create([
            'user_id' => $applicant->id,
            'title' => 'Office Assignment Confirmed',
            'message' => "You have been assigned to {$office} as a working student for {$dutyLabel}.",
        ]);

        $application->refresh();
        $this->recordStatus($application, 'Approved');
        $this->recordStatus($application, 'Assigned', "{$office} · {$dutyLabel}");
        $this->notifyN8nApplicationStatus($application, 'Approved', [
            'assigned_department' => $office,
            'assigned_duty' => $dutyLabel,
        ]);

        app(DepartmentAssignmentNotifier::class)->notify($applicant, $office, $dutyLabel);

        return response()->json([
            'message' => 'Student successfully matched and placed!',
            'credentials' => [
                'name' => $studentName,
                'username' => $applicant->username,
                'email' => $applicant->email,
                'password' => $tempPassword,
            ],
        ]);
    }

        // COORDINATOR: Schedule Interview
    public function scheduleInterview(Request $request, $id)
    {
        SuperAdminAudit::denyMutation($request);
        $application = Application::findOrFail($id);

        $validated = $request->validate([
            'interview_date' => 'required|date',
            'interview_remarks' => 'nullable|string',
        ]);

        $application->update([
            'interview_date' => $validated['interview_date'],
            'interview_remarks' => $validated['interview_remarks'],
            'status' => 'Interview' // Automatically move to Interview status
        ]);

        $interviewLabel = $application->interview_date
            ?->timezone(config('app.timezone'))
            ->format('M j, Y g:i A');
        $note = 'Interview scheduled for ' . $interviewLabel;
        if (!empty($validated['interview_remarks'])) {
            $note .= '. ' . $validated['interview_remarks'];
        }
        $this->recordStatus($application, 'Interview', $note);
        $this->notifyN8nApplicationStatus($application, 'Interview', [
            'interview_date' => $interviewLabel,
            'interview_remarks' => $application->interview_remarks,
        ]);

        return response()->json(['message' => 'Interview scheduled successfully!']);
    }

    // 5. AUTOMATED MATCHING ENGINE (Feature #4)
    public function getMatchingSuggestions($id)
    {
        $application = Application::findOrFail($id);

        // MOCK DATA: In a fully scaled system, this would query a 'JobOpenings' table.
        // For the capstone defense, this perfectly demonstrates the algorithm.
        $openings = [
            ['department' => 'College of Computer Studies', 'position' => 'Computer Lab Assistant', 'required_days' => ['Monday', 'Wednesday', 'Friday']],
            ['department' => 'College of Business and Accountancy', 'position' => 'Office Clerk', 'required_days' => ['Tuesday', 'Thursday']],
            ['department' => 'Library', 'position' => 'Library Assistant', 'required_days' => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']],
            ['department' => 'Registrar', 'position' => 'Filing Staff', 'required_days' => ['Wednesday', 'Friday']],
        ];

        $suggestions = [];
        $studentSchedules = $application->available_schedules ?? [];

        foreach ($openings as $opening) {
            $score = 0;

            // CRITERIA 1: Department Preference (Weighs 50%)
            if ($application->preferred_department === $opening['department']) {
                $score += 50;
            }

            // CRITERIA 2: Schedule Overlap (Weighs up to 50%)
            // Counts how many required days the student is actually available
            $matchedDays = array_intersect($studentSchedules, $opening['required_days']);
            $scheduleScore = (count($matchedDays) / count($opening['required_days'])) * 50;
            $score += $scheduleScore;

            // Only suggest if there is at least a 30% match
            if ($score >= 30) {
                $suggestions[] = [
                    'department' => $opening['department'],
                    'position' => $opening['position'],
                    'match_score' => round($score) . '%',
                    'matched_days' => $matchedDays
                ];
            }
        }

        // Sort suggestions from highest score to lowest
        usort($suggestions, fn($a, $b) => (int)$b['match_score'] <=> (int)$a['match_score']);

        return response()->json(['suggestions' => $suggestions]);
    }

    private function notifyN8nApplicationStatus(Application $application, string $status, array $extra = []): void
    {
        $payload = array_merge([
            'event' => 'application_status_updated',
            'application_id' => $application->id,
            'applicant_name' => $this->applicantName($application),
            'email' => $application->email,
            'status' => $status,
            'tracking_code' => $application->tracking_code,
            'updated_at' => now()->toIso8601String(),
        ], $extra);

        try {
            Http::timeout(5)->asJson()->post('http://localhost:5678/webhook/techhrm/application-submitted', $payload);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    private function recordStatus(Application $application, string $status, ?string $note = null): void
    {
        $latest = $application->statusEvents()->latest('id')->first();
        if ($latest && $latest->status === $status) {
            if ($note && $latest->note !== $note) {
                $latest->update(['note' => $note, 'occurred_at' => now()]);
            }
            return;
        }

        $application->statusEvents()->create([
            'status' => $status,
            'note' => $note,
            'occurred_at' => now(),
        ]);
    }

    private function makeTrackingCode(): string
    {
        do {
            $code = 'WSPO-' . strtoupper(Str::random(6));
        } while (Application::where('tracking_code', $code)->exists());

        return $code;
    }

    private function applicantName(Application $application): string
    {
        return trim(
            $application->first_name . ' ' .
                ($application->middle_name ? $application->middle_name . ' ' : '') .
                $application->last_name
        );
    }

    private function presentTracker(Application $application, bool $includePrivate = false): array
    {
        $application->loadMissing(['statusEvents', 'documents', 'applicant.profile']);
        $profile = $application->applicant?->profile;
        $duty = null;
        if ($profile) {
            $duty = $profile->duty_type === 'Request' ? $profile->duty_request : $profile->duty_type;
        }

        $assigned = filled($application->assigned_department);
        $currentStage = $application->status === 'Rejected'
            ? 'Rejected'
            : ($assigned ? 'Assigned' : $application->status);
        $rejectionReason = $application->statusEvents
            ->firstWhere('status', 'Rejected')
            ?->note;

        $payload = [
            'status' => $application->status,
            'current_stage' => $currentStage,
            'rejection_reason' => $rejectionReason,
            'applicant_name' => $this->applicantName($application),
            'preferred_department' => $application->preferred_department,
            'interview_date' => $application->interview_date,
            'interview_remarks' => $application->interview_remarks,
            'assigned_department' => $application->assigned_department,
            'assigned_position' => $application->assigned_position,
            'assigned_duty' => $duty,
            'submitted_at' => $application->created_at,
            'events' => $application->statusEvents->map(fn (ApplicationStatusEvent $event) => [
                'status' => $event->status,
                'note' => $event->note,
                'occurred_at' => $event->occurred_at,
            ])->values(),
        ];

        if ($includePrivate) {
            $payload['id'] = $application->id;
            $payload['tracking_code'] = $application->tracking_code;
            $payload['email'] = $application->email;
            $payload['documents'] = $application->documents->map(fn ($document) => [
                'id' => $document->id,
                'original_name' => $document->original_name,
                'file_path' => $document->file_path,
            ])->values();
        }

        return $payload;
    }

    private function purgeApplication(Application $application): void
    {
        DB::transaction(function () use ($application) {
            $application->loadMissing('applicant');

            $applicant = $application->applicant;
            $removeAccount = $application->status !== 'Approved'
                && $applicant
                && $applicant->role === 'Student';

            if ($removeAccount) {
                // Detach first so deleting the unused account does not cascade
                // away the application row kept for the audit list.
                $application->user_id = null;
                $application->save();
                $applicant->tokens()->delete();
                $applicant->forceDelete();
            }

            if (!$application->trashed()) {
                $application->delete();
            }
        });
    }

    private function recordApplicationSubmission($user, Application $application, ?string $actorName = null): void
    {
        $application->load('documents');

        $documents = $application->documents->map(fn ($document) => [
            'name' => $document->original_name,
            'path' => $document->file_path,
        ])->values()->all();

        $count = count($documents);
        $actorName = $actorName ?: ($user->name ?? $user->username ?? 'Applicant');

        try {
            ActivityLog::create([
                'admin_id' => $user?->id,
                'admin_name' => $actorName,
                'action' => 'Submit Application',
                'module' => 'Application',
                'record_id' => $application->id,
                'description' => "{$actorName} submitted an application with {$count} document".($count === 1 ? '' : 's').'.',
                'new_values' => [
                    'preferred_department' => $application->preferred_department,
                    'status' => $application->status,
                    'reason_for_applying' => $application->reason_for_applying,
                    'documents' => $documents,
                ],
                'ip_address' => request()?->ip(),
            ]);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    private function storeApplicationDocuments(Request $request, Application $application): void
    {
        foreach ($request->file('documents', []) as $file) {
            $path = $file->store('application-documents', 'local');

            $application->documents()->create([
                'original_name' => $file->getClientOriginalName(),
                'file_path' => $path,
                'mime_type' => $file->getClientMimeType(),
                'file_size' => $file->getSize(),
            ]);
        }
    }

    private function assertStudentIdentityAvailable(
        string $email,
        ?string $studentId,
        ?int $ignoreUserId = null,
        ?int $ignoreApplicationId = null
    ): void {
        $emailTaken = AccountLogin::identifierTaken($email, $ignoreUserId);

        $emailOnApplication = Application::query()
            ->when($ignoreApplicationId, fn ($query) => $query->where('id', '!=', $ignoreApplicationId))
            ->where('status', '!=', 'Rejected')
            ->whereRaw('LOWER(email) = ?', [strtolower(trim($email))])
            ->exists();

        if ($emailTaken || $emailOnApplication) {
            abort(422, 'This email is already used by another applicant or account.');
        }

        $studentId = trim((string) $studentId);
        if ($studentId === '') {
            return;
        }

        $studentIdTaken = UserProfile::query()
            ->when($ignoreUserId, fn ($query) => $query->where('user_id', '!=', $ignoreUserId))
            ->where('student_id_number', $studentId)
            ->exists();

        $studentIdOnApplication = Application::query()
            ->when($ignoreApplicationId, fn ($query) => $query->where('id', '!=', $ignoreApplicationId))
            ->where('status', '!=', 'Rejected')
            ->where('student_id_number', $studentId)
            ->exists();

        if ($studentIdTaken || $studentIdOnApplication) {
            abort(422, 'This student ID number is already used.');
        }
    }

    private function displayName(string $firstName, ?string $middleName, string $lastName): string
    {
        $initial = $this->middleInitial($middleName);

        return trim(preg_replace('/\s+/u', ' ', trim($firstName . ' ' . ($initial !== '' ? $initial . ' ' : '') . $lastName)) ?? '');
    }

    private function middleInitial(?string $middleName): string
    {
        $middleName = trim((string) $middleName);
        if ($middleName === '') {
            return '';
        }

        $middleName = rtrim($middleName, '.');
        $letter = mb_substr($middleName, 0, 1);

        return $letter === '' ? '' : mb_strtoupper($letter) . '.';
    }

    private function numericYearLevel(mixed $yearLevel): ?int
    {
        if ($yearLevel === null || $yearLevel === '') {
            return null;
        }

        if (is_numeric($yearLevel)) {
            return (int) $yearLevel;
        }

        if (is_string($yearLevel) && preg_match('/(\d+)/', $yearLevel, $matches)) {
            return (int) $matches[1];
        }

        return null;
    }
}
