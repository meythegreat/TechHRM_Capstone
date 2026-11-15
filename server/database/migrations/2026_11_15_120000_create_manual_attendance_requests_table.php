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
            Schema::create('manual_attendance_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('reason', 1000)->default('Office had no internet; submitted for supervisor approval.');
                $table->string('status', 20)->default('Pending');
                $table->text('decision_note')->nullable();
                $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('reviewed_at')->nullable();
                $table->timestamps();

                $table->index(['user_id', 'status'], 'mar_user_status_idx');
                $table->index(['status', 'created_at'], 'mar_status_created_idx');
            });
        }

        if (! Schema::hasTable('manual_attendance_request_shifts')) {
            Schema::create('manual_attendance_request_shifts', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('manual_attendance_request_id');
                $table->date('work_date');
                $table->string('time_in', 5);
                $table->string('time_out', 5);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->unsignedBigInteger('attendance_id')->nullable();
                $table->timestamps();

                $table->index('manual_attendance_request_id', 'mars_request_id_idx');
                $table->foreign('manual_attendance_request_id', 'mars_request_id_fk')
                    ->references('id')
                    ->on('manual_attendance_requests')
                    ->cascadeOnDelete();
                $table->foreign('attendance_id', 'mars_attendance_id_fk')
                    ->references('id')
                    ->on('attendances')
                    ->nullOnDelete();
            });

            return;
        }

        // Partial apply: shifts table exists but short-named FKs may be missing.
        Schema::table('manual_attendance_request_shifts', function (Blueprint $table) {
            if (! $this->hasIndex('manual_attendance_request_shifts', 'mars_request_id_idx')
                && ! $this->hasIndex('manual_attendance_request_shifts', 'manual_attendance_request_shifts_manual_attendance_request_id_index')
            ) {
                $table->index('manual_attendance_request_id', 'mars_request_id_idx');
            }

            if (! $this->hasForeignKey('manual_attendance_request_shifts', 'mars_request_id_fk')) {
                $table->foreign('manual_attendance_request_id', 'mars_request_id_fk')
                    ->references('id')
                    ->on('manual_attendance_requests')
                    ->cascadeOnDelete();
            }

            if (! $this->hasForeignKey('manual_attendance_request_shifts', 'mars_attendance_id_fk')) {
                $table->foreign('attendance_id', 'mars_attendance_id_fk')
                    ->references('id')
                    ->on('attendances')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manual_attendance_request_shifts');
        Schema::dropIfExists('manual_attendance_requests');
    }

    private function hasForeignKey(string $table, string $name): bool
    {
        return $this->constraintExists($table, $name, 'FOREIGN KEY');
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

        return $this->constraintExists($table, $name, 'INDEX')
            || $this->mysqlIndexExists($table, $name);
    }

    private function constraintExists(string $table, string $name, string $type): bool
    {
        $connection = Schema::getConnection();
        if ($connection->getDriverName() === 'sqlite') {
            return false;
        }

        $database = $connection->getDatabaseName();
        $rows = $connection->select(
            'select CONSTRAINT_NAME from information_schema.TABLE_CONSTRAINTS
             where CONSTRAINT_SCHEMA = ? and TABLE_NAME = ? and CONSTRAINT_NAME = ? and CONSTRAINT_TYPE = ?',
            [$database, $table, $name, $type]
        );

        return $rows !== [];
    }

    private function mysqlIndexExists(string $table, string $name): bool
    {
        $connection = Schema::getConnection();
        if ($connection->getDriverName() !== 'mysql') {
            return false;
        }

        $database = $connection->getDatabaseName();
        $rows = $connection->select(
            'select INDEX_NAME from information_schema.STATISTICS
             where TABLE_SCHEMA = ? and TABLE_NAME = ? and INDEX_NAME = ?
             limit 1',
            [$database, $table, $name]
        );

        return $rows !== [];
    }
};
