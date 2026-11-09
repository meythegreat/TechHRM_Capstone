<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Group attendance awards the meeting's hours only to members who scanned on time.
     * Absent and late marks award nothing. Existing group rows are rewritten to match.
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
            $entries = DB::table('rendered_hour_entries')->where('event_id', $event->id)->get();
            foreach ($entries as $entry) {
                $delta = $entry->status === 'on_time' ? round((float) $event->hours, 2) : 0;
                DB::table('rendered_hour_entries')->where('id', $entry->id)->update([
                    'hours_delta' => $delta,
                ]);

                if (!$entry->attendance_id || !Schema::hasTable('attendances')) {
                    continue;
                }

                $reason = match ($entry->status) {
                    'late' => 'Clocked in after the on-time window. No hours were added.',
                    'absent' => 'Marked absent. No meeting hours were awarded.',
                    default => null,
                };

                DB::table('attendances')->where('id', $entry->attendance_id)->update([
                    'activity_hours' => $delta,
                    'is_anomaly' => in_array($entry->status, ['late', 'absent'], true),
                    'anomaly_reason' => $reason,
                ]);
            }
        }
    }

    public function down(): void
    {
        // Point awards are not restored to the previous deduction rules.
    }
};
