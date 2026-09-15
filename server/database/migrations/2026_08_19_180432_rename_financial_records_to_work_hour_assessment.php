<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('financial_records')) {
            return;
        }

        if (Schema::hasColumn('financial_records', 'gross_compensation')) {
            Schema::table('financial_records', function (Blueprint $table) {
                $table->renameColumn('gross_compensation', 'estimated_gross_amount');
            });
        }

        if (Schema::hasColumn('financial_records', 'deductions')) {
            Schema::table('financial_records', function (Blueprint $table) {
                $table->renameColumn('deductions', 'penalty_deductions');
            });
        }

        if (Schema::hasColumn('financial_records', 'net_compensation')) {
            Schema::table('financial_records', function (Blueprint $table) {
                $table->renameColumn('net_compensation', 'equivalent_total_amount');
            });
        }

        if (Schema::hasColumn('financial_records', 'status')) {
            DB::table('financial_records')
                ->where('status', 'Credited')
                ->update(['status' => 'Forwarded to Finance']);

            DB::statement("ALTER TABLE financial_records MODIFY status ENUM('Draft', 'Approved', 'Locked', 'Forwarded to Finance') NOT NULL DEFAULT 'Draft'");
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('financial_records')) {
            return;
        }

        DB::table('financial_records')
            ->where('status', 'Forwarded to Finance')
            ->update(['status' => 'Credited']);

        DB::statement("ALTER TABLE financial_records MODIFY status ENUM('Draft', 'Approved', 'Locked', 'Credited') NOT NULL DEFAULT 'Draft'");

        if (Schema::hasColumn('financial_records', 'estimated_gross_amount')) {
            Schema::table('financial_records', function (Blueprint $table) {
                $table->renameColumn('estimated_gross_amount', 'gross_compensation');
            });
        }

        if (Schema::hasColumn('financial_records', 'penalty_deductions')) {
            Schema::table('financial_records', function (Blueprint $table) {
                $table->renameColumn('penalty_deductions', 'deductions');
            });
        }

        if (Schema::hasColumn('financial_records', 'equivalent_total_amount')) {
            Schema::table('financial_records', function (Blueprint $table) {
                $table->renameColumn('equivalent_total_amount', 'net_compensation');
            });
        }
    }
};
