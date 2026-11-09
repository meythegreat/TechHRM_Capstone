<?php

namespace App\Http\Controllers;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ChatController extends Controller
{
    public function directory(Request $request)
    {
        $user = $request->user();
        $query = User::query()
            ->whereKeyNot($user->id)
            ->orderBy('name');

        if ($request->filled('q')) {
            $term = trim((string) $request->query('q'));
            $query->where(function ($builder) use ($term) {
                $builder->where('name', 'like', "%{$term}%")
                    ->orWhere('username', 'like', "%{$term}%")
                    ->orWhere('role', 'like', "%{$term}%");
            });
        }

        $users = $query
            ->limit(50)
            ->get(['id', 'name', 'username', 'role', 'profile_picture']);

        return response()->json($users);
    }

    public function conversations(Request $request)
    {
        $user = $request->user();

        $conversations = Conversation::query()
            ->where(function ($builder) use ($user) {
                $builder->where('user_low_id', $user->id)
                    ->orWhere('user_high_id', $user->id);
            })
            ->with([
                'userLow:id,name,username,role,profile_picture',
                'userHigh:id,name,username,role,profile_picture',
                'latestMessage.sender:id,name,profile_picture',
            ])
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->get()
            ->map(function (Conversation $conversation) use ($user) {
                return $this->serializeConversation($conversation, $user->id);
            })
            ->values();

        return response()->json($conversations);
    }

    public function open(Request $request)
    {
        $user = $request->user();
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $peerId = (int) $validated['user_id'];
        if ($peerId === (int) $user->id) {
            return response()->json(['message' => 'You cannot start a chat with yourself.'], 422);
        }

        $peer = User::query()->findOrFail($peerId);
        $conversation = Conversation::findOrCreateBetween($user->id, $peer->id);
        $conversation->load([
            'userLow:id,name,username,role,profile_picture',
            'userHigh:id,name,username,role,profile_picture',
            'latestMessage.sender:id,name,profile_picture',
        ]);

        return response()->json($this->serializeConversation($conversation, $user->id));
    }

    public function messages(Request $request, Conversation $conversation)
    {
        $user = $request->user();
        $this->assertParticipant($conversation, $user->id);

        Message::query()
            ->where('conversation_id', $conversation->id)
            ->where('sender_id', '!=', $user->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        $messages = $conversation->messages()
            ->with('sender:id,name,profile_picture')
            ->orderBy('created_at')
            ->orderBy('id')
            ->limit(200)
            ->get()
            ->map(fn (Message $message) => $this->serializeMessage($message, $user->id));

        return response()->json($messages);
    }

    public function send(Request $request, Conversation $conversation)
    {
        $user = $request->user();
        $this->assertParticipant($conversation, $user->id);

        $validated = $request->validate([
            'body' => ['required', 'string', 'max:4000'],
        ]);

        $body = trim($validated['body']);
        if ($body === '') {
            return response()->json(['message' => 'Message cannot be empty.'], 422);
        }

        $message = $conversation->messages()->create([
            'sender_id' => $user->id,
            'body' => $body,
        ]);

        $conversation->forceFill(['last_message_at' => $message->created_at])->save();

        $peerId = $conversation->peerIdFor($user->id);
        Notification::create([
            'user_id' => $peerId,
            'title' => 'New Message',
            'message' => $user->name . ': ' . Str::limit($body, 120),
        ]);

        $message->load('sender:id,name,profile_picture');

        return response()->json([
            'message' => 'Message sent.',
            'data' => $this->serializeMessage($message, $user->id),
        ], 201);
    }

    private function assertParticipant(Conversation $conversation, int $userId): void
    {
        if (! $conversation->involves($userId)) {
            abort(403, 'You are not part of this conversation.');
        }
    }

    private function serializeConversation(Conversation $conversation, int $viewerId): array
    {
        $peer = $conversation->user_low_id === $viewerId
            ? $conversation->userHigh
            : $conversation->userLow;

        $latest = $conversation->latestMessage;

        $unreadCount = Message::query()
            ->where('conversation_id', $conversation->id)
            ->where('sender_id', '!=', $viewerId)
            ->whereNull('read_at')
            ->count();

        return [
            'id' => $conversation->id,
            'peer' => $peer ? [
                'id' => $peer->id,
                'name' => $peer->name,
                'username' => $peer->username,
                'role' => $peer->role,
                'profile_picture' => $peer->profile_picture,
            ] : null,
            'last_message' => $latest ? $this->serializeMessage($latest, $viewerId) : null,
            'last_message_at' => optional($conversation->last_message_at)?->toIso8601String(),
            'unread_count' => $unreadCount,
        ];
    }

    private function serializeMessage(Message $message, int $viewerId): array
    {
        return [
            'id' => $message->id,
            'conversation_id' => $message->conversation_id,
            'sender_id' => $message->sender_id,
            'body' => $message->body,
            'is_mine' => (int) $message->sender_id === $viewerId,
            'read_at' => optional($message->read_at)?->toIso8601String(),
            'created_at' => optional($message->created_at)?->toIso8601String(),
            'sender' => $message->relationLoaded('sender') && $message->sender ? [
                'id' => $message->sender->id,
                'name' => $message->sender->name,
                'profile_picture' => $message->sender->profile_picture,
            ] : null,
        ];
    }
}
