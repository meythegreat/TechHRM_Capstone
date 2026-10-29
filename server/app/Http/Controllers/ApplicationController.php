<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Application;
use App\Models\ApplicationStatusEvent;
use App\Models\Notification;
use App\Models\Office;
use App\Models\User;
use App\Models\UserProfile;
use App\Services\DepartmentAssignmentNotifier;
use App\Services\StaffNotifier;
use App\Support\AccountLogin;
use App\Support\SuperAdminAudit;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ApplicationController extends Controller
{
    private const REQUIRED_DOCUMENT_KEYS = [
        'application_letter',
        'report_card',
        'birth_certificate',
        'id_picture',
        'indigency',
    ];

    private const OPTIONAL_DOCUMENT_KEYS = [
        'medical_certificate',
    ];

    // PUBLIC: Register a new applicant and submit their WSPO application.
    public function publicApply(Request $request)
    {
        $validated = $this->validateOfficialApplication($request);
        $details = $validated['form_details'];

        $this->assertStudentIdentityAvailable($validated['email'], null);

        $application = DB::transaction(function () use ($request, $validated, $details) {
            $application = Application::create($this->officialApplicationAttributes($validated, $details, 'website', null));
            $this->storeApplicationDocuments($request, $application);
            $this->recordStatus($application, 'Pending', 'Personal information sheet and parents consent submitted');

            return $application;
        });

        $this->deliverOfficialForms($application, null);

        return response()->json([
            'message' => 'Application submitted. Both forms were sent to the WSPO coordinator. A username and password are issued only after placement is finalized.',
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

        $validated = $this->validateOfficialApplication($request);
        $details = $validated['form_details'];
        $this->assertStudentIdentityAvailable($validated['email'], null, $request->user()->id);

        $application = DB::transaction(function () use ($request, $validated, $details) {
            $application = Application::create(
                $this->officialApplicationAttributes($validated, $details, 'portal', $request->user()->id)
            );
            $this->storeApplicationDocuments($request, $application);
            $this->recordStatus($application, 'Pending', 'Personal information sheet and parents consent submitted');

            return $application;
        });

        $this->deliverOfficialForms($application, $request->user());

        return response()->json([
            'message' => 'Application submitted. Both forms were sent to the WSPO coordinator.',
            'tracking_code' => $application->tracking_code,
            'data' => $application->load('documents'),
        ], 201);
    }

    // COORDINATOR: Official personal information sheet and parents consent.
    public function officialForms($id)
    {
        $application = Application::withTrashed()->findOrFail($id);
        $application->makeVisible('form_details');

        return response()->json([
            'id' => $application->id,
            'first_name' => $application->first_name,
            'middle_name' => $application->middle_name,
            'last_name' => $application->last_name,
            'age' => $application->age,
            'email' => $application->email,
            'tracking_code' => $application->tracking_code,
            'submitted_at' => $application->created_at,
            'form_details' => $application->form_details,
        ]);
    }

    // 2. STUDENT: Check own application status
    public function myApplication(Request $request)
    {
        $application = Application::with(['documents', 'statusEvents', 'applicant.profile'])
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $application) {
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

        if (! $emailMatches) {
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
            $sendError = $this->notifyN8nApplicationStatus($application, 'Rejected', [
                'rejection_reason' => $reason,
            ]);

            $message = 'Applicant declined, and their tracker now shows Not Approved.';
            $message .= $sendError
                ? ' The status email was not sent: '.$sendError
                : ' A rejection email has been sent.';

            return response()->json(['message' => $message]);
        }

        $application->update([
            'status' => $request->status,
        ]);

        $this->recordStatus($application, $request->status);
        $sendError = $this->notifyN8nApplicationStatus($application, $request->status);
        $message = 'Workflow status updated to '.$request->status.'.';
        if ($sendError) {
            $message .= ' The status email was not sent: '.$sendError;
        }

        return response()->json([
            'message' => $message,
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

        $tempPassword = 'FCU-'.strtoupper(Str::random(5)).'!'.random_int(0, 9);
        $loginEmail = strtolower(trim($validated['email']));
        $loginUsername = ($applicant && ! filter_var($applicant->username, FILTER_VALIDATE_EMAIL))
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
        if (! in_array($office, Office::names(), true)) {
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

            if (! $applicant) {
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
        $sendError = $this->notifyN8nApplicationStatus($application, 'Approved', [
            'assigned_department' => $office,
            'assigned_duty' => $dutyLabel,
        ]);

        app(DepartmentAssignmentNotifier::class)->notify($applicant, $office, $dutyLabel);

        $message = 'Student successfully matched and placed!';
        if ($sendError) {
            $message .= ' The status email was not sent: '.$sendError;
        }

        return response()->json([
            'message' => $message,
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
            'status' => 'Interview', // Automatically move to Interview status
        ]);

        $interviewLabel = $application->interview_date
            ?->timezone(config('app.timezone'))
            ->format('M j, Y g:i A');
        $note = 'Interview scheduled for '.$interviewLabel;
        if (! empty($validated['interview_remarks'])) {
            $note .= '. '.$validated['interview_remarks'];
        }
        $this->recordStatus($application, 'Interview', $note);
        $sendError = $this->notifyN8nApplicationStatus($application, 'Interview', [
            'interview_date' => $interviewLabel,
            'interview_remarks' => $application->interview_remarks,
        ]);

        $message = 'Interview scheduled successfully!';
        if ($sendError) {
            $message .= ' The status email was not sent: '.$sendError;
        }

        return response()->json(['message' => $message]);
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
                    'match_score' => round($score).'%',
                    'matched_days' => $matchedDays,
                ];
            }
        }

        // Sort suggestions from highest score to lowest
        usort($suggestions, fn ($a, $b) => (int) $b['match_score'] <=> (int) $a['match_score']);

        return response()->json(['suggestions' => $suggestions]);
    }

    /**
     * Email the applicant through the n8n Gmail workflow.
     * Returns an error message when the email was not sent.
     */
    private function notifyN8nApplicationStatus(Application $application, string $status, array $extra = []): ?string
    {
        $email = is_string($application->email) ? trim($application->email) : '';
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return 'This application has no email address on file.';
        }

        $webhook = config('services.n8n.application_status_webhook');
        if (! is_string($webhook) || trim($webhook) === '') {
            return 'Set N8N_APPLICATION_STATUS_WEBHOOK to the application-status workflow.';
        }

        unset($extra['digital_forms']);
        $payload = array_merge([
            'event' => 'application_status_updated',
            'application_id' => $application->id,
            'applicant_name' => $this->applicantName($application),
            'email' => $email,
            'status' => $status,
            'tracking_code' => $application->tracking_code,
            'updated_at' => now()->toIso8601String(),
        ], $extra);

        try {
            $response = Http::timeout(20)
                ->acceptJson()
                ->asJson()
                ->post($webhook, $payload);
        } catch (\Throwable $exception) {
            report($exception);

            return 'Could not reach the application status webhook.';
        }

        if ($response->successful()) {
            return null;
        }

        $webhookMessage = data_get($response->json(), 'message');
        report(new \RuntimeException(
            'Application status webhook failed with HTTP '.$response->status().': '.(is_string($webhookMessage) && $webhookMessage !== '' ? $webhookMessage : 'no message')
        ));

        if (is_string($webhookMessage) && $webhookMessage !== '') {
            return $webhookMessage;
        }

        return 'The application status webhook rejected the message (HTTP '.$response->status().').';
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
            $code = 'WSPO-'.strtoupper(Str::random(6));
        } while (Application::where('tracking_code', $code)->exists());

        return $code;
    }

    private function applicantName(Application $application): string
    {
        return trim(
            $application->first_name.' '.
                ($application->middle_name ? $application->middle_name.' ' : '').
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

            if (! $application->trashed()) {
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
        $keys = array_values($request->input('document_keys', []));
        $files = array_values(array_filter(
            is_array($request->file('documents')) ? $request->file('documents') : [],
            fn ($file) => $file instanceof UploadedFile && $file->isValid()
        ));

        foreach ($files as $index => $file) {
            $path = $file->store('application-documents', 'local');

            $application->documents()->create([
                'document_key' => $keys[$index] ?? null,
                'original_name' => $file->getClientOriginalName(),
                'file_path' => $path,
                'mime_type' => $file->getClientMimeType(),
                'file_size' => $file->getSize(),
            ]);
        }
    }

    private function validateOfficialApplication(Request $request): array
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'required|string|max:255',
            'email' => ['required', 'string', 'email', 'max:255'],
            'age' => 'required|integer|min:16',
            'gender' => 'required|string|in:Male,Female',
            'address' => 'required|string|max:500',
            'contact_number' => 'required|string|max:50',
            'year_level' => 'required|string|max:50',
            'course' => 'required|string|max:255',
            'form_details' => 'required|string',
            'documents' => 'required|array|min:5|max:6',
            'documents.*' => 'file|mimes:pdf,jpg,jpeg,png|max:4096',
            'document_keys' => 'required|array|min:5|max:6',
            'document_keys.*' => 'string|in:'.implode(',', array_merge(self::REQUIRED_DOCUMENT_KEYS, self::OPTIONAL_DOCUMENT_KEYS)),
        ]);

        $keys = $validated['document_keys'];
        $missing = array_diff(self::REQUIRED_DOCUMENT_KEYS, $keys);
        if ($missing !== [] || count($keys) !== count(array_unique($keys))) {
            throw ValidationException::withMessages([
                'documents' => 'Attach the application letter, report card or grades, birth certificate, 2 x 2 picture, and certificate of indigency.',
            ]);
        }

        $picture = $request->file('documents')[array_search('id_picture', $keys, true)] ?? null;
        if (! $picture || ! str_starts_with((string) $picture->getMimeType(), 'image/')) {
            throw ValidationException::withMessages([
                'documents' => 'The 2 x 2 I.D. picture must be a JPG or PNG image.',
            ]);
        }

        $details = json_decode($validated['form_details'], true);
        if (! is_array($details)) {
            throw ValidationException::withMessages([
                'form_details' => 'Complete the official information sheet.',
            ]);
        }

        $detailsValidator = Validator::make($details, [
            'religion' => 'required|string|max:100',
            'civil_status' => 'required|in:Single,Married,Widowed,Separated',
            'tel_number' => 'nullable|string|max:50',
            'date_of_birth' => 'required|date|before:today',
            'place_of_birth' => 'required|string|max:255',
            'height' => 'required|string|max:50',
            'weight' => 'required|string|max:50',
            'sex' => 'required|in:Male,Female',
            'parent_name' => 'required|string|max:255',
            'parent_status' => 'required|in:Living,Deceased',
            'parent_tel' => 'required|string|max:50',
            'parent_occupation' => 'required|in:Farmer,Fisherman,Retired,Private Employee,Unemployed,Others',
            'parent_occupation_other' => 'nullable|string|max:100',
            'parent_income' => 'required|string|max:100',
            'guardian_name' => 'nullable|string|max:255',
            'guardian_tel' => 'nullable|string|max:50',
            'guardian_occupation' => 'nullable|string|max:100',
            'guardian_occupation_other' => 'nullable|string|max:100',
            'guardian_income' => 'nullable|string|max:100',
            'sibling_employed_at_fcu' => 'required|in:Yes,No',
            'employed_sibling_count' => 'nullable|integer|min:1|max:12',
            'employed_siblings' => 'nullable|array|max:12',
            'employed_siblings.*.name' => 'nullable|string|max:255',
            'has_non_working_siblings' => 'required|in:Yes,No',
            'siblings' => 'nullable|array|max:6',
            'siblings.*.name' => 'nullable|string|max:255',
            'siblings.*.age' => 'nullable|string|max:10',
            'siblings.*.school_or_work' => 'nullable|string|max:255',
            'technical_qualification' => 'required|string|max:1000',
            'work_experience' => 'required|string|max:1000',
            'school_last_attended' => 'required|string|max:255',
            'school_address' => 'required|string|max:255',
            'degree_program' => 'required|string|max:255',
            'year_level' => 'required|string|max:50',
            'has_scholarship' => 'required|in:Yes,No',
            'scholarship_details' => 'nullable|string|max:255',
            'is_4ps' => 'required|in:Yes,No',
            'medical_conditions' => 'required|array|min:1',
            'medical_conditions.*' => 'string|in:None,Visual Impairment,Allergies,Hypertension,Asthma,Mental Health Condition,Others',
            'medical_other' => 'nullable|string|max:255',
            'will_pass_good_moral' => 'required|in:Yes,No',
            'medical_certificate_attached' => 'required|boolean',
            'folder_acknowledged' => 'accepted',
            'will_sign_printed_copy' => 'accepted',
            'consent_child_name' => 'required|string|max:255',
            'photo' => 'required|string|max:1500000',
            'email' => 'required|email|max:255',
            'home_address' => 'required|string|max:500',
            'cell_number' => 'required|string|max:50',
        ]);
        $detailsValidator->validate();
        $details = $detailsValidator->validated();

        if ($details['parent_occupation'] === 'Others' && trim((string) ($details['parent_occupation_other'] ?? '')) === '') {
            throw ValidationException::withMessages(['form_details' => 'Specify the parent occupation.']);
        }
        if ($details['has_scholarship'] === 'Yes' && trim((string) ($details['scholarship_details'] ?? '')) === '') {
            throw ValidationException::withMessages(['form_details' => 'Specify the scholarship.']);
        }
        if (in_array('Others', $details['medical_conditions'], true) && trim((string) ($details['medical_other'] ?? '')) === '') {
            throw ValidationException::withMessages(['form_details' => 'Specify the medical condition.']);
        }
        if (in_array('None', $details['medical_conditions'], true) && count($details['medical_conditions']) > 1) {
            throw ValidationException::withMessages(['form_details' => 'Choose None only when there is no medical condition.']);
        }
        $employedNames = collect();
        if ($details['sibling_employed_at_fcu'] === 'Yes') {
            $count = (int) ($details['employed_sibling_count'] ?? 0);
            $employedNames = collect($details['employed_siblings'] ?? [])
                ->map(fn ($row) => trim((string) ($row['name'] ?? '')))
                ->filter()
                ->values();
            $unique = $employedNames->map(fn ($name) => mb_strtolower($name))->unique();
            if ($count < 1 || $employedNames->count() !== $count || $unique->count() !== $count) {
                throw ValidationException::withMessages([
                    'form_details' => 'If a brother or sister is a work student, state how many and name each one.',
                ]);
            }
        } else {
            $details['employed_sibling_count'] = null;
            $details['employed_siblings'] = [];
        }

        if ($details['has_non_working_siblings'] === 'Yes') {
            $listed = collect($details['siblings'] ?? [])->filter(function ($sibling) {
                return trim((string) ($sibling['name'] ?? '')) !== ''
                    && trim((string) ($sibling['age'] ?? '')) !== ''
                    && trim((string) ($sibling['school_or_work'] ?? '')) !== '';
            })->values();
            if ($listed->isEmpty()) {
                throw ValidationException::withMessages([
                    'form_details' => 'List each brother or sister who is not a work student at FCU.',
                ]);
            }
            $overlaps = $listed->contains(function ($sibling) use ($employedNames) {
                return $employedNames->contains(fn ($name) => mb_strtolower($name) === mb_strtolower(trim((string) $sibling['name'])));
            });
            if ($overlaps) {
                throw ValidationException::withMessages([
                    'form_details' => 'Question 4 is only for brothers and sisters who are not work students at the university.',
                ]);
            }
            $details['siblings'] = $listed->all();
        } else {
            $details['siblings'] = [];
        }
        if ($details['parent_status'] === 'Deceased') {
            foreach (['guardian_name', 'guardian_tel', 'guardian_occupation', 'guardian_income'] as $field) {
                if (trim((string) ($details[$field] ?? '')) === '') {
                    throw ValidationException::withMessages(['form_details' => 'Complete the guardian section when the parents are deceased.']);
                }
            }
        }
        if (! str_starts_with((string) ($details['photo'] ?? ''), 'data:image/')) {
            throw ValidationException::withMessages(['form_details' => 'The 2 x 2 photo must be an image.']);
        }

        $details['medical_certificate_attached'] = in_array('medical_certificate', $keys, true);
        $validated['form_details'] = $details;

        return $validated;
    }

    private function officialApplicationAttributes(array $validated, array $details, string $source, ?int $userId): array
    {
        return [
            'user_id' => $userId,
            'first_name' => $validated['first_name'],
            'middle_name' => $validated['middle_name'] ?? null,
            'last_name' => $validated['last_name'],
            'age' => $validated['age'],
            'gender' => $validated['gender'],
            'address' => $validated['address'],
            'contact_number' => $validated['contact_number'],
            'year_level' => $validated['year_level'],
            'course' => $validated['course'],
            'email' => $validated['email'],
            'form_details' => $details,
            'status' => 'Pending',
            'source' => $source,
            'tracking_code' => $this->makeTrackingCode(),
        ];
    }

    private function deliverOfficialForms(Application $application, $user): void
    {
        $applicantName = $this->applicantName($application);
        $this->recordApplicationSubmission($user, $application, $applicantName);
        app(StaffNotifier::class)->notify(
            'Official application forms',
            "{$applicantName} filed the Personal Information Sheet (FCU-EOMS-WP-012) and the Parents Consent ({$application->tracking_code}). Both forms are saved on the application and can be printed on long coupon."
        );
        $this->notifyN8nApplicationStatus($application, 'Pending', [
            'event' => 'application_submitted',
            'submitted_at' => $application->created_at,
            'digital_forms' => $this->digitalFormSummary($application),
        ]);
    }

    private function digitalFormSummary(Application $application): array
    {
        $details = $application->form_details ?? [];
        $fields = $details;
        foreach (['photo', 'applicant_signature', 'father_signature', 'mother_signature', 'guardian_signature', 'consent_signature'] as $image) {
            unset($fields[$image]);
        }

        return [
            'personal_information_sheet' => 'FCU-EOMS-WP-012',
            'parents_consent' => 'Parents Consent',
            'paper' => 'long coupon 8.5 x 13 in',
            'tracking_code' => $application->tracking_code,
            'applicant_name' => $this->applicantName($application),
            'email' => $application->email,
            'signatures' => 'Leave blank. Sign by hand on the printed long-coupon copy.',
            'fields' => $fields,
        ];
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

        return trim(preg_replace('/\s+/u', ' ', trim($firstName.' '.($initial !== '' ? $initial.' ' : '').$lastName)) ?? '');
    }

    private function middleInitial(?string $middleName): string
    {
        $middleName = trim((string) $middleName);
        if ($middleName === '') {
            return '';
        }

        $middleName = rtrim($middleName, '.');
        $letter = mb_substr($middleName, 0, 1);

        return $letter === '' ? '' : mb_strtoupper($letter).'.';
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
