<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use App\Models\User;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        // 1. Validate user input to protect data integrity
        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        // 2. Fetch user (Eloquent automatically uses prepared statements preventing SQL injection)
        $user = User::where('username', $request->username)->first();

        // 3. Verify User and Password (Invalid login handling)
        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Invalid username or password.'
            ], 401);
        }

        // 4. Create Sanctum Token for secure React API requests
        $token = $user->createToken('auth_token')->plainTextToken;

        // 5. Accounting: Record the login activity
        DB::table('logs')->insert([
            'user_id' => $user->id,
            'activity' => 'Logged in',
            'created_at' => now(),
        ]);

        return response()->json([
            'message' => 'Login successful',
            'user' => $user,
            'token' => $token
        ]);
    }

    public function logout(Request $request)
    {
        $user = $request->user();

        // Accounting: Record the logout activity
        DB::table('logs')->insert([
            'user_id' => $user->id,
            'activity' => 'Logged out',
            'created_at' => now(),
        ]);

        // Revoke the token to secure the session
        $user->tokens()->delete();

        return response()->json([
            'message' => 'Logged out successfully'
        ]);
    }
}
