<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('disciplinary_records', function (Blueprint $table) {
            if (!Schema::hasColumn('disciplinary_records', 'incident_date')) {
                $table->date('incident_date')->nullable()->after('violation_type');
            }

            if (!Schema::hasColumn('disciplinary_records', 'penalty')) {
                $table->string('penalty')->default('Warning')->after('penalty_hours');
            }

            if (!Schema::hasColumn('disciplinary_records', 'deduction_amount')) {
                $table->decimal('deduction_amount', 8, 2)->default(0.00)->after('penalty');
            }
        });
    }

    public function down(): void
    {
        Schema::table('disciplinary_records', function (Blueprint $table) {
            $columns = array_filter([
                Schema::hasColumn('disciplinary_records', 'deduction_amount') ? 'deduction_amount' : null,
                Schema::hasColumn('disciplinary_records', 'penalty') ? 'penalty' : null,
                Schema::hasColumn('disciplinary_records', 'incident_date') ? 'incident_date' : null,
            ]);

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
