<?php

namespace App\Support;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

class AccountProfileNotice
{
    public const TITLE = 'Complete your account';

    public function isFcuAccount(User $user): bool
    {
        $username = strtoupper(trim((string) $user->username));
        if (str_starts_with($username, 'FCU-')) {
            return true;
        }

        $studentId = strtoupper(trim((string) ($this->profileValue($user, 'student_id_number') ?? '')));

        return str_starts_with($studentId, 'FCU-');
    }

    public function hasEmail(User $user): bool
    {
        if (is_string($user->email) && filter_var($user->email, FILTER_VALIDATE_EMAIL)) {
            return true;
        }

        if (filter_var($user->username, FILTER_VALIDATE_EMAIL)) {
            return true;
        }

        if (! Schema::hasTable('applications')) {
            return false;
        }

        $applicationEmail = \App\Models\Application::where('user_id', $user->id)->latest()->value('email');

        return is_string($applicationEmail) && filter_var($applicationEmail, FILTER_VALIDATE_EMAIL);
    }

    /**
     * Shown after sign-in, and on the sign-in page when an email code cannot be sent.
     */
    public function message(User $user): ?string
    {
        $missingEmail = ! $this->hasEmail($user);
        $fcu = $this->isFcuAccount($user);
        $missingPersonal = $this->missingPersonalInformation($user);

        if (! $missingEmail && ! ($fcu && $missingPersonal)) {
            return null;
        }

        if ($fcu) {
            return 'This FCU account still needs an email address and personal information. Add them in Settings. Until an email is on file, sign in with your password — an email code cannot be sent.';
        }

        return 'Add your email address and personal information in Settings. Until an email is on file, sign in with your password — an email code cannot be sent.';
    }

    public function passwordFallbackMessage(User $user): string
    {
        if ($this->isFcuAccount($user)) {
            return 'This FCU account has no email address, so an 8-digit code cannot be sent. Sign in with your password, then add your email address and personal information in Settings.';
        }

        return 'This account has no email address, so an 8-digit code cannot be sent. Sign in with your password, then add your email address and personal information in Settings.';
    }

    /**
     * Create one unread reminder. Returns the message even when the notification table is absent.
     */
    public function notify(User $user): ?string
    {
        $message = $this->message($user);
        if ($message === null || ! Schema::hasTable('notifications')) {
            return $message;
        }

        $exists = Notification::query()
            ->where('user_id', $user->id)
            ->where('title', self::TITLE)
            ->where('is_read', false)
            ->exists();

        if (! $exists) {
            Notification::create([
                'user_id' => $user->id,
                'title' => self::TITLE,
                'message' => $message,
                'is_read' => false,
            ]);
        }

        return $message;
    }

    private function missingPersonalInformation(User $user): bool
    {
        if (trim((string) $user->name) === '' || trim((string) ($user->phone_number ?? '')) === '') {
            return true;
        }

        if ($user->role !== 'Student') {
            return false;
        }

        foreach (['student_id_number', 'course', 'year_level', 'gender'] as $field) {
            $value = $this->profileValue($user, $field);
            if ($value === null || trim((string) $value) === '') {
                return true;
            }
        }

        return false;
    }

    private function profileValue(User $user, string $field): mixed
    {
        if (! Schema::hasTable('user_profiles') || ! Schema::hasColumn('user_profiles', $field)) {
            return null;
        }

        $user->loadMissing('profile');

        return $user->profile?->{$field};
    }
}
