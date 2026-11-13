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
        // Task management was removed. This migration only drops a leftover table.
    }
};
