<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('disciplinary_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('issued_by')->constrained('users');

            $table->string('violation_type');
            $table->text('description');
            $table->decimal('penalty_hours', 5, 2)->default(0.00);

            $table->enum('status', ['Active', 'Pending Appeal', 'Resolved', 'Dismissed'])->default('Active');

            $table->text('appeal_notes')->nullable();
            $table->dateTime('resolved_at')->nullable();
            $table->text('resolution_remarks')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('disciplinary_records');
    }
};
