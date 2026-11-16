<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('janitorial_leaders') && ! Schema::hasColumn('janitorial_leaders', 'is_present')) {
            Schema::table('janitorial_leaders', function (Blueprint $table) {
                $table->boolean('is_present')->default(true);
            });
        }

        if (Schema::hasTable('manual_attendance_request_shifts')) {
            Schema::table('manual_attendance_request_shifts', function (Blueprint $table) {
                if (! Schema::hasColumn('manual_attendance_request_shifts', 'before_captured_at')) {
                    $table->timestamp('before_captured_at')->nullable();
                }
                if (! Schema::hasColumn('manual_attendance_request_shifts', 'after_captured_at')) {
                    $table->timestamp('after_captured_at')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('janitorial_leaders') && Schema::hasColumn('janitorial_leaders', 'is_present')) {
            Schema::table('janitorial_leaders', function (Blueprint $table) {
                $table->dropColumn('is_present');
            });
        }

        if (Schema::hasTable('manual_attendance_request_shifts')) {
            Schema::table('manual_attendance_request_shifts', function (Blueprint $table) {
                if (Schema::hasColumn('manual_attendance_request_shifts', 'before_captured_at')) {
                    $table->dropColumn('before_captured_at');
                }
                if (Schema::hasColumn('manual_attendance_request_shifts', 'after_captured_at')) {
                    $table->dropColumn('after_captured_at');
                }
            });
        }
    }
};
