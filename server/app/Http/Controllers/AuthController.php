<?php

namespace App\Http\Controllers;

use App\Mail\TemporaryPasswordMail;
use App\Models\ActivityLog; // Imported your new ActivityLog model!
use App\Models\Application;
use App\Models\User;
use App\Services\AccountEventMailer;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        // 1. Validate user input to protect data integrity
        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        // 2. Fetch user WITH their student profile eager-loaded
        $user = $this->userForIdentifier($request->username)?->load('profile');

        // 3. Verify User and Password (Invalid login handling)
        if (! $user || ! Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Invalid username, email, or password.',
            ], 401);
        }

        $pendingApplicantResponse = $this->pendingApplicantResponse($user);
        if ($pendingApplicantResponse) {
            return $pendingApplicantResponse;
        }

        // 4. Return assigned department for students/supervisors; admins get 'Management'
        $office = match ($user->role) {
            'Student', 'Supervisor', 'WSPO Staff', 'Department Secretary', 'Immediate Supervisor' => $user->profile?->assignment_label
                ?: ($user->profile?->assigned_office ?? 'Unassigned'),
            default => 'Management',
        };
        $accounts = app(\App\Http\Controllers\UserController::class);

        // 5. Create Sanctum Token for secure React API requests.
        // The token stops working at 11:59 PM on the day it was issued.
        $token = $this->issueSessionToken($user, 'auth_token');

        // 6. Audit trail (must not block login if logging fails)
        try {
            ActivityLog::create([
                'admin_id' => $user->id,
                'admin_name' => $user->name ?? $user->username,
                'action' => 'System Login',
                'description' => 'logged into the system.',
                'ip_address' => $request->ip(),
            ]);
        } catch (\Throwable $e) {
            report($e);
        }

        app(AccountEventMailer::class)->signedIn($user, $request->ip());

        // 7. Return the exact payload React is expecting
        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'role' => $user->role,
            'name' => $user->name,
            'office' => $office,
            'assigned_office' => $user->profile?->assigned_office,
            'can_check_activity_attendance' => $accounts->canCheckActivityAttendance($user),
            'can_issue_activity_attendance' => $accounts->canCheckActivityAttendance($user),
            'can_manage_activity_groups' => $accounts->canManageActivityGroups($user),
            'can_manage_janitorial_groups' => $accounts->canManageJanitorialGroups($user),
            'can_issue_daily_attendance' => $accounts->canIssueDailyAttendance($user),
            'can_file_evaluations' => $accounts->canFileEvaluation($user),
            'can_review_evaluations' => $accounts->canReviewEvaluation($user),
            'is_student_officer' => $accounts->isStudentOfficer($user),
            'officer_position' => $accounts->officerPosition($user) ?: null,
            'must_clock_as_student' => $accounts->mustClockAsStudent($user),
            'profile_picture' => $user->profile_picture,
            'must_change_password' => (bool) $user->must_change_password,
            'acting' => $user->role === 'Department Secretary' ? $accounts->isActingDepartmentSecretary($user) : null,
            'supervisor_absent' => $user->role === 'Supervisor' ? $accounts->supervisorIsAbsentToday($user) : null,
            'special_hours_request' => (bool) $user->profile?->special_hours_request,
            'required_hours' => \App\Support\WorkRequirement::hoursFor($user),
        ]);
    }

    public function forgotPassword(Request $request)
    {
        $request->validate([
            'username' => 'required|string|max:255',
        ]);

        $identifier = trim($request->username);
        $user = $this->userForIdentifier($identifier);

        if (! $user) {
            return response()->json([
                'message' => 'No account matches that username or email.',
            ], 404);
        }

        $email = $this->resetDestination($user, $identifier);

        if (! $email) {
            return response()->json([
                'message' => 'This account has no email address on file. Ask the Work-Study office to reset it.',
            ], 422);
        }

        $temporaryPassword = Str::password(12, symbols: false);

        $sendError = $this->sendPasswordResetEmail($email, $user, $temporaryPassword);
        if ($sendError !== null) {
            return response()->json(['message' => $sendError], 502);
        }

        $user->password = $temporaryPassword;
        $user->must_change_password = true;
        $user->save();
        $user->tokens()->delete();

        try {
            ActivityLog::create([
                'admin_id' => $user->id,
                'admin_name' => $user->name ?? $user->username,
                'action' => 'Password Reset',
                'description' => 'requested a password reset. A temporary password was emailed.',
                'ip_address' => $request->ip(),
            ]);
        } catch (\Throwable $e) {
            report($e);
        }

        $maskedEmail = $this->maskEmail($email);

        return response()->json([
            'message' => "A temporary password has been sent to this account's email, {$maskedEmail}. Sign in with it, then choose a new password.",
            'masked_email' => $maskedEmail,
            'account' => filter_var($user->username, FILTER_VALIDATE_EMAIL) ? $maskedEmail : $user->username,
        ]);
    }

    public function logout(Request $request)
    {
        // Tell Intelephense exactly what model we are using
        /** @var User $user */
        $user = $request->user();

        if ($user) {
            try {
                ActivityLog::create([
                    'admin_id' => $user->id,
                    'admin_name' => $user->name ?? $user->username,
                    'action' => 'System Logout',
                    'description' => 'logged out of the system.',
                    'ip_address' => $request->ip(),
                ]);
            } catch (\Throwable $e) {
                report($e);
            }

            $user->tokens()->delete();
        }

        return response()->json([
            'message' => 'Logged out successfully',
        ]);
    }

    public function mobileLogin(Request $request)
    {
        $request->validate([
            'username' => 'required',
            'password' => 'required',
        ]);

        $user = $this->userForIdentifier($request->username);

        // 1. Check if user exists and password is correct
        if (! $user || ! Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Invalid username, email, or password.',
            ], 401);
        }

        // The mobile app mirrors the web portal, so every role can sign in.
        // Pending applicants are still blocked below.

        $pendingApplicantResponse = $this->pendingApplicantResponse($user);
        if ($pendingApplicantResponse) {
            return $pendingApplicantResponse;
        }

        // 3. Create the Sanctum Token (valid until 11:59 PM today)
        $token = $this->issueSessionToken($user, 'mobile-auth-token');
        app(AccountEventMailer::class)->signedIn($user, $request->ip());

        // Load the profile so the mobile app has their department/course info
        $user->load('profile');
        $accounts = app(\App\Http\Controllers\UserController::class);
        $payload = $user->toArray();
        $payload['assigned_office'] = $user->profile?->assigned_office;
        $payload['can_check_activity_attendance'] = $accounts->canCheckActivityAttendance($user);
        $payload['can_issue_activity_attendance'] = $payload['can_check_activity_attendance'];
        $payload['can_manage_activity_groups'] = $accounts->canManageActivityGroups($user);
        $payload['can_manage_janitorial_groups'] = $accounts->canManageJanitorialGroups($user);
        $payload['can_issue_daily_attendance'] = $accounts->canIssueDailyAttendance($user);
        $payload['is_student_officer'] = $accounts->isStudentOfficer($user);
        $payload['officer_position'] = $accounts->officerPosition($user) ?: null;
        $payload['must_clock_as_student'] = $accounts->mustClockAsStudent($user);

        return response()->json([
            'token' => $token,
            'user' => $payload,
        ], 200);
    }

    private function issueSessionToken(User $user, string $name): string
    {
        return $user->createToken($name, ['*'], $this->sessionExpiresAt())->plainTextToken;
    }

    private function sessionExpiresAt(): Carbon
    {
        return Carbon::now()->setTime(23, 59, 59);
    }

    private function maskEmail(string $email): string
    {
        [$local, $domain] = explode('@', $email, 2);
        $visible = mb_substr($local, 0, 2);
        $hidden = str_repeat('*', max(mb_strlen($local) - mb_strlen($visible), 0));

        return $visible.$hidden.'@'.$domain;
    }

    private function userForIdentifier(string $identifier): ?User
    {
        $identifier = trim($identifier);
        $lower = strtolower($identifier);
        $user = User::query()
            ->whereRaw('LOWER(username) = ?', [$lower])
            ->orWhereRaw('LOWER(email) = ?', [$lower])
            ->first();

        if ($user || ! filter_var($identifier, FILTER_VALIDATE_EMAIL)) {
            return $user;
        }

        $userId = Application::whereRaw('LOWER(email) = ?', [$lower])
            ->whereNotNull('user_id')
            ->latest()
            ->value('user_id');

        return $userId ? User::find($userId) : null;
    }

    /**
     * Send the temporary password through Resend.
     * Returns an error message on failure, or null on success.
     */
    private function sendPasswordResetEmail(string $email, User $user, string $temporaryPassword): ?string
    {
        $key = config('services.resend.key');
        if (! is_string($key) || trim($key) === '') {
            return 'Password reset email is not configured. Set RESEND_API_KEY.';
        }

        try {
            Mail::to($email)->send(new TemporaryPasswordMail($user, $temporaryPassword));
        } catch (\Throwable $e) {
            report($e);

            return 'Could not send the password reset email. Your password was not changed.';
        }

        return null;
    }

    private function resetDestination(User $user, string $identifier): ?string
    {
        if (is_string($user->email) && filter_var($user->email, FILTER_VALIDATE_EMAIL)) {
            return strtolower($user->email);
        }

        if (filter_var($user->username, FILTER_VALIDATE_EMAIL)) {
            return strtolower($user->username);
        }

        $applicationEmail = Application::where('user_id', $user->id)->latest()->value('email');

        if (is_string($applicationEmail) && filter_var($applicationEmail, FILTER_VALIDATE_EMAIL)) {
            return strtolower($applicationEmail);
        }

        return null;
    }

    private function pendingApplicantResponse(User $user)
    {
        if ($user->role !== 'Student') {
            return null;
        }

        $application = Application::where('user_id', $user->id)->latest()->first();

        if (! $application || $application->status === 'Approved') {
            return null;
        }

        return response()->json([
            'message' => "Your application is currently {$application->status}. Please wait for WSPO confirmation before accessing the portal.",
        ], 403);
    }
}
