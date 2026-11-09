<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ChatController extends Controller
{
    private const PRESENCE_TTL_SECONDS = 90;

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

        $scope = $request->query('scope', 'active');
        if (! in_array($scope, ['active', 'archived'], true)) {
            $scope = 'active';
        }

        $conversations = Conversation::query()
            ->whereHas('participantRows', function ($query) use ($user, $scope) {
                $query->where('user_id', $user->id)->whereNull('hidden_at');
                if ($scope === 'archived') {
                    $query->whereNotNull('archived_at');
                } else {
                    $query->whereNull('archived_at');
                }
            })
            ->with([
                'userLow:id,name,username,role,profile_picture',
                'userLow.profile',
                'userHigh:id,name,username,role,profile_picture',
                'userHigh.profile',
                'participants:id,name,username,role,profile_picture',
                'participants.profile',
                'latestMessage.sender:id,name,profile_picture',
                'participantRows',
            ])
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->get();

        $peerIds = $conversations
            ->flatMap(function (Conversation $conversation) use ($user) {
                if ($conversation->isGroup()) {
                    return $conversation->participants->pluck('id');
                }

                $peerId = $conversation->peerIdFor($user->id);

                return $peerId ? [$peerId] : [];
            })
            ->unique()
            ->values()
            ->all();
        $this->warmOpenAttendances($peerIds);

        // Inbox fetch counts as delivery: recipient received the message without opening the thread.
        $conversationIds = $conversations->pluck('id')->all();
        if ($conversationIds !== []) {
            Message::query()
                ->whereIn('conversation_id', $conversationIds)
                ->where('sender_id', '!=', $user->id)
                ->whereNull('delivered_at')
                ->update(['delivered_at' => now()]);
        }

        return response()->json(
            $conversations
                ->map(fn (Conversation $conversation) => $this->serializeConversation($conversation, $user->id))
                ->values()
        );
    }

    public function archive(Request $request, Conversation $conversation)
    {
        $user = $request->user();
        $this->assertParticipant($conversation, $user->id, true);
        $this->touchPresence($user->id);

        $row = $this->participantRowFor($conversation, $user->id);
        if ($row->hidden_at) {
            return response()->json(['message' => 'Conversation was deleted.'], 422);
        }

        $row->forceFill([
            'archived_at' => now(),
        ])->save();

        $conversation->load([
            'userLow:id,name,username,role,profile_picture',
            'userLow.profile',
            'userHigh:id,name,username,role,profile_picture',
            'userHigh.profile',
            'participants:id,name,username,role,profile_picture',
            'participants.profile',
            'latestMessage.sender:id,name,profile_picture',
            'participantRows',
        ]);

        return response()->json([
            'message' => 'Conversation archived.',
            'data' => $this->serializeConversation($conversation, $user->id),
        ]);
    }

    public function restore(Request $request, Conversation $conversation)
    {
        $user = $request->user();
        $this->assertParticipant($conversation, $user->id, true);
        $this->touchPresence($user->id);

        $row = $this->participantRowFor($conversation, $user->id);
        if ($row->hidden_at) {
            return response()->json(['message' => 'Deleted conversations cannot be restored.'], 422);
        }

        $row->forceFill([
            'archived_at' => null,
        ])->save();

        $conversation->load([
            'userLow:id,name,username,role,profile_picture',
            'userLow.profile',
            'userHigh:id,name,username,role,profile_picture',
            'userHigh.profile',
            'participants:id,name,username,role,profile_picture',
            'participants.profile',
            'latestMessage.sender:id,name,profile_picture',
            'participantRows',
        ]);

        return response()->json([
            'message' => 'Conversation restored.',
            'data' => $this->serializeConversation($conversation, $user->id),
        ]);
    }

    public function deleteForMe(Request $request, Conversation $conversation)
    {
        $user = $request->user();
        $this->assertParticipant($conversation, $user->id, true);
        $this->touchPresence($user->id);
        $this->clearTyping($conversation->id, $user->id);

        $row = $this->participantRowFor($conversation, $user->id);
        $row->forceFill([
            'hidden_at' => now(),
            'archived_at' => null,
        ])->save();

        return response()->json([
            'message' => 'Conversation deleted.',
            'ok' => true,
        ]);
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
        $this->reviveParticipant($conversation, $user->id);
        $conversation->load([
            'userLow:id,name,username,role,profile_picture',
            'userLow.profile',
            'userHigh:id,name,username,role,profile_picture',
            'userHigh.profile',
            'participants:id,name,username,role,profile_picture',
            'participants.profile',
            'latestMessage.sender:id,name,profile_picture',
            'participantRows',
        ]);
        $this->warmOpenAttendances([$peer->id]);

        return response()->json($this->serializeConversation($conversation, $user->id));
    }

    public function createGroup(Request $request)
    {
        $user = $request->user();
        $this->touchPresence($user->id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:80'],
            'member_ids' => ['required', 'array', 'min:1'],
            'member_ids.*' => ['integer', 'distinct', 'exists:users,id', Rule::notIn([(int) $user->id])],
        ]);

        $name = trim($validated['name']);
        if ($name === '') {
            return response()->json(['message' => 'Group name cannot be empty.'], 422);
        }

        $conversation = Conversation::createGroup($name, $user->id, $validated['member_ids']);
        $conversation->load([
            'participants:id,name,username,role,profile_picture',
            'participants.profile',
            'latestMessage.sender:id,name,profile_picture',
            'participantRows',
        ]);

        $memberIds = collect($validated['member_ids'])->map(fn ($id) => (int) $id)->all();
        $this->warmOpenAttendances($memberIds);

        foreach ($memberIds as $memberId) {
            Notification::create([
                'user_id' => $memberId,
                'title' => 'New Group Chat',
                'message' => $user->name.' added you to "'.$name.'"',
            ]);
        }

        return response()->json($this->serializeConversation($conversation, $user->id), 201);
    }

    public function messages(Request $request, Conversation $conversation)
    {
        $user = $request->user();
        $this->assertParticipant($conversation, $user->id);
        $this->touchPresence($user->id);

        Message::query()
            ->where('conversation_id', $conversation->id)
            ->where('sender_id', '!=', $user->id)
            ->whereNull('delivered_at')
            ->update(['delivered_at' => now()]);

        Message::query()
            ->where('conversation_id', $conversation->id)
            ->where('sender_id', '!=', $user->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        ConversationParticipant::query()->updateOrCreate(
            [
                'conversation_id' => $conversation->id,
                'user_id' => $user->id,
            ],
            [
                'last_read_at' => now(),
            ]
        );

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

        ConversationParticipant::query()->updateOrCreate(
            [
                'conversation_id' => $conversation->id,
                'user_id' => $user->id,
            ],
            [
                'last_read_at' => now(),
            ]
        );

        $recipientIds = $this->participantIds($conversation)
            ->reject(fn (int $id) => $id === (int) $user->id)
            ->values();

        $preview = $conversation->isGroup()
            ? $user->name.' in '.$conversation->name.': '.Str::limit($body, 100)
            : $user->name.': '.Str::limit($body, 120);

        foreach ($recipientIds as $recipientId) {
            Notification::create([
                'user_id' => $recipientId,
                'title' => 'New Message',
                'message' => $preview,
            ]);
        }

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

    public function leavePresence(Request $request)
    {
        $user = $request->user();
        Cache::forget($this->presenceKey($user->id));

        return response()->json(['ok' => true, 'online' => false]);
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

        $conversation->loadMissing([
            'participants:id,name,username,role,profile_picture',
            'participants.profile',
            'userLow:id,name,username,role,profile_picture',
            'userLow.profile',
            'userHigh:id,name,username,role,profile_picture',
            'userHigh.profile',
        ]);

        if ($conversation->isGroup()) {
            $others = $conversation->participants
                ->filter(fn (User $participant) => (int) $participant->id !== (int) $user->id)
                ->values();
            $this->warmOpenAttendances($others->pluck('id')->all());

            $typingNames = $others
                ->filter(fn (User $participant) => (bool) Cache::get($this->typingKey($conversation->id, $participant->id), false))
                ->pluck('name')
                ->values();

            $onlineCount = $others->filter(fn (User $participant) => $this->isOnline($participant->id))->count();

            return response()->json([
                'conversation_id' => $conversation->id,
                'type' => Conversation::TYPE_GROUP,
                'peer_id' => null,
                'peer_online' => $onlineCount > 0,
                'peer_typing' => $typingNames->isNotEmpty(),
                'typing_names' => $typingNames,
                'online_count' => $onlineCount,
                'member_count' => $conversation->participants->count(),
                'peer_last_seen_at' => null,
                'peer_assignment' => null,
                'peer_clocked_in' => false,
                'peer_clocked_in_since' => null,
                'peer_work_type' => null,
            ]);
        }

        $peerId = $conversation->peerIdFor($user->id);
        $peer = $peerId ? User::query()->with('profile')->find($peerId) : null;
        $this->warmOpenAttendances($peerId ? [$peerId] : []);
        $open = $peerId ? $this->openAttendanceFor($peerId) : null;

        return response()->json([
            'conversation_id' => $conversation->id,
            'type' => Conversation::TYPE_DIRECT,
            'peer_id' => $peerId,
            'peer_online' => $peerId ? $this->isOnline($peerId) : false,
            'peer_typing' => $peerId
                ? (bool) Cache::get($this->typingKey($conversation->id, $peerId), false)
                : false,
            'typing_names' => [],
            'online_count' => $peerId && $this->isOnline($peerId) ? 1 : 0,
            'member_count' => 2,
            'peer_last_seen_at' => $peerId ? $this->lastSeenAt($peerId) : null,
            'peer_assignment' => $peer ? $this->assignmentFor($peer) : 'Unassigned',
            'peer_clocked_in' => $open !== null,
            'peer_clocked_in_since' => optional($open?->time_in)?->toIso8601String(),
            'peer_work_type' => $open
                ? trim((string) ($open->work_type ?: $open->attendance_type ?: 'On duty'))
                : null,
        ]);
    }

    private function assertParticipant(Conversation $conversation, int $userId, bool $allowHidden = false): void
    {
        if (! $conversation->involves($userId)) {
            abort(403, 'You are not part of this conversation.');
        }

        if ($allowHidden) {
            return;
        }

        $row = ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $userId)
            ->first();

        if ($row?->hidden_at) {
            abort(403, 'You are not part of this conversation.');
        }
    }

    private function participantRowFor(Conversation $conversation, int $userId): ConversationParticipant
    {
        return ConversationParticipant::query()->firstOrCreate(
            [
                'conversation_id' => $conversation->id,
                'user_id' => $userId,
            ],
            [
                'last_read_at' => null,
                'archived_at' => null,
                'hidden_at' => null,
            ]
        );
    }

    private function reviveParticipant(Conversation $conversation, int $userId): void
    {
        $row = $this->participantRowFor($conversation, $userId);
        if ($row->hidden_at || $row->archived_at) {
            $row->forceFill([
                'hidden_at' => null,
                'archived_at' => null,
            ])->save();
        }
    }

    private function assertMessageInConversation(Conversation $conversation, Message $message): void
    {
        if ((int) $message->conversation_id !== (int) $conversation->id) {
            abort(404);
        }
    }

    /**
     * @return \Illuminate\Support\Collection<int, int>
     */
    private function participantIds(Conversation $conversation)
    {
        if ($conversation->relationLoaded('participants') && $conversation->participants->isNotEmpty()) {
            return $conversation->participants->pluck('id')->map(fn ($id) => (int) $id);
        }

        if ($conversation->relationLoaded('participantRows') && $conversation->participantRows->isNotEmpty()) {
            return $conversation->participantRows->pluck('user_id')->map(fn ($id) => (int) $id);
        }

        $ids = ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id);

        if ($ids->isNotEmpty()) {
            return $ids;
        }

        return collect([
            (int) $conversation->user_low_id,
            (int) $conversation->user_high_id,
        ])->filter()->unique()->values();
    }

    private function serializeConversation(Conversation $conversation, int $viewerId): array
    {
        $latest = $conversation->latestMessage;
        $isGroup = $conversation->isGroup();

        if (! $conversation->relationLoaded('participants')) {
            $conversation->load([
                'participants:id,name,username,role,profile_picture',
                'participants.profile',
            ]);
        }

        $participants = $conversation->participants
            ->map(fn (User $participant) => $this->serializeUser($participant))
            ->values();

        $peer = null;
        if (! $isGroup) {
            $peerModel = $conversation->user_low_id === $viewerId
                ? $conversation->userHigh
                : $conversation->userLow;

            if (! $peerModel) {
                $peerModel = $conversation->participants
                    ->first(fn (User $participant) => (int) $participant->id !== $viewerId);
            }

            $peer = $peerModel ? $this->serializeUser($peerModel) : null;
        }

        $unreadCount = $this->unreadCountFor($conversation, $viewerId);

        $typingFromOthers = $conversation->participants
            ->filter(fn (User $participant) => (int) $participant->id !== $viewerId)
            ->contains(fn (User $participant) => (bool) Cache::get(
                $this->typingKey($conversation->id, $participant->id),
                false
            ));

        $title = $isGroup
            ? ($conversation->name ?: 'Group chat')
            : ($peer['name'] ?? 'Unknown user');

        $viewerRow = $conversation->relationLoaded('participantRows')
            ? $conversation->participantRows->firstWhere('user_id', $viewerId)
            : ConversationParticipant::query()
                ->where('conversation_id', $conversation->id)
                ->where('user_id', $viewerId)
                ->first();

        return [
            'id' => $conversation->id,
            'type' => $isGroup ? Conversation::TYPE_GROUP : Conversation::TYPE_DIRECT,
            'is_group' => $isGroup,
            'name' => $isGroup ? $conversation->name : null,
            'title' => $title,
            'created_by' => $conversation->created_by,
            'peer' => $peer,
            'participants' => $participants,
            'member_count' => $participants->count(),
            'last_message' => $latest ? $this->serializeMessage($latest, $viewerId) : null,
            'last_message_preview' => $latest
                ? ($latest->isUnsent() ? 'Message unsent' : $latest->body)
                : null,
            'last_message_at' => optional($conversation->last_message_at)?->toIso8601String(),
            'unread_count' => $unreadCount,
            'peer_typing' => $typingFromOthers,
            'is_archived' => $viewerRow?->archived_at !== null,
            'archived_at' => optional($viewerRow?->archived_at)?->toIso8601String(),
        ];
    }

    private function unreadCountFor(Conversation $conversation, int $viewerId): int
    {
        $lastReadAt = null;
        if ($conversation->relationLoaded('participantRows')) {
            $lastReadAt = optional(
                $conversation->participantRows->firstWhere('user_id', $viewerId)
            )->last_read_at;
        } else {
            $lastReadAt = ConversationParticipant::query()
                ->where('conversation_id', $conversation->id)
                ->where('user_id', $viewerId)
                ->value('last_read_at');
        }

        $query = Message::query()
            ->where('conversation_id', $conversation->id)
            ->where('sender_id', '!=', $viewerId)
            ->whereNull('unsent_at');

        if ($lastReadAt) {
            $query->where('created_at', '>', $lastReadAt);
        } else {
            $query->whereNull('read_at');
        }

        return $query->count();
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
            'delivered_at' => optional($message->delivered_at)?->toIso8601String(),
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
