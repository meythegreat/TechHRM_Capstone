<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE attendances MODIFY attendance_type VARCHAR(40) NOT NULL DEFAULT 'Regular'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE attendances MODIFY attendance_type ENUM('Regular', 'Cleaning', 'Meeting') NOT NULL DEFAULT 'Regular'");
    }
};
