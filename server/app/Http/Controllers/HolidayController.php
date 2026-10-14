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
            'kind' => ['nullable', 'in:holiday,break'],
            'portion' => ['nullable', 'in:full,half'],
            'starts_at' => ['nullable', 'date_format:H:i'],
            'ends_at' => ['nullable', 'date_format:H:i'],
        ]);
        [$start, $end, $kind, $portion, $startsAt, $endsAt] = $this->normalized($validated);
        $this->assertNoOverlap($start, $end, $kind);

        $holiday = Holiday::create([
            'date' => $start,
            'end_date' => $end,
            'name' => trim($validated['name']),
            'kind' => $kind,
            'portion' => $portion,
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
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
            'kind' => ['nullable', 'in:holiday,break'],
            'portion' => ['nullable', 'in:full,half'],
            'starts_at' => ['nullable', 'date_format:H:i'],
            'ends_at' => ['nullable', 'date_format:H:i'],
        ]);
        [$start, $end, $kind, $portion, $startsAt, $endsAt] = $this->normalized($validated);
        $this->assertNoOverlap($start, $end, $kind, $holiday->id);

        $holiday->update([
            'date' => $start,
            'end_date' => $end,
            'name' => trim($validated['name']),
            'kind' => $kind,
            'portion' => $portion,
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
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
            'kind' => $holiday->kind ?: 'holiday',
            'portion' => $holiday->portion ?: 'full',
            'starts_at' => $holiday->starts_at ? substr((string) $holiday->starts_at, 0, 5) : null,
            'ends_at' => $holiday->ends_at ? substr((string) $holiday->ends_at, 0, 5) : null,
        ];
    }

    /**
     * @param  array{date: string, end_date?: string|null, kind?: string|null, portion?: string|null, starts_at?: string|null, ends_at?: string|null}  $validated
     * @return array{0: string, 1: string, 2: string, 3: string, 4: string|null, 5: string|null}
     */
    private function normalized(array $validated): array
    {
        $kind = ($validated['kind'] ?? 'holiday') === 'break' ? 'break' : 'holiday';
        $portion = $kind === 'holiday' && ($validated['portion'] ?? 'full') === 'half' ? 'half' : 'full';
        [$start, $end] = $this->span($validated, $kind === 'break' ? 120 : 31);
        if ($portion === 'half') {
            $end = $start;
        }

        $startsAt = null;
        $endsAt = null;
        if ($portion === 'half') {
            $startsAt = $validated['starts_at'] ?? null;
            $endsAt = $validated['ends_at'] ?? null;
            if (! $startsAt || ! $endsAt || $endsAt <= $startsAt) {
                throw ValidationException::withMessages([
                    'ends_at' => 'A half-day holiday needs a start and end time, with the end after the start.',
                ]);
            }
        }

        return [$start, $end, $kind, $portion, $startsAt, $endsAt];
    }

    /**
     * @param  array{date: string, end_date?: string|null}  $validated
     * @return array{0: string, 1: string}
     */
    private function span(array $validated, int $maxDays = 31): array
    {
        $start = Carbon::parse($validated['date'])->toDateString();
        $end = Carbon::parse($validated['end_date'] ?? $validated['date'])->toDateString();

        if ($end < $start) {
            throw ValidationException::withMessages([
                'end_date' => 'The end date must be on or after the start date.',
            ]);
        }

        $days = Carbon::parse($start)->diffInDays(Carbon::parse($end), true) + 1;
        if ($days > $maxDays) {
            throw ValidationException::withMessages([
                'end_date' => $maxDays > 31
                    ? 'A class break can cover at most '.$maxDays.' days.'
                    : 'A holiday can cover at most 31 days. Use a class break for a longer closure such as semester break.',
            ]);
        }

        return [$start, $end];
    }

    private function assertNoOverlap(string $start, string $end, string $kind, ?int $ignoreId = null): void
    {
        $conflict = Holiday::query()
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->where('kind', $kind)
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
