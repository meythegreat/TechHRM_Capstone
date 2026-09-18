<?php

namespace App\Http\Controllers;

use App\Models\Task;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Task::with(['student:id,name', 'supervisor:id,name']);

        if ($user->role === 'Student') {
            $query->where('student_id', $user->id);
        } elseif ($user->role === 'Supervisor') {
            $query->where('supervisor_id', $user->id);
        }

        return $query->latest()->get();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'student_id' => 'required|exists:users,id',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'task_type' => 'nullable|in:Routine,Special Project',
            'priority' => 'nullable|in:Low,Medium,High',
            'due_date' => 'nullable|date',
        ]);

        $student = \App\Models\User::with('profile')->where('role', 'Student')->findOrFail($validated['student_id']);
        $department = $request->user()->profile?->assigned_office;
        abort_unless(
            $department && $this->departmentsMatch($student->profile?->assigned_office, $student->profile?->course, $department),
            403,
            'You can only assign tasks to students enrolled in your department.'
        );

        $task = Task::create([
            'student_id' => $validated['student_id'],
            'supervisor_id' => $request->user()->id,
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'task_type' => $validated['task_type'] ?? 'Routine',
            'priority' => $validated['priority'] ?? 'Medium',
            'due_date' => $validated['due_date'] ?? null,
            'status' => 'Pending',
        ]);

        return response()->json(['message' => 'Task assigned successfully!', 'task' => $task], 201);
    }

    public function addSupervisorNote(Request $request, $id)
    {
        $task = Task::where('supervisor_id', $request->user()->id)->findOrFail($id);

        $request->validate([
            'supervisor_notes' => 'required_without:evaluation_notes|string',
            'evaluation_notes' => 'required_without:supervisor_notes|string',
        ]);

        $note = $request->supervisor_notes ?? $request->evaluation_notes;

        $task->update([
            'supervisor_notes' => $note,
            'evaluation_notes' => $note,
            'status' => 'For Verification',
        ]);

        return response()->json(['message' => 'Evaluation sent to WSPO for verification.']);
    }

    public function myTasks(Request $request)
    {
        return Task::with('supervisor:id,name')
            ->where('student_id', $request->user()->id)
            ->latest()
            ->get();
    }

    public function updateStatus(Request $request, $id)
    {
        $task = Task::where('student_id', $request->user()->id)->findOrFail($id);

        $request->validate([
            'status' => 'required|in:Pending,Assigned,In Progress,Completed',
            'completion_log' => 'required_if:status,Completed|string|nullable',
        ]);

        $task->update([
            'status' => $request->status === 'Assigned' ? 'Pending' : $request->status,
            'completion_log' => $request->completion_log ?? $task->completion_log,
        ]);

        return response()->json(['message' => 'Task updated!']);
    }

    public function verifyTask(Request $request, $id)
    {
        abort_unless(in_array($request->user()->role, ['WSPO Staff', 'Super Admin'], true), 403);
        $task = Task::where('status', 'For Verification')->findOrFail($id);

        $request->validate([
            'evaluation_notes' => 'nullable|string',
        ]);

        $task->update([
            'status' => 'Verified',
            'evaluation_notes' => $request->evaluation_notes,
            'supervisor_notes' => $task->supervisor_notes,
        ]);

        return response()->json(['message' => 'Task verified and evaluated successfully.']);
    }

    /** Keep deployment authorization aligned with the supervisor personnel list. */
    private function departmentsMatch(?string $assignedOffice, ?string $course, string $supervisorDepartment): bool
    {
        $groups = [
            ['CCS', 'College of Computer Studies', 'College of Computer Studies (CCS)', 'CCS Office'],
            ['CBA', 'College of Business and Accountancy', 'College of Business Administration', 'Business Office'],
            ['CHTM', 'College of Hotel and Tourism Management', 'College of Hospitality and Tourism Management'],
            ['CCJE', 'College of Criminal Justice Education'],
            ['COE', 'College of Engineering'],
            ['CON', 'College of Nursing'],
            ['CTE', 'College of Teacher Education'],
            ['CAS', 'College of Arts and Sciences'],
            ['GS', 'Graduate School'],
            ['SHS', 'Senior High School Department'],
            ['JHS', 'Junior High School Department'],
            ['ES', 'Elementary Department'],
            ['PS', 'Pre-School Department'],
        ];

        $normalize = fn (?string $value) => strtolower((string) preg_replace('/[^a-z0-9]/i', '', $value ?? ''));
        $supervisor = $normalize($supervisorDepartment);
        $studentValues = array_filter([$normalize($assignedOffice), $normalize($course)]);

        if (in_array($supervisor, $studentValues, true)) {
            return true;
        }

        foreach ($groups as $group) {
            $aliases = array_map($normalize, $group);
            if (in_array($supervisor, $aliases, true) && array_intersect($studentValues, $aliases) !== []) {
                return true;
            }
        }

        return false;
    }
}
