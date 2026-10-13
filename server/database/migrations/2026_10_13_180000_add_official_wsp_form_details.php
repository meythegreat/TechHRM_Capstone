<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->json('form_details')->nullable()->after('reason_for_applying');
        });

        Schema::table('application_documents', function (Blueprint $table) {
            $table->string('document_key')->nullable()->after('application_id');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->dropColumn('form_details');
        });

        Schema::table('application_documents', function (Blueprint $table) {
            $table->dropColumn('document_key');
        });
    }
};
