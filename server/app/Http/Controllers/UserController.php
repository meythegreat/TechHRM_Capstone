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
    public function index()
    {
        $users = User::with('profile')->orderBy('created_at', 'desc')->paginate(15);
        return response()->json($users);
    }

    public function store(Request $request)
    {
        // THE BOUNCER: Phone number must be explicitly allowed here!
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users',
            'password' => 'required|string|min:8',
            'role' => ['required', Rule::in(['Student', 'Supervisor', 'WSPO Staff', 'Super Admin'])],
            'phone_number' => 'nullable|string|max:20',

            // Profile fields
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
            'phone_number' => $validated['phone_number'] ?? null,
        ]);

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
            'phone_number' => 'nullable|string|max:20',

            'student_id_number' => 'required_if:role,Student|nullable|string',
            'course' => 'required_if:role,Student|nullable|string',
            'year_level' => 'required_if:role,Student|nullable|integer',
            'assigned_office' => 'required_if:role,Student|nullable|string',
        ]);

        $user->name = $validated['name'];
        $user->username = $validated['username'];
        $user->role = $validated['role'];
        $user->phone_number = $validated['phone_number'] ?? null;

        if (!empty($validated['password'])) {
            $user->password = Hash::make($validated['password']);
        }
        $user->save();

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
            if ($user->profile) {
                $user->profile->delete();
            }
        }

        return response()->json(['message' => 'User updated successfully', 'user' => $user->load('profile')]);
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
                Storage::disk('public')->delete($user->profile_picture);
            }

            $path = $request->file('avatar')->store('avatars', 'public');

            $user->profile_picture = $path;
            $user->save();

            return response()->json([
                'message' => 'Profile picture updated successfully!',
                'profile_picture' => asset('storage/' . $path)
            ]);
        }

        return response()->json(['message' => 'No image uploaded'], 400);
    }
}
