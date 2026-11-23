<?php

namespace App\Support;

use App\Http\Controllers\UserController;
use App\Models\Schedule;
use App\Models\User;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Writes TechHRM duty, class, holiday, and class-break events into a personal Gmail calendar.
 */
class GoogleCalendarSync
{
    public function __construct(private GoogleCalendarFeed $feed) {}

    public function enabled(): bool
    {
        if (app()->runningUnitTests() && ! config('services.google.sync_in_tests')) {
            return false;
        }

        return trim((string) config('services.google.client_id')) !== ''
            && trim((string) config('services.google.client_secret')) !== '';
    }

    public function connected(User $user): bool
    {
        return trim((string) $user->google_refresh_token) !== ''
            && trim((string) $user->google_calendar_id) !== '';
    }

    public function authorizationUrl(User $user): string
    {
        $this->assertConfigured();

        $state = Crypt::encryptString(json_encode([
            'user_id' => $user->id,
            'exp' => now()->addMinutes(15)->getTimestamp(),
        ], JSON_THROW_ON_ERROR));

        $query = http_build_query([
            'client_id' => config('services.google.client_id'),
            'redirect_uri' => config('services.google.redirect'),
            'response_type' => 'code',
            'scope' => implode(' ', [
                'https://www.googleapis.com/auth/calendar',
                'openid',
                'email',
            ]),
            'access_type' => 'offline',
            'prompt' => 'consent',
            'include_granted_scopes' => 'true',
            'state' => $state,
        ]);

        return 'https://accounts.google.com/o/oauth2/v2/auth?'.$query;
    }

