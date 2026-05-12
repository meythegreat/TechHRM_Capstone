<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\ActivityLog; // <-- Imported the new ActivityLog model for the dashboard
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    // READ: Get all users
    public function index()
    {
        // 'with('profile')' eager-loads the student profile data so React can read it
        $users = User::with('profile')->orderBy('created_at', 'desc')->get();
        return response()->json($users);
    }

    // CREATE: Add a new user
    public function store(Request $request)
    {
        $validated = $request->validate([
            'fullname' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users',
            'password' => 'required|string|min:6',
            'role' => ['required', Rule::in(['Admin', 'User'])],

            // Student Profile fields (Only required if the role is 'User')
            'student_id_number' => 'required_if:role,User|nullable|string|unique:student_profiles,student_id_number',
            'course' => 'required_if:role,User|nullable|string',
            'year_level' => 'required_if:role,User|nullable|integer',
            'assigned_office' => 'required_if:role,User|nullable|string',
            'contact_number' => 'nullable|string',
        ]);

        // Use a Database Transaction to ensure data integrity
        DB::beginTransaction();

        try {
            // 1. Create the base User
            $user = User::create([
                'fullname' => $validated['fullname'],
                'username' => $validated['username'],
                'password' => Hash::make($validated['password']),
                'role' => $validated['role'],
            ]);

            // 2. If it's a student worker, attach the profile using the relationship
            if ($validated['role'] === 'User') {
                $user->profile()->create([
                    'student_id_number' => $validated['student_id_number'],
                    'course' => $validated['course'],
                    'year_level' => $validated['year_level'],
                    'assigned_office' => $validated['assigned_office'],
                    'contact_number' => $validated['contact_number'] ?? null,
                ]);
            }

            // 3. Accounting: Log the creation directly to the Admin Dashboard feed
            ActivityLog::create([
                'admin_id' => $request->user()->id,
                'admin_name' => $request->user()->fullname,
                'description' => "registered a new user account for {$user->fullname}."
            ]);

            DB::commit(); // Save everything
            return response()->json(['message' => 'User created successfully', 'user' => $user], 201);
        } catch (\Exception $e) {
            DB::rollBack(); // If anything fails, revert the database to prevent partial entries
            return response()->json(['message' => 'Failed to create user profile.', 'error' => $e->getMessage()], 500);
        }
    }

    // READ: Get a specific user
    public function show(User $user)
    {
        return response()->json($user);
    }

    // UPDATE: Modify an existing user
    public function update(Request $request, User $user)
    {
        $validated = $request->validate([
            'fullname' => 'sometimes|required|string|max:255',
            'username' => ['sometimes', 'required', 'string', 'max:255', Rule::unique('users')->ignore($user->id)],
            'password' => 'nullable|string|min:6',
            'role' => ['sometimes', 'required', Rule::in(['Admin', 'User'])],

            // Profile fields (nullable because an Admin won't submit them)
            'student_id_number' => ['nullable', 'string', Rule::unique('student_profiles')->ignore($user->profile?->id)],
            'course' => 'nullable|string',
            'year_level' => 'nullable|integer',
            'assigned_office' => 'nullable|string',
            'contact_number' => 'nullable|string',
        ]);

        DB::beginTransaction();

        try {
            // 1. Update Base User
            if (isset($validated['fullname'])) $user->fullname = $validated['fullname'];
            if (isset($validated['username'])) $user->username = $validated['username'];
            if (isset($validated['role'])) $user->role = $validated['role'];

            if (!empty($validated['password'])) {
                $user->password = Hash::make($validated['password']);
            }

            $user->save();

            // 2. Handle Student Profile Logic
            if ($user->role === 'User') {
                // updateOrCreate will update the profile if it exists, or create a new one if this user was just downgraded from Admin
                $user->profile()->updateOrCreate(
                    ['user_id' => $user->id],
                    [
                        'student_id_number' => $validated['student_id_number'],
                        'course' => $validated['course'],
                        'year_level' => $validated['year_level'],
                        'assigned_office' => $validated['assigned_office'],
                        'contact_number' => $validated['contact_number'] ?? null,
                    ]
                );
            } elseif ($user->role === 'Admin') {
                // If they are promoted to Admin, delete their student profile to keep the database clean
                $user->profile()->delete();
            }

            // 3. Accounting: Log the update directly to the Admin Dashboard feed
            ActivityLog::create([
                'admin_id' => $request->user()->id,
                'admin_name' => $request->user()->fullname,
                'description' => "updated the profile for {$user->fullname}."
            ]);

            DB::commit();

            // Return the updated user with the fresh profile attached
            return response()->json(['message' => 'User updated successfully', 'user' => $user->load('profile')]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update user.', 'error' => $e->getMessage()], 500);
        }
    }

    // DELETE: Remove a user
    public function destroy(Request $request, User $user)
    {
        // Prevent admins from deleting themselves
        if ($request->user()->id === $user->id) {
            return response()->json(['message' => 'You cannot delete your own account.'], 403);
        }

        // Save the fullname before deleting so we can put it in the log
        $deletedName = $user->fullname;
        $user->delete();

        // Log the deletion directly to the Admin Dashboard feed
        ActivityLog::create([
            'admin_id' => $request->user()->id,
            'admin_name' => $request->user()->fullname,
            'description' => "deleted the user account for {$deletedName}."
        ]);

        return response()->json(['message' => 'User deleted successfully']);
    }
}
