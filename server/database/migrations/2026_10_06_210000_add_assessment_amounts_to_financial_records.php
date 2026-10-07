<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('financial_records', function (Blueprint $table) {
            if (!Schema::hasColumn('financial_records', 'estimated_acquired_amount')) {
                $table->decimal('estimated_acquired_amount', 10, 2)->default(0)->after('hourly_rate');
            }
            if (!Schema::hasColumn('financial_records', 'allowances')) {
                $table->decimal('allowances', 10, 2)->default(0)->after('estimated_acquired_amount');
            }
            if (!Schema::hasColumn('financial_records', 'adjustment_breakdown')) {
                $table->json('adjustment_breakdown')->nullable()->after('notes');
            }
            if (!Schema::hasColumn('financial_records', 'processed_by')) {
                $table->foreignId('processed_by')->nullable()->after('adjustment_breakdown')->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('financial_records', 'locked_at')) {
                $table->timestamp('locked_at')->nullable()->after('processed_by');
            }
        });
    }

    public function down(): void
    {
        Schema::table('financial_records', function (Blueprint $table) {
            if (Schema::hasColumn('financial_records', 'processed_by')) {
                $table->dropConstrainedForeignId('processed_by');
            }
            foreach (['locked_at', 'adjustment_breakdown', 'allowances', 'estimated_acquired_amount'] as $column) {
                if (Schema::hasColumn('financial_records', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
