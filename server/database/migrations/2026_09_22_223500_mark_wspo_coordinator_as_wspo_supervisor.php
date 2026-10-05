<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Existing WSPO accounts with no position are the coordinator,
     * who also supervises working students placed in the WSPO office.
     */
    public function up(): void
    {
        User::with('profile')->where('role', 'WSPO Staff')->each(function (User $user) {
            $position = trim((string) ($user->profile?->assigned_office ?? ''));
            if ($position !== '' && strcasecmp($position, 'WSPO') !== 0) {
                return;
            }

            $user->profile()->updateOrCreate(
                ['user_id' => $user->id],
                ['assigned_office' => 'WSPO Coordinator']
            );
        });
    }

    public function down(): void
    {
        // Position labels are user data. Leave them in place.
    }
};
