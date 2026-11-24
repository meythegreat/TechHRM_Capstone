<?php

namespace App\Models;

use App\Traits\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WsaEvaluation extends Model
{
    use RecordsActivity;

    public const DRAFT = 'Draft';

    public const PENDING = 'Pending';

    public const APPROVED = 'Approved';

    public const REJECTED = 'Rejected';

    public const RATINGS = ['Outstanding', 'Very Good', 'Good', 'Fair', 'Poor'];

    public const RECOMMENDATIONS = ['Retained', 'Replace', 'Suspension'];

    /** Official WSA Evaluation Form standards (FCU-EOMS-WP-002-F). */
    public const STANDARDS = [
        ['id' => 'greets', 'text' => 'Greets all clients, school authorities & peers in a friendly and respectful manner.'],
        ['id' => 'confidentiality', 'text' => 'Respects confidentially rights.'],
        ['id' => 'service', 'text' => 'Puts service above any personal interest or activities while on duty.'],
        ['id' => 'courtesy', 'text' => 'Deals responsively and courteously with employees and clients.'],
        ['id' => 'property', 'text' => 'Cares for FCU property and keeps workplace safe and tidy.'],
        ['id' => 'facilities', 'text' => 'Appropriate use of school facilities.'],
        ['id' => 'efficiency', 'text' => 'Does tasks in an efficient & timely manner.'],
        ['id' => 'initiative', 'text' => 'Takes initiative and independence within job descriptions.'],
        ['id' => 'attendance', 'text' => 'Attends regularly and punctually in work/assigned tasks.'],
        ['id' => 'quality', 'text' => 'Provides consistent quality service.'],
        ['id' => 'communication', 'text' => 'Communicates clearly and honestly.'],
        ['id' => 'attire', 'text' => 'Wears appropriate and neat attire.'],
        ['id' => 'hygiene', 'text' => 'Practices personal hygiene.'],
    ];

    protected $fillable = [
        'submitted_by',
        'student_id',
        'department',
        'semester_label',
        'school_year',
        'evaluated_on',
        'ratings',
        'comments',
        'recommendation',
        'evaluated_by_name',
        'attested_by_name',
        'evaluated_signature_path',
        'evaluated_signature_name',
        'attested_signature_path',
        'attested_signature_name',
        'status',
        'decision_note',
        'reviewed_by',
        'reviewed_at',
    ];

    protected $casts = [
        'ratings' => 'array',
        'evaluated_on' => 'date',
        'reviewed_at' => 'datetime',
    ];

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /** @return list<string> */
    public static function standardIds(): array
    {
        return array_column(self::STANDARDS, 'id');
    }
};
