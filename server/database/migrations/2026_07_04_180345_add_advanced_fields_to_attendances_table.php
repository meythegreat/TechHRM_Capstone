<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->enum('attendance_type', ['Regular', 'Cleaning', 'Meeting'])->default('Regular')->after('user_id');
            $table->string('verification_code_used')->nullable()->after('attendance_type');
            $table->decimal('computed_hours', 5, 2)->default(0.00)->after('rendered_hours');
            $table->boolean('is_anomaly')->default(false)->after('computed_hours');
            $table->string('anomaly_reason')->nullable()->after('is_anomaly');
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn([
                'attendance_type',
                'verification_code_used',
                'computed_hours',
                'is_anomaly',
                'anomaly_reason',
            ]);
        });
    }
};
