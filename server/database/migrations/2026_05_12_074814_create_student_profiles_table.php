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
        Schema::create('student_profiles', function (Blueprint $table) {
            $table->id();

            // This links the profile directly to the users table
            // onDelete('cascade') means if the user is deleted, their profile is deleted too
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');

            $table->string('student_id_number')->unique();
            $table->string('course');
            $table->integer('year_level');
            $table->string('assigned_office'); // Where they are deployed on campus
            $table->string('contact_number')->nullable();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('student_profiles');
    }
};
