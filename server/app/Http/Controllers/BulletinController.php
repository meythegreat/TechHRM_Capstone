<?php

namespace App\Http\Controllers;

use App\Models\Bulletin;
use App\Models\BulletinDismissal;
use App\Models\BulletinRecipient;
use App\Models\Notification;
use App\Models\Office;
use App\Models\User;
use App\Models\UserProfile;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BulletinController extends Controller
{
    public function mine(Request $request)
    {
        $userId = $request->user()->id;

        $bulletins = Bulletin::query()
            ->with([
                'author:id,name',
                'dismissals' => fn ($dismissals) => $dismissals->where('user_id', $userId),
            ])
            ->where('expires_at', '>', now())
            ->whereHas('recipients', fn ($recipients) => $recipients->where('user_id', $userId))
            ->latest()
            ->get()
            ->map(fn (Bulletin $bulletin) => $this->recipientPayload($bulletin, $userId));

        return response()->json(['bulletins' => $bulletins]);
    }

    public function dismiss(Request $request, Bulletin $bulletin)
    {
        $userId = $request->user()->id;
        $isRecipient = $bulletin->recipients()->where('user_id', $userId)->exists();
        abort_unless($isRecipient, 404);

        BulletinDismissal::query()->updateOrCreate(
            ['bulletin_id' => $bulletin->id, 'user_id' => $userId],
            []
        );

        return response()->json(['dismissed' => true]);
    }

    public function index()
    {
        $bulletins = Bulletin::query()
            ->with('author:id,name')
            ->latest()
            ->get()
            ->map(fn (Bulletin $bulletin) => $this->adminPayload($bulletin));

        return response()->json(['bulletins' => $bulletins]);
    }

    public function offices()
    {
        $names = collect();

        if (Schema::hasTable('offices')) {
            $names = $names->merge(Office::names());
        }

        if (Schema::hasTable('user_profiles')) {
            $names = $names
                ->merge(UserProfile::query()->whereNotNull('assigned_office')->distinct()->pluck('assigned_office'))
                ->merge(UserProfile::query()->whereNotNull('work_department')->distinct()->pluck('work_department'));
        }

        $offices = $names
            ->map(fn ($name) => trim((string) $name))
            ->filter()
            ->unique()
            ->sort()
            ->values();

        return response()->json(['offices' => $offices]);
    }

    public function students(Request $request)
    {
        $validated = $request->validate([
            'q' => 'nullable|string|max:100',
            'year_level' => 'nullable|integer|min:1|max:4',
            'office' => 'nullable|string|max:120',
            'created_from' => 'nullable|date',
            'created_until' => 'nullable|date',
            'ids_only' => 'nullable|boolean',
        ]);

        $query = $this->studentQuery($validated);
        $limit = $request->boolean('ids_only') ? 500 : 30;
        $matches = (clone $query)->limit($limit + 1)->get();
        $truncated = $matches->count() > $limit;
        $matches = $matches->take($limit);

        return response()->json([
            'students' => $matches->map(fn (User $student) => [
                'id' => $student->id,
                'name' => $student->name,
                'student_id_number' => $student->profile?->student_id_number,
                'year_level' => $student->profile?->year_level,
                'office' => $student->profile?->assigned_office,
                'created_at' => $student->created_at?->toIso8601String(),
            ])->values(),
            'ids' => $matches->pluck('id')->values(),
            'shown' => $matches->count(),
            'truncated' => $truncated,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:120',
            'message' => 'required|string|max:2000',
            'priority' => ['required', Rule::in(['normal', 'urgent', 'special'])],
            'audience' => ['required', Rule::in(['everyone', 'year_level', 'office', 'students'])],
            'year_levels' => 'exclude_unless:audience,year_level|required|array|min:1',
            'year_levels.*' => 'integer|min:1|max:4|distinct',
            'offices' => 'exclude_unless:audience,office|required|array|min:1',
            'offices.*' => 'string|max:120|distinct',
            'user_ids' => 'exclude_unless:audience,students|required|array|min:1|max:500',
            'user_ids.*' => 'integer|distinct|exists:users,id',
            'expires_at' => ['required', 'date', 'after:now', 'before:'.now()->addYears(2)->toDateTimeString()],
        ]);

        $yearLevels = array_values(array_unique(array_map('intval', $validated['year_levels'] ?? [])));
        $offices = array_values(array_unique(array_map(
            fn ($office) => trim((string) $office),
            $validated['offices'] ?? []
        )));
        $userIds = array_values(array_unique(array_map('intval', $validated['user_ids'] ?? [])));

        if ($validated['audience'] === 'students') {
            $studentIds = User::query()
                ->where('role', 'Student')
                ->whereIn('id', $userIds)
                ->pluck('id');

            if ($studentIds->count() !== count($userIds)) {
                throw ValidationException::withMessages([
                    'user_ids' => 'Choose student accounts only.',
                ]);
            }
        }

        $recipientIds = $this->recipientIds(
            $validated['audience'],
            $yearLevels,
            $offices,
            $userIds
        );

        if ($recipientIds === []) {
            throw ValidationException::withMessages([
                'audience' => 'Nobody matches this audience. Adjust the filter and try again.',
            ]);
        }

        $bulletin = DB::transaction(function () use ($request, $validated, $yearLevels, $offices, $recipientIds) {
            $bulletin = Bulletin::create([
                'created_by' => $request->user()->id,
                'title' => trim($validated['title']),
                'message' => trim($validated['message']),
                'priority' => $validated['priority'],
                'audience' => $validated['audience'],
                'year_levels' => $validated['audience'] === 'year_level' ? $yearLevels : null,
                'offices' => $validated['audience'] === 'office' ? $offices : null,
                'delivered_count' => count($recipientIds),
                'expires_at' => Carbon::parse($validated['expires_at']),
            ]);

            $now = now();
            foreach (array_chunk($recipientIds, 500) as $chunk) {
                BulletinRecipient::insert(array_map(fn (int $userId) => [
                    'bulletin_id' => $bulletin->id,
                    'user_id' => $userId,
                    'created_at' => $now,
                    'updated_at' => $now,
                ], $chunk));
            }

            $title = match ($bulletin->priority) {
                'urgent' => 'Urgent announcement: '.$bulletin->title,
                'special' => 'Special announcement: '.$bulletin->title,
                default => 'Announcement: '.$bulletin->title,
            };
            $message = $bulletin->message."\n\nOpen until ".$bulletin->expires_at->timezone(config('app.timezone'))->format('M j, Y g:i A').'.';

            foreach ($recipientIds as $userId) {
                Notification::create([
                    'user_id' => $userId,
                    'bulletin_id' => $bulletin->id,
                    'title' => $title,
                    'message' => $message,
                    'is_read' => false,
                ]);
            }

            return $bulletin;
        });

        return response()->json($this->adminPayload($bulletin->load('author:id,name')), 201);
    }

    public function destroy(Bulletin $bulletin)
    {
        $bulletin->delete();

        return response()->json(['deleted' => true]);
    }

    private function studentQuery(array $filters)
    {
        $query = User::query()
            ->with('profile:id,user_id,student_id_number,year_level,assigned_office')
            ->where('role', 'Student')
            ->orderBy('name');

        $search = trim((string) ($filters['q'] ?? ''));
        if ($search !== '') {
            $query->where(function ($people) use ($search) {
                $people->where('name', 'like', "%{$search}%")
                    ->orWhere('username', 'like', "%{$search}%")
                    ->orWhereHas('profile', function ($profile) use ($search) {
                        $profile->where('student_id_number', 'like', "%{$search}%");
                    });
            });
        }

        if (!empty($filters['year_level'])) {
            $year = (int) $filters['year_level'];
            $query->whereHas('profile', fn ($profile) => $profile->where('year_level', $year));
        }

        $office = trim((string) ($filters['office'] ?? ''));
        if ($office !== '') {
            $query->whereHas('profile', fn ($profile) => $profile->where('assigned_office', $office));
        }

        if (!empty($filters['created_from'])) {
            $query->where('created_at', '>=', Carbon::parse($filters['created_from'])->startOfDay());
        }

        if (!empty($filters['created_until'])) {
            $query->where('created_at', '<=', Carbon::parse($filters['created_until'])->endOfDay());
        }

        return $query;
    }

    /**
     * @param  array<int, int>  $yearLevels
     * @param  array<int, string>  $offices
     * @param  array<int, int>  $userIds
     * @return array<int, int>
     */
    private function recipientIds(string $audience, array $yearLevels, array $offices, array $userIds): array
    {
        $query = User::query()->orderBy('id');

        if ($audience === 'everyone') {
            return $query->pluck('id')->map(fn ($id) => (int) $id)->all();
        }

        if ($audience === 'students') {
            return $query->where('role', 'Student')->whereIn('id', $userIds)->pluck('id')->map(fn ($id) => (int) $id)->all();
        }

        if ($audience === 'year_level') {
            return $query
                ->where('role', 'Student')
                ->whereHas('profile', fn ($profile) => $profile->whereIn('year_level', $yearLevels))
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();
        }

        return $query
            ->whereHas('profile', function ($profile) use ($offices) {
                $profile->where(function ($match) use ($offices) {
                    $match->whereIn('assigned_office', $offices)
                        ->orWhereIn('work_department', $offices);

                    foreach ($offices as $office) {
                        $match->orWhereJsonContains('supervised_departments', $office)
                            ->orWhereJsonContains('secretary_departments', $office);
                    }
                });
            })
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function recipientPayload(Bulletin $bulletin, int $userId): array
    {
        $dismissed = $bulletin->relationLoaded('dismissals')
            ? $bulletin->dismissals->isNotEmpty()
            : BulletinDismissal::query()
                ->where('bulletin_id', $bulletin->id)
                ->where('user_id', $userId)
                ->exists();

        return [
            'id' => $bulletin->id,
            'title' => $bulletin->title,
            'message' => $bulletin->message,
            'priority' => $bulletin->priority,
            'audience' => $bulletin->audience,
            'expires_at' => $bulletin->expires_at?->toIso8601String(),
            'created_at' => $bulletin->created_at?->toIso8601String(),
            'author' => $bulletin->author?->name ?? 'Super Admin',
            'dismissed' => $dismissed,
        ];
    }

    private function adminPayload(Bulletin $bulletin): array
    {
        return [
            'id' => $bulletin->id,
            'title' => $bulletin->title,
            'message' => $bulletin->message,
            'priority' => $bulletin->priority,
            'audience' => $bulletin->audience,
            'year_levels' => $bulletin->year_levels ?? [],
            'offices' => $bulletin->offices ?? [],
            'delivered_count' => $bulletin->delivered_count,
            'expires_at' => $bulletin->expires_at?->toIso8601String(),
            'created_at' => $bulletin->created_at?->toIso8601String(),
            'author' => $bulletin->author?->name ?? 'Super Admin',
            'active' => !$bulletin->isExpired(),
        ];
    }
}
