<?php

namespace App\Models;

use App\Support\OffenseCatalog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DisciplinaryRecord extends Model
{
    protected $fillable = [
        'student_id',
        'issued_by',
        'violation_type',
        'offense_level',
        'incident_date',
        'description',
        'penalty_hours',
        'penalty',
        'suspension_length',
        'suspension_ends_at',
        'suspension_reason',
        'deduction_amount',
        'status',
        'appeal_notes',
        'resolved_at',
        'resolution_remarks',
    ];

    protected $casts = [
        'incident_date' => 'date',
        'resolved_at' => 'datetime',
        'suspension_ends_at' => 'datetime',
        'penalty_hours' => 'decimal:2',
        'deduction_amount' => 'decimal:2',
    ];

    public function getOffenseLevelAttribute($value): ?string
    {
        return $value ?: OffenseCatalog::levelFor($this->attributes['violation_type'] ?? null);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function issuer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'issued_by');
    }

    public function reporter(): BelongsTo
    {
        return $this->issuer();
    }

    /** Hours deducted from duty on the DTR. Dismissal removes the deduction. */
    public static function dutyDeductionHours(int $studentId, ?string $start = null, ?string $end = null): float
    {
        $query = static::query()
            ->where('student_id', $studentId)
            ->where('status', '!=', 'Dismissed')
            ->where('penalty', '!=', 'Pending')
            ->where('penalty_hours', '>', 0);

        if ($start) {
            $query->whereDate('incident_date', '>=', $start);
        }
        if ($end) {
            $query->whereDate('incident_date', '<=', $end);
        }

        return (float) $query->sum('penalty_hours');
    }

    public static function activeSuspension(int $studentId): ?self
    {
        return static::query()
            ->where('student_id', $studentId)
            ->where('penalty', 'Suspension')
            ->whereIn('status', ['Active', 'Pending Appeal'])
            ->where(function ($query) {
                $query->whereNull('suspension_ends_at')
                    ->orWhere('suspension_ends_at', '>', now());
            })
            ->latest()
            ->first();
    }

    public function suspensionNotice(): string
    {
        $until = $this->suspension_ends_at
            ? ' until ' . $this->suspension_ends_at->format('F j, Y')
            : '';
        $length = $this->suspension_length ? " ({$this->suspension_length})" : '';
        $reason = $this->suspension_reason ? " Reason: {$this->suspension_reason}" : '';

        return "You are suspended from duty{$length}{$until}.{$reason}";
    }
}
