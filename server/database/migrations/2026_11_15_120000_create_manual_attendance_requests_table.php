<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manual_attendance_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('reason', 1000)->default('Office had no internet; submitted for supervisor approval.');
            $table->string('status', 20)->default('Pending');
            $table->text('decision_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index(['status', 'created_at']);
        });

        Schema::create('manual_attendance_request_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('manual_attendance_request_id')
                ->constrained('manual_attendance_requests')
                ->cascadeOnDelete();
            $table->date('work_date');
            $table->string('time_in', 5);
            $table->string('time_out', 5);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->foreignId('attendance_id')->nullable()->constrained('attendances')->nullOnDelete();
            $table->timestamps();

            $table->index('manual_attendance_request_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manual_attendance_request_shifts');
        Schema::dropIfExists('manual_attendance_requests');
    }
};
