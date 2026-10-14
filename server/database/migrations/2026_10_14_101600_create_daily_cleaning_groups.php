<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_cleaning_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('daily_cleaning_group_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained('daily_cleaning_groups')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->unique('user_id');
        });

        Schema::table('rendered_hour_events', function (Blueprint $table) {
            $table->foreignId('group_id')->nullable()->after('group_name')->constrained('daily_cleaning_groups')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('rendered_hour_events', function (Blueprint $table) {
            $table->dropConstrainedForeignId('group_id');
        });
        Schema::dropIfExists('daily_cleaning_group_members');
        Schema::dropIfExists('daily_cleaning_groups');
    }
};
