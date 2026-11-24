<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('janitorial_supervisor_absences')) {
            return;
        }

        Schema::create('janitorial_supervisor_absences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('absent_on');
            $table->string('reason', 500);
            $table->string('status', 20)->default('Pending');
            $table->text('decision_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'absent_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('janitorial_supervisor_absences');
    }
};