    /**
     * @return array{email: ?string, events: int}
     */
    public function userFromState(string $state): User
    {
        try {
            $payload = json_decode(Crypt::decryptString($state), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            throw new RuntimeException('This Google sign-in link is no longer valid. Connect again.');
        }

        if ((int) ($payload['exp'] ?? 0) < now()->getTimestamp()) {
            throw new RuntimeException('This Google sign-in link is no longer valid. Connect again.');
        }

        $user = User::query()->find($payload['user_id'] ?? 0);
        if (! $user) {
            throw new RuntimeException('This Google sign-in link is no longer valid. Connect again.');
        }

        return $user;
    }

    /**
     * @return array{email: ?string, events: int}
     */
    public function connect(User $user, string $code, string $state): array
    {
        $this->assertConfigured();
        $this->assertState($user, $state);

        $token = $this->tokenRequest([
            'code' => $code,
            'grant_type' => 'authorization_code',
            'redirect_uri' => config('services.google.redirect'),
        ]);
        $refresh = (string) ($token['refresh_token'] ?? '');
        if ($refresh === '') {
            throw new RuntimeException('Google did not return a refresh token. Connect again and choose Allow.');
        }

        $access = (string) ($token['access_token'] ?? '');
        $email = $this->email($access);
        if ($user->google_calendar_id) {
            $this->deleteCalendar($access, (string) $user->google_calendar_id);
        }

        $calendar = Http::withToken($access)
            ->acceptJson()
            ->post('https://www.googleapis.com/calendar/v3/calendars', [
                'summary' => 'TechHRM',
                'timeZone' => 'Asia/Manila',
            ]);
        if (! $calendar->successful()) {
            throw new RuntimeException($this->googleMessage($calendar));
        }

        $calendarId = (string) $calendar->json('id');
        DB::table('users')->where('id', $user->id)->update([
            'google_refresh_token' => Crypt::encryptString($refresh),
            'google_calendar_id' => $calendarId,
            'google_email' => $email,
        ]);
        $user->google_refresh_token = Crypt::encryptString($refresh);
        $user->google_calendar_id = $calendarId;
        $user->google_email = $email;
        $this->accessTokens[$user->id] = $access;

        return [
            'email' => $email,
            'events' => $this->syncUser($user),
        ];
    }

    public function disconnect(User $user): void
    {
        if ($this->connected($user) && $this->enabled()) {
            try {
                $this->send($user, 'delete', $this->calendarUrl((string) $user->google_calendar_id));
            } catch (\Throwable $exception) {
                Log::warning('Google calendar disconnect failed', ['user_id' => $user->id, 'error' => $exception->getMessage()]);
            }
        }

        DB::table('users')->where('id', $user->id)->update([
            'google_refresh_token' => null,
            'google_calendar_id' => null,
            'google_email' => null,
        ]);
        $user->google_refresh_token = null;
        $user->google_calendar_id = null;
        $user->google_email = null;
    }

    public function syncUser(User $user): int
    {
        if (! $this->enabled() || ! $this->connected($user)) {
            return 0;
        }

        $count = 0;
        foreach ($this->feed->apiEvents($user, $this->feed->scopeFor($user)) as $event) {
            $this->writeEvent($user, $event);
            $count++;
        }

        return $count;
    }

    public function pushSchedule(Schedule $schedule): void
    {
        if (! $this->enabled()) {
            return;
        }

        try {
            $schedule->loadMissing('user.profile');
            $audience = $this->audience($schedule);
            foreach ($this->connectedUsers() as $viewer) {
                $eventId = 'techhrmschedule'.$schedule->id;
                if ($audience->contains(fn (User $user) => $user->id === $viewer->id)) {
                    $personal = $this->feed->scopeFor($viewer) === 'personal';
                    $events = $this->feed->apiEvents($viewer, $personal ? 'personal' : 'assigned');
                    $event = collect($events)->firstWhere('id', $eventId);
                    if (is_array($event)) {
                        $this->writeEvent($viewer, $event);
                    }
                } else {
                    $this->deleteEvent($viewer, $eventId);
                }
            }
        } catch (\Throwable $exception) {
            Log::warning('Google schedule push failed', ['schedule_id' => $schedule->id, 'error' => $exception->getMessage()]);
        }
    }

    public function deleteScheduleEvent(int $scheduleId): void
    {
        if (! $this->enabled()) {
            return;
        }

        foreach ($this->connectedUsers() as $viewer) {
            try {
                $this->deleteEvent($viewer, 'techhrmschedule'.$scheduleId);
            } catch (\Throwable $exception) {
                Log::warning('Google schedule delete failed', ['schedule_id' => $scheduleId, 'error' => $exception->getMessage()]);
            }
        }
    }

    public function syncConnectedUsers(): void
    {
        if (! $this->enabled()) {
            return;
        }

        foreach ($this->connectedUsers() as $viewer) {
            try {
                $this->syncUser($viewer);
            } catch (\Throwable $exception) {
                Log::warning('Google calendar sync failed', ['user_id' => $viewer->id, 'error' => $exception->getMessage()]);
            }
        }
    }

    /**
     * Calling apiEvents for every viewer on one schedule change rebuilds the whole feed.
     * That keeps holiday exclusions accurate without a second code path.
     *
     * @return \Illuminate\Support\Collection<int, User>
     */
    private function audience(Schedule $schedule)
    {
        $student = $schedule->user;

        return $this->connectedUsers()->filter(function (User $viewer) use ($student) {
            if ($this->feed->scopeFor($viewer) === 'personal') {
                return $student && (int) $viewer->id === (int) $student->id;
            }

            if (in_array($viewer->role, ['WSPO Staff', 'Super Admin'], true)) {
                return true;
            }

            return $student
                && app(UserController::class)->supervisorCanAccessStudent($viewer, $student);
        })->values();
    }

    /**
     * @return \Illuminate\Support\Collection<int, User>
     */
    private function connectedUsers()
    {
        return User::query()
            ->whereNotNull('google_refresh_token')
            ->where('google_refresh_token', '!=', '')
            ->whereNotNull('google_calendar_id')
            ->where('google_calendar_id', '!=', '')
            ->get();
    }

    /**
     * @param  array<string, mixed>  $event
     */
    private function writeEvent(User $user, array $event): void
    {
        $id = rawurlencode((string) $event['id']);
        $url = $this->calendarUrl((string) $user->google_calendar_id).'/events/'.$id;
        $update = $this->send($user, 'put', $url, $event);
        if ($update->status() === 404) {
            $create = $this->send($user, 'post', $this->calendarUrl((string) $user->google_calendar_id).'/events', $event);
            if (! $create->successful()) {
                throw new RuntimeException($this->googleMessage($create));
            }
        } elseif (! $update->successful()) {
            throw new RuntimeException($this->googleMessage($update));
        }
    }

    private function deleteEvent(User $user, string $eventId): void
    {
        $response = $this->send(
            $user,
            'delete',
            $this->calendarUrl((string) $user->google_calendar_id).'/events/'.rawurlencode($eventId)
        );
        if (! $response->successful() && $response->status() !== 404 && $response->status() !== 410) {
            throw new RuntimeException($this->googleMessage($response));
        }
    }

    /** @var array<int, string> */
    private array $accessTokens = [];

    /**
     * @param  array<string, mixed>|null  $body
     */
    private function send(User $user, string $method, string $url, ?array $body = null): Response
    {
        $request = Http::withToken($this->accessToken($user))->acceptJson();
        $response = $body === null ? $request->{$method}($url) : $request->{$method}($url, $body);
        if ($response->status() !== 401) {
            return $response;
        }

        unset($this->accessTokens[$user->id]);
        $request = Http::withToken($this->accessToken($user, true))->acceptJson();

        return $body === null ? $request->{$method}($url) : $request->{$method}($url, $body);
    }

    private function accessToken(User $user, bool $force = false): string
    {
        if (! $force && isset($this->accessTokens[$user->id])) {
            return $this->accessTokens[$user->id];
        }

        $refresh = Crypt::decryptString((string) $user->google_refresh_token);
        $token = $this->tokenRequest([
            'grant_type' => 'refresh_token',
            'refresh_token' => $refresh,
        ]);
        $access = (string) ($token['access_token'] ?? '');
        if ($access === '') {
            throw new RuntimeException('Google did not issue an access token.');
        }
        if (! empty($token['refresh_token'])) {
            $encrypted = Crypt::encryptString((string) $token['refresh_token']);
            DB::table('users')->where('id', $user->id)->update(['google_refresh_token' => $encrypted]);
            $user->google_refresh_token = $encrypted;
        }
        $this->accessTokens[$user->id] = $access;

        return $access;
    }

    /**
     * @param  array<string, string>  $fields
     * @return array<string, mixed>
     */
    private function tokenRequest(array $fields): array
    {
        $response = Http::asForm()->post('https://oauth2.googleapis.com/token', array_merge($fields, [
            'client_id' => config('services.google.client_id'),
            'client_secret' => config('services.google.client_secret'),
        ]));
        if (! $response->successful()) {
            throw new RuntimeException($this->googleMessage($response));
        }

        return $response->json();
    }

    private function email(string $access): ?string
    {
        $profile = Http::withToken($access)->acceptJson()->get('https://www.googleapis.com/oauth2/v3/userinfo');
        $email = $profile->json('email');

        return is_string($email) && $email !== '' ? $email : null;
    }

    private function deleteCalendar(string $access, string $calendarId): void
    {
        Http::withToken($access)->delete($this->calendarUrl($calendarId));
    }

    private function calendarUrl(string $calendarId): string
    {
        return 'https://www.googleapis.com/calendar/v3/calendars/'.rawurlencode($calendarId);
    }

    private function assertConfigured(): void
    {
        if (! $this->enabled()) {
            throw new RuntimeException('Google Calendar is not configured on the server.');
        }
    }

    private function assertState(User $user, string $state): void
    {
        try {
            $payload = json_decode(Crypt::decryptString($state), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            throw new RuntimeException('This Google sign-in link is no longer valid. Connect again.');
        }

        if ((int) ($payload['user_id'] ?? 0) !== (int) $user->id || (int) ($payload['exp'] ?? 0) < now()->getTimestamp()) {
            throw new RuntimeException('This Google sign-in link is no longer valid. Connect again.');
        }
    }

    private function googleMessage(Response $response): string
    {
        $error = $response->json('error_description') ?? $response->json('error.message') ?? $response->json('error');
        if (is_array($error)) {
            $error = $error['message'] ?? null;
        }

        return is_string($error) && $error !== ''
            ? $error
            : 'Google Calendar could not be updated.';
    }
}
