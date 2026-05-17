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

        // 6. Accounting: Record the login activity in the new Audit Trail
        \App\Models\ActivityLog::create([
            'admin_id' => $user->id,
            'admin_name' => $user->name, // <-- Make sure this line is exactly like this!
            'action' => 'System Login',
            'description' => 'logged into the system.',
            'ip_address' => $request->ip(),
        ]);

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
            // Accounting: Record the logout activity in the new Audit Trail
            ActivityLog::create([
                'admin_id' => $user->id,
                'admin_name' => $user->fullname,
                'action' => 'System Logout',
                'description' => 'logged out of the system.',
                'ip_address' => $request->ip(),
            ]);

            // Revoke the token to secure the session
            $user->tokens()->delete();
        }

        return response()->json([
            'message' => 'Logged out successfully'
        ]);
    }
}
