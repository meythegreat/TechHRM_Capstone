<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        User::create([
            'fullname' => 'Miguel Basinillo',
            'username' => 'admin',
            'password' => Hash::make('admin123'), // Hashed password for security
            'role' => 'Admin', // Assigning the required Admin role
        ]);
    }
}
