<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use App\Services\PhonePush;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class PushSubscriptionController extends Controller
{
    public function publicKey(PhonePush $push)
    {
        if (! Schema::hasTable('push_vapid_keys')) {
            return response()->json(['message' => 'Phone notifications are not ready yet.'], 503);
        }

        return response()->json(['public_key' => $push->publicKey()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'endpoint' => ['required', 'url', 'max:2000'],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:255'],
            'contentEncoding' => ['nullable', 'string', 'max:32'],
        ]);

        if (! str_starts_with($data['endpoint'], 'https://')) {
            return response()->json(['message' => 'The phone notification address must use HTTPS.'], 422);
        }

        PushSubscription::query()->updateOrCreate(
            ['endpoint_hash' => hash('sha256', $data['endpoint'])],
            [
                'user_id' => $request->user()->id,
                'endpoint' => $data['endpoint'],
                'public_key' => $data['keys']['p256dh'],
                'auth_token' => $data['keys']['auth'],
                'content_encoding' => $data['contentEncoding'] ?? 'aes128gcm',
            ],
        );

        return response()->json(['message' => 'Phone notifications are on.']);
    }

    public function destroy(Request $request)
    {
        $data = $request->validate([
            'endpoint' => ['required', 'string', 'max:2000'],
        ]);

        $request->user()->pushSubscriptions()
            ->where('endpoint_hash', hash('sha256', $data['endpoint']))
            ->delete();

        return response()->json(['message' => 'Phone notifications are off for this device.']);
    }
}
