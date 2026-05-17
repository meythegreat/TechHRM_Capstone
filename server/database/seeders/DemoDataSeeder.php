<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\UserProfile;
use App\Models\Attendance;
use App\Models\Schedule;
use Illuminate\Support\Facades\Hash;
use Carbon\Carbon;
use Faker\Factory as Faker;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $faker = Faker::create();

        // The Departments your WSPO actually uses
        $departments = [
            'College of Computer Studies',
            'College of Nursing',
            'College of Business and Accountancy',
            'College of Engineering',
            'College of Arts and Sciences',
            'Registrar\'s Office',
            'University Library'
        ];

        $dutyTypes = ['Clerical Work', 'Job Order', 'Janitorial', 'Routine Maintenance', 'Ad Hoc Tasks'];
        $days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        $this->command->info('Spawning 30 fake student workers... please wait.');

        // 1. Create 30 Students
        for ($i = 1; $i <= 30; $i++) {
            $student = User::create([
                'name' => $faker->name,
                'username' => 'student' . $i,
                'password' => Hash::make('password123'),
                'role' => 'Student',
                'phone_number' => $faker->phoneNumber,
            ]);

            $assignedOffice = $faker->randomElement($departments);

            // Create Profile
            UserProfile::create([
                'user_id' => $student->id,
                'student_id_number' => 'FCU-2026-' . str_pad($i, 3, '0', STR_PAD_LEFT),
                'course' => 'BS ' . $faker->word,
                'year_level' => $faker->numberBetween(1, 4),
                'assigned_office' => $assignedOffice,
            ]);

            // 2. Assign Random Weekly Schedules (1 to 3 shifts per student)
            $shiftCount = $faker->numberBetween(1, 3);
            $assignedDays = $faker->randomElements($days, $shiftCount);

            foreach ($assignedDays as $day) {
                $startHour = $faker->numberBetween(8, 14); // Between 8 AM and 2 PM
                $endHour = $startHour + $faker->numberBetween(2, 4); // 2 to 4 hour shifts

                $startTime = Carbon::createFromTime($startHour, 0)->format('g:i A');
                $endTime = Carbon::createFromTime($endHour, 0)->format('g:i A');

                Schedule::create([
                    'user_id' => $student->id,
                    'day' => $day,
                    'time' => "$startTime - $endTime",
                    'duty_type' => $faker->randomElement($dutyTypes),
                    'department' => $assignedOffice,
                    'supervisor' => 'Mr/Ms. ' . $faker->lastName,
                    'edit_request_status' => 'none',
                ]);
            }

            // 3. Generate Historical Attendance (Simulating the last 30 days)
            $attendanceCount = $faker->numberBetween(10, 25);
            for ($d = 1; $d <= $attendanceCount; $d++) {
                $date = Carbon::now()->subDays($faker->numberBetween(1, 30));

                // Skip Sundays
                if ($date->isSunday()) continue;

                $startHour = $faker->numberBetween(8, 14);
                $timeIn = $date->copy()->setTime($startHour, $faker->numberBetween(0, 59));
                $timeOut = $timeIn->copy()->addMinutes($faker->numberBetween(60, 240)); // Worked 1 to 4 hours

                $hours = $timeIn->diffInMinutes($timeOut) / 60;

                Attendance::create([
                    'user_id' => $student->id,
                    'time_in' => $timeIn,
                    'time_out' => $timeOut,
                    'rendered_hours' => round($hours, 2),
                    'work_type' => $faker->randomElement($dutyTypes),
                    'task_description' => $faker->sentence(6), // Fake paragraph of what they did
                    'status' => $faker->randomElement(['approved', 'approved', 'pending']), // Most are approved, some pending
                ]);
            }

            // 4. The "Wow Factor" - Leave 4 specific students currently "Active Now" today
            if ($i <= 4) {
                $timeIn = Carbon::now()->subMinutes($faker->numberBetween(10, 120)); // Clocked in 10 to 120 mins ago
                Attendance::create([
                    'user_id' => $student->id,
                    'time_in' => $timeIn,
                    'time_out' => null, // STILL WORKING
                    'rendered_hours' => null,
                    'work_type' => $faker->randomElement($dutyTypes),
                    'task_description' => null,
                    'status' => 'pending',
                ]);
            }
        }

        $this->command->info('✅ Data successfully generated!');
    }
}
