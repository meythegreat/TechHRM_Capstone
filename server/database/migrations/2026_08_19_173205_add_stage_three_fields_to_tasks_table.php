<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE tasks MODIFY status ENUM('Pending', 'Assigned', 'In Progress', 'Completed', 'Verified') DEFAULT 'Pending'");

        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'task_type')) {
                $table->enum('task_type', ['Routine', 'Special Project'])->default('Routine')->after('description');
            }

            if (!Schema::hasColumn('tasks', 'priority')) {
                $table->enum('priority', ['Low', 'Medium', 'High'])->default('Medium')->after('task_type');
            }

            if (!Schema::hasColumn('tasks', 'evaluation_notes')) {
                $table->text('evaluation_notes')->nullable()->after('supervisor_notes');
            }
        });
    }

    public function down(): void
    {
        DB::table('tasks')->where('status', 'Verified')->update(['status' => 'Completed']);
        DB::table('tasks')->where('status', 'Assigned')->update(['status' => 'Pending']);
        DB::statement("ALTER TABLE tasks MODIFY status ENUM('Pending', 'In Progress', 'Completed') DEFAULT 'Pending'");

        Schema::table('tasks', function (Blueprint $table) {
            $columns = array_filter([
                Schema::hasColumn('tasks', 'evaluation_notes') ? 'evaluation_notes' : null,
                Schema::hasColumn('tasks', 'priority') ? 'priority' : null,
                Schema::hasColumn('tasks', 'task_type') ? 'task_type' : null,
            ]);

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
