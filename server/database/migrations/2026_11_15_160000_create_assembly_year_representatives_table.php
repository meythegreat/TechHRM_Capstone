<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('assembly_year_representatives')) {
            Schema::create('assembly_year_representatives', function (Blueprint $table) {
                $table->id();
                $table->unsignedTinyInteger('year_level');
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->timestamps();

                $table->unique('year_level', 'ayr_year_uq');
                $table->unique('user_id', 'ayr_user_uq');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('assembly_year_representatives');
    }
};
