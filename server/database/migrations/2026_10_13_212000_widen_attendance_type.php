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
            DB::statement("ALTER TABLE attendances MODIFY attendance_type VARCHAR(40) NOT NULL DEFAULT 'Regular'");
            return;
        }

        DB::statement('ALTER TABLE attendances DROP CONSTRAINT IF EXISTS attendances_attendance_type_check');
        DB::statement("ALTER TABLE attendances ALTER COLUMN attendance_type TYPE VARCHAR(40)");
        DB::statement("ALTER TABLE attendances ALTER COLUMN attendance_type SET DEFAULT 'Regular'");
        DB::statement('ALTER TABLE attendances ALTER COLUMN attendance_type SET NOT NULL');
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE attendances MODIFY attendance_type ENUM('Regular', 'Cleaning', 'Meeting') NOT NULL DEFAULT 'Regular'");
        }
    }
};
