<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            if (! Schema::hasColumn('attendances', 'cleaning_before_path')) {
                $table->string('cleaning_before_path', 500)->nullable()->after('janitorial_area');
            }
            if (! Schema::hasColumn('attendances', 'cleaning_after_path')) {
                $table->string('cleaning_after_path', 500)->nullable()->after('cleaning_before_path');
            }
            if (! Schema::hasColumn('attendances', 'cleaning_before_captured_at')) {
                $table->timestamp('cleaning_before_captured_at')->nullable()->after('cleaning_after_path');
            }
            if (! Schema::hasColumn('attendances', 'cleaning_after_captured_at')) {
                $table->timestamp('cleaning_after_captured_at')->nullable()->after('cleaning_before_captured_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            foreach ([
                'cleaning_before_path',
                'cleaning_after_path',
                'cleaning_before_captured_at',
                'cleaning_after_captured_at',
            ] as $column) {
                if (Schema::hasColumn('attendances', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
