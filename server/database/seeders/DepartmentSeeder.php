<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Department;
use App\Models\User;

class DepartmentSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Define the departments
        $departments = [
            [
                'name' => 'College of Computer Studies (CCS)',
                'description' => 'IT support and lab maintenance',
                'capacity' => 15
            ],
            [
                'name' => 'College of Business Administration (CBA)',
                'description' => 'Office and clerical duties',
                'capacity' => 10
            ],
            [
                'name' => 'College of Hospitality and Tourism Management (CHTM)',
                'description' => 'Events and hospitality assistance',
                'capacity' => 20
            ],
            [
                'name' => 'University Library',
                'description' => 'Library student assistants',
                'capacity' => 25
            ],
        ];

        // 2. Insert departments into the database
        foreach ($departments as $dept) {
            Department::firstOrCreate(['name' => $dept['name']], $dept);
        }

        // 3. Get the IDs of the departments we just created
        $departmentIds = Department::pluck('id')->toArray();

        // 4. Define your working student role (Change this if your database uses 'Student' or 'User' instead)
        $roleName = 'User';

        // 5. Check if you have any working students
        $students = User::where('role', $roleName)->get();

        // 6. If your database is empty, create 5 dummy students automatically
        if ($students->isEmpty()) {
            for ($i = 1; $i <= 5; $i++) {
                $students->push(User::create([
                    'name' => 'Working Student ' . $i,
                    'email' => 'student' . $i . '@filamer.edu',
                    'password' => bcrypt('password'), // default password
                    'role' => $roleName,
                ]));
            }
        }

        // 7. Assign a random department to each student
        foreach ($students as $student) {
            $student->department_id = $departmentIds[array_rand($departmentIds)];
            $student->save();
        }
    }
}
