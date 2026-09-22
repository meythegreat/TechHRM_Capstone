<?php

namespace App\Http\Controllers;

use App\Models\Application;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
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
            'email' => 'required|string|email|max:255|unique:users,username',
            'age' => 'required|integer|min:16',
            'gender' => 'required|string|in:Male,Female,Prefer not to say',
            'address' => 'required|string',
            'contact_number' => 'required|string',
            'year_level' => 'required|string',
            'course' => 'required|string',
            'preferred_department' => 'required|string',
            'available_schedules' => 'required|array|min:1',
            'reason_for_applying' => 'required|string',
            'documents' => 'required|array|min:3|max:5',
            'documents.*' => 'file|mimes:pdf,jpg,jpeg,png|max:4096',
        ]);

        DB::transaction(function () use ($request, $validated) {
            $fullName = trim(implode(' ', array_filter([
                $validated['first_name'],
                $validated['middle_name'] ?? null,
                $validated['last_name'],
            ])));
            $tempPassword = 'FCU' . ucfirst(strtolower($validated['last_name']));

            $user = User::create([
                'name' => $fullName,
                'username' => $validated['email'],
                'password' => Hash::make($tempPassword),
                'role' => 'Student',
                'phone_number' => $validated['contact_number'],
            ]);

            $user->profile()->create([
                'assigned_office' => null,
                'course' => $validated['course'],
                'year_level' => $this->numericYearLevel($validated['year_level']),
                'student_id_number' => null,
                'gender' => in_array($validated['gender'], ['Male', 'Female'], true) ? $validated['gender'] : null,
            ]);

            $application = Application::create([
                'user_id' => $user->id,
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
                'preferred_department' => $validated['preferred_department'],
                'available_schedules' => $validated['available_schedules'],
                'reason_for_applying' => $validated['reason_for_applying'],
                'status' => 'Pending',
            ]);

            $this->storeApplicationDocuments($request, $application);
        });

        return response()->json([
            'message' => 'Application submitted successfully! Please wait for WSPO confirmation to receive your login details.'
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

        $request->validate(['status' => 'required|in:Pending,Interview,Training,For Result,Approved,Rejected']);

        if ($request->status === 'Rejected') {
            $this->purgeApplication($application);

            return response()->json(['message' => 'Applicant declined and removed.']);
        }

        $application->update(['status' => $request->status]);

        return response()->json(['message' => 'Workflow status updated to ' . $request->status]);
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
        ]);

        $application->update([
            'assigned_department' => $validated['assigned_department'],
            'assigned_position' => null,
            'status' => 'Approved'
        ]);

        $applicant = $application->applicant;
        $tempPassword = 'FCU-' . strtoupper(Str::random(5)) . '!' . random_int(0, 9);

        if ($applicant) {
            $applicant->load('profile');
            $applicant->profile()->updateOrCreate(
                ['user_id' => $applicant->id],
                [
                    'assigned_office' => $validated['assigned_department'],
                    'gender' => in_array($application->gender, ['Male', 'Female'], true) ? $application->gender : $applicant->profile?->gender,
                ]
            );
            $applicant->password = $tempPassword;
            $applicant->save();
        }

        return response()->json([
            'message' => 'Student successfully matched and placed!',
            'credentials' => [
                'name' => $applicant?->name ?? trim($application->first_name . ' ' . $application->last_name),
                'username' => $applicant?->username ?? $application->email,
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
