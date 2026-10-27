<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('campus_settings', function (Blueprint $table) {
            $table->decimal('weekly_standard_hours', 8, 2)->default(20)->after('hourly_rate');
            $table->decimal('weekly_extended_hours', 8, 2)->default(25)->after('weekly_standard_hours');
            $table->decimal('monthly_max_hours', 8, 2)->default(100)->after('weekly_extended_hours');
        });
    }

    public function down(): void
    {
        Schema::table('campus_settings', function (Blueprint $table) {
            $table->dropColumn([
                'weekly_standard_hours',
                'weekly_extended_hours',
                'monthly_max_hours',
            ]);
        });
    }
};
