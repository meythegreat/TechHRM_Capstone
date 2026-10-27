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
        // Keep existing production/local data intact. Only seed demo accounts on an empty users table.
        if (User::withTrashed()->exists()) {
            $this->command?->info('Users already exist; skipping AdminUserSeeder.');
            return;
        }

        // 1. Super Admin Account
        User::updateOrCreate(
            ['username' => 'superadmin'],
            [
                'name' => 'System Developer',
                'password' => Hash::make('password123'),
                'role' => 'Super Admin',
            ]
        );

        // 2. WSPO Staff Account — also the supervisor of working students placed in WSPO
        $coordinator = User::updateOrCreate(
            ['username' => 'wspostaff'],
            [
                'name' => 'WSPO Coordinator',
                'password' => Hash::make('password123'),
                'role' => 'WSPO Staff',
            ]
        );
        UserProfile::updateOrCreate(
            ['user_id' => $coordinator->id],
            ['assigned_office' => 'WSPO Coordinator']
        );

        // 3. Supervisor Account (e.g., Dean of CCS)
        $supervisor = User::updateOrCreate(
            ['username' => 'supervisor'],
            [
                'name' => 'CCS Supervisor',
                'password' => Hash::make('password123'),
                'role' => 'Supervisor',
            ]
        );

        // The supervisor and the working students must share the exact area name.
        UserProfile::updateOrCreate(
            ['user_id' => $supervisor->id],
            ['assigned_office' => 'College of Computer Studies (CCS)']
        );

        // 4. Student Worker Account
        $student = User::updateOrCreate(
            ['username' => 'student'],
            [
                'name' => 'Student Worker',
                'password' => Hash::make('password123'),
                'role' => 'Student',
            ]
        );

        // Attach the required profile to the Student
        UserProfile::updateOrCreate(
            ['user_id' => $student->id],
            [
                'student_id_number' => 'FCU-2026-001',
                'course' => 'BS Information Technology',
                'year_level' => 3,
                'assigned_office' => 'College of Computer Studies (CCS)',
            ]
        );
    }
}
