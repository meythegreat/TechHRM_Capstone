<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        if (! Schema::hasTable('attendances')) {
            return;
        }

        // Laravel's enum() column is a varchar plus this check. On MySQL the
        // photo migration widened the column; Postgres still only allows
        // passcode and qr, so missed_login, photo, and class_hours inserts fail.
        DB::statement('ALTER TABLE attendances DROP CONSTRAINT IF EXISTS attendances_check_in_method_check');
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        if (! Schema::hasTable('attendances')) {
            return;
        }

        DB::statement("ALTER TABLE attendances ADD CONSTRAINT attendances_check_in_method_check CHECK (check_in_method IN ('passcode', 'qr'))");
    }
};
