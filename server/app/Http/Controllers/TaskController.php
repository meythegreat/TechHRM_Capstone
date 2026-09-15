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
        ]);

        return response()->json(['message' => 'Feedback saved.']);
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
        $task = Task::where('supervisor_id', $request->user()->id)->findOrFail($id);

        $request->validate([
            'evaluation_notes' => 'nullable|string',
        ]);

        $task->update([
            'status' => 'Verified',
            'evaluation_notes' => $request->evaluation_notes,
            'supervisor_notes' => $request->evaluation_notes,
        ]);

        return response()->json(['message' => 'Task verified and evaluated successfully.']);
    }
}
