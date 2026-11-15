<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hot-path indexes for burst login / clock-in traffic.
 * token_code was previously unindexed (table scan on every secure clock).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('daily_tokens')) {
            Schema::table('daily_tokens', function (Blueprint $table) {
                $table->index('token_code', 'daily_tokens_token_code_idx');
            });
        }

        if (Schema::hasTable('attendances')) {
            Schema::table('attendances', function (Blueprint $table) {
                // Active-shift lookups: user_id + time_out IS NULL (+ rendered_hour_event_id).
                $table->index(['user_id', 'time_out'], 'attendances_user_time_out_idx');
                $table->index(['user_id', 'time_in'], 'attendances_user_time_in_idx');
            });
        }

        if (Schema::hasTable('schedules') && Schema::hasColumn('schedules', 'kind')) {
            Schema::table('schedules', function (Blueprint $table) {
                $table->index(['user_id', 'kind', 'day'], 'schedules_user_kind_day_idx');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('daily_tokens')) {
            Schema::table('daily_tokens', function (Blueprint $table) {
                $table->dropIndex('daily_tokens_token_code_idx');
            });
        }

        if (Schema::hasTable('attendances')) {
            Schema::table('attendances', function (Blueprint $table) {
                $table->dropIndex('attendances_user_time_out_idx');
                $table->dropIndex('attendances_user_time_in_idx');
            });
        }

        if (Schema::hasTable('schedules') && Schema::hasColumn('schedules', 'kind')) {
            Schema::table('schedules', function (Blueprint $table) {
                $table->dropIndex('schedules_user_kind_day_idx');
            });
        }
    }
};
