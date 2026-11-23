<?php

namespace App\Services;

use App\Mail\AccountEventMail;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Mail;

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
     */
    public function duty(?User $user, string $subject, string $heading, string $paragraph, array $details = [], ?string $notice = null): void
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
    ): void {
        $recipient = $this->deliverable($user) ?? $user;
        $to = $to ?? $this->accountAddress($recipient);
        if ($to === null || ! $this->canSend()) {
            return;
        }

        try {
            Mail::to($to)->send(new AccountEventMail(
                recipientName: $recipient->name ?: $recipient->username,
                subjectLine: $subject,
                heading: $heading,
                paragraphs: $paragraphs,
                details: $details,
                notice: $notice ?? "Didn't do this? Contact the Work-Study Program Office immediately so the account can be secured.",
            ));
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
