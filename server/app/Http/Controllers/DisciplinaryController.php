<?php

namespace App\Http\Controllers;

use App\Models\DisciplinaryRecord;
use Carbon\Carbon;
use Illuminate\Http\Request;

class DisciplinaryController extends Controller
{
    public function index(Request $request)
    {
        $query = DisciplinaryRecord::with(['student:id,name,assigned_office', 'issuer:id,name', 'reporter:id,name']);

        if ($request->user()->role === 'Supervisor' && $request->user()->assigned_office) {
            $query->whereHas('student', function ($q) use ($request) {
                $q->where('assigned_office', $request->user()->assigned_office);
            });
        }

        return $query
            ->latest()
            ->get();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'student_id' => 'required_without:user_id|exists:users,id',
            'user_id' => 'required_without:student_id|exists:users,id',
            'violation_type' => 'required|string',
            'incident_date' => 'nullable|date',
            'description' => 'required|string',
            'penalty_hours' => 'nullable|numeric|min:0',
            'penalty' => 'nullable|string|max:255',
            'deduction_amount' => 'nullable|numeric|min:0',
        ]);

        $studentId = $validated['student_id'] ?? $validated['user_id'];
        $penaltyHours = (float) ($validated['penalty_hours'] ?? 0.00);
        $deductionAmount = (float) ($validated['deduction_amount'] ?? 0.00);

        $record = DisciplinaryRecord::create([
            'student_id' => $studentId,
            'issued_by' => $request->user()->id,
            'violation_type' => $validated['violation_type'],
            'incident_date' => $validated['incident_date'] ?? now()->toDateString(),
            'description' => $validated['description'],
            'penalty_hours' => $penaltyHours,
            'penalty' => $validated['penalty'] ?? ($penaltyHours > 0 || $deductionAmount > 0 ? 'Deduction' : 'Warning'),
            'deduction_amount' => $deductionAmount,
        ]);

        return response()->json(['message' => 'Disciplinary action logged successfully!', 'record' => $record], 201);
    }

    public function resolve(Request $request, $id)
    {
        $record = DisciplinaryRecord::findOrFail($id);

        $validated = $request->validate([
            'status' => 'required|in:Resolved,Dismissed',
            'resolution_remarks' => 'required_without:resolution_notes|string',
            'resolution_notes' => 'required_without:resolution_remarks|string',
        ]);

        $record->update([
            'status' => $validated['status'],
            'resolution_remarks' => $validated['resolution_remarks'] ?? $validated['resolution_notes'],
            'resolved_at' => Carbon::now(),
        ]);

        return response()->json(['message' => 'Case officially closed.']);
    }

    public function myRecords(Request $request)
    {
        return DisciplinaryRecord::with(['issuer:id,name', 'reporter:id,name'])
            ->where('student_id', $request->user()->id)
            ->latest()
            ->get();
    }

    public function submitAppeal(Request $request, $id)
    {
        $record = DisciplinaryRecord::where('id', $id)
            ->where('student_id', $request->user()->id)
            ->firstOrFail();

        if (!in_array($record->status, ['Active', 'Resolved'], true)) {
            return response()->json(['message' => 'This record cannot be appealed in its current status.'], 422);
        }

        $validated = $request->validate([
            'appeal_notes' => 'required_without:student_appeal|string',
            'student_appeal' => 'required_without:appeal_notes|string',
        ]);

        $record->update([
            'appeal_notes' => $validated['appeal_notes'] ?? $validated['student_appeal'],
            'status' => 'Pending Appeal',
        ]);

        return response()->json(['message' => 'Appeal submitted for administrative review.']);
    }
}
