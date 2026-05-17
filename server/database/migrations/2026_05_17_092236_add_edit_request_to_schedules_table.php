<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('schedules', function (Blueprint $table) {
            $table->text('edit_request_note')->nullable();
            $table->string('edit_request_status')->default('none'); // none, pending, approved, rejected
        });
    }

    public function down()
    {
        Schema::table('schedules', function (Blueprint $table) {
            $table->dropColumn(['edit_request_note', 'edit_request_status']);
        });
    }
};
