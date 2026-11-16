<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('manual_attendance_request_shifts')) {
            return;
        }

        Schema::table('manual_attendance_request_shifts', function (Blueprint $table) {
            if (! Schema::hasColumn('manual_attendance_request_shifts', 'before_photo_path')) {
                $table->string('before_photo_path', 500)->nullable();
            }
            if (! Schema::hasColumn('manual_attendance_request_shifts', 'after_photo_path')) {
                $table->string('after_photo_path', 500)->nullable();
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('manual_attendance_request_shifts')) {
            return;
        }

        Schema::table('manual_attendance_request_shifts', function (Blueprint $table) {
            if (Schema::hasColumn('manual_attendance_request_shifts', 'before_photo_path')) {
                $table->dropColumn('before_photo_path');
            }
            if (Schema::hasColumn('manual_attendance_request_shifts', 'after_photo_path')) {
                $table->dropColumn('after_photo_path');
            }
        });
    }
};
