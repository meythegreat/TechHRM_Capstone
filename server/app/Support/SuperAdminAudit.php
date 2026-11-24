<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * Super Admin is audit / read-only for almost all write APIs.
 *
 * Call denyMutation() at the top of shared staff mutation endpoints so a Super Admin
 * token cannot create, update, or delete through those routes.
 *
 * Explicit mutation exceptions (documented, do not call denyMutation there):
 * - ForceClockOutController — Super Admin–only bulk and selected force clock-out of
 *   open regular-duty and group-activity sessions (forgotten student punches).
 * - HolidayController store/update/destroy — WSPO Staff and Super Admin may add,
 *   edit, and remove holidays and class breaks.
 *
 * @see \App\Http\Controllers\ForceClockOutController
 * @see \App\Http\Controllers\HolidayController
 */
class SuperAdminAudit
{
    /** Documented allow-list key for the force clock-out mutation exception. */
    public const FORCE_CLOCK_OUT_EXCEPTION = 'force_clock_out';

    /** Documented allow-list key for holiday and class-break writes. */
    public const HOLIDAY_EXCEPTION = 'holidays';

    public static function denyMutation(Request $request): void
    {
        if ($request->user()?->role === 'Super Admin') {
            abort(403, 'Super Admin access is read-only.');
        }
    }

    /**
     * Guard the force clock-out exception: Super Admin only (writes allowed).
     * Other roles must not use these endpoints.
     */
    public static function assertForceClockOutAllowed(Request $request): void
    {
        if ($request->user()?->role !== 'Super Admin') {
            abort(403, 'Only a Super Admin can force clock-out open sessions.');
        }
    }
}
