<?php

namespace App\Http\Controllers;

use App\Models\Task;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function index(Request $request)
    {
        return Task::with('student:id,name')
            ->where('supervisor_id', $request->user()->id)
            ->latest()
            ->get();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'student_id' => 'required|exists:users,id',
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'due_date' => 'nullable|date',
        ]);

        $task = Task::create([
            'student_id' => $validated['student_id'],
            'supervisor_id' => $request->user()->id,
            'title' => $validated['title'],
            'description' => $validated['description'],
            'due_date' => $validated['due_date'] ?? null,
            'status' => 'Pending',
        ]);

        return response()->json(['message' => 'Task assigned successfully!', 'task' => $task], 201);
    }

    public function addSupervisorNote(Request $request, $id)
    {
        $task = Task::where('supervisor_id', $request->user()->id)->findOrFail($id);

        $request->validate(['supervisor_notes' => 'required|string']);

        $task->update(['supervisor_notes' => $request->supervisor_notes]);

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
            'status' => 'required|in:Pending,In Progress,Completed',
            'completion_log' => 'required_if:status,Completed|string|nullable',
        ]);

        $task->update([
            'status' => $request->status,
            'completion_log' => $request->completion_log ?? $task->completion_log,
        ]);

        return response()->json(['message' => 'Task updated!']);
    }
}
