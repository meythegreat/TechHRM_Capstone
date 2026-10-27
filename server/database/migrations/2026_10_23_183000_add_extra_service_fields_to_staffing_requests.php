<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('staffing_requests', function (Blueprint $table) {
            $table->string('event_title')->nullable()->after('duty_request');
            $table->text('duty_period')->nullable()->after('event_title');
            $table->text('reason')->nullable()->after('duty_period');
            $table->string('approval_letter_path')->nullable()->after('reason');
        });
    }

    public function down(): void
    {
        Schema::table('staffing_requests', function (Blueprint $table) {
            $table->dropColumn(['event_title', 'duty_period', 'reason', 'approval_letter_path']);
        });
    }
};
