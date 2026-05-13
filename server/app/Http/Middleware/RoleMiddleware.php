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
        // 1. Check if user is authenticated
        if (!Auth::check()) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $user = Auth::user();

        // 2. Strip any accidental spaces from the route definition
        $cleanRoles = array_map('trim', $roles);

        // 3. Check if their role is in the cleaned allowed array
        if (!in_array($user->role, $cleanRoles)) {
            // Optional: You can keep these debug lines here temporarily if you want to see exactly what is failing in the Network tab
            return response()->json([
                'message' => 'Unauthorized access for your role.',
                'debug_user_role' => $user->role,
                'debug_required_roles' => $cleanRoles
            ], 403);
        }

        return $next($request);
    }
}
