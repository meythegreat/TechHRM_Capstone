<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->string('source')->default('portal')->after('status');
        });

        $applications = DB::table('applications')->get(['id', 'user_id', 'created_at']);
        foreach ($applications as $application) {
            $source = 'portal';
            if ($application->user_id === null) {
                $source = 'website';
            } else {
                $userCreated = DB::table('users')->where('id', $application->user_id)->value('created_at');
                if ($userCreated && $application->created_at && strtotime((string) $userCreated) > strtotime((string) $application->created_at) + 60) {
                    $source = 'website';
                }
            }
            DB::table('applications')->where('id', $application->id)->update(['source' => $source]);
        }
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->dropColumn('source');
        });
    }
};
