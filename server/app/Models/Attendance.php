<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\RecordsActivity;

class Attendance extends Model
{
    use HasFactory, RecordsActivity;

    protected $fillable = [
        'user_id',
        'attendance_type',
        'verification_code_used',
        'check_in_method',
        'code_owner_id',
        'time_in',
        'time_out',
        'rendered_hours',
        'computed_hours',
        'work_type',
        'task_description',
        'status',
        'is_anomaly',
        'anomaly_reason',
        'rendered_hour_event_id',
        'activity_hours',
        'schedule_id',
        'janitorial_group_id',
        'janitorial_area',
        'cleaning_before_path',
        'cleaning_after_path',
        'cleaning_before_captured_at',
        'cleaning_after_captured_at',
    ];

    protected $casts = [
        'time_in' => 'datetime',
        'time_out' => 'datetime',
        'is_anomaly' => 'boolean',
        'computed_hours' => 'decimal:2',
        'activity_hours' => 'float',
        'cleaning_before_captured_at' => 'datetime',
        'cleaning_after_captured_at' => 'datetime',
    ];

    protected $appends = ['account_deleted'];

    // An attendance record belongs to one specific User
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function renderedHourEvent()
    {
        return $this->belongsTo(RenderedHourEvent::class, 'rendered_hour_event_id');
    }

    public function janitorialGroup()
    {
        return $this->belongsTo(JanitorialGroup::class, 'janitorial_group_id');
    }

    /** Official DTR rows are ordinary shift clock-ins. Meeting scans stay off the timesheet. */
    public function isNormalClockIn(): bool
    {
        if ($this->rendered_hour_event_id) {
            return false;
        }

        $label = strtolower(trim((string) $this->attendance_type.' '.$this->work_type));

        return !str_contains($label, 'meeting');
    }

    /**
     * Soft-deleted accounts stay in the archive for Super Admin.
     * Every other role only receives records whose account still exists.
     */
    public function scopeVisibleTo($query, ?string $role)
    {
        if ($role === 'Super Admin') {
            return $query->with(['user' => function ($relation) {
                $relation->withTrashed()->with('profile');
            }]);
        }

        return $query->whereHas('user')->with('user.profile');
    }

    public function getAccountDeletedAttribute(): bool
    {
        if (!$this->relationLoaded('user') || $this->user === null) {
            return false;
        }

        return $this->user->trashed();
    }
}
