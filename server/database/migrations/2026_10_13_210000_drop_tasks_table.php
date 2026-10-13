<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('tasks');
    }

    public function down(): void
    {
        // Task Management was removed. Recreating the table is not supported.
    }
};
