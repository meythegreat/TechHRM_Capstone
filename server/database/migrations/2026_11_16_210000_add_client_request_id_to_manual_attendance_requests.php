<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('manual_attendance_requests')) {
            return;
        }

        Schema::table('manual_attendance_requests', function (Blueprint $table) {
            if (! Schema::hasColumn('manual_attendance_requests', 'client_request_id')) {
                $table->string('client_request_id', 36)->nullable()->after('user_id');
            }
        });

        if (! $this->hasIndex('manual_attendance_requests', 'mar_user_client_req_uidx')) {
            Schema::table('manual_attendance_requests', function (Blueprint $table) {
                $table->unique(['user_id', 'client_request_id'], 'mar_user_client_req_uidx');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('manual_attendance_requests')) {
            return;
        }

        Schema::table('manual_attendance_requests', function (Blueprint $table) {
            if ($this->hasIndex('manual_attendance_requests', 'mar_user_client_req_uidx')) {
                $table->dropUnique('mar_user_client_req_uidx');
            }
            if (Schema::hasColumn('manual_attendance_requests', 'client_request_id')) {
                $table->dropColumn('client_request_id');
            }
        });
    }

    private function hasIndex(string $table, string $name): bool
    {
        $connection = Schema::getConnection();
        $driver = $connection->getDriverName();

        if ($driver === 'sqlite') {
            $rows = $connection->select('PRAGMA index_list('.$connection->getSchemaGrammar()->wrap($table).')');
            foreach ($rows as $row) {
                $row = (array) $row;
                if (($row['name'] ?? '') === $name) {
                    return true;
                }
            }

            return false;
        }

        if ($driver !== 'mysql') {
            return false;
        }

        $database = $connection->getDatabaseName();
        $rows = DB::select(
            'select INDEX_NAME from information_schema.STATISTICS
             where TABLE_SCHEMA = ? and TABLE_NAME = ? and INDEX_NAME = ?
             limit 1',
            [$database, $table, $name]
        );

        return $rows !== [];
    }
};
