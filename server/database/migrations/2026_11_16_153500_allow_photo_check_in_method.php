<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('attendances', 'check_in_method')) {
            return;
        }

        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement('ALTER TABLE attendances MODIFY check_in_method VARCHAR(20) NULL');
    }

    public function down(): void
    {
        if (! Schema::hasColumn('attendances', 'check_in_method')) {
            return;
        }

        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement("ALTER TABLE attendances MODIFY check_in_method ENUM('passcode', 'qr') NULL");
    }
};
