<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Your Super Admin (You)
        User::create([
            'fullname' => 'Miguel Basinillo',
            'username' => 'superadmin',
            'password' => Hash::make('admin123'),
            'role' => 'Super Admin',
        ]);

        // 2. A standard Admin (Employee)
        User::create([
            'fullname' => 'Staff Member',
            'username' => 'admin',
            'password' => Hash::make('admin123'),
            'role' => 'Admin',
        ]);
    }
}
