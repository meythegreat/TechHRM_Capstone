<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE tasks MODIFY status ENUM('Pending', 'Assigned', 'In Progress', 'Completed', 'For Verification', 'Verified') DEFAULT 'Pending'");
    }

    public function down(): void
    {
        DB::table('tasks')->where('status', 'For Verification')->update(['status' => 'Completed']);
        DB::statement("ALTER TABLE tasks MODIFY status ENUM('Pending', 'Assigned', 'In Progress', 'Completed', 'Verified') DEFAULT 'Pending'");
    }
};
