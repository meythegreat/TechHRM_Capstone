<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Schema;

class JanitorialLeader extends Model
{
    protected $fillable = [
        'user_id',
        'is_present',
    ];

    protected $casts = [
        'is_present' => 'boolean',
    ];

    /**
     * A leader is off duty when the coordinator has marked them absent,
     * or when the coordinator has approved their absence request for this date.
     */
    public static function isOnDuty(int $userId, ?Carbon $on = null): bool
    {
        if ($userId <= 0) {
            return true;
        }

        $day = ($on ?? now())->copy()->timezone(config('app.timezone'))->toDateString();
        if (Schema::hasTable('janitorial_supervisor_absences')) {
            $approved = JanitorialSupervisorAbsence::query()
                ->where('user_id', $userId)
                ->where('status', JanitorialSupervisorAbsence::APPROVED)
                ->whereDate('absent_on', $day)
                ->exists();
            if ($approved) {
                return false;
            }
        }

        if (! Schema::hasTable('janitorial_leaders') || ! Schema::hasColumn('janitorial_leaders', 'is_present')) {
            return true;
        }

        $flag = static::query()->where('user_id', $userId)->value('is_present');

        return $flag === null ? true : (bool) $flag;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function groups(): HasMany
    {
        return $this->hasMany(JanitorialGroup::class, 'supervisor_user_id', 'user_id');
    }
}
