<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DepartmentSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $departments = [
            ['name' => 'Working Students Program Office', 'code' => 'WSPO'],
            ['name' => 'College of Computer Studies', 'code' => 'CCS'],
            ['name' => 'College of Nursing', 'code' => 'CN'],
            ['name' => 'College of Business and Accountancy', 'code' => 'CBA'],
            ['name' => 'Registrar\'s Office', 'code' => 'REG'],
            ['name' => 'University Library', 'code' => 'LIB'],
            ['name' => 'General Services Office', 'code' => 'GSO'],
        ];

        // Insert into the departments table
        DB::table('departments')->insert($departments);
    }
}
