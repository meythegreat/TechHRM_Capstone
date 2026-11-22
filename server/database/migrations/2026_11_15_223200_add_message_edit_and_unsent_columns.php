<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Local databases created the messages table before edited_at / unsent_at
 * were added to the original chat migration, so those columns never landed.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('messages')) {
            return;
        }

        if (! Schema::hasColumn('messages', 'edited_at')) {
            $after = Schema::hasColumn('messages', 'delivered_at') ? 'delivered_at' : 'read_at';
            Schema::table('messages', function (Blueprint $table) use ($after) {
                $table->timestamp('edited_at')->nullable()->after($after);
            });
        }

        if (! Schema::hasColumn('messages', 'unsent_at')) {
            Schema::table('messages', function (Blueprint $table) {
                $table->timestamp('unsent_at')->nullable()->after('edited_at');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('messages')) {
            return;
        }

        if (Schema::hasColumn('messages', 'unsent_at')) {
            Schema::table('messages', function (Blueprint $table) {
                $table->dropColumn('unsent_at');
            });
        }

        if (Schema::hasColumn('messages', 'edited_at')) {
            Schema::table('messages', function (Blueprint $table) {
                $table->dropColumn('edited_at');
            });
        }
    }
};
