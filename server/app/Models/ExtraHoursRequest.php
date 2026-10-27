<?php

namespace App\Models;

use App\Traits\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ExtraHoursRequest extends Model
{
    use RecordsActivity;

    public const DRAFT = 'Draft';
    public const PENDING = 'Pending';
    public const APPROVED = 'Approved';
    public const REJECTED = 'Rejected';

    protected $fillable = [
        'requested_by',
        'department',
        'requester_title',
        'duty_description',
        'period_label',
        'period_start',
        'period_end',
        'approved_hours',
        'status',
        'approval_letter_path',
        'decision_note',
        'reviewed_by',
        'reviewed_at',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end' => 'date',
        'approved_hours' => 'float',
        'reviewed_at' => 'datetime',
    ];

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function students(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'extra_hours_request_students')
            ->withTimestamps()
            ->with('profile:id,user_id,student_id_number,assigned_office,gender');
    }

    public function isApproved(): bool
    {
        return $this->status === self::APPROVED;
    }

    public function coversDate(\Carbon\CarbonInterface $at): bool
    {
        $day = $at->toDateString();

        return $day >= $this->period_start->toDateString()
            && $day <= $this->period_end->toDateString();
    }
}
