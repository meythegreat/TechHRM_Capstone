<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )

    ->withMiddleware(function (Middleware $middleware) {
        // Vite proxies API calls from this machine. Trust only loopback so the
        // forwarded client address is used, and a direct connection cannot spoof it.
        // Trust Render/Cloudflare proxies in production; keep loopback-only for local XAMPP.
        // Read $_ENV directly — config()/env() are unsafe here during early bootstrap.
        $appEnv = $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? 'production';
        $middleware->trustProxies(
            at: $appEnv === 'local' ? ['127.0.0.1', '::1', '::ffff:127.0.0.1'] : '*',
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO,
        );

        $middleware->alias([
            'role' => \App\Http\Middleware\RoleMiddleware::class,
        ]);

        $middleware->redirectGuestsTo(function ($request) {

            if ($request->is('api/*')) {
                abort(response()->json([
                    'message' => 'Unauthenticated.'
                ], 401));
            }

            return '/';
        });

    })

    ->withExceptions(function (Exceptions $exceptions) {
        //
    })

    ->create();
