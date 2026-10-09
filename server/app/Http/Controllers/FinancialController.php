<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Support\SuperAdminAudit;
use App\Models\DisciplinaryRecord;
use App\Models\FinancialRecord;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FinancialController extends Controller
{
    private const VERIFIED_STATUSES = ['accepted', 'approved', 'Approved'];

    public function index(Request $request)
    {
        $records = FinancialRecord::with('student:id,name')->orderByDesc('period_start')->get();
        $stats = [
            'total_equivalent_value' => (float) FinancialRecord::whereIn('status', ['Approved', 'Locked', 'Forwarded to Finance'])->sum('equivalent_total_amount'),
            'pending_drafts' => FinancialRecord::where('status', 'Draft')->count(),
        ];

        return response()->json(['records' => ['data' => $records], 'stats' => $stats]);
    }

    public function computePeriod(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $request->validate([
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
            'hourly_rate' => 'required|numeric|min:0',
        ]);

        $start = Carbon::parse($request->period_start)->startOfDay();
        $end = Carbon::parse($request->period_end)->endOfDay();
        $rate = (float) $request->hourly_rate;
        $assessed = 0;
        $skipped = 0;

        DB::transaction(function () use ($request, $start, $end, $rate, &$assessed, &$skipped) {
            $students = User::where('role', 'Student')->get();

            foreach ($students as $student) {
                $record = FinancialRecord::firstOrNew([
                    'user_id' => $student->id,
                    'period_start' => $request->period_start,
                    'period_end' => $request->period_end,
                ]);

                if (in_array($record->status, ['Locked', 'Forwarded to Finance'], true)) {
                    $skipped++;
                    continue;
                }

                // Days already saved on an earlier coverage stay there, so overlapping periods do not bill the same duty twice.
                $hours = $this->verifiedHours($student->id, $start, $end, $record->exists ? $record->id : null, true);
                if ($hours <= 0) {
                    if ($record->exists) {
                        $record->delete();
                    }
                    continue;
                }

                $penalty = $this->penaltyAmount($student->id, $request->period_start, $request->period_end, $rate, $hours);

                $record->total_hours_rendered = round($hours, 2);
                $record->hourly_rate = $rate;
                $record->allowances = (float) ($record->allowances ?? 0);
                $record->penalty_deductions = $penalty['amount'];
                $record->status = $record->status ?: 'Draft';
                $record->adjustment_breakdown = array_merge($record->adjustment_breakdown ?? [], [[
                    'type' => 'compute',
                    'gross_hours' => round($hours, 2),
                    'penalty_hours' => $penalty['hours'],
                    'fixed_deductions' => $penalty['fixed'],
                    'at' => now()->toIso8601String(),
                ]]);
                $record->recalculate();
                $record->save();
                $assessed++;
            }
        });

        return response()->json([
            'message' => $assessed > 0
                ? 'Hours rendered recorded for this period.'
                : 'No verified duty hours were found in that period.',
            'assessed' => $assessed,
            'skipped_locked' => $skipped,
        ]);
    }

    public function updateAdjustments(Request $request, $id)
    {
        SuperAdminAudit::denyMutation($request);
        $record = FinancialRecord::findOrFail($id);

        $validated = $request->validate([
            'allowances' => 'nullable|numeric|min:0',
            'penalty_deductions' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string|max:2000',
            'status' => 'nullable|in:Draft,Approved,Locked,Forwarded to Finance',
            'adjustment_reason' => 'nullable|string|max:500',
        ]);

        if (array_key_exists('allowances', $validated) && $validated['allowances'] !== null) {
            $record->allowances = $validated['allowances'];
        }
        if (array_key_exists('penalty_deductions', $validated) && $validated['penalty_deductions'] !== null) {
            $record->penalty_deductions = $validated['penalty_deductions'];
        }
        if (array_key_exists('notes', $validated)) {
            $record->notes = $validated['notes'];
        }
        if (!empty($validated['status'])) {
            $record->status = $validated['status'];
            if (in_array($record->status, ['Locked', 'Forwarded to Finance'], true)) {
                $record->locked_at = now();
                $record->processed_by = $request->user()->id;
            } else {
                $record->locked_at = null;
            }
        }

        $breakdown = $record->adjustment_breakdown ?? [];
        $breakdown[] = [
            'type' => 'adjustment',
            'reason' => $validated['adjustment_reason'] ?? 'Manual adjustment',
            'by' => $request->user()->id,
            'at' => now()->toIso8601String(),
        ];
        $record->adjustment_breakdown = $breakdown;
        $record->recalculate();
        $record->save();

        return response()->json([
            'message' => 'Hours rendered updated.',
            'record' => $record->load('student:id,name'),
        ]);
    }

    public function destroy(Request $request, $id)
    {
        SuperAdminAudit::denyMutation($request);
        $record = FinancialRecord::findOrFail($id);
        $record->delete();

        return response()->json(['message' => 'Record cancelled.']);
    }

    public function myCompensation(Request $request)
    {
        $user = $request->user();
        $history = FinancialRecord::where('user_id', $user->id)
            ->orderByDesc('period_start')
            ->get();

        $latest = $history->first();
        if ($latest) {
            $cycleStart = Carbon::parse($latest->period_start)->startOfDay();
            $cycleEnd = Carbon::parse($latest->period_end)->endOfDay();
            $current = [
                'cycle_name' => $cycleStart->format('M j') . ' – ' . $cycleEnd->format('M j, Y'),
                'hours_rendered' => round((float) $latest->total_hours_rendered, 2),
                'hourly_rate' => round((float) $latest->hourly_rate, 2),
                'estimated_gross' => round((float) $latest->estimated_acquired_amount, 2),
                'approved_shifts_count' => $this->verifiedShiftCount($user->id, $cycleStart, $cycleEnd),
            ];
        } else {
            $cycleStart = now()->startOfMonth();
            $cycleEnd = now()->endOfMonth();
            $hours = $this->verifiedHours($user->id, $cycleStart, $cycleEnd);
            $rate = 28.0;
            $current = [
                'cycle_name' => $cycleStart->format('F Y') . ' preview',
                'hours_rendered' => round($hours, 2),
                'hourly_rate' => $rate,
                'estimated_gross' => round($hours * $rate, 2),
                'approved_shifts_count' => $this->verifiedShiftCount($user->id, $cycleStart, $cycleEnd),
            ];
        }

        $lifetime = (float) $history
            ->whereIn('status', ['Approved', 'Locked', 'Forwarded to Finance'])
            ->sum('equivalent_total_amount');

        return response()->json([
            'history' => $history,
            'current_cycle' => $current,
            'lifetime_equivalent_value' => round($lifetime, 2),
        ]);
    }

    public function exportCsv(Request $request)
    {
        $records = FinancialRecord::with('student:id,name')->orderByDesc('period_start')->get();
        $filename = 'hours_rendered_' . date('Y-m-d') . '.csv';
        $headers = [
            'Content-type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=$filename",
            'Pragma' => 'no-cache',
            'Cache-Control' => 'must-revalidate, post-check=0, pre-check=0',
            'Expires' => '0',
        ];

        $callback = function () use ($records) {
            $file = fopen('php://output', 'w');
            fputcsv($file, [
                'Student',
                'Period Start',
                'Period End',
                'Verified Hours',
                'Hourly Rate',
                'Estimated Amount',
                'Allowances',
                'Penalty Deductions',
                'Equivalent Total',
                'Status',
            ]);

            foreach ($records as $record) {
                fputcsv($file, [
                    $record->student->name ?? 'Unknown',
                    optional($record->period_start)->toDateString(),
                    optional($record->period_end)->toDateString(),
                    $record->total_hours_rendered,
                    $record->hourly_rate,
                    $record->estimated_acquired_amount,
                    $record->allowances,
                    $record->penalty_deductions,
                    $record->equivalent_total_amount,
                    $record->status,
                ]);
            }

            fclose($file);
        };

        return response()->stream($callback, 200, $headers);
    }

    private function verifiedHours(int $userId, Carbon $start, Carbon $end, ?int $exceptRecordId = null, bool $respectEarlierCoverages = false): float
    {
        $query = Attendance::query()
            ->where('user_id', $userId)
            ->whereNotNull('time_out')
            ->whereIn('status', self::VERIFIED_STATUSES)
            ->whereBetween('time_in', [$start, $end]);

        $earlier = $respectEarlierCoverages
            ? FinancialRecord::query()
                ->where('user_id', $userId)
                ->when($exceptRecordId, fn ($records) => $records->where('id', '<', $exceptRecordId))
                ->get(['period_start', 'period_end'])
            : collect();

        foreach ($earlier as $coverage) {
            $coveredStart = Carbon::parse($coverage->period_start)->startOfDay();
            $coveredEnd = Carbon::parse($coverage->period_end)->endOfDay();
            $query->where(function ($attendance) use ($coveredStart, $coveredEnd) {
                $attendance->where('time_in', '<', $coveredStart)
                    ->orWhere('time_in', '>', $coveredEnd);
            });
        }

        $row = $query
            ->selectRaw('COALESCE(SUM(CASE WHEN computed_hours > 0 THEN computed_hours ELSE COALESCE(rendered_hours, 0) END), 0) as hours')
            ->first();

        return (float) ($row->hours ?? 0);
    }

    private function verifiedShiftCount(int $userId, Carbon $start, Carbon $end): int
    {
        return Attendance::query()
            ->where('user_id', $userId)
            ->whereNotNull('time_out')
            ->whereIn('status', self::VERIFIED_STATUSES)
            ->whereBetween('time_in', [$start, $end])
            ->count();
    }

    /**
     * Peso penalty is duty-hour deductions times the rate, plus any fixed deduction amount.
     * Hour deductions cannot exceed the verified hours in the period.
     *
     * @return array{hours: float, fixed: float, amount: float}
     */
    private function penaltyAmount(int $userId, string $start, string $end, float $rate, float $hours): array
    {
        $penaltyHours = min($hours, DisciplinaryRecord::dutyDeductionHours($userId, $start, $end));
        $fixed = (float) DisciplinaryRecord::query()
            ->where('student_id', $userId)
            ->where('status', '!=', 'Dismissed')
            ->where('penalty', '!=', 'Pending')
            ->where('deduction_amount', '>', 0)
            ->whereDate('incident_date', '>=', $start)
            ->whereDate('incident_date', '<=', $end)
            ->sum('deduction_amount');

        return [
            'hours' => round($penaltyHours, 2),
            'fixed' => round($fixed, 2),
            'amount' => round(($penaltyHours * $rate) + $fixed, 2),
        ];
    }
}
