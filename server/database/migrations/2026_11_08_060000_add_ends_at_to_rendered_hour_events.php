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
            $table->time('ends_at')->nullable()->after('starts_at');
        });

        // Backfill a sensible end time from start + credited hours when possible.
        $events = DB::table('rendered_hour_events')
            ->whereNotNull('starts_at')
            ->whereNull('ends_at')
            ->where('kind', '!=', 'special_request')
            ->get(['id', 'starts_at', 'hours']);

        foreach ($events as $event) {
            $start = substr((string) $event->starts_at, 0, 5);
            $minutes = (int) round(((float) $event->hours) * 60);
            if ($minutes < 30) {
                $minutes = 60;
            }
            $end = \Carbon\Carbon::createFromFormat('H:i', $start)->addMinutes($minutes)->format('H:i:s');
            DB::table('rendered_hour_events')->where('id', $event->id)->update(['ends_at' => $end]);
        }
    }

    public function down(): void
    {
        Schema::table('rendered_hour_events', function (Blueprint $table) {
            $table->dropColumn('ends_at');
        });
    }
};
