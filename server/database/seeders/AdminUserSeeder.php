<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // 1. Super Admin Account
        User::create([
            'name' => 'System Developer',
            'username' => 'superadmin',
            'password' => Hash::make('password123'),
            'role' => 'Super Admin',
        ]);

        // 2. WSPO Staff Account
        User::create([
            'name' => 'WSPO Coordinator',
            'username' => 'wspostaff',
            'password' => Hash::make('password123'),
            'role' => 'WSPO Staff',
        ]);

        // 3. Supervisor Account (e.g., Dean of CCS)
        User::create([
            'name' => 'CCS Supervisor',
            'username' => 'supervisor',
            'password' => Hash::make('password123'),
            'role' => 'Supervisor',
        ]);

        // 4. Student Worker Account
        $student = User::create([
            'name' => 'Miguel Angelo Basinillo',
            'username' => 'student',
            'password' => Hash::make('password123'),
            'role' => 'Student',
        ]);

        // Attach the required profile to the Student
        UserProfile::create([
            'user_id' => $student->id,
            'student_id_number' => 'FCU-2026-001',
            'course' => 'BS Information Technology',
            'year_level' => 3,
            'assigned_office' => 'College of Computer Studies (CCS)',
        ]);
    }
}
