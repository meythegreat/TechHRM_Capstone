<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();

            // Link to the user who is clocking in
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');

            // Timestamps for the actual shift
            $table->timestamp('time_in')->nullable();
            $table->timestamp('time_out')->nullable();

            $table->string('status')->default('Present'); // Can be used later for Late, Absent, etc.

            // To store the calculated hours worked (e.g., 4.5 hours)
            $table->decimal('rendered_hours', 5, 2)->nullable();

            // Standard Laravel created_at and updated_at
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('attendances');
    }
};
