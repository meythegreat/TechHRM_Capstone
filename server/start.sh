#!/bin/sh
# Render's health check allows 5 seconds. Listen before migrate/seed so a
# restart can answer /up while those commands are still running.
set -u

port="${PORT:-10000}"

# php artisan serve checks the child every 500ms (usleep in ServeCommand).
# Dashboard polls fill the stdout pipe, workers block until the next read,
# and the log fills with ~500ms, 1s, 2s, … stalls — including /up.
# Run php -S directly so each worker logs and returns without that wait.
export PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-4}"

root="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
cd "$root/public"

setsid php -d variables_order=EGPCS -S "0.0.0.0:${port}" "$root/serve.php" &
server_pid=$!

cd "$root"

shutdown() {
    kill -TERM -"$server_pid" 2>/dev/null || kill -TERM "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
    exit 0
}
trap shutdown TERM INT

php artisan migrate --force || echo "migrate failed"
php artisan db:seed --force || echo "seed failed"
php artisan schedule:work --no-interaction > /tmp/shift-reminders.log 2>&1 &
# Account mail is queued so a slow SMTP connection cannot occupy a web worker.
php artisan queue:work --no-interaction --tries=3 --timeout=90 --sleep=1 > /tmp/queue.log 2>&1 &

wait "$server_pid"
