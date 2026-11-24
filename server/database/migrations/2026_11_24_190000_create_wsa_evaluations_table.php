<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wsa_evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('submitted_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $table->string('department');
            $table->string('semester_label');
            $table->string('school_year', 20);
            $table->date('evaluated_on');
            $table->json('ratings');
            $table->text('comments')->nullable();
            $table->string('recommendation');
            $table->string('evaluated_by_name');
            $table->string('attested_by_name');
            $table->string('evaluated_signature_path')->nullable();
            $table->string('evaluated_signature_name')->nullable();
            $table->string('attested_signature_path')->nullable();
            $table->string('attested_signature_name')->nullable();
            $table->string('status')->default('Draft');
            $table->text('decision_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['department', 'student_id', 'evaluated_on']);
            $table->index(['status', 'evaluated_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wsa_evaluations');
    }
};
