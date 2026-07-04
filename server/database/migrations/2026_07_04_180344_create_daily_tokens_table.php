<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('token_code');
            $table->enum('type', ['Daily Clock', 'Cleaning', 'Meeting']);
            $table->string('description')->nullable();
            $table->foreignId('generated_by')->constrained('users');
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_tokens');
    }
};
