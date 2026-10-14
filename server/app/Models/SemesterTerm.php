<?php

namespace App\Models;

use App\Traits\RecordsActivity;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SemesterTerm extends Model
{
    use RecordsActivity;

    protected $fillable = [
        'label',
        'starts_on',
        'ends_on',
        'months',
        'updated_by',
    ];

    protected $casts = [
        'starts_on' => 'date',
        'ends_on' => 'date',
        'months' => 'integer',
    ];

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public static function current(): ?self
    {
        return static::query()->latest('id')->first();
    }

    public static function endFromStart(string $start, int $months): string
    {
        return Carbon::parse($start)->startOfDay()->addMonthsNoOverflow($months)->subDay()->toDateString();
    }

    public function toPayload(): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'starts_on' => $this->starts_on->toDateString(),
            'ends_on' => $this->ends_on->toDateString(),
            'months' => (int) $this->months,
        ];
    }
}
