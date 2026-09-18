<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class UserController extends Controller
{
    private const UNIVERSITY_OFFICES = [
        'University President', 'Quality Assurance', 'Human Resource Development Center', 'Office of the Student Affairs', 'University Chaplain', 'Alumni Affairs', 'Administration', 'Buildings & Grounds', 'Pollution Control', 'Security Office', 'Safety and Disaster Management', 'Sports', 'Socio-Cultural', 'WSPO', 'Health Services', 'General Services', 'Mass Media', 'ICT Services Office', 'Higher Education Laboratory', 'Academic Affairs', 'Graduate School', 'College of Arts and Sciences', 'College of Business and Accountancy', 'College of Computer Studies', 'College of Criminal Justice Education', 'College of Electronic Engineering', 'College of Hospitality and Tourism Management', 'College of Nursing', 'College of Teacher Education', 'Kindergarten/Elementary', 'High School', 'University Registrar', 'Libraries', 'Guidance & Counselling Center', 'NSTP', 'REIID', 'International Program Office', 'Community Extension', 'Research', 'Finance', 'Accounting/Budget', 'Business Management', 'Property Custodian', 'University Enterprise',
    ];
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

    /** Students available to the current department. */
    public function personnel(Request $request)
    {
        $query = User::with('profile')->where('role', 'Student');
        $department = trim((string) ($request->user()->profile?->assigned_office ?? ''));

        if ($request->user()->role === 'Supervisor') {
            if ($department === '') {
                return response()->json([
                    'message' => 'Your supervisor account has no assigned department. Ask WSPO to set your department first.',
                ], 422);
            }
            // A supervisor may be configured with "CCS" while older student
            // records use "College of Computer Studies" (and vice versa).
            $areas = $this->departmentAliases($department);

            $query->whereHas('profile', function ($q) use ($areas) {
                $q->where(function ($areaQuery) use ($areas) {
                    $areaQuery->whereIn('assigned_office', $areas)
                        ->orWhereIn('course', $areas);
                });
            });
        } elseif ($request->filled('department')) {
            $query->whereHas('profile', fn ($q) => $q->where('assigned_office', $request->department));
        }

        return response()->json($query->orderBy('name')->get());
    }

    /**
     * Canonical course/college aliases used by both old and new profile records.
     * Keep all placement values in this list so abbreviations and full names are
     * interchangeable when determining a supervisor's personnel list.
     */
    private function departmentAliases(string $department): array
    {
        $groups = [
            ['CCS', 'College of Computer Studies', 'College of Computer Studies (CCS)', 'CCS Office'],
            ['CBA', 'College of Business and Accountancy', 'College of Business Administration', 'Business Office'],
            ['CHTM', 'College of Hotel and Tourism Management', 'College of Hospitality and Tourism Management'],
            ['CCJE', 'College of Criminal Justice Education'],
            ['COE', 'College of Engineering'],
            ['CON', 'College of Nursing'],
            ['CTE', 'College of Teacher Education'],
            ['CAS', 'College of Arts and Sciences'],
            ['GS', 'Graduate School'],
            ['SHS', 'Senior High School Department'],
            ['JHS', 'Junior High School Department'],
            ['ES', 'Elementary Department'],
            ['PS', 'Pre-School Department'],
        ];

        $normalized = $this->normalizeDepartment($department);
        foreach ($groups as $group) {
            if (in_array($normalized, array_map([$this, 'normalizeDepartment'], $group), true)) {
                return $group;
            }
        }

        return array_values(array_unique([
            trim($department),
            trim((string) preg_replace('/\\s*\\([^)]*\\)/', '', $department)),
        ]));
    }

    private function normalizeDepartment(string $department): string
    {
        return strtolower((string) preg_replace('/[^a-z0-9]/i', '', $department));
    }

    /** WSPO coordinator links an existing working student to a department. */
    public function assignDepartment(Request $request, string $id)
    {
        $validated = $request->validate([
            'department' => ['required', 'string', 'in:' . implode(',', self::UNIVERSITY_OFFICES)],
            'duty_type' => 'required|in:Clerical,Janitorial,Request',
            'duty_request' => 'required_if:duty_type,Request|nullable|string|max:1000',
        ]);
        $student = User::where('role', 'Student')->findOrFail($id);
        $student->profile()->updateOrCreate(['user_id' => $student->id], [
            'assigned_office' => trim($validated['department']),
            'duty_type' => $validated['duty_type'],
            'duty_request' => $validated['duty_type'] === 'Request' ? trim($validated['duty_request']) : null,
        ]);

        return response()->json(['message' => 'Student assigned to department successfully.']);
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
            'phone_number' => 'nullable|string',
            'duty_type' => 'nullable|in:Clerical,Janitorial,Request',
            'duty_request' => 'required_if:duty_type,Request|nullable|string|max:1000',
        ]);

        $validated['password'] = bcrypt($validated['password']);
        $this->ensureOfficeIsAllowed($request);
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
            // The management edit form does not expose login IDs. Keep the
            // current username unless an API client explicitly sends a new one.
            'username' => 'sometimes|required|string|unique:users,username,' . $id,
            'role' => 'required|string',
            'phone_number' => 'nullable|string',
            'duty_type' => 'nullable|in:Clerical,Janitorial,Request',
            'duty_request' => 'required_if:duty_type,Request|nullable|string|max:1000',
        ]);

        if ($request->filled('password')) {
            $validated['password'] = bcrypt($request->password);
        }

        $this->ensureOfficeIsAllowed($request);
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

    private function ensureOfficeIsAllowed(Request $request): void
    {
        if (in_array($request->input('role'), ['Student', 'Supervisor'], true)
            && $request->filled('assigned_office')
            && !in_array($request->input('assigned_office'), self::UNIVERSITY_OFFICES, true)) {
            abort(422, 'Assigned Office / Dept must be selected from the university office list.');
        }
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
                'duty_type' => $nullableString($request->input('duty_type')),
                'duty_request' => $request->input('duty_type') === 'Request' ? $nullableString($request->input('duty_request')) : null,
            ],
            'Supervisor', 'WSPO Staff' => [
                'student_id_number' => null,
                'course' => null,
                'year_level' => null,
                'assigned_office' => $nullableString($request->input('assigned_office')),
                'duty_type' => null,
                'duty_request' => null,
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
