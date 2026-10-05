<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('disciplinary_records', function (Blueprint $table) {
            if (!Schema::hasColumn('disciplinary_records', 'suspension_length')) {
                $table->string('suspension_length')->nullable()->after('penalty');
            }
            if (!Schema::hasColumn('disciplinary_records', 'suspension_ends_at')) {
                $table->timestamp('suspension_ends_at')->nullable()->after('suspension_length');
            }
            if (!Schema::hasColumn('disciplinary_records', 'suspension_reason')) {
                $table->text('suspension_reason')->nullable()->after('suspension_ends_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('disciplinary_records', function (Blueprint $table) {
            $columns = array_filter([
                Schema::hasColumn('disciplinary_records', 'suspension_reason') ? 'suspension_reason' : null,
                Schema::hasColumn('disciplinary_records', 'suspension_ends_at') ? 'suspension_ends_at' : null,
                Schema::hasColumn('disciplinary_records', 'suspension_length') ? 'suspension_length' : null,
            ]);

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
