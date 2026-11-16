<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('janitorial_leaders')) {
            Schema::create('janitorial_leaders', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('janitorial_groups')) {
            return;
        }

        $indexes = Schema::getIndexes('janitorial_groups');
        $hasNameUnique = collect($indexes)->contains(
            fn (array $index) => ($index['name'] ?? '') === 'jg_department_name_uq'
        );
        if ($hasNameUnique) {
            Schema::table('janitorial_groups', function (Blueprint $table) {
                $table->dropUnique('jg_department_name_uq');
            });
        }

        $now = now();
        $supervisorIds = DB::table('janitorial_groups')->distinct()->pluck('supervisor_user_id');
        foreach ($supervisorIds as $userId) {
            $exists = DB::table('janitorial_leaders')->where('user_id', $userId)->exists();
            if (! $exists && $userId) {
                DB::table('janitorial_leaders')->insert([
                    'user_id' => $userId,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('janitorial_leaders');
    }
};
