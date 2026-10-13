<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rendered_hour_events', function (Blueprint $table) {
            $table->id();
            $table->string('kind');
            $table->string('title');
            $table->date('event_date');
            $table->decimal('hours', 8, 2);
            $table->string('direction')->nullable();
            $table->unsignedTinyInteger('year_level')->nullable();
            $table->string('group_name')->nullable();
            $table->time('valid_until')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['event_date', 'kind']);
        });

        Schema::create('rendered_hour_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained('rendered_hour_events')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('status')->nullable();
            $table->timestamp('scanned_at')->nullable();
            $table->decimal('hours_delta', 8, 2)->default(0);
            $table->timestamps();

            $table->unique(['event_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rendered_hour_entries');
        Schema::dropIfExists('rendered_hour_events');
    }
};
