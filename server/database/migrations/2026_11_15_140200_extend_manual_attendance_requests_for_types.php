<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('manual_attendance_requests', function (Blueprint $table) {
            if (! Schema::hasColumn('manual_attendance_requests', 'request_type')) {
                $table->string('request_type', 40)->default('regular')->after('user_id');
            }
        });

        Schema::table('manual_attendance_request_shifts', function (Blueprint $table) {
            if (! Schema::hasColumn('manual_attendance_request_shifts', 'janitorial_area')) {
                $table->string('janitorial_area', 120)->nullable()->after('time_out');
            }
            if (! Schema::hasColumn('manual_attendance_request_shifts', 'janitorial_group_id')) {
                $table->unsignedBigInteger('janitorial_group_id')->nullable()->after('janitorial_area');
            }
        });
    }

    public function down(): void
    {
        Schema::table('manual_attendance_request_shifts', function (Blueprint $table) {
            if (Schema::hasColumn('manual_attendance_request_shifts', 'janitorial_group_id')) {
                $table->dropColumn('janitorial_group_id');
            }
            if (Schema::hasColumn('manual_attendance_request_shifts', 'janitorial_area')) {
                $table->dropColumn('janitorial_area');
            }
        });

        Schema::table('manual_attendance_requests', function (Blueprint $table) {
            if (Schema::hasColumn('manual_attendance_requests', 'request_type')) {
                $table->dropColumn('request_type');
            }
        });
    }
};
