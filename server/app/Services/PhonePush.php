<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\PushSubscription;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\VAPID;
use Minishlink\WebPush\WebPush;

class PhonePush
{
    public function deliver(Notification $notification): void
    {
        if (! Schema::hasTable('push_subscriptions')) {
            return;
        }

        $subscriptions = PushSubscription::query()
            ->where('user_id', $notification->user_id)
            ->get();

        if ($subscriptions->isEmpty()) {
            return;
        }

        $payload = json_encode([
            'title' => $notification->title,
            'message' => $notification->message,
            'url' => '/',
        ]);

        try {
            $webPush = $this->client();
        } catch (\Throwable $exception) {
            Log::warning('Phone notification keys are unavailable.', ['error' => $exception->getMessage()]);

            return;
        }

        foreach ($subscriptions as $subscription) {
            $webPush->queueNotification(
                Subscription::create([
                    'endpoint' => $subscription->endpoint,
                    'publicKey' => $subscription->public_key,
                    'authToken' => $subscription->auth_token,
                    'contentEncoding' => $subscription->content_encoding ?: 'aes128gcm',
                ]),
                $payload,
            );
        }

        foreach ($webPush->flush() as $report) {
            if ($report->isSuccess()) {
                continue;
            }

            if ($report->isSubscriptionExpired()) {
                PushSubscription::query()->where('endpoint', $report->getEndpoint())->delete();
                continue;
            }

            Log::warning('Phone notification was not delivered.', [
                'endpoint' => $report->getEndpoint(),
                'reason' => $report->getReason(),
            ]);
        }
    }

    public function publicKey(): string
    {
        return $this->keys()['publicKey'];
    }

    /**
     * @return array{publicKey: string, privateKey: string}
     */
    private function keys(): array
    {
        $configuredPublic = (string) config('services.webpush.public_key');
        $configuredPrivate = (string) config('services.webpush.private_key');
        if ($configuredPublic !== '' && $configuredPrivate !== '') {
            return [
                'publicKey' => $configuredPublic,
                'privateKey' => $configuredPrivate,
            ];
        }

        return DB::transaction(function () {
            $existing = DB::table('push_vapid_keys')->orderBy('id')->first();
            if ($existing) {
                return [
                    'publicKey' => $existing->public_key,
                    'privateKey' => $existing->private_key,
                ];
            }

            $created = VAPID::createVapidKeys();
            DB::table('push_vapid_keys')->insert([
                'public_key' => $created['publicKey'],
                'private_key' => $created['privateKey'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return $created;
        });
    }

    private function client(): WebPush
    {
        $keys = $this->keys();

        return new WebPush([
            'VAPID' => [
                'subject' => (string) config('services.webpush.subject'),
                'publicKey' => $keys['publicKey'],
                'privateKey' => $keys['privateKey'],
            ],
        ]);
    }
}
