<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->string('tracking_code', 16)->nullable()->unique()->after('source');
        });

        Schema::create('application_status_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('application_id')->constrained('applications')->cascadeOnDelete();
            $table->string('status', 32);
            $table->text('note')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
        });

        $used = [];
        $applications = DB::table('applications')->orderBy('id')->get();

        foreach ($applications as $application) {
            $code = $this->trackingCode($used);
            DB::table('applications')->where('id', $application->id)->update([
                'tracking_code' => $code,
            ]);

            $submittedAt = $application->created_at ?? now();
            $events = [
                ['status' => 'Pending', 'note' => 'Application submitted', 'occurred_at' => $submittedAt],
            ];

            $order = ['Pending', 'Interview', 'Training', 'For Result', 'Approved'];
            $index = array_search($application->status, $order, true);
            if ($index !== false && $index > 0) {
                $when = $application->status === 'Interview' && $application->interview_date
                    ? $application->interview_date
                    : ($application->updated_at ?? $submittedAt);
                $events[] = [
                    'status' => $application->status,
                    'note' => null,
                    'occurred_at' => $when,
                ];
            }

            if ($application->status === 'Approved' && !empty($application->assigned_department)) {
                $events[] = [
                    'status' => 'Assigned',
                    'note' => $application->assigned_department,
                    'occurred_at' => $application->updated_at ?? $submittedAt,
                ];
            }

            foreach ($events as $event) {
                DB::table('application_status_events')->insert([
                    'application_id' => $application->id,
                    'status' => $event['status'],
                    'note' => $event['note'],
                    'occurred_at' => $event['occurred_at'],
                    'created_at' => $event['occurred_at'],
                    'updated_at' => $event['occurred_at'],
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('application_status_events');

        Schema::table('applications', function (Blueprint $table) {
            $table->dropUnique(['tracking_code']);
            $table->dropColumn('tracking_code');
        });
    }

    private function trackingCode(array &$used): string
    {
        do {
            $code = 'WSPO-' . strtoupper(Str::random(6));
        } while (isset($used[$code]) || DB::table('applications')->where('tracking_code', $code)->exists());

        $used[$code] = true;

        return $code;
    }
};
