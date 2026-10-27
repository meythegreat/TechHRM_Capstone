<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('holidays', function (Blueprint $table) {
            $table->date('end_date')->nullable()->after('date');
        });

        $dateColumn = Schema::getConnection()->getQueryGrammar()->wrap('date');
        DB::table('holidays')->whereNull('end_date')->update([
            'end_date' => DB::raw($dateColumn),
        ]);
    }

    public function down(): void
    {
        Schema::table('holidays', function (Blueprint $table) {
            $table->dropColumn('end_date');
        });
    }
};
