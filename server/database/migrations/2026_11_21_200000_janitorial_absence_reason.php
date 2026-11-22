<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('janitorial_immediate_absences') && ! Schema::hasColumn('janitorial_immediate_absences', 'reason')) {
            Schema::table('janitorial_immediate_absences', function (Blueprint $table) {
                $table->string('reason', 500)->nullable()->after('absent_on');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('janitorial_immediate_absences') && Schema::hasColumn('janitorial_immediate_absences', 'reason')) {
            Schema::table('janitorial_immediate_absences', function (Blueprint $table) {
                $table->dropColumn('reason');
            });
        }
    }
};
