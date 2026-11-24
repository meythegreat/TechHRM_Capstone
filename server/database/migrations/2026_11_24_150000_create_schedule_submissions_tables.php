<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schedule_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('kind'); // class | work
            $table->string('status')->default('Pending');
            $table->string('proof_path');
            $table->string('proof_name')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'kind', 'status']);
        });

        Schema::create('schedule_submission_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('schedule_submission_id')->constrained()->cascadeOnDelete();
            $table->string('day');
            $table->string('time');
            $table->string('duty_type')->nullable();
            $table->string('subject')->nullable();
            $table->string('room')->nullable();
            $table->string('instructor')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('schedule_submission_entries');
        Schema::dropIfExists('schedule_submissions');
    }
};
