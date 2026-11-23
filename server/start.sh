#!/bin/sh
# Render's health check allows 5 seconds. Listen before migrate/seed so a
# restart can answer /up while those commands are still running.
set -u

port="${PORT:-10000}"

php artisan serve --host=0.0.0.0 --port="$port" &
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
