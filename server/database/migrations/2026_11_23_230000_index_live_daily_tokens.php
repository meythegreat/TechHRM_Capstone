<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_tokens', function (Blueprint $table) {
            $table->index(
                ['type', 'channel', 'generated_by', 'expires_at'],
                'daily_tokens_live_lookup_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('daily_tokens', function (Blueprint $table) {
            $table->dropIndex('daily_tokens_live_lookup_idx');
        });
    }
};
