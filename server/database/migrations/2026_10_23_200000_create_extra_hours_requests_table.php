<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('extra_hours_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->string('department');
            $table->string('requester_title')->nullable();
            $table->text('duty_description');
            $table->string('period_label');
            $table->date('period_start');
            $table->date('period_end');
            $table->decimal('approved_hours', 8, 2)->default(25);
            $table->string('status', 20)->default('Draft');
            $table->string('approval_letter_path')->nullable();
            $table->text('decision_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'period_start', 'period_end']);
        });

        Schema::create('extra_hours_request_students', function (Blueprint $table) {
            $table->id();
            $table->foreignId('extra_hours_request_id')->constrained('extra_hours_requests')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['extra_hours_request_id', 'user_id'], 'extra_hours_request_student_unique');
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('extra_hours_request_students');
        Schema::dropIfExists('extra_hours_requests');
    }
};
