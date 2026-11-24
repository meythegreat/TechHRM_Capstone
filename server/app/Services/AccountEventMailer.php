<?php

namespace App\Services;

use App\Mail\AccountEventMail;
use App\Models\Attendance;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

class AccountEventMailer
{
    public function signedIn(User $user, ?string $ipAddress): void
    {
        $this->send(
            $this->accountAddress($user),
            $user,
            'New sign-in to your WoSPIS account',
            'New sign-in',
            ['Someone signed in to your WoSPIS account.'],
            [
                ['label' => 'When', 'value' => Carbon::now()->timezone(config('app.timezone'))->format('M j, Y g:i A')],
                ['label' => 'IP address', 'value' => $ipAddress ?: 'Unavailable'],
                ['label' => 'Username', 'value' => (string) $user->username],
            ],
        );
    }

    public function passwordChanged(User $user, bool $byAdministrator): void
    {
        $actor = $byAdministrator ? 'An administrator' : 'You';

        $this->send(
            $this->accountAddress($user),
            $user,
            'Your WoSPIS password was changed',
            'Password changed',
            ["{$actor} changed the password for your WoSPIS account. This message does not include the new password."],
            [
                ['label' => 'Username', 'value' => (string) $user->username],
                ['label' => 'Changed by', 'value' => $byAdministrator ? 'An administrator' : 'You'],
            ],
        );
    }

    public function clock(User $user, string $action, mixed $at, ?string $detail = null): void
    {
        $out = $action === 'out';
        $heading = $out ? 'Clocked out' : 'Clocked in';
        $moment = Carbon::parse($at)->timezone(config('app.timezone'))->format('M j, Y g:i A');

        $this->duty(
            $user,
            $out ? 'You clocked out of WoSPIS' : 'You clocked in to WoSPIS',
            $heading,
            $detail ?: ($out
                ? 'Your clock-out was recorded.'
                : 'Your clock-in was recorded.'),
            [
                ['label' => 'When', 'value' => $moment],
            ],
            'If you did not clock '.($out ? 'out' : 'in').', contact the Work-Study Program Office.',
        );
    }

    /**
     * @param  list<array{label: string, value: string}>  $details
     * @param  list<array{path: string, name: string, mime?: string}>  $files
     */
    public function duty(?User $user, string $subject, string $heading, string $paragraph, array $details = [], ?string $notice = null, array $files = []): void
    {
        if (! $user) {
            return;
        }

        $this->send(
            null,
            $user,
            $subject,
            $heading,
            [$paragraph],
            $details,
            $notice ?? 'If this does not look right, contact the Work-Study Program Office.',
            $files,
        );
    }

    public function accountCreated(User $user, string $plainPassword, bool $fromSignup): void
    {
        $intro = $fromSignup
            ? 'Your WoSPIS account is ready. The email you entered when you signed up is now the email for this login.'
            : 'An administrator created your WoSPIS account in User Management.';

        $this->send(
            null,
            $user,
            'Your WoSPIS account is ready',
            'Account created',
            [$intro, 'Sign in with the username or the email below.'],
            [
                ['label' => 'Username', 'value' => (string) $user->username],
                ['label' => 'Email', 'value' => (string) ($user->email ?: 'Not on file')],
                ['label' => 'Password', 'value' => $plainPassword],
                ['label' => 'Role', 'value' => (string) $user->role],
            ],
            'If you did not expect this account, contact the Work-Study Program Office.',
            [],
            false,
        );
    }

    public function janitorialClockOut(User $user, Attendance $attendance, string $paragraph): void
    {
        $when = $attendance->time_out
            ? Carbon::parse($attendance->time_out)->timezone(config('app.timezone'))->format('M j, Y g:i A')
            : Carbon::now()->timezone(config('app.timezone'))->format('M j, Y g:i A');
        $area = trim((string) ($attendance->janitorial_area ?: 'Janitorial'));
        $photos = $this->cleaningPhotos($attendance);

        $this->duty(
            $user,
            'You clocked out of janitorial duty',
            'Clocked out',
            $paragraph.' The before and after surroundings photos are attached.',
            [
                ['label' => 'When', 'value' => $when],
                ['label' => 'Area', 'value' => $area],
                ['label' => 'Photos', 'value' => count($photos) === 2 ? 'Before and after attached' : count($photos).' attached'],
            ],
            'If you did not clock out, contact the Work-Study Program Office.',
            $photos,
        );
    }

