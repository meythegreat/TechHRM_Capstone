<?php

namespace App\Http\Controllers;

use App\Models\Application;
use App\Models\Notification;
use App\Models\User;
use App\Models\UserProfile;
use App\Services\DepartmentAssignmentNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ApplicationController extends Controller
{
    // PUBLIC: Register a new applicant and submit their WSPO application.
    public function publicApply(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'required|string|max:255',
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'username')->whereNull('deleted_at')],
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
            ]);

            $this->storeApplicationDocuments($request, $application);

            return $application;
        });

        Http::post('http://localhost:5678/webhook/techhrm/application-submitted', [
            'event' => 'application_submitted',
            'application_id' => $application->id,
            'applicant_name' => trim(
                $application->first_name . ' ' .
                    ($application->middle_name ? $application->middle_name . ' ' : '') .
                    $application->last_name
            ),
            'email' => $validated['email'],
            'status' => $application->status,
            'submitted_at' => $application->created_at,
        ]);

        return response()->json([
            'message' => 'Application submitted. Complete your personal profile and university details now. A login is issued only after placement is finalized.'
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
        ]);

        $this->storeApplicationDocuments($request, $application);

        return response()->json(['message' => 'Application submitted successfully!', 'data' => $application->load('documents')], 201);
    }

    // 2. STUDENT: Check own application status
    public function myApplication(Request $request)
    {
        $application = Application::with('documents')->where('user_id', $request->user()->id)->first();

        if (!$application) {
            return response()->json(null, 404);
        }

        return response()->json($application);
    }

    // 3. COORDINATOR: View all applications
    public function index()
    {
        $this->purgeDeclinedApplications();

        return Application::with(['applicant', 'documents'])
            ->where('status', '!=', 'Rejected')
            ->orderBy('created_at', 'desc')
            ->get();
    }

    // 3. COORDINATOR: Update Workflow (Pending -> Interview -> Training -> Approved)
    public function updateStatus(Request $request, $id)
    {
        $application = Application::findOrFail($id);

        $request->validate([
            'status' => 'required|in:Pending,Interview,Training,For Result,Approved,Rejected'
        ]);

        if ($request->status === 'Rejected') {
            $this->notifyN8nApplicationStatus($application, 'Rejected');
            $this->purgeApplication($application);

            return response()->json(['message' => 'Applicant declined and removed.']);
        }

        $application->update([
            'status' => $request->status
        ]);

        $this->notifyN8nApplicationStatus($application, $request->status);

        return response()->json([
            'message' => 'Workflow status updated to ' . $request->status
        ]);
    }

    public function destroy($id)
    {
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

        $applicant = DB::transaction(function () use ($application, $validated, $applicant, $tempPassword, $studentName, $office, $storedMiddleName, $dutyRequest) {
            $application->update([
                'first_name' => $validated['first_name'],
                'middle_name' => $storedMiddleName,
                'last_name' => $validated['last_name'],
                'email' => $validated['email'],
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
                    'username' => $validated['email'],
                    'password' => $tempPassword,
                    'role' => 'Student',
                    'phone_number' => $validated['contact_number'],
                ]);
                $application->update(['user_id' => $applicant->id]);
            } else {
                $applicant->name = $studentName;
                $applicant->username = $validated['email'];
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

        app(DepartmentAssignmentNotifier::class)->notify($applicant, $office, $dutyLabel);

        return response()->json([
            'message' => 'Student successfully matched and placed!',
            'credentials' => [
                'name' => $studentName,
                'username' => $applicant->username,
                'password' => $tempPassword,
            ],
        ]);
    }

        // COORDINATOR: Schedule Interview
    public function scheduleInterview(Request $request, $id)
    {
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

        $this->notifyN8nApplicationStatus($application, 'Interview');

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

    private function purgeDeclinedApplications(): void
    {
        Application::with(['documents', 'applicant'])
            ->where('status', 'Rejected')
            ->get()
            ->each(fn (Application $application) => $this->purgeApplication($application));
    }

    private function notifyN8nApplicationStatus(Application $application, string $status): void
    {
        Http::timeout(5)->post('http://localhost:5678/webhook/techhrm/application-submitted', [
            'event' => 'application_status_updated',
            'application_id' => $application->id,
            'applicant_name' => trim(
                $application->first_name . ' ' .
                    ($application->middle_name ? $application->middle_name . ' ' : '') .
                    $application->last_name
            ),
            'email' => $application->email,
            'status' => $status,
            'updated_at' => now(),
        ]);
    }

    private function purgeApplication(Application $application): void
    {
        DB::transaction(function () use ($application) {
            $application->loadMissing(['documents', 'applicant']);

            foreach ($application->documents as $document) {
                if ($document->file_path) {
                    Storage::disk('local')->delete($document->file_path);
                }
            }

            $applicant = $application->applicant;
            $removeAccount = $application->status !== 'Approved'
                && $applicant
                && $applicant->role === 'Student';

            if ($removeAccount) {
                $applicant->tokens()->delete();
                $applicant->forceDelete();
                return;
            }

            $application->documents()->delete();
            $application->delete();
        });
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
        $emailTaken = User::query()
            ->when($ignoreUserId, fn ($query) => $query->where('id', '!=', $ignoreUserId))
            ->where('username', $email)
            ->exists();

        $emailOnApplication = Application::query()
            ->when($ignoreApplicationId, fn ($query) => $query->where('id', '!=', $ignoreApplicationId))
            ->where('status', '!=', 'Rejected')
            ->where('email', $email)
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
