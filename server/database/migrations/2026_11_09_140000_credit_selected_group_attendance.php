<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Members placed on a group activity without a scan or an absent/late mark
     * receive that meeting's hours.
     */
    public function up(): void
    {
        if (!Schema::hasTable('rendered_hour_events') || !Schema::hasTable('rendered_hour_entries')) {
            return;
        }

        $events = DB::table('rendered_hour_events')
            ->whereNotNull('group_id')
            ->where('kind', '!=', 'special_request')
            ->get(['id', 'hours']);

        foreach ($events as $event) {
            $hours = round((float) $event->hours, 2);
            DB::table('rendered_hour_entries')
                ->where('event_id', $event->id)
                ->where(function ($query) {
                    $query->whereNull('status')->orWhere('status', 'selected');
                })
                ->update([
                    'status' => 'selected',
                    'hours_delta' => $hours,
                ]);
        }
    }

    public function down(): void
    {
        // Awarded group hours are kept.
    }
};
