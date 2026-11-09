<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->string('assignment_area')->nullable();
            $table->boolean('special_hours_request')->default(false);
            $table->json('secretary_departments')->nullable();
            $table->date('supervisor_absent_on')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->dropColumn([
                'assignment_area',
                'special_hours_request',
                'secretary_departments',
                'supervisor_absent_on',
            ]);
        });
    }
};
