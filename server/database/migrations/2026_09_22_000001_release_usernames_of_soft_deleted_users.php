<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Soft-deleted accounts kept their login email, so the unique username
     * blocked registering that address again. Archive those usernames.
     */
    public function up(): void
    {
        $users = DB::table('users')->whereNotNull('deleted_at')->get(['id', 'username']);

        foreach ($users as $user) {
            $suffix = '#deleted-' . $user->id;
            $current = (string) $user->username;

            if ($current === '' || str_ends_with($current, $suffix)) {
                continue;
            }

            $released = $current . $suffix;
            if (strlen($released) > 255) {
                $released = substr($current, 0, 255 - strlen($suffix)) . $suffix;
            }

            DB::table('users')->where('id', $user->id)->update(['username' => $released]);
        }
    }

    public function down(): void
    {
        $users = DB::table('users')->whereNotNull('deleted_at')->get(['id', 'username']);

        foreach ($users as $user) {
            $suffix = '#deleted-' . $user->id;
            $current = (string) $user->username;

            if (!str_ends_with($current, $suffix)) {
                continue;
            }

            DB::table('users')->where('id', $user->id)->update([
                'username' => substr($current, 0, -strlen($suffix)),
            ]);
        }
    }
};