    /**
     * @param  list<array{label: string, value: string}>  $details
     */
    public function dutyFor(int $userId, string $subject, string $heading, string $paragraph, array $details = [], ?string $notice = null): void
    {
        $this->duty(User::query()->find($userId), $subject, $heading, $paragraph, $details, $notice);
    }

    public function emailChanged(User $user, ?string $previousEmail, ?string $newEmail, bool $byAdministrator): void
    {
        $previous = $this->validEmail($previousEmail);
        $next = $this->validEmail($newEmail);

        if ($previous === $next) {
            return;
        }

        $actor = $byAdministrator ? 'An administrator' : 'You';
        $nextLabel = $next ?? 'Removed';

        if ($previous !== null) {
            $this->send(
                $previous,
                $user,
                'Your WoSPIS email address was changed',
                'Email address changed',
                ["{$actor} changed the email address on your WoSPIS account. Future security messages will go to the new address."],
                [
                    ['label' => 'Username', 'value' => (string) $user->username],
                    ['label' => 'Previous email', 'value' => $previous],
                    ['label' => 'New email', 'value' => $nextLabel],
                ],
            );
        }

        if ($next !== null) {
            $this->send(
                $next,
                $user,
                'This email is now used for your WoSPIS account',
                'Email address confirmed',
                ['This address is now the email on file for your WoSPIS account.'],
                [
                    ['label' => 'Username', 'value' => (string) $user->username],
                    ['label' => 'Email', 'value' => $next],
                ],
            );
        }
    }

    public function accountAddress(User $user): ?string
    {
        return $this->validEmail($user->email) ?? $this->validEmail($user->username);
    }

    private function send(
        ?string $to,
        User $user,
        string $subject,
        string $heading,
        array $paragraphs,
        array $details,
        ?string $notice = null,
        array $files = [],
        bool $hidesPassword = true,
    ): void {
        $recipient = $this->deliverable($user) ?? $user;
        $to = $to ?? $this->accountAddress($recipient);
        if ($to === null || ! $this->canSend()) {
            return;
        }

        $message = new AccountEventMail(
            recipientName: $recipient->name ?: $recipient->username,
            subjectLine: $subject,
            heading: $heading,
            paragraphs: $paragraphs,
            details: $details,
            notice: $notice ?? "Didn't do this? Contact the Work-Study Program Office immediately so the account can be secured.",
            files: $files,
            hidesPassword: $hidesPassword,
        );

        try {
            $pending = Mail::to($to);
            // The sync driver (tests) sends now. A real queue keeps SMTP off the
            // web workers so a slow mail server cannot pin every PHP process.
            if (config('queue.default') === 'sync') {
                $pending->send($message);
            } else {
                $pending->queue($message);
            }
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    private function deliverable(User $user): ?User
    {
        if ($this->accountAddress($user)) {
            return $user;
        }

        if (! $user->id) {
            return null;
        }

        $fresh = User::query()->find($user->id);

        return $fresh && $this->accountAddress($fresh) ? $fresh : null;
    }

    /**
     * @return list<array{path: string, name: string, mime: string}>
     */
    private function cleaningPhotos(Attendance $attendance): array
    {
        $files = [];
        foreach ([
            'cleaning_before_path' => 'before-surroundings',
            'cleaning_after_path' => 'after-surroundings',
        ] as $column => $name) {
            $relative = $attendance->{$column};
            if (! is_string($relative) || $relative === '' || ! Storage::disk('local')->exists($relative)) {
                continue;
            }

            $extension = strtolower(pathinfo($relative, PATHINFO_EXTENSION) ?: 'jpg');
            $files[] = [
                'path' => Storage::disk('local')->path($relative),
                'name' => $name.'.'.$extension,
                'mime' => match ($extension) {
                    'png' => 'image/png',
                    'webp' => 'image/webp',
                    default => 'image/jpeg',
                },
            ];
        }

        return $files;
    }

    private function canSend(): bool
    {
        $key = config('services.resend.key');

        return is_string($key) && trim($key) !== '';
    }

    private function validEmail(mixed $email): ?string
    {
        if (! is_string($email)) {
            return null;
        }

        $email = strtolower(trim($email));

        return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
    }
}
