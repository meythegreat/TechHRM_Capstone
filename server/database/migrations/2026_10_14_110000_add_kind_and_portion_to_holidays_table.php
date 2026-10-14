<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('holidays', function (Blueprint $table) {
            $table->dropUnique('holidays_date_unique');
            $table->string('kind', 20)->default('holiday')->after('name');
            $table->string('portion', 10)->default('full')->after('kind');
        });
    }

    public function down(): void
    {
        Schema::table('holidays', function (Blueprint $table) {
            $table->dropColumn(['kind', 'portion']);
            $table->unique('date');
        });
    }
};
