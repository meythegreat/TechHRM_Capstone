<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bulletins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title');
            $table->text('message');
            $table->string('priority', 16);
            $table->string('audience', 32);
            $table->json('year_levels')->nullable();
            $table->json('offices')->nullable();
            $table->unsignedInteger('delivered_count')->default(0);
            $table->timestamp('expires_at');
            $table->timestamps();
        });

        Schema::create('bulletin_recipients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bulletin_id')->constrained('bulletins')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['bulletin_id', 'user_id']);
        });

        Schema::create('bulletin_dismissals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bulletin_id')->constrained('bulletins')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['bulletin_id', 'user_id']);
        });

        Schema::table('notifications', function (Blueprint $table) {
            $table->foreignId('bulletin_id')->nullable()->after('user_id')->constrained('bulletins')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropConstrainedForeignId('bulletin_id');
        });

        Schema::dropIfExists('bulletin_dismissals');
        Schema::dropIfExists('bulletin_recipients');
        Schema::dropIfExists('bulletins');
    }
};
