<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class ChatController extends Controller
{
    private const PRESENCE_TTL_SECONDS = 45;

    private const TYPING_TTL_SECONDS = 5;

    /** @var array<int, Attendance|null> */
    private array $openAttendanceByUser = [];

    public function directory(Request $request)
    {
        $user = $request->user();
        $this->touchPresence($user->id);

        $query = User::query()
            ->with('profile')
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

        $this->warmOpenAttendances($users->pluck('id')->all());

        return response()->json(
            $users->map(fn (User $peer) => $this->serializeUser($peer))->values()
        );
    }

    public function conversations(Request $request)
    {
        $user = $request->user();
        $this->touchPresence($user->id);

        $conversations = Conversation::query()
            ->where(function ($builder) use ($user) {
                $builder->where('user_low_id', $user->id)
                    ->orWhere('user_high_id', $user->id);
            })
            ->with([
                'userLow:id,name,username,role,profile_picture',
                'userLow.profile',
                'userHigh:id,name,username,role,profile_picture',
                'userHigh.profile',
                'latestMessage.sender:id,name,profile_picture',
            ])
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->get();

        $peerIds = $conversations->map(fn (Conversation $conversation) => $conversation->peerIdFor($user->id))->all();
        $this->warmOpenAttendances($peerIds);

        return response()->json(
            $conversations
                ->map(fn (Conversation $conversation) => $this->serializeConversation($conversation, $user->id))
                ->values()
        );
    }

    public function activeNow(Request $request)
    {
        $viewer = $request->user();
        $this->touchPresence($viewer->id);

        $rows = Attendance::query()
            ->whereNull('time_out')
            ->with(['user.profile'])
            ->whereHas('user')
            ->orderByDesc('time_in')
            ->limit(40)
            ->get();

        $this->warmOpenAttendances($rows->pluck('user_id')->all());

        $people = $rows
            ->map(function (Attendance $attendance) use ($viewer) {
                $person = $attendance->user;
                if (! $person || (int) $person->id === (int) $viewer->id) {
                    return null;
                }

                return $this->serializeUser($person, $attendance);
            })
            ->filter()
            ->unique('id')
            ->values();

        return response()->json([
            'people' => $people,
            'count' => $people->count(),
        ]);
    }

    public function open(Request $request)
    {
        $user = $request->user();
        $this->touchPresence($user->id);

        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $peerId = (int) $validated['user_id'];
        if ($peerId === (int) $user->id) {
            return response()->json(['message' => 'You cannot start a chat with yourself.'], 422);
        }

        $peer = User::query()->with('profile')->findOrFail($peerId);
        $conversation = Conversation::findOrCreateBetween($user->id, $peer->id);
        $conversation->load([
            'userLow:id,name,username,role,profile_picture',
            'userLow.profile',
            'userHigh:id,name,username,role,profile_picture',
            'userHigh.profile',
            'latestMessage.sender:id,name,profile_picture',
        ]);
        $this->warmOpenAttendances([$peer->id]);

        return response()->json($this->serializeConversation($conversation, $user->id));
    }

    public function messages(Request $request, Conversation $conversation)
    {
        $user = $request->user();
        $this->assertParticipant($conversation, $user->id);
        $this->touchPresence($user->id);

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
        $this->touchPresence($user->id);
        $this->clearTyping($conversation->id, $user->id);

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

    public function updateMessage(Request $request, Conversation $conversation, Message $message)
    {
        $user = $request->user();
        $this->assertParticipant($conversation, $user->id);
        $this->assertMessageInConversation($conversation, $message);
        $this->touchPresence($user->id);

        if ((int) $message->sender_id !== (int) $user->id) {
            abort(403, 'You can only edit your own messages.');
        }

        if ($message->isUnsent()) {
            return response()->json(['message' => 'Unsent messages cannot be edited.'], 422);
        }

        if (! $message->isWithinEditWindow()) {
            return response()->json(['message' => 'Messages can only be edited within 15 minutes.'], 422);
        }

        $validated = $request->validate([
            'body' => ['required', 'string', 'max:4000'],
        ]);

        $body = trim($validated['body']);
        if ($body === '') {
            return response()->json(['message' => 'Message cannot be empty.'], 422);
        }

        $message->forceFill([
            'body' => $body,
            'edited_at' => now(),
        ])->save();

        $message->load('sender:id,name,profile_picture');

        return response()->json([
            'message' => 'Message updated.',
            'data' => $this->serializeMessage($message, $user->id),
        ]);
    }

    public function unsendMessage(Request $request, Conversation $conversation, Message $message)
    {
        $user = $request->user();
        $this->assertParticipant($conversation, $user->id);
        $this->assertMessageInConversation($conversation, $message);
        $this->touchPresence($user->id);

        if ((int) $message->sender_id !== (int) $user->id) {
            abort(403, 'You can only unsend your own messages.');
        }

        if ($message->isUnsent()) {
            return response()->json([
                'message' => 'Message already unsent.',
                'data' => $this->serializeMessage($message, $user->id),
            ]);
        }

        $message->forceFill([
            'body' => '',
            'unsent_at' => now(),
            'edited_at' => null,
        ])->save();

        $message->load('sender:id,name,profile_picture');

        return response()->json([
            'message' => 'Message unsent.',
            'data' => $this->serializeMessage($message, $user->id),
        ]);
    }

    public function heartbeat(Request $request)
    {
        $user = $request->user();
        $this->touchPresence($user->id);

        return response()->json([
            'ok' => true,
            'online' => true,
            'last_seen_at' => $this->lastSeenAt($user->id),
        ]);
    }

    public function typing(Request $request, Conversation $conversation)
    {
        $user = $request->user();
        $this->assertParticipant($conversation, $user->id);
        $this->touchPresence($user->id);

        $validated = $request->validate([
            'typing' => ['required', 'boolean'],
        ]);

        if ($validated['typing']) {
            Cache::put(
                $this->typingKey($conversation->id, $user->id),
                true,
                now()->addSeconds(self::TYPING_TTL_SECONDS)
            );
        } else {
            $this->clearTyping($conversation->id, $user->id);
        }

        return response()->json(['ok' => true]);
    }

    public function state(Request $request, Conversation $conversation)
    {
        $user = $request->user();
        $this->assertParticipant($conversation, $user->id);
        $this->touchPresence($user->id);

        $peerId = $conversation->peerIdFor($user->id);
        $peer = User::query()->with('profile')->find($peerId);
        $this->warmOpenAttendances([$peerId]);
        $open = $this->openAttendanceFor($peerId);

        return response()->json([
            'conversation_id' => $conversation->id,
            'peer_id' => $peerId,
            'peer_online' => $this->isOnline($peerId),
            'peer_typing' => (bool) Cache::get($this->typingKey($conversation->id, $peerId), false),
            'peer_last_seen_at' => $this->lastSeenAt($peerId),
            'peer_assignment' => $peer ? $this->assignmentFor($peer) : 'Unassigned',
            'peer_clocked_in' => $open !== null,
            'peer_clocked_in_since' => optional($open?->time_in)?->toIso8601String(),
            'peer_work_type' => $open
                ? trim((string) ($open->work_type ?: $open->attendance_type ?: 'On duty'))
                : null,
        ]);
    }

    private function assertParticipant(Conversation $conversation, int $userId): void
    {
        if (! $conversation->involves($userId)) {
            abort(403, 'You are not part of this conversation.');
        }
    }

    private function assertMessageInConversation(Conversation $conversation, Message $message): void
    {
        if ((int) $message->conversation_id !== (int) $conversation->id) {
            abort(404);
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

        $peerId = $peer?->id;
        $peerTyping = $peerId
            ? (bool) Cache::get($this->typingKey($conversation->id, $peerId), false)
            : false;

        return [
            'id' => $conversation->id,
            'peer' => $peer ? $this->serializeUser($peer) : null,
            'last_message' => $latest ? $this->serializeMessage($latest, $viewerId) : null,
            'last_message_preview' => $latest
                ? ($latest->isUnsent() ? 'Message unsent' : $latest->body)
                : null,
            'last_message_at' => optional($conversation->last_message_at)?->toIso8601String(),
            'unread_count' => $unreadCount,
            'peer_typing' => $peerTyping,
        ];
    }

    private function serializeUser(User $user, ?Attendance $openAttendance = null): array
    {
        $open = $openAttendance ?? $this->openAttendanceFor($user->id);
        $assignment = $this->assignmentFor($user);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'role' => $user->role,
            'profile_picture' => $user->profile_picture,
            'online' => $this->isOnline($user->id),
            'last_seen_at' => $this->lastSeenAt($user->id),
            'assignment' => $assignment,
            'assigned_office' => trim((string) ($user->profile?->assigned_office ?? '')) ?: null,
            'clocked_in' => $open !== null,
            'clocked_in_since' => optional($open?->time_in)?->toIso8601String(),
            'work_type' => $open
                ? trim((string) ($open->work_type ?: $open->attendance_type ?: 'On duty'))
                : null,
        ];
    }

    private function assignmentFor(User $user): string
    {
        $profile = $user->profile;
        if (! $profile) {
            return match ($user->role) {
                'Super Admin' => 'System',
                'WSPO Staff' => 'WSPO',
                default => 'Unassigned',
            };
        }

        if ($user->role === 'Supervisor') {
            $departments = $profile->supervised_departments;
            if (is_array($departments) && count($departments) > 0) {
                return implode(', ', $departments);
            }
        }

        $label = trim((string) ($profile->assignment_label ?? ''));
        if ($label !== '') {
            return $label;
        }

        $office = trim((string) ($profile->assigned_office ?? ''));
        if ($office !== '') {
            return $office;
        }

        return match ($user->role) {
            'WSPO Staff' => 'WSPO',
            'Super Admin' => 'System',
            default => 'Unassigned',
        };
    }

    /**
     * @param  array<int|string|null>  $userIds
     */
    private function warmOpenAttendances(array $userIds): void
    {
        $ids = collect($userIds)
            ->filter(fn ($id) => $id !== null && $id !== '')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        $missing = array_values(array_filter(
            $ids,
            fn (int $id) => ! array_key_exists($id, $this->openAttendanceByUser)
        ));

        if ($missing === []) {
            return;
        }

        foreach ($missing as $id) {
            $this->openAttendanceByUser[$id] = null;
        }

        Attendance::query()
            ->whereNull('time_out')
            ->whereIn('user_id', $missing)
            ->orderByDesc('time_in')
            ->get()
            ->each(function (Attendance $attendance) {
                $userId = (int) $attendance->user_id;
                if (($this->openAttendanceByUser[$userId] ?? null) === null) {
                    $this->openAttendanceByUser[$userId] = $attendance;
                }
            });
    }

    private function openAttendanceFor(int $userId): ?Attendance
    {
        if (! array_key_exists($userId, $this->openAttendanceByUser)) {
            $this->warmOpenAttendances([$userId]);
        }

        return $this->openAttendanceByUser[$userId] ?? null;
    }

    private function serializeMessage(Message $message, int $viewerId): array
    {
        $isUnsent = $message->isUnsent();
        $isMine = (int) $message->sender_id === $viewerId;

        return [
            'id' => $message->id,
            'conversation_id' => $message->conversation_id,
            'sender_id' => $message->sender_id,
            'body' => $isUnsent ? '' : $message->body,
            'is_mine' => $isMine,
            'is_unsent' => $isUnsent,
            'edited_at' => optional($message->edited_at)?->toIso8601String(),
            'unsent_at' => optional($message->unsent_at)?->toIso8601String(),
            'can_edit' => $message->canBeEditedBy($viewerId),
            'can_unsend' => $message->canBeUnsentBy($viewerId),
            'read_at' => optional($message->read_at)?->toIso8601String(),
            'created_at' => optional($message->created_at)?->toIso8601String(),
            'sender' => $message->relationLoaded('sender') && $message->sender ? [
                'id' => $message->sender->id,
                'name' => $message->sender->name,
                'profile_picture' => $message->sender->profile_picture,
            ] : null,
        ];
    }

    private function touchPresence(int $userId): void
    {
        Cache::put(
            $this->presenceKey($userId),
            now()->toIso8601String(),
            now()->addSeconds(self::PRESENCE_TTL_SECONDS)
        );
    }

    private function isOnline(int $userId): bool
    {
        return Cache::has($this->presenceKey($userId));
    }

    private function lastSeenAt(int $userId): ?string
    {
        $value = Cache::get($this->presenceKey($userId));

        return is_string($value) && $value !== '' ? $value : null;
    }

    private function clearTyping(int $conversationId, int $userId): void
    {
        Cache::forget($this->typingKey($conversationId, $userId));
    }

    private function presenceKey(int $userId): string
    {
        return "chat:presence:{$userId}";
    }

    private function typingKey(int $conversationId, int $userId): string
    {
        return "chat:typing:{$conversationId}:{$userId}";
    }
}
