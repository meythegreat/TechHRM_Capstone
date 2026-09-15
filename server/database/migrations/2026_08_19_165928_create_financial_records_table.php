<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('financial_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('period_start');
            $table->date('period_end');
            $table->decimal('total_hours_rendered', 8, 2)->default(0);
            $table->decimal('hourly_rate', 8, 2)->default(28.00);
            $table->decimal('penalty_deductions', 10, 2)->default(0);
            $table->decimal('equivalent_total_amount', 10, 2)->default(0);
            $table->enum('status', ['Draft', 'Approved', 'Locked', 'Forwarded to Finance'])->default('Draft');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void {
        Schema::dropIfExists('financial_records');
    }
};
