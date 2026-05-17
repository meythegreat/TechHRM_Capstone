<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Requirement;
use Illuminate\Support\Facades\Storage;

class RequirementController extends Controller
{
    // 1. STUDENT: Upload a document
    public function upload(Request $request)
    {
        $request->validate([
            'document_type' => 'required|string',
            'file' => 'required|file|mimes:jpg,jpeg,png,pdf|max:2048', // Max 2MB
        ]);

        $path = $request->file('file')->store('requirements', 'local');

        // Check if they already uploaded this type, if so, update it. If not, create new.
        $requirement = Requirement::updateOrCreate(
            ['user_id' => $request->user()->id, 'document_type' => $request->document_type],
            ['file_path' => $path, 'status' => 'pending', 'remarks' => null]
        );

        return response()->json(['message' => 'Document uploaded successfully!', 'requirement' => $requirement]);
    }

    // 2. STUDENT: View their own requirements
    public function myRequirements(Request $request)
    {
        return response()->json($request->user()->requirements);
    }

    // 3. ADMIN/SUPERVISOR: Get all pending requirements for review
    public function index()
    {
        $requirements = Requirement::with('user.profile')->orderBy('created_at', 'desc')->get();
        return response()->json($requirements);
    }

    // 4. ADMIN/SUPERVISOR: Verify or Reject
    public function updateStatus(Request $request, string $id)
    {
        $request->validate([
            'status' => 'required|in:verified,rejected',
            'remarks' => 'nullable|string'
        ]);

        $requirement = Requirement::findOrFail($id);
        $requirement->update([
            'status' => $request->status,
            'remarks' => $request->remarks
        ]);

        // Notify the student
        \App\Models\Notification::create([
            'user_id' => $requirement->user_id,
            'title' => 'Requirement ' . ucfirst($request->status),
            'message' => 'Your ' . $requirement->document_type . ' has been ' . $request->status . '.'
        ]);

        return response()->json(['message' => 'Document status updated!']);
    }
}
