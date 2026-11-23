#!/bin/sh
# Render's health check allows 5 seconds. Listen before migrate/seed so a
# restart can answer /up while those commands are still running.
set -u

port="${PORT:-10000}"

# ServeCommand ignores PHP_CLI_SERVER_WORKERS unless --no-reload is set, and
# then the built-in server handles one request at a time. Dashboard polls
# (/api/user, /api/notifications, /up, bulletins, schedules) queue behind
# whichever request is running, and the supervisor only reports completions
# every 500ms — so the log fills with ~500ms, 1s, 2s, … stalls.
# Four workers keep a slow call from freezing the rest of the app.
export PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-4}"

php artisan serve --host=0.0.0.0 --port="$port" --no-reload &
server_pid=$!

shutdown() {
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
    exit 0
}
trap shutdown TERM INT

php artisan migrate --force || echo "migrate failed"
php artisan db:seed --force || echo "seed failed"
php artisan schedule:work --no-interaction > /tmp/shift-reminders.log 2>&1 &

wait "$server_pid"
