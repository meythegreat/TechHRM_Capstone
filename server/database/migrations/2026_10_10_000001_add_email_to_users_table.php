<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('users', 'email')) {
            Schema::table('users', function (Blueprint $table) {
                // No ->after(): Postgres rejects MySQL column positioning.
                $table->string('email')->nullable()->unique();
            });
        }

        $users = DB::table('users')->whereNull('deleted_at')->get(['id', 'username']);
        foreach ($users as $user) {
            if (filter_var($user->username, FILTER_VALIDATE_EMAIL)) {
                DB::table('users')->where('id', $user->id)->update([
                    'email' => strtolower($user->username),
                ]);
            }
        }

        $applications = DB::table('applications')
            ->whereNotNull('user_id')
            ->whereNotNull('email')
            ->orderByDesc('id')
            ->get(['user_id', 'email']);

        foreach ($applications as $application) {
            $email = strtolower(trim((string) $application->email));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                continue;
            }

            $account = DB::table('users')->where('id', $application->user_id)->whereNull('deleted_at')->first(['id', 'email']);
            if (!$account || !empty($account->email)) {
                continue;
            }

            $taken = DB::table('users')
                ->where('id', '!=', $account->id)
                ->where(function ($query) use ($email) {
                    $query->whereRaw('LOWER(username) = ?', [$email])
                        ->orWhereRaw('LOWER(email) = ?', [$email]);
                })
                ->exists();

            if (!$taken) {
                DB::table('users')->where('id', $account->id)->update(['email' => $email]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['email']);
            $table->dropColumn('email');
        });
    }
};
