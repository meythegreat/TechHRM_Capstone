<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Offices used to be a fixed list in application code.
     * Seed that same list so existing assignments stay valid.
     */
    private const STARTER_OFFICES = [
        'University President',
        'Quality Assurance',
        'Human Resource Development Center',
        'Office of the Student Affairs',
        'University Chaplain',
        'Alumni Affairs',
        'VP-Administration',
        'Superintendent Buildings & Grounds / Officer Pollution Control',
        'Security Office',
        'Safety and Disaster Management',
        'Sports',
        'Socio-Cultural',
        'WSPO',
        'Health Services',
        'General Services',
        'Mass Media',
        'ICT Services Office',
        'Higher Education Laboratory',
        'VP-Academic Affairs',
        'Graduate School',
        'College of Arts and Sciences',
        'College of Business and Accountancy',
        'College of Computer Studies',
        'College of Criminal Justice Education',
        'College of Electronic Engineering',
        'College of Hospitality and Tourism Management',
        'College of Nursing',
        'College of Teacher Education',
        'Kindergarten/Elementary',
        'High School',
        'University Registrar',
        'Director of Libraries',
        'Guidance & Counselling Center',
        'NSTP',
        'VP-REIID',
        'International Program Office',
        'Community Extension',
        'Research',
        'VP-Finance',
        'Accountant/Budget Officer',
        'Business Manager',
        'Property Custodian',
        'University Enterprise',
    ];

    public function up(): void
    {
        Schema::create('offices', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->timestamps();
        });

        $now = now();
        DB::table('offices')->insert(array_map(
            fn (string $name) => ['name' => $name, 'created_at' => $now, 'updated_at' => $now],
            self::STARTER_OFFICES
        ));
    }

    public function down(): void
    {
        Schema::dropIfExists('offices');
    }
};
