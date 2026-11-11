<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->string('work_department')->nullable()->after('assigned_office');
            $table->boolean('organization_officer')->default(false)->after('work_department');
            $table->string('officer_position')->nullable()->after('organization_officer');
        });

        if (!Schema::hasTable('users')) {
            return;
        }

        $officerId = DB::table('users')->where('username', 'quia.felipe907')->value('id');
        if ($officerId) {
            DB::table('user_profiles')->where('user_id', $officerId)->update([
                'work_department' => 'College of Computer Studies',
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->dropColumn(['work_department', 'organization_officer', 'officer_position']);
        });
    }
};
