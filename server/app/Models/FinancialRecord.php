<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinancialRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'period_start',
        'period_end',
        'total_hours_rendered',
        'hourly_rate',
        'estimated_acquired_amount', // Updated to match panel notes precisely
        'allowances',
        'penalty_deductions',
        'equivalent_total_amount',   // Matches panel notes
        'status',
        'adjustment_breakdown',
        'notes',
        'processed_by',
        'locked_at',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end' => 'date',
        'total_hours_rendered' => 'float',
        'hourly_rate' => 'float',
        'estimated_acquired_amount' => 'float',
        'allowances' => 'float',
        'penalty_deductions' => 'float',
        'equivalent_total_amount' => 'float',
        'adjustment_breakdown' => 'array',
        'locked_at' => 'datetime',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function processor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }

    /**
     * Recalculate the assessment values based on the rendered hours.
     */
    public function recalculate(): void
    {
        // Calculates: Estimated/acquired amount (e.g., 28 * 15) as per panel notes
        $this->estimated_acquired_amount = round($this->total_hours_rendered * $this->hourly_rate, 2);

        // Calculates: Equivalent Total Amount
        $this->equivalent_total_amount = round(
            max(0, $this->estimated_acquired_amount + $this->allowances - $this->penalty_deductions),
            2
        );
    }
}
