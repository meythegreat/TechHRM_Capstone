<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;

class StaffNotifier
{
    /**
     * Alert the WSPO coordinator and every Super Admin.
     *
     * @param  list<int>  $exceptUserIds
     */
    public function notify(string $title, string $message, array $exceptUserIds = []): void
    {
        $recipients = User::query()
            ->whereIn('role', ['WSPO Staff', 'Super Admin'])
            ->when($exceptUserIds !== [], fn ($query) => $query->whereNotIn('id', $exceptUserIds))
            ->get(['id']);

        foreach ($recipients as $recipient) {
            Notification::create([
                'user_id' => $recipient->id,
                'title' => $title,
                'message' => $message,
            ]);
        }
    }
}
