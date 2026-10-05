<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_tokens', function (Blueprint $table) {
            $table->enum('channel', ['passcode', 'qr'])->default('passcode')->after('type');
        });

        Schema::table('attendances', function (Blueprint $table) {
            $table->enum('check_in_method', ['passcode', 'qr'])->nullable()->after('verification_code_used');
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn('check_in_method');
        });

        Schema::table('daily_tokens', function (Blueprint $table) {
            $table->dropColumn('channel');
        });
    }
};
