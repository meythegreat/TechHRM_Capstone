<?php

namespace App\Http\Controllers;

use App\Support\ForceClockOut;
use App\Support\SuperAdminAudit;
use Illuminate\Http\Request;

/**
 * Super Admin–only force clock-out for forgotten open sessions.
 *
 * Explicit SuperAdminAudit exception: most Super Admin routes stay read-only via
 * SuperAdminAudit::denyMutation(). These endpoints intentionally allow mutation
 * because only Super Admin may bulk/selected-close open regular and activity rows.
 *
 * @see SuperAdminAudit::FORCE_CLOCK_OUT_EXCEPTION
 */
class ForceClockOutController extends Controller
{
    /** List every open regular-duty and activity attendance session. */
    public function openSessions(Request $request)
    {
        SuperAdminAudit::assertForceClockOutAllowed($request);

        $sessions = array_map(
            fn ($row) => ForceClockOut::present($row),
            ForceClockOut::openSessions()
        );

        return response()->json([
            'sessions' => $sessions,
            'count' => count($sessions),
        ]);
    }

    /**
     * Close open sessions.
     *
     * mode=bulk → every open regular + activity session
     * mode=selected + attendance_ids → only the chosen open rows
     */
    public function store(Request $request)
    {
        SuperAdminAudit::assertForceClockOutAllowed($request);

        $validated = $request->validate([
            'mode' => 'required|in:bulk,selected',
            'attendance_ids' => 'required_if:mode,selected|array|min:1',
            'attendance_ids.*' => 'integer|distinct',
        ]);

        $actor = $request->user();

        if ($validated['mode'] === 'bulk') {
            $sessions = ForceClockOut::openSessions();
            if ($sessions === []) {
                return response()->json([
                    'message' => 'No open sessions to clock out.',
                    'mode' => 'bulk',
                    'closed' => 0,
                    'failed' => 0,
                    'results' => [],
                ]);
            }

            $outcome = ForceClockOut::closeMany($sessions, $actor);

            return response()->json([
                'message' => $this->summaryMessage($outcome['closed'], $outcome['failed'], 'bulk'),
                'mode' => 'bulk',
                'closed' => $outcome['closed'],
                'failed' => $outcome['failed'],
                'results' => $outcome['results'],
            ]);
        }

        $ids = array_map('intval', $validated['attendance_ids']);
        $sessions = ForceClockOut::openSessions($ids);
        $foundIds = array_map(fn ($row) => (int) $row->id, $sessions);
        $missing = array_values(array_diff($ids, $foundIds));

        if ($sessions === []) {
            return response()->json([
                'message' => 'None of the selected sessions are open.',
                'mode' => 'selected',
                'closed' => 0,
                'failed' => count($missing),
                'missing_ids' => $missing,
                'results' => [],
            ], 422);
        }

        $outcome = ForceClockOut::closeMany($sessions, $actor);
        foreach ($missing as $missingId) {
            $outcome['results'][] = [
                'ok' => false,
                'attendance_id' => $missingId,
                'session_kind' => 'unknown',
                'hours_rendered' => null,
                'message' => 'Session was not open (already closed or not found).',
            ];
            $outcome['failed']++;
        }

        return response()->json([
            'message' => $this->summaryMessage($outcome['closed'], $outcome['failed'], 'selected'),
            'mode' => 'selected',
            'closed' => $outcome['closed'],
            'failed' => $outcome['failed'],
            'missing_ids' => $missing,
            'results' => $outcome['results'],
        ]);
    }

    private function summaryMessage(int $closed, int $failed, string $mode): string
    {
        $scope = $mode === 'bulk' ? 'Bulk' : 'Selected';
        if ($closed === 0 && $failed === 0) {
            return "{$scope} clock-out: nothing to close.";
        }
        if ($failed === 0) {
            return "{$scope} clock-out closed {$closed} session".($closed === 1 ? '' : 's').'.';
        }

        return "{$scope} clock-out closed {$closed}, failed {$failed}.";
    }
}
