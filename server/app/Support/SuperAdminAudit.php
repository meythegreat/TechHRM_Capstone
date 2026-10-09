<?php

namespace App\Support;

use Illuminate\Http\Request;

class SuperAdminAudit
{
    public static function denyMutation(Request $request): void
    {
        if ($request->user()?->role === 'Super Admin') {
            abort(403, 'Super Admin access is read-only.');
        }
    }
}
