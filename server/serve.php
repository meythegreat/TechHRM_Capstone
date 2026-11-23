<?php

/**
 * Router for PHP's built-in server. Start with cwd set to public/.
 * Replaces `php artisan serve`, whose supervisor only reads the process
 * pipe every 500ms and stalls every worker once that pipe fills.
 */

$publicPath = getcwd();

$uri = urldecode(
    parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? ''
);

if ($uri !== '/' && $uri !== '' && file_exists($publicPath.$uri)) {
    return false;
}

$started = microtime(true);

require_once $publicPath.'/index.php';

$milliseconds = (microtime(true) - $started) * 1000;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
fwrite(STDOUT, sprintf("[%s] %s %s %.1fms\n", date('Y-m-d H:i:s'), $method, $uri, $milliseconds));
fflush(STDOUT);
