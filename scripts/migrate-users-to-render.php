<?php

/**
 * One-off: copy users + user_profiles from local MySQL to Render Postgres.
 *
 * Usage:
 *   php scripts/migrate-users-to-render.php "postgresql://user:pass@host:5432/dbname"
 */

declare(strict_types=1);

if ($argc < 2) {
    fwrite(STDERR, "Usage: php scripts/migrate-users-to-render.php <external-postgres-url>\n");
    exit(1);
}

$remoteUrl = $argv[1];
$parts = parse_url($remoteUrl);

if (($parts['scheme'] ?? '') !== 'postgresql' && ($parts['scheme'] ?? '') !== 'postgres') {
    fwrite(STDERR, "Expected a postgresql:// URL\n");
    exit(1);
}

$host = $parts['host'] ?? '';
$port = (string) ($parts['port'] ?? 5432);
$db = ltrim($parts['path'] ?? '', '/');
$user = $parts['user'] ?? '';
$pass = $parts['pass'] ?? '';

if ($host === '' || $db === '' || $user === '') {
    fwrite(STDERR, "Could not parse Postgres URL\n");
    exit(1);
}

require __DIR__ . '/../server/vendor/autoload.php';
$app = require __DIR__ . '/../server/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

echo "Reading local MySQL users...\n";

$users = DB::table('users')->orderBy('id')->get()->map(fn ($row) => (array) $row)->all();
$profiles = DB::table('user_profiles')->orderBy('id')->get()->map(function ($row) {
    $data = (array) $row;
    // MySQL JSON may already be a string; keep as string for Postgres json/jsonb-ish text insert.
    if (array_key_exists('supervised_departments', $data) && $data['supervised_departments'] !== null && !is_string($data['supervised_departments'])) {
        $data['supervised_departments'] = json_encode($data['supervised_departments']);
    }
    return $data;
})->all();

echo 'Local users: ' . count($users) . ', profiles: ' . count($profiles) . PHP_EOL;

$dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s;sslmode=require', $host, $port, $db);
$pdo = new PDO($dsn, $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

echo "Connected to Render Postgres at {$host}\n";

$pdo->beginTransaction();
try {
    // CASCADE clears dependent rows (tokens, etc). Render free DB cannot set session_replication_role.
    $pdo->exec('TRUNCATE TABLE users RESTART IDENTITY CASCADE');

    $userSql = 'INSERT INTO users (
        id, name, username, email, password, must_change_password, role,
        profile_picture, phone_number, remember_token, created_at, updated_at,
        department_id, deleted_at
    ) VALUES (
        :id, :name, :username, :email, :password, :must_change_password, :role,
        :profile_picture, :phone_number, :remember_token, :created_at, :updated_at,
        :department_id, :deleted_at
    )';
    $userStmt = $pdo->prepare($userSql);

    foreach ($users as $u) {
        $userStmt->execute([
            ':id' => $u['id'],
            ':name' => $u['name'],
            ':username' => $u['username'],
            ':email' => $u['email'],
            ':password' => $u['password'],
            ':must_change_password' => !empty($u['must_change_password']) ? 'true' : 'false',
            ':role' => $u['role'],
            ':profile_picture' => $u['profile_picture'],
            ':phone_number' => $u['phone_number'],
            ':remember_token' => $u['remember_token'],
            ':created_at' => $u['created_at'],
            ':updated_at' => $u['updated_at'],
            ':department_id' => $u['department_id'],
            ':deleted_at' => $u['deleted_at'],
        ]);
    }

    $profileSql = 'INSERT INTO user_profiles (
        id, user_id, student_id_number, course, year_level, gender, assigned_office,
        supervised_departments, duty_type, duty_request, created_at, updated_at
    ) VALUES (
        :id, :user_id, :student_id_number, :course, :year_level, :gender, :assigned_office,
        :supervised_departments, :duty_type, :duty_request, :created_at, :updated_at
    )';
    $profileStmt = $pdo->prepare($profileSql);

    foreach ($profiles as $p) {
        $supervised = $p['supervised_departments'];
        if ($supervised !== null && $supervised !== '') {
            // Ensure valid JSON text for Postgres
            if (is_string($supervised)) {
                json_decode($supervised);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    $supervised = json_encode($supervised);
                }
            } else {
                $supervised = json_encode($supervised);
            }
        } else {
            $supervised = null;
        }

        $profileStmt->execute([
            ':id' => $p['id'],
            ':user_id' => $p['user_id'],
            ':student_id_number' => $p['student_id_number'],
            ':course' => $p['course'],
            ':year_level' => $p['year_level'],
            ':gender' => $p['gender'],
            ':assigned_office' => $p['assigned_office'],
            ':supervised_departments' => $supervised,
            ':duty_type' => $p['duty_type'],
            ':duty_request' => $p['duty_request'],
            ':created_at' => $p['created_at'],
            ':updated_at' => $p['updated_at'],
        ]);
    }

    $pdo->exec("SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1))");
    $pdo->exec("SELECT setval(pg_get_serial_sequence('user_profiles', 'id'), COALESCE((SELECT MAX(id) FROM user_profiles), 1))");

    $pdo->commit();

    $remoteUsers = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $remoteProfiles = (int) $pdo->query('SELECT COUNT(*) FROM user_profiles')->fetchColumn();
    $activeUsers = (int) $pdo->query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL')->fetchColumn();

    echo "Import complete.\n";
    echo "Remote users: {$remoteUsers} (active: {$activeUsers}), profiles: {$remoteProfiles}\n";
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'Import failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
