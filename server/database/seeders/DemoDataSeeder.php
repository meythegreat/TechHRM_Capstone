<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(AdminUserSeeder::class);

        $this->command->info('Seeded the 4 default sample accounts (Super Admin, WSPO Staff, Supervisor, Student).');
    }
}
