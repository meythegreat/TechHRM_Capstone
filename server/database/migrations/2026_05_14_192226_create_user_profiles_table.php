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
        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            // This links the profile directly to the main User account
            $table->foreignId('user_id')->constrained()->onDelete('cascade');

            $table->string('student_id_number')->nullable();
            $table->string('course')->nullable();
            $table->integer('year_level')->nullable();
            $table->string('assigned_office')->nullable();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_profiles');
    }
};
