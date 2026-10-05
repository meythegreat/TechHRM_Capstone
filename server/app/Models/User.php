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
        'password',
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
        ];
    }

    protected static function booted(): void
    {
        static::deleting(function (User $user): void {
            if ($user->isForceDeleting()) {
                return;
            }

            // Soft delete keeps the row, and username is unique. Free the
            // login email so the same address can be registered again.
            $user->releaseUsername();
        });
    }

    public function releaseUsername(): void
    {
        $suffix = '#deleted-' . $this->getKey();
        $current = (string) $this->username;

        if ($current === '' || str_ends_with($current, $suffix)) {
            return;
        }

        $released = $current . $suffix;
        if (strlen($released) > 255) {
            $released = substr($current, 0, 255 - strlen($suffix)) . $suffix;
        }

        DB::table('users')->where('id', $this->getKey())->update(['username' => $released]);
        $this->username = $released;
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

    public function requirements()
    {
        return $this->hasMany(Requirement::class);
    }
}
