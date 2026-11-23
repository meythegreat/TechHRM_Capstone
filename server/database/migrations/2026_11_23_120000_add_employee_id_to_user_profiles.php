<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('user_profiles') || Schema::hasColumn('user_profiles', 'employee_id')) {
            return;
        }

        Schema::table('user_profiles', function (Blueprint $table) {
            $table->string('employee_id')->nullable()->unique()->after('student_id_number');
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('user_profiles', 'employee_id')) {
            return;
        }

        Schema::table('user_profiles', function (Blueprint $table) {
            $table->dropUnique(['employee_id']);
            $table->dropColumn('employee_id');
        });
    }
};
