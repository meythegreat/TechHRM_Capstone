<?php

namespace App\Http\Controllers;

use App\Models\Holiday;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class HolidayController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'start' => ['nullable', 'date'],
            'end' => ['nullable', 'date'],
        ]);

        $query = Holiday::query()->orderBy('date');

        if (! empty($validated['start'])) {
            $query->whereDate('date', '>=', $validated['start']);
        }
        if (! empty($validated['end'])) {
            $query->whereDate('date', '<=', $validated['end']);
        }

        return response()->json(
            $query->get()->map(fn (Holiday $holiday) => $this->payload($holiday))
        );
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date', Rule::unique('holidays', 'date')],
            'name' => ['required', 'string', 'max:120'],
        ]);

        $holiday = Holiday::create([
            'date' => $validated['date'],
            'name' => trim($validated['name']),
            'created_by' => $request->user()?->id,
        ]);

        return response()->json($this->payload($holiday), 201);
    }

    public function destroy(Holiday $holiday)
    {
        $holiday->delete();

        return response()->json(['message' => 'Holiday removed.']);
    }

    private function payload(Holiday $holiday): array
    {
        return [
            'id' => $holiday->id,
            'date' => $holiday->date->toDateString(),
            'name' => $holiday->name,
        ];
    }
}
