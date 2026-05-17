<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Storage;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = \App\Models\User::with('profile');

        // IF THE USER IS A SUPERVISOR: Lock them down
        if ($user->role === 'Supervisor') {
            // Get the supervisor's department
            $myDepartment = $user->profile->assigned_office ?? 'Unassigned';

            // Rule 1: Only show users in the same department
            $query->whereHas('profile', function($q) use ($myDepartment) {
                $q->where('assigned_office', $myDepartment);
            });

            // Rule 2: Strictly hide WSPO Staff and Super Admins from them
            $query->whereNotIn('role', ['Super Admin', 'WSPO Staff']);
        }

        // Return paginated results (or get() if you aren't using pagination yet)
        $users = $query->paginate(10);
        return response()->json($users);
    }

    // --- 1. THE STORE METHOD (Creating a new user) ---
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'username' => 'required|string|unique:users',
            'password' => 'required|string|min:8',
            'role' => 'required|string',
            'phone_number' => 'nullable|string'
        ]);

        $validated['password'] = bcrypt($validated['password']);
        $user = \App\Models\User::create($validated);

        // FIX: Save profile data for Students, Supervisors, AND WSPO Staff
        if (in_array($user->role, ['Student', 'Supervisor', 'WSPO Staff'])) {
            $user->profile()->create([
                'student_id_number' => $request->student_id_number ?? null,
                'course' => $request->course ?? null, // Also holds WSPO Staff Title
                'year_level' => $request->year_level ?? null,
                'assigned_office' => $request->assigned_office ?? null, // Holds the Department
            ]);
        }

        return response()->json(['message' => 'User created successfully', 'user' => $user]);
    }

    // --- 2. THE UPDATE METHOD (Editing an existing user) ---
    public function update(Request $request, string $id)
    {
        $user = \App\Models\User::findOrFail($id);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'username' => 'required|string|unique:users,username,' . $id,
            'role' => 'required|string',
            'phone_number' => 'nullable|string'
        ]);

        if ($request->filled('password')) {
            $validated['password'] = bcrypt($request->password);
        }

        $user->update($validated);

        // FIX: Update or Create profile data for the assigned roles
        if (in_array($user->role, ['Student', 'Supervisor', 'WSPO Staff'])) {
            $user->profile()->updateOrCreate(
                ['user_id' => $user->id],
                [
                    'student_id_number' => $request->student_id_number ?? null,
                    'course' => $request->course ?? null, // Also holds WSPO Staff Title
                    'year_level' => $request->year_level ?? null,
                    'assigned_office' => $request->assigned_office ?? null, // Holds the Department
                ]
            );
        } else {
            // Optional: If they are changed to a Super Admin, delete their profile data to clean up
            $user->profile()->delete();
        }

        return response()->json(['message' => 'User updated successfully', 'user' => $user]);
    }

    public function destroy(string $id)
    {
        $user = User::findOrFail($id);
        $user->delete();

        return response()->json(['message' => 'User deleted successfully']);
    }

    public function uploadAvatar(Request $request)
    {
        $request->validate([
            'avatar' => 'required|image|mimes:jpeg,png,jpg,gif|max:2048',
        ]);

        $user = $request->user();

        if ($request->hasFile('avatar')) {
            if ($user->profile_picture) {
                Storage::disk('local')->delete($user->profile_picture);
            }

            $path = $request->file('avatar')->store('avatars', 'local');

            $user->profile_picture = $path;
            $user->save();

            return response()->json([
                'message' => 'Profile picture updated successfully!',
                'profile_picture' => $path,
            ]);
        }

        return response()->json(['message' => 'No image uploaded'], 400);
    }
}
