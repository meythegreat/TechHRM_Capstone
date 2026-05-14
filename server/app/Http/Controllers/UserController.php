<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index()
    {
        // Fetch users with their profiles, ordered by latest
        $users = User::with('profile')->orderBy('created_at', 'desc')->get();
        return response()->json($users);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users',
            'password' => 'required|string|min:8',

            // Validate against the exact 4 system roles
            'role' => ['required', Rule::in(['Student', 'Supervisor', 'WSPO Staff', 'Super Admin'])],

            // Profile fields (only required if role is 'Student')
            'student_id_number' => 'required_if:role,Student|nullable|string',
            'course' => 'required_if:role,Student|nullable|string',
            'year_level' => 'required_if:role,Student|nullable|integer',
            'assigned_office' => 'required_if:role,Student|nullable|string',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'username' => $validated['username'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
        ]);

        // Create profile only if they are a Student
        if ($validated['role'] === 'Student') {
            UserProfile::create([
                'user_id' => $user->id,
                'student_id_number' => $validated['student_id_number'],
                'course' => $validated['course'],
                'year_level' => $validated['year_level'],
                'assigned_office' => $validated['assigned_office'],
            ]);
        }

        return response()->json(['message' => 'User created successfully', 'user' => $user->load('profile')], 201);
    }

    public function update(Request $request, string $id)
    {
        $user = User::findOrFail($id);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'username' => ['required', 'string', 'max:255', Rule::unique('users')->ignore($user->id)],
            'role' => ['required', Rule::in(['Student', 'Supervisor', 'WSPO Staff', 'Super Admin'])],
            'password' => 'nullable|string|min:8',

            // Profile fields
            'student_id_number' => 'required_if:role,Student|nullable|string',
            'course' => 'required_if:role,Student|nullable|string',
            'year_level' => 'required_if:role,Student|nullable|integer',
            'assigned_office' => 'required_if:role,Student|nullable|string',
        ]);

        // Update Base User
        $user->name = $validated['name'];
        $user->username = $validated['username'];
        $user->role = $validated['role'];
        if (!empty($validated['password'])) {
            $user->password = Hash::make($validated['password']);
        }
        $user->save();

        // Handle Profile updates
        if ($validated['role'] === 'Student') {
            UserProfile::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'student_id_number' => $validated['student_id_number'],
                    'course' => $validated['course'],
                    'year_level' => $validated['year_level'],
                    'assigned_office' => $validated['assigned_office'],
                ]
            );
        } else {
            // If they were changed from a Student to an Admin/Supervisor, delete their old profile
            if ($user->profile) {
                $user->profile->delete();
            }
        }

        return response()->json(['message' => 'User updated successfully', 'user' => $user->load('profile')]);
    }

    public function destroy(string $id)
    {
        $user = User::findOrFail($id);
        $user->delete(); // This cascades and deletes the profile too

        return response()->json(['message' => 'User deleted successfully']);
    }
}
