<?php

namespace App\Http\Controllers;

use App\Models\FinancialRecord;
use App\Models\Attendance;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FinancialController extends Controller {

    public function index(Request $request) {
        $records = FinancialRecord::with('student:id,name')->orderByDesc('period_start')->get();
        $stats = [
            'total_equivalent_value' => (float) FinancialRecord::whereIn('status', ['Approved', 'Locked', 'Forwarded to Finance'])->sum('equivalent_total_amount'),
            'pending_drafts' => FinancialRecord::where('status', 'Draft')->count(),
        ];
        return response()->json(['records' => ['data' => $records], 'stats' => $stats]);
    }

    public function computePeriod(Request $request) {
        $request->validate([
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
            'hourly_rate' => 'required|numeric',
        ]);

        $students = User::where('role', 'Student')->get();

        DB::transaction(function () use ($students, $request) {
            foreach ($students as $student) {
                $hours = Attendance::where('user_id', $student->id)
                    ->where('status', 'Approved')
                    ->whereBetween('created_at', [$request->period_start, $request->period_end])
                    ->sum('rendered_hours');

                if ($hours > 0) {
                    $record = FinancialRecord::firstOrNew([
                        'user_id' => $student->id,
                        'period_start' => $request->period_start,
                        'period_end' => $request->period_end,
                    ]);

                    if (!in_array($record->status, ['Locked', 'Forwarded to Finance'])) {
                        $record->total_hours_rendered = $hours;
                        $record->hourly_rate = $request->hourly_rate;
                        $record->recalculate();
                    }
                }
            }
        });

        return response()->json(['message' => 'Hours successfully assessed.']);
    }
}
