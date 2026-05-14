<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            // Uncomment this next line IF you have already created a 'departments' table migration
            // DepartmentSeeder::class,

            AdminUserSeeder::class,
        ]);
    }
}
