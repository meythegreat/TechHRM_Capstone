<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use App\Traits\RecordsActivity;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes, RecordsActivity;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'name',
        'username',
        'email',
        'password',
        'must_change_password',
        'role',
        'profile_picture',
        'phone_number',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'calendar_token',
        'google_refresh_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'must_change_password' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::deleting(function (User $user): void {
            if ($user->isForceDeleting()) {
                return;
            }

            // Soft delete keeps the row, and username/email are unique. Free
            // both so the same login can be registered again.
            $user->releaseUsername();
        });
    }

    public function releaseUsername(): void
    {
        $this->archiveUniqueColumn('username');
        $this->archiveUniqueColumn('email');
    }

    private function archiveUniqueColumn(string $column): void
    {
        $suffix = '#deleted-' . $this->getKey();
        $current = (string) ($this->{$column} ?? '');

        if ($current === '' || str_ends_with($current, $suffix)) {
            return;
        }

        $released = $current . $suffix;
        if (strlen($released) > 255) {
            $released = substr($current, 0, 255 - strlen($suffix)) . $suffix;
        }

        DB::table('users')->where('id', $this->getKey())->update([$column => $released]);
        $this->{$column} = $released;
    }

    public function profile()
    {
        return $this->hasOne(UserProfile::class);
    }

    public function attendances()
    {
        return $this->hasMany(Attendance::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function notifications()
    {
        return $this->hasMany(Notification::class);
    }

    public function sentMessages()
    {
        return $this->hasMany(Message::class, 'sender_id');
    }

    public function pushSubscriptions()
    {
        return $this->hasMany(PushSubscription::class);
    }

    public function requirements()
    {
        return $this->hasMany(Requirement::class);
    }

    /**
     * Secret used in the public calendar feed URL. Stored without an activity-log entry.
     */
    public function ensureCalendarToken(): string
    {
        $existing = trim((string) ($this->calendar_token ?? ''));
        if ($existing !== '') {
            return $existing;
        }

        $token = Str::random(48);
        $claimed = DB::table('users')
            ->where('id', $this->getKey())
            ->where(function ($query) {
                $query->whereNull('calendar_token')->orWhere('calendar_token', '');
            })
            ->update(['calendar_token' => $token]);

        if ($claimed === 0) {
            $token = (string) DB::table('users')->where('id', $this->getKey())->value('calendar_token');
        }

        $this->calendar_token = $token;

        return $token;
    }
}
