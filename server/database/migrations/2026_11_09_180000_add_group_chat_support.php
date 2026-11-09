<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->string('type', 20)->default('direct')->after('id');
            $table->string('name')->nullable()->after('type');
            $table->foreignId('created_by')->nullable()->after('name')->constrained('users')->nullOnDelete();
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->dropUnique(['user_low_id', 'user_high_id']);
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->unsignedBigInteger('user_low_id')->nullable()->change();
            $table->unsignedBigInteger('user_high_id')->nullable()->change();
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->unique(['user_low_id', 'user_high_id']);
        });

        Schema::create('conversation_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('last_read_at')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamp('hidden_at')->nullable();
            $table->timestamps();

            $table->unique(['conversation_id', 'user_id']);
            $table->index(['user_id', 'conversation_id']);
            $table->index(['user_id', 'archived_at']);
            $table->index(['user_id', 'hidden_at']);
        });

        $conversations = DB::table('conversations')->select('id', 'user_low_id', 'user_high_id')->get();
        $now = now();
        foreach ($conversations as $conversation) {
            foreach ([$conversation->user_low_id, $conversation->user_high_id] as $userId) {
                if (! $userId) {
                    continue;
                }
                DB::table('conversation_participants')->insertOrIgnore([
                    'conversation_id' => $conversation->id,
                    'user_id' => $userId,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('conversation_participants');

        Schema::table('conversations', function (Blueprint $table) {
            $table->dropUnique(['user_low_id', 'user_high_id']);
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn(['type', 'name']);
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->unsignedBigInteger('user_low_id')->nullable(false)->change();
            $table->unsignedBigInteger('user_high_id')->nullable(false)->change();
            $table->unique(['user_low_id', 'user_high_id']);
        });
    }
};
