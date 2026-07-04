<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('user_id');
            $table->string('middle_name')->nullable()->after('first_name');
            $table->string('last_name')->nullable()->after('middle_name');
            $table->integer('age')->nullable()->after('last_name');
            $table->string('address')->nullable()->after('age');
            $table->string('contact_number')->nullable()->after('address');
            $table->string('year_level')->nullable()->after('contact_number');
            $table->string('course')->nullable()->after('year_level');
            $table->string('email')->nullable()->after('course');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->dropColumn([
                'first_name',
                'middle_name',
                'last_name',
                'age',
                'address',
                'contact_number',
                'year_level',
                'course',
                'email',
            ]);
        });
    }
};
