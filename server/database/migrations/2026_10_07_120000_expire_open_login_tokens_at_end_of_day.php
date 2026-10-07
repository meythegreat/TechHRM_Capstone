<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Sessions issued before the daily cutoff have no expiry.
     * End those still-open logins at 11:59 PM today as well.
     */
    public function up(): void
    {
        DB::table('personal_access_tokens')
            ->whereNull('expires_at')
            ->update([
                'expires_at' => now()->setTime(23, 59, 59),
            ]);
    }

    public function down(): void
    {
        DB::table('personal_access_tokens')
            ->whereDate('expires_at', now()->toDateString())
            ->whereTime('expires_at', '23:59:59')
            ->update([
                'expires_at' => null,
            ]);
    }
};
