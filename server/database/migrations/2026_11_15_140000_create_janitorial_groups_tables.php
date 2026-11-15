<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('janitorial_groups')) {
            Schema::create('janitorial_groups', function (Blueprint $table) {
                $table->id();
                $table->string('department', 120);
                $table->string('name', 80);
                $table->string('area', 120);
                $table->foreignId('supervisor_user_id')->constrained('users')->cascadeOnDelete();
                $table->timestamps();

                $table->index(['department'], 'jg_department_idx');
                $table->unique(['department', 'name'], 'jg_department_name_uq');
            });
        }

        if (! Schema::hasTable('janitorial_group_members')) {
            Schema::create('janitorial_group_members', function (Blueprint $table) {
                $table->id();
                $table->foreignId('group_id')->constrained('janitorial_groups')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->timestamps();

                $table->unique(['user_id'], 'jgm_user_uq');
                $table->index(['group_id'], 'jgm_group_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('janitorial_group_members');
        Schema::dropIfExists('janitorial_groups');
    }
};
