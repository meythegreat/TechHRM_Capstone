<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Illuminate\Support\Facades\Auth;

class RoleMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     * @param  string  ...$roles
     */
    public function handle(Request $request, Closure $next, ...$roles): Response
    {
        // Check if authenticated
        if (!Auth::check()) {
            return response()->json([
                'message' => 'Unauthenticated.'
            ], 401);
        }

        $user = Auth::user();

        // Clean route roles
        $cleanRoles = array_map('trim', $roles);

        // A department secretary uses the supervisor's access only while that supervisor is absent.
        if ($user->role === 'Department Secretary' && in_array('Supervisor', $cleanRoles, true)) {
            if (!app(\App\Http\Controllers\UserController::class)->isActingDepartmentSecretary($user)) {
                return response()->json([
                    'message' => 'The department supervisor is on duty. You can act for them after they are marked absent.',
                ], 403);
            }

            return $next($request);
        }

        // Check authorization
        if (!in_array($user->role, $cleanRoles)) {
            return response()->json([
                'message' => 'Forbidden'
            ], 403);
        }

        return $next($request);
    }
}
