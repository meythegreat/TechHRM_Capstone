<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_cleaning_group_members', function (Blueprint $table) {
            $table->boolean('is_leader')->default(false);
        });

        Schema::table('attendances', function (Blueprint $table) {
            $table->foreignId('schedule_id')->nullable()->constrained('schedules')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropConstrainedForeignId('schedule_id');
        });

        Schema::table('daily_cleaning_group_members', function (Blueprint $table) {
            $table->dropColumn('is_leader');
        });
    }
};
