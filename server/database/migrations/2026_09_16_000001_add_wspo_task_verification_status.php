<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE tasks MODIFY status ENUM('Pending', 'Assigned', 'In Progress', 'Completed', 'For Verification', 'Verified') DEFAULT 'Pending'");
            return;
        }

        // Postgres: drop enum check so the new status value is allowed.
        DB::statement('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check');
    }

    public function down(): void
    {
        DB::table('tasks')->where('status', 'For Verification')->update(['status' => 'Completed']);

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE tasks MODIFY status ENUM('Pending', 'Assigned', 'In Progress', 'Completed', 'Verified') DEFAULT 'Pending'");
        }
    }
};
