<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            if (! Schema::hasColumn('attendances', 'janitorial_group_id')) {
                $table->unsignedBigInteger('janitorial_group_id')->nullable()->after('schedule_id');
            }
            if (! Schema::hasColumn('attendances', 'janitorial_area')) {
                $table->string('janitorial_area', 120)->nullable()->after('janitorial_group_id');
            }
        });

        Schema::table('attendances', function (Blueprint $table) {
            if (
                Schema::hasColumn('attendances', 'janitorial_group_id')
                && ! $this->hasForeignKey('attendances', 'att_janitorial_group_fk')
            ) {
                $table->foreign('janitorial_group_id', 'att_janitorial_group_fk')
                    ->references('id')
                    ->on('janitorial_groups')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            if ($this->hasForeignKey('attendances', 'att_janitorial_group_fk')) {
                $table->dropForeign('att_janitorial_group_fk');
            }
            if (Schema::hasColumn('attendances', 'janitorial_area')) {
                $table->dropColumn('janitorial_area');
            }
            if (Schema::hasColumn('attendances', 'janitorial_group_id')) {
                $table->dropColumn('janitorial_group_id');
            }
        });
    }

    private function hasForeignKey(string $table, string $name): bool
    {
        $connection = Schema::getConnection();
        if ($connection->getDriverName() === 'sqlite') {
            return false;
        }

        $database = $connection->getDatabaseName();
        $rows = $connection->select(
            'select CONSTRAINT_NAME from information_schema.TABLE_CONSTRAINTS
             where CONSTRAINT_SCHEMA = ? and TABLE_NAME = ? and CONSTRAINT_NAME = ? and CONSTRAINT_TYPE = ?',
            [$database, $table, $name, 'FOREIGN KEY']
        );

        return $rows !== [];
    }
};
