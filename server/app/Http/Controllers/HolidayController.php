<?php

namespace App\Http\Controllers;

use App\Models\Holiday;
use App\Support\SuperAdminAudit;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class HolidayController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'start' => ['nullable', 'date'],
            'end' => ['nullable', 'date'],
        ]);

        $query = Holiday::query()->orderBy('date');

        if (! empty($validated['start']) && ! empty($validated['end'])) {
            $query->whereDate('date', '<=', $validated['end'])
                ->whereDate('end_date', '>=', $validated['start']);
        } elseif (! empty($validated['start'])) {
            $query->whereDate('end_date', '>=', $validated['start']);
        } elseif (! empty($validated['end'])) {
            $query->whereDate('date', '<=', $validated['end']);
        }

        return response()->json(
            $query->get()->map(fn (Holiday $holiday) => $this->payload($holiday))
        );
    }

    public function store(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $validated = $request->validate([
            'date' => ['required', 'date'],
            'end_date' => ['nullable', 'date'],
            'name' => ['required', 'string', 'max:120'],
        ]);
        [$start, $end] = $this->span($validated);
        $this->assertNoOverlap($start, $end);

        $holiday = Holiday::create([
            'date' => $start,
            'end_date' => $end,
            'name' => trim($validated['name']),
            'created_by' => $request->user()?->id,
        ]);

        return response()->json($this->payload($holiday), 201);
    }

    public function update(Request $request, Holiday $holiday)
    {
        SuperAdminAudit::denyMutation($request);
        $validated = $request->validate([
            'date' => ['required', 'date'],
            'end_date' => ['nullable', 'date'],
            'name' => ['required', 'string', 'max:120'],
        ]);
        [$start, $end] = $this->span($validated);
        $this->assertNoOverlap($start, $end, $holiday->id);

        $holiday->update([
            'date' => $start,
            'end_date' => $end,
            'name' => trim($validated['name']),
        ]);

        return response()->json($this->payload($holiday->fresh()));
    }

    public function destroy(Request $request, Holiday $holiday)
    {
        SuperAdminAudit::denyMutation($request);
        $holiday->delete();

        return response()->json(['message' => 'Holiday removed.']);
    }

    private function payload(Holiday $holiday): array
    {
        $start = $holiday->date->toDateString();
        $end = ($holiday->end_date ?? $holiday->date)->toDateString();

        return [
            'id' => $holiday->id,
            'date' => $start,
            'end_date' => $end,
            'name' => $holiday->name,
        ];
    }

    /**
     * @param  array{date: string, end_date?: string|null}  $validated
     * @return array{0: string, 1: string}
     */
    private function span(array $validated): array
    {
        $start = Carbon::parse($validated['date'])->toDateString();
        $end = Carbon::parse($validated['end_date'] ?? $validated['date'])->toDateString();

        if ($end < $start) {
            throw ValidationException::withMessages([
                'end_date' => 'The end date must be on or after the start date.',
            ]);
        }

        $days = Carbon::parse($start)->diffInDays(Carbon::parse($end), true) + 1;
        if ($days > 31) {
            throw ValidationException::withMessages([
                'end_date' => 'A holiday can cover at most 31 days. Split a longer break into more than one holiday.',
            ]);
        }

        return [$start, $end];
    }

    private function assertNoOverlap(string $start, string $end, ?int $ignoreId = null): void
    {
        $conflict = Holiday::query()
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->whereDate('date', '<=', $end)
            ->whereDate('end_date', '>=', $start)
            ->first();

        if ($conflict) {
            $label = $conflict->date->toDateString();
            $conflictEnd = ($conflict->end_date ?? $conflict->date)->toDateString();
            if ($conflictEnd !== $label) {
                $label .= ' to '.$conflictEnd;
            }

            throw ValidationException::withMessages([
                'date' => "Those dates overlap {$conflict->name} ({$label}).",
            ]);
        }
    }
}
