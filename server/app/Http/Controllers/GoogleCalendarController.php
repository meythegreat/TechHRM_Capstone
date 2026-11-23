<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\GoogleCalendarFeed;
use App\Support\GoogleCalendarSync;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class GoogleCalendarController extends Controller
{
    public function link(Request $request, GoogleCalendarFeed $feed)
    {
        abort_unless(
            Schema::hasColumn('users', 'calendar_token'),
            503,
            'Calendar links are not available until the latest database migration has been applied.'
        );

        $user = $request->user();
        $scope = $request->query('scope') === 'assigned' ? 'assigned' : 'personal';
        $this->assertScope($user, $scope);

        $token = $user->ensureCalendarToken();
        $feedUrl = url('/api/calendar/'.$token.'.ics').'?scope='.$scope;

        return response()->json([
            'scope' => $scope,
            'reachable' => $this->feedIsReachable($feedUrl),
            'calendar_name' => $feed->calendarName($user, $scope),
            'feed_url' => $feedUrl,
            'download_url' => $feedUrl.'&download=1',
            'google_url' => 'https://calendar.google.com/calendar/render?cid='.rawurlencode($feedUrl),
        ]);
    }

    public function status(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'connected' => app(GoogleCalendarSync::class)->connected($user),
            'email' => $user->google_email,
        ]);
    }

    public function connect(Request $request, GoogleCalendarSync $sync)
    {
        try {
            return response()->json([
                'url' => $sync->authorizationUrl($request->user()),
            ]);
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }
    }

    public function finish(Request $request, GoogleCalendarSync $sync)
    {
        $validated = $request->validate([
            'code' => ['required', 'string'],
            'state' => ['required', 'string'],
        ]);

        try {
            // Google sends the browser back without the WoSPIS login token, so the
            // encrypted state identifies who started Connect Google.
            $user = $sync->userFromState($validated['state']);
            $result = $sync->connect($user, $validated['code'], $validated['state']);
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json([
            'connected' => true,
            'email' => $result['email'],
            'events' => $result['events'],
        ]);
    }

    public function disconnect(Request $request, GoogleCalendarSync $sync)
    {
        $sync->disconnect($request->user());

        return response()->json(['connected' => false]);
    }

    public function feed(Request $request, GoogleCalendarFeed $builder, string $token)
    {
        abort_unless(preg_match('/^[A-Za-z0-9]{48}$/', $token) === 1, 404);

        $user = User::query()->where('calendar_token', $token)->first();
        abort_unless($user, 404);

        $scope = $request->query('scope') === 'assigned' ? 'assigned' : 'personal';
        $this->assertScope($user, $scope);

        $download = $request->boolean('download');

        return response($builder->render($user, $scope), 200, [
            'Content-Type' => 'text/calendar; charset=utf-8',
            'Content-Disposition' => ($download ? 'attachment' : 'inline').'; filename="techhrm.ics"',
            'Cache-Control' => 'private, max-age=300',
        ]);
    }

    private function assertScope(User $user, string $scope): void
    {
        if ($scope === 'personal') {
            return;
        }

        abort_unless(
            in_array($user->role, ['Supervisor', 'Department Secretary', 'WSPO Staff', 'Super Admin'], true),
            403,
            'This calendar is only available for a supervisor or the work-study office.'
        );
    }

    private function feedIsReachable(string $url): bool
    {
        $parts = parse_url($url);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        if ($scheme !== 'https' || $host === '' || $host === 'localhost' || str_ends_with($host, '.local') || str_ends_with($host, '.test')) {
            return false;
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return (bool) filter_var(
                $host,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            );
        }

        return true;
    }
}
