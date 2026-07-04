<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('applications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade'); // The student applying

            // 1. Application Details
            $table->string('preferred_department')->nullable();
            $table->json('available_schedules')->nullable(); // Store Mon/Wed/Fri availability
            $table->text('reason_for_applying')->nullable();

            // 2. Workflow Status
            $table->enum('status', [
                'Pending',
                'Interview',
                'Training',
                'For Result',
                'Approved',
                'Rejected'
            ])->default('Pending');

            // 3. Interview Scheduling
            $table->dateTime('interview_date')->nullable();
            $table->text('interview_remarks')->nullable();

            // 4. Automated Placement / Final Assignment
            $table->string('assigned_department')->nullable();
            $table->string('assigned_position')->nullable();

            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('applications');
    }
};
