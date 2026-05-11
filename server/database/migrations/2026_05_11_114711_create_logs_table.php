<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('logs', function (Blueprint $table) {
            $table->id();

            // Link to the users table and cascade on delete
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');

            $table->string('activity');

            // Laravel's built-in timestamps can handle the timestamp requirement
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('logs');
    }
};
