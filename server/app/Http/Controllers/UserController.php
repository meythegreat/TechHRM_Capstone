<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = \App\Models\User::with('profile');

        // 1. ROLE-BASED VISIBILITY
        // If Super Admin, show normal AND deleted users
        if ($user->role === 'Super Admin') {
            $query->withTrashed();
        }

        // If Supervisor, lock them down to ONLY their department
        if ($user->role === 'Supervisor') {
            $myDepartment = $user->profile->assigned_office ?? 'Unassigned';

            $query->whereHas('profile', function($q) use ($myDepartment) {
                $q->where('assigned_office', $myDepartment);
            });
            $query->whereNotIn('role', ['Super Admin', 'WSPO Staff']);
        }

        // 2. DYNAMIC SEARCH FUNCTIONALITY
        if ($request->has('search') && $request->search != '') {
            $searchTerm = $request->search;

            $query->where(function($q) use ($searchTerm) {
                // Search main User table
                $q->where('name', 'LIKE', "%{$searchTerm}%")
                  ->orWhere('username', 'LIKE', "%{$searchTerm}%")
                  ->orWhere('role', 'LIKE', "%{$searchTerm}%")
                  // Search related Profile table
                  ->orWhereHas('profile', function($profileQuery) use ($searchTerm) {
                      $profileQuery->where('assigned_office', 'LIKE', "%{$searchTerm}%")
                                   ->orWhere('student_id_number', 'LIKE', "%{$searchTerm}%")
                                   ->orWhere('course', 'LIKE', "%{$searchTerm}%");
                  });
            });
        }

        // 3. RETURN PAGINATED RESULTS
        // Change from 10 to 15 or 20 if you want more users per page!
        $users = $query->paginate(10);
        return response()->json($users);
    }

    // --- 1. THE STORE METHOD (Creating a new user) ---
    public function store(Request $request)
    {
        $this->normalizeUserPayload($request);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'username' => 'required|string|unique:users',
            'password' => 'required|string|min:6',
            'role' => 'required|string',
            'phone_number' => 'nullable|string'
        ]);

        $validated['password'] = bcrypt($validated['password']);
        $user = \App\Models\User::create($validated);

        if ($this->roleUsesProfile($user->role)) {
            $user->profile()->create($this->profileAttributesForRole($user->role, $request));
        }

        return response()->json(['message' => 'User created successfully', 'user' => $user]);
    }

    // --- 2. THE UPDATE METHOD (Editing an existing user) ---
    public function update(Request $request, string $id)
    {
        $this->normalizeUserPayload($request);

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

        if ($this->roleUsesProfile($user->role)) {
            $user->profile()->updateOrCreate(
                ['user_id' => $user->id],
                $this->profileAttributesForRole($user->role, $request)
            );
        } else {
            $user->profile()->delete();
        }

        return response()->json(['message' => 'User updated successfully', 'user' => $user->load('profile')]);
    }

    public function updateSelf(Request $request)
    {
        /** @var \App\Models\User $user */
        $user = $request->user();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'phone_number' => 'nullable|string|max:50',
            'password' => 'nullable|string|min:6|confirmed',
            'current_password' => 'required_with:password|string',
        ]);

        if ($request->filled('password')) {
            if (!Hash::check($request->current_password, $user->password)) {
                return response()->json(['message' => 'Current password is incorrect.'], 422);
            }
            $user->password = Hash::make($validated['password']);
        }

        $user->name = $validated['name'];
        $user->phone_number = $validated['phone_number'] ?? null;
        $user->save();

        return response()->json([
            'message' => 'Profile updated successfully.',
            'user' => $user->load('profile'),
        ]);
    }

    private function normalizeUserPayload(Request $request): void
    {
        $normalized = [];

        if (!$request->filled('name') && $request->filled('fullname')) {
            $normalized['name'] = $request->input('fullname');
        }

        if ($request->input('role') === 'User') {
            $normalized['role'] = 'Student';
        }

        if ($normalized !== []) {
            $request->merge($normalized);
        }
    }

    private function roleUsesProfile(string $role): bool
    {
        return in_array($role, ['Student', 'Supervisor', 'WSPO Staff'], true);
    }

    private function profileAttributesForRole(string $role, Request $request): array
    {
        $nullableString = fn (?string $value) => ($value === null || trim($value) === '') ? null : trim($value);
        $nullableInt = fn ($value) => ($value === null || $value === '') ? null : (int) $value;

        return match ($role) {
            'Student' => [
                'student_id_number' => $nullableString($request->input('student_id_number')),
                'course' => $nullableString($request->input('course')),
                'year_level' => $nullableInt($request->input('year_level')),
                'assigned_office' => $nullableString($request->input('assigned_office')),
            ],
            'Supervisor', 'WSPO Staff' => [
                'student_id_number' => null,
                'course' => null,
                'year_level' => null,
                'assigned_office' => $nullableString($request->input('assigned_office')),
            ],
            default => [],
        };
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
