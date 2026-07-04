<?php

namespace App\Http\Controllers;

use App\Models\DisciplinaryRecord;
use Carbon\Carbon;
use Illuminate\Http\Request;

class DisciplinaryController extends Controller
{
    public function index()
    {
        return DisciplinaryRecord::with(['student:id,name', 'issuer:id,name'])
            ->latest()
            ->get();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'student_id' => 'required|exists:users,id',
            'violation_type' => 'required|string',
            'description' => 'required|string',
            'penalty_hours' => 'numeric|min:0',
        ]);

        $record = DisciplinaryRecord::create([
            'student_id' => $validated['student_id'],
            'issued_by' => $request->user()->id,
            'violation_type' => $validated['violation_type'],
            'description' => $validated['description'],
            'penalty_hours' => $validated['penalty_hours'] ?? 0.00,
        ]);

        return response()->json(['message' => 'Disciplinary action logged successfully!', 'record' => $record], 201);
    }

    public function resolve(Request $request, $id)
    {
        $record = DisciplinaryRecord::findOrFail($id);

        $validated = $request->validate([
            'status' => 'required|in:Resolved,Dismissed',
            'resolution_remarks' => 'required|string',
        ]);

        $record->update([
            'status' => $validated['status'],
            'resolution_remarks' => $validated['resolution_remarks'],
            'resolved_at' => Carbon::now(),
        ]);

        return response()->json(['message' => 'Case officially closed.']);
    }

    public function myRecords(Request $request)
    {
        return DisciplinaryRecord::with('issuer:id,name')
            ->where('student_id', $request->user()->id)
            ->latest()
            ->get();
    }

    public function submitAppeal(Request $request, $id)
    {
        $record = DisciplinaryRecord::where('id', $id)
            ->where('student_id', $request->user()->id)
            ->firstOrFail();

        if ($record->status !== 'Active') {
            return response()->json(['message' => 'This record cannot be appealed in its current status.'], 422);
        }

        $validated = $request->validate(['appeal_notes' => 'required|string']);

        $record->update([
            'appeal_notes' => $validated['appeal_notes'],
            'status' => 'Pending Appeal',
        ]);

        return response()->json(['message' => 'Appeal submitted for administrative review.']);
    }
}
