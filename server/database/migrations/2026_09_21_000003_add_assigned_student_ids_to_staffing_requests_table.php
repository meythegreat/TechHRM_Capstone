<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('staffing_requests', function (Blueprint $table) {
            $table->json('assigned_student_ids')->nullable()->after('quantity');
        });
    }

    public function down(): void
    {
        Schema::table('staffing_requests', function (Blueprint $table) {
            $table->dropColumn('assigned_student_ids');
        });
    }
};
