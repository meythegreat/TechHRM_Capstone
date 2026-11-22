<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('janitorial_groups') && ! Schema::hasColumn('janitorial_groups', 'immediate_supervisor_user_id')) {
            Schema::table('janitorial_groups', function (Blueprint $table) {
                $table->unsignedBigInteger('immediate_supervisor_user_id')->nullable()->after('supervisor_user_id');
                $table->index('immediate_supervisor_user_id', 'jg_immediate_idx');
            });
        }

        if (Schema::hasTable('attendances')) {
            Schema::table('attendances', function (Blueprint $table) {
                if (! Schema::hasColumn('attendances', 'janitorial_leader_decision')) {
                    $table->string('janitorial_leader_decision', 20)->nullable();
                }
                if (! Schema::hasColumn('attendances', 'janitorial_deducted_hours')) {
                    $table->decimal('janitorial_deducted_hours', 8, 2)->nullable();
                }
                if (! Schema::hasColumn('attendances', 'janitorial_leader_remarks')) {
                    $table->text('janitorial_leader_remarks')->nullable();
                }
                if (! Schema::hasColumn('attendances', 'janitorial_leader_reviewed_by')) {
                    $table->unsignedBigInteger('janitorial_leader_reviewed_by')->nullable();
                }
                if (! Schema::hasColumn('attendances', 'janitorial_leader_reviewed_at')) {
                    $table->timestamp('janitorial_leader_reviewed_at')->nullable();
                }
                if (! Schema::hasColumn('attendances', 'janitorial_final_by')) {
                    $table->unsignedBigInteger('janitorial_final_by')->nullable();
                }
                if (! Schema::hasColumn('attendances', 'janitorial_final_on_behalf')) {
                    $table->boolean('janitorial_final_on_behalf')->default(false);
                }
                if (! Schema::hasColumn('attendances', 'janitorial_supervision')) {
                    $table->boolean('janitorial_supervision')->default(false);
                }
            });
        }

        if (Schema::hasTable('manual_attendance_requests')) {
            Schema::table('manual_attendance_requests', function (Blueprint $table) {
                if (! Schema::hasColumn('manual_attendance_requests', 'janitorial_leader_decision')) {
                    $table->string('janitorial_leader_decision', 20)->nullable();
                }
                if (! Schema::hasColumn('manual_attendance_requests', 'janitorial_deducted_hours')) {
                    $table->decimal('janitorial_deducted_hours', 8, 2)->nullable();
                }
                if (! Schema::hasColumn('manual_attendance_requests', 'janitorial_leader_remarks')) {
                    $table->text('janitorial_leader_remarks')->nullable();
                }
                if (! Schema::hasColumn('manual_attendance_requests', 'janitorial_leader_reviewed_by')) {
                    $table->unsignedBigInteger('janitorial_leader_reviewed_by')->nullable();
                }
                if (! Schema::hasColumn('manual_attendance_requests', 'janitorial_leader_reviewed_at')) {
                    $table->timestamp('janitorial_leader_reviewed_at')->nullable();
                }
                if (! Schema::hasColumn('manual_attendance_requests', 'janitorial_final_on_behalf')) {
                    $table->boolean('janitorial_final_on_behalf')->default(false);
                }
            });
        }

        if (! Schema::hasTable('janitorial_immediate_absences')) {
            Schema::create('janitorial_immediate_absences', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->date('absent_on');
                $table->timestamps();

                $table->unique(['user_id', 'absent_on'], 'jia_user_date_uq');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('janitorial_immediate_absences');

        if (Schema::hasTable('janitorial_groups') && Schema::hasColumn('janitorial_groups', 'immediate_supervisor_user_id')) {
            Schema::table('janitorial_groups', function (Blueprint $table) {
                $table->dropIndex('jg_immediate_idx');
                $table->dropColumn('immediate_supervisor_user_id');
            });
        }

        $attendanceColumns = [
            'janitorial_leader_decision',
            'janitorial_deducted_hours',
            'janitorial_leader_remarks',
            'janitorial_leader_reviewed_by',
            'janitorial_leader_reviewed_at',
            'janitorial_final_by',
            'janitorial_final_on_behalf',
            'janitorial_supervision',
        ];
        if (Schema::hasTable('attendances')) {
            Schema::table('attendances', function (Blueprint $table) use ($attendanceColumns) {
                foreach ($attendanceColumns as $column) {
                    if (Schema::hasColumn('attendances', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }

        $requestColumns = [
            'janitorial_leader_decision',
            'janitorial_deducted_hours',
            'janitorial_leader_remarks',
            'janitorial_leader_reviewed_by',
            'janitorial_leader_reviewed_at',
            'janitorial_final_on_behalf',
        ];
        if (Schema::hasTable('manual_attendance_requests')) {
            Schema::table('manual_attendance_requests', function (Blueprint $table) use ($requestColumns) {
                foreach ($requestColumns as $column) {
                    if (Schema::hasColumn('manual_attendance_requests', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }
};
