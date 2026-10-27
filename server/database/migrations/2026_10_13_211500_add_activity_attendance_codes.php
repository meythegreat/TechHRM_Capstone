<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rendered_hour_events', function (Blueprint $table) {
            $table->time('starts_at')->nullable();
        });

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE daily_tokens MODIFY type VARCHAR(40) NOT NULL');
        } else {
            DB::statement('ALTER TABLE daily_tokens DROP CONSTRAINT IF EXISTS daily_tokens_type_check');
            DB::statement('ALTER TABLE daily_tokens ALTER COLUMN type TYPE VARCHAR(40)');
        }

        Schema::table('daily_tokens', function (Blueprint $table) {
            $table->foreignId('event_id')->nullable()->constrained('rendered_hour_events')->nullOnDelete();
        });

        Schema::table('attendances', function (Blueprint $table) {
            $table->foreignId('rendered_hour_event_id')->nullable()->constrained('rendered_hour_events')->nullOnDelete();
            $table->decimal('activity_hours', 8, 2)->nullable();
        });

        Schema::table('rendered_hour_entries', function (Blueprint $table) {
            $table->foreignId('attendance_id')->nullable()->constrained('attendances')->nullOnDelete();
        });

        DB::table('rendered_hour_events')
            ->where('kind', 'daily_cleaning')
            ->update([
                'hours' => 1,
                'starts_at' => DB::raw("COALESCE(starts_at, '05:00:00')"),
                'valid_until' => DB::raw("COALESCE(valid_until, '06:00:00')"),
            ]);

        $dailyIds = DB::table('rendered_hour_events')->where('kind', 'daily_cleaning')->pluck('id');
        if ($dailyIds->isNotEmpty()) {
            DB::table('rendered_hour_entries')->whereIn('event_id', $dailyIds)->where('status', 'on_time')->update(['hours_delta' => 1]);
            DB::table('rendered_hour_entries')->whereIn('event_id', $dailyIds)->where('status', 'absent')->update(['hours_delta' => -1]);
            DB::table('rendered_hour_entries')->whereIn('event_id', $dailyIds)->where('status', 'late')->update(['hours_delta' => 0]);
        }
    }

    public function down(): void
    {
        Schema::table('rendered_hour_entries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('attendance_id');
        });

        Schema::table('attendances', function (Blueprint $table) {
            $table->dropConstrainedForeignId('rendered_hour_event_id');
            $table->dropColumn('activity_hours');
        });

        Schema::table('daily_tokens', function (Blueprint $table) {
            $table->dropConstrainedForeignId('event_id');
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE daily_tokens MODIFY type ENUM('Daily Clock', 'Cleaning', 'Meeting') NOT NULL");
        }

        Schema::table('rendered_hour_events', function (Blueprint $table) {
            $table->dropColumn('starts_at');
        });
    }
};
