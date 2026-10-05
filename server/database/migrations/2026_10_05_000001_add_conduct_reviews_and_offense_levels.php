<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('disciplinary_records', function (Blueprint $table) {
            if (!Schema::hasColumn('disciplinary_records', 'offense_level')) {
                $table->string('offense_level', 10)->nullable()->after('violation_type');
            }
        });

        if (!Schema::hasTable('student_performance_reviews')) {
            Schema::create('student_performance_reviews', function (Blueprint $table) {
                $table->id();
                $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('recorded_by')->constrained('users');
                $table->string('school_year', 9);
                $table->string('rating', 32);
                $table->string('outcome', 32);
                $table->string('target_department')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->unique(['student_id', 'school_year']);
            });
        }

        if (!Schema::hasTable('student_awards')) {
            Schema::create('student_awards', function (Blueprint $table) {
                $table->id();
                $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('awarded_by')->constrained('users');
                $table->string('school_year', 9);
                $table->string('title');
                $table->text('citation')->nullable();
                $table->timestamps();

                $table->unique(['student_id', 'school_year', 'title']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('student_awards');
        Schema::dropIfExists('student_performance_reviews');

        Schema::table('disciplinary_records', function (Blueprint $table) {
            if (Schema::hasColumn('disciplinary_records', 'offense_level')) {
                $table->dropColumn('offense_level');
            }
        });
    }
};
