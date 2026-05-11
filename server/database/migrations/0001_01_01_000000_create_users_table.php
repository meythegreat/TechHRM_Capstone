<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('fullname');
            $table->string('username')->unique();
            $table->string('password');
            // $table->foreignId('department_id')->constrained()->onDelete('cascade');
            $table->enum('role', ['Admin', 'User'])->default('User');
            $table->rememberToken();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
