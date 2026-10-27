<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('staffing_requests', function (Blueprint $table) {
            $table->date('duty_start_date')->nullable()->after('duty_period');
            $table->date('duty_end_date')->nullable()->after('duty_start_date');
            $table->decimal('hours_per_day', 4, 1)->nullable()->after('duty_end_date');
        });
    }

    public function down(): void
    {
        Schema::table('staffing_requests', function (Blueprint $table) {
            $table->dropColumn(['duty_start_date', 'duty_end_date', 'hours_per_day']);
        });
    }
};
