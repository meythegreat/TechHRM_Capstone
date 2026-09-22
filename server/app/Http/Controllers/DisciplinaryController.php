<?php

namespace App\Http\Controllers;

use App\Models\DisciplinaryRecord;
use App\Models\Notification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;

class DisciplinaryController extends Controller
{
    public function index(Request $request)
    {
        $query = DisciplinaryRecord::with(['student:id,name', 'issuer:id,name', 'reporter:id,name']);

        if ($request->user()->role === 'Supervisor') {
            $request->user()->loadMissing('profile');
            $departments = $this->supervisedDepartments($request->user());
            $query->whereHas('student.profile', function ($q) use ($departments) {
                $q->whereIn('assigned_office', $departments);
            });
        }

        return $query
            ->latest()
            ->get();
    }

    public function store(Request $request)
    {
        $canSetPenalties = $this->isCoordinator($request->user());

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
        $penaltyHours = $canSetPenalties ? (float) ($validated['penalty_hours'] ?? 0.00) : 0.00;
        $deductionAmount = $canSetPenalties ? (float) ($validated['deduction_amount'] ?? 0.00) : 0.00;

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
        $user = $request->user();

        if ($record->status === 'Pending Appeal' && !$this->isCoordinator($user)) {
            return response()->json(['message' => 'Only the WSPO coordinator can decide an appeal.'], 403);
        }

        $rules = [
            'status' => 'required|in:Resolved,Dismissed',
            'resolution_remarks' => 'required_without:resolution_notes|string',
            'resolution_notes' => 'required_without:resolution_remarks|string',
        ];

        if ($this->isCoordinator($user)) {
            $rules['penalty_hours'] = 'nullable|numeric|min:0';
            $rules['deduction_amount'] = 'nullable|numeric|min:0';
            $rules['penalty'] = 'nullable|string|max:255';
        }

        $validated = $request->validate($rules);

        $updates = [
            'status' => $validated['status'],
            'resolution_remarks' => $validated['resolution_remarks'] ?? $validated['resolution_notes'],
            'resolved_at' => Carbon::now(),
        ];

        if ($this->isCoordinator($user)) {
            if (array_key_exists('penalty_hours', $validated)) {
                $updates['penalty_hours'] = (float) ($validated['penalty_hours'] ?? 0);
            }
            if (array_key_exists('deduction_amount', $validated)) {
                $updates['deduction_amount'] = (float) ($validated['deduction_amount'] ?? 0);
            }
            if (!empty($validated['penalty'])) {
                $updates['penalty'] = $validated['penalty'];
            }
        }

        $record->update($updates);

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

        $studentName = $request->user()->name;
        $this->notifyCoordinators(
            'Disciplinary Appeal Submitted',
            "{$studentName} appealed a {$record->violation_type} record. Please review and decide the case in Compliance."
        );

        return response()->json(['message' => 'Appeal submitted to the WSPO coordinator.']);
    }

    private function isCoordinator(?User $user): bool
    {
        return $user && in_array($user->role, ['WSPO Staff', 'Super Admin'], true);
    }

    private function supervisedDepartments(User $user): array
    {
        $configured = $user->profile?->supervised_departments;
        $departments = is_array($configured) ? $configured : [];

        if ($departments === [] && $user->profile?->assigned_office) {
            $departments[] = $user->profile->assigned_office;
        }

        return array_values(array_unique(array_filter(array_map('trim', $departments))));
    }

    private function notifyCoordinators(string $title, string $message): void
    {
        $coordinators = User::whereIn('role', ['WSPO Staff', 'Super Admin'])->get(['id']);
        foreach ($coordinators as $coordinator) {
            Notification::create([
                'user_id' => $coordinator->id,
                'title' => $title,
                'message' => $message,
            ]);
        }
    }
}
