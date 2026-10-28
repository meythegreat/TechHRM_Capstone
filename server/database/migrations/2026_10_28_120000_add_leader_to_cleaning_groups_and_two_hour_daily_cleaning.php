<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_cleaning_groups', function (Blueprint $table) {
            $table->foreignId('leader_id')->nullable()->after('name')->constrained('users')->nullOnDelete();
        });

        DB::table('rendered_hour_events')
            ->where('kind', 'daily_cleaning')
            ->update(['hours' => 2]);

        $dailyIds = DB::table('rendered_hour_events')->where('kind', 'daily_cleaning')->pluck('id');
        if ($dailyIds->isNotEmpty()) {
            DB::table('rendered_hour_entries')->whereIn('event_id', $dailyIds)->where('status', 'on_time')->update(['hours_delta' => 2]);
            DB::table('rendered_hour_entries')->whereIn('event_id', $dailyIds)->where('status', 'absent')->update(['hours_delta' => -2]);
            DB::table('rendered_hour_entries')->whereIn('event_id', $dailyIds)->where('status', 'late')->update(['hours_delta' => 0]);
        }
    }

    public function down(): void
    {
        DB::table('rendered_hour_events')
            ->where('kind', 'daily_cleaning')
            ->update(['hours' => 1]);

        $dailyIds = DB::table('rendered_hour_events')->where('kind', 'daily_cleaning')->pluck('id');
        if ($dailyIds->isNotEmpty()) {
            DB::table('rendered_hour_entries')->whereIn('event_id', $dailyIds)->where('status', 'on_time')->update(['hours_delta' => 1]);
            DB::table('rendered_hour_entries')->whereIn('event_id', $dailyIds)->where('status', 'absent')->update(['hours_delta' => -1]);
            DB::table('rendered_hour_entries')->whereIn('event_id', $dailyIds)->where('status', 'late')->update(['hours_delta' => 0]);
        }

        Schema::table('daily_cleaning_groups', function (Blueprint $table) {
            $table->dropConstrainedForeignId('leader_id');
        });
    }
};
