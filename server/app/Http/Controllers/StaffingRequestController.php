<?php

namespace App\Http\Controllers;

use App\Models\StaffingRequest;
use Illuminate\Http\Request;

class StaffingRequestController extends Controller
{
    public function index(Request $request)
    {
        $query = StaffingRequest::with('requester:id,name')->latest();
        if ($request->user()->role === 'Supervisor') {
            $query->where('requested_by', $request->user()->id);
        }
        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $department = $request->user()->profile?->assigned_office;
        abort_unless($department, 422, 'Your supervisor account must have an assigned office before requesting a student.');

        $validated = $request->validate([
            'duty_type' => 'required|in:Clerical,Janitorial,Request',
            'duty_request' => 'required_if:duty_type,Request|nullable|string|max:1000',
            'quantity' => 'nullable|integer|min:1|max:50',
        ]);

        $staffingRequest = StaffingRequest::create([
            'requested_by' => $request->user()->id,
            'department' => $department,
            'duty_type' => $validated['duty_type'],
            'duty_request' => $validated['duty_type'] === 'Request' ? $validated['duty_request'] : null,
            'quantity' => $validated['quantity'] ?? 1,
        ]);

        return response()->json(['message' => 'Staffing request sent to WSPO.', 'request' => $staffingRequest], 201);
    }

    public function updateStatus(Request $request, StaffingRequest $staffingRequest)
    {
        $validated = $request->validate(['status' => 'required|in:Pending,Approved,Fulfilled,Declined']);
        $staffingRequest->update($validated);
        return response()->json(['message' => 'Staffing request updated.', 'request' => $staffingRequest]);
    }
}
