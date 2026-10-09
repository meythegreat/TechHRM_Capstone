<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use App\Models\User;
use App\Models\Application;
use App\Models\ActivityLog; // Imported your new ActivityLog model!

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
        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Invalid username, email, or password.'
            ], 401);
        }

        $pendingApplicantResponse = $this->pendingApplicantResponse($user);
        if ($pendingApplicantResponse) {
            return $pendingApplicantResponse;
        }

        // 4. Return assigned department for students/supervisors; admins get 'Management'
        $office = match ($user->role) {
            'Student', 'Supervisor', 'WSPO Staff' => $user->profile?->assigned_office ?? 'Unassigned',
            default => 'Management',
        };

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

        // 7. Return the exact payload React is expecting
        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'role' => $user->role,
            'name' => $user->name,
            'office' => $office,
            'profile_picture' => $user->profile_picture,
            'must_change_password' => (bool) $user->must_change_password,
        ]);
    }

    public function forgotPassword(Request $request)
    {
        $request->validate([
            'username' => 'required|string|max:255',
        ]);

        $identifier = trim($request->username);
        $user = $this->userForIdentifier($identifier);

        if (!$user) {
            return response()->json([
                'message' => 'No account matches that username or email.',
            ], 404);
        }

        $email = $this->resetDestination($user, $identifier);

        if (!$email) {
            return response()->json([
                'message' => 'This account has no email address on file. Ask the Work-Study office to reset it.',
            ], 422);
        }

        $temporaryPassword = Str::password(12, symbols: false);
        $payload = [
            'event' => 'forgot_password',
            'name' => $user->name,
            'username' => $user->username,
            'email' => $email,
            'from_email' => 'techhrmwspo@gmail.com',
            'from_name' => 'TechHRM WSPO',
            'temporary_password' => $temporaryPassword,
            'subject' => 'Your TechHRM temporary password',
            'message' => $this->resetEmailBody($user, $temporaryPassword),
        ];

        try {
            $webhook = Http::timeout(20)->post(config('services.n8n.forgot_password_webhook'), $payload);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'Could not reach n8n to send the Gmail reset. Start n8n, then try again.',
            ], 502);
        }

        if (!$webhook->successful()) {
            return response()->json([
                'message' => 'n8n did not send the Gmail reset. Check that the forgot-password workflow is active and Gmail is connected.',
            ], 502);
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
        /** @var \App\Models\User $user */
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
            'message' => 'Logged out successfully'
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
        if (!$user || !\Illuminate\Support\Facades\Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Invalid username, email, or password.'
            ], 401);
        }

        // 2. STRICT ROLE CHECK: Only Students and Supervisors allowed on Mobile!
        if (!in_array($user->role, ['Student', 'Supervisor'])) {
            return response()->json([
                'message' => 'Access Denied: Mobile app is strictly for Students and Supervisors. Admins must use the Web Portal.'
            ], 403);
        }

        $pendingApplicantResponse = $this->pendingApplicantResponse($user);
        if ($pendingApplicantResponse) {
            return $pendingApplicantResponse;
        }

        // 3. Create the Sanctum Token (valid until 11:59 PM today)
        $token = $this->issueSessionToken($user, 'mobile-auth-token');

        // Load the profile so the mobile app has their department/course info
        $user->load('profile');

        return response()->json([
            'token' => $token,
            'user' => $user
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

        return $visible . $hidden . '@' . $domain;
    }

    private function userForIdentifier(string $identifier): ?User
    {
        $identifier = trim($identifier);
        $user = User::where('username', $identifier)->first();

        if ($user) {
            return $user;
        }

        $lower = strtolower($identifier);
        $user = User::whereRaw('LOWER(username) = ?', [$lower])->first();

        if ($user || !filter_var($identifier, FILTER_VALIDATE_EMAIL)) {
            return $user;
        }

        $userId = Application::whereRaw('LOWER(email) = ?', [$lower])
            ->whereNotNull('user_id')
            ->latest()
            ->value('user_id');

        return $userId ? User::find($userId) : null;
    }

    private function resetDestination(User $user, string $identifier): ?string
    {
        if (filter_var($identifier, FILTER_VALIDATE_EMAIL)) {
            return strtolower($identifier);
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

    private function resetEmailBody(User $user, string $temporaryPassword): string
    {
        $name = htmlspecialchars($user->name ?: $user->username, ENT_QUOTES, 'UTF-8');
        $username = htmlspecialchars($user->username, ENT_QUOTES, 'UTF-8');
        $password = htmlspecialchars($temporaryPassword, ENT_QUOTES, 'UTF-8');

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#e8fbff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8fbff;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #b8f4f6;font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td style="background:#30f1f3;height:8px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background:#0731af;padding:28px 32px 22px;">
              <p style="margin:0;color:#30f1f3;font-size:11px;letter-spacing:1.8px;font-weight:bold;">FILAMER CHRISTIAN UNIVERSITY</p>
              <h1 style="margin:10px 0 0;color:#fde004;font-size:30px;line-height:1.1;">TechHRM</h1>
              <p style="margin:8px 0 0;color:#ffffff;font-size:14px;">Work-Study Program Organization</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0;font-size:0;line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="34%" style="background:#fde004;height:6px;">&nbsp;</td>
                  <td width="33%" style="background:#096cf3;height:6px;">&nbsp;</td>
                  <td width="33%" style="background:#c11a0d;height:6px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 14px;color:#0731af;font-size:18px;font-weight:bold;">Hello {$name},</p>
              <p style="margin:0 0 22px;color:#1e293b;font-size:15px;line-height:1.6;">A password reset was requested for your TechHRM account. Use the temporary password below to sign in. You will be asked to choose a new password before you can continue.</p>
              <p style="margin:0 0 6px;color:#096cf3;font-size:11px;font-weight:bold;letter-spacing:1.2px;">EMAIL</p>
              <p style="margin:0 0 18px;color:#0731af;font-size:16px;font-weight:bold;">{$username}</p>
              <p style="margin:0 0 8px;color:#096cf3;font-size:11px;font-weight:bold;letter-spacing:1.2px;">TEMPORARY PASSWORD</p>
              <p style="margin:0 0 24px;background:#fde004;border:2px solid #0731af;border-radius:12px;padding:16px 12px;color:#0731af;font-size:22px;font-weight:bold;letter-spacing:1px;text-align:center;">{$password}</p>
              <p style="margin:0;color:#334155;font-size:13px;line-height:1.6;">If you did not request this, contact the Work-Study Program office.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#0731af;">
              <p style="margin:0;color:#fde004;font-size:13px;font-weight:bold;">TechHRM WSPO</p>
              <p style="margin:4px 0 0;color:#30f1f3;font-size:13px;">techhrmwspo@gmail.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
    }

    private function pendingApplicantResponse(User $user)
    {
        if ($user->role !== 'Student') {
            return null;
        }

        $application = Application::where('user_id', $user->id)->latest()->first();

        if (!$application || $application->status === 'Approved') {
            return null;
        }

        return response()->json([
            'message' => "Your application is currently {$application->status}. Please wait for WSPO confirmation before accessing the portal."
        ], 403);
    }
}
