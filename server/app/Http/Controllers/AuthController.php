<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
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
        $user = User::with('profile')->where('username', $request->username)->first();

        // 3. Verify User and Password (Invalid login handling)
        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Invalid username or password.'
            ], 401);
        }

        // 4. Grab the office if they are a student worker (Admins get 'Management')
        $office = $user->role === 'Student' ? $user->profile?->assigned_office : 'Management';

        // 5. Create Sanctum Token for secure React API requests
        $token = $user->createToken('auth_token')->plainTextToken;

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

        $user = \App\Models\User::where('username', $request->username)->first();

        // 1. Check if user exists and password is correct
        if (!$user || !\Illuminate\Support\Facades\Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Invalid username or password.'
            ], 401);
        }

        // 2. STRICT ROLE CHECK: Only Students and Supervisors allowed on Mobile!
        if (!in_array($user->role, ['Student', 'Supervisor'])) {
            return response()->json([
                'message' => 'Access Denied: Mobile app is strictly for Students and Supervisors. Admins must use the Web Portal.'
            ], 403);
        }

        // 3. Create the Sanctum Token
        $token = $user->createToken('mobile-auth-token')->plainTextToken;

        // Load the profile so the mobile app has their department/course info
        $user->load('profile');

        return response()->json([
            'token' => $token,
            'user' => $user
        ], 200);
    }
}
