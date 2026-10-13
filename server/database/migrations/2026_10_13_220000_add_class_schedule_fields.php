<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schedules', function (Blueprint $table) {
            $table->string('kind')->default('work')->after('user_id');
            $table->string('subject')->nullable()->after('duty_type');
            $table->string('room')->nullable()->after('subject');
            $table->string('instructor')->nullable()->after('room');
        });
    }

    public function down(): void
    {
        Schema::table('schedules', function (Blueprint $table) {
            $table->dropColumn(['kind', 'subject', 'room', 'instructor']);
        });
    }
};
