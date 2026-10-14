<?php

namespace App\Http\Controllers;

use App\Models\SemesterTerm;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SemesterTermController extends Controller
{
    public function show()
    {
        $term = SemesterTerm::current();

        return response()->json([
            'semester' => $term?->toPayload(),
        ]);
    }

    public function update(Request $request)
    {
        $user = $request->user();
        abort_unless(
            $user && in_array($user->role, ['WSPO Staff', 'Super Admin'], true),
            403,
            'Only WSPO staff or a super admin can set the semester.'
        );

        $validated = $request->validate([
            'label' => ['required', 'string', 'max:80'],
            'starts_on' => ['required', 'date'],
            'ends_on' => ['required', 'date'],
        ]);

        $label = trim($validated['label']);
        if ($label === '') {
            throw ValidationException::withMessages([
                'label' => 'Name the semester, such as 1st Semester.',
            ]);
        }

        $startsOn = Carbon::parse($validated['starts_on'])->toDateString();
        $endsOn = Carbon::parse($validated['ends_on'])->toDateString();
        if ($endsOn < $startsOn) {
            throw ValidationException::withMessages([
                'ends_on' => 'The end date must be on or after the start date.',
            ]);
        }

        $latestEnd = SemesterTerm::endFromStart($startsOn, 8);
        if ($endsOn > $latestEnd) {
            throw ValidationException::withMessages([
                'ends_on' => 'A semester can cover at most 8 months.',
            ]);
        }

        $months = max(1, (int) round(Carbon::parse($startsOn)->diffInMonths(Carbon::parse($endsOn)->addDay())));

        $term = SemesterTerm::current();
        if ($term) {
            $term->update([
                'label' => $label,
                'starts_on' => $startsOn,
                'ends_on' => $endsOn,
                'months' => $months,
                'updated_by' => $user->id,
            ]);
        } else {
            $term = SemesterTerm::create([
                'label' => $label,
                'starts_on' => $startsOn,
                'ends_on' => $endsOn,
                'months' => $months,
                'updated_by' => $user->id,
            ]);
        }

        return response()->json([
            'message' => 'Semester window saved. Weekly schedules repeat only inside these dates.',
            'semester' => $term->fresh()->toPayload(),
        ]);
    }
}
