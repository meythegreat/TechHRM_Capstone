<?php

namespace App\Http\Controllers;

use App\Models\AssemblyYearRepresentative;
use App\Models\User;
use App\Support\RenderedHours;
use App\Support\SuperAdminAudit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AssemblyYearRepresentativeController extends Controller
{
    public function index(Request $request)
    {
        $rows = AssemblyYearRepresentative::query()
            ->with('student.profile:id,user_id,student_id_number,year_level,assigned_office')
            ->orderBy('year_level')
            ->get()
            ->map(fn (AssemblyYearRepresentative $row) => $this->present($row));

        $mine = null;
        $actor = $request->user();
        if ($actor && $actor->role === 'Student') {
            $rep = AssemblyYearRepresentative::forUser((int) $actor->id);
            $mine = $rep ? $this->present($rep) : null;
        }

        return response()->json([
            'representatives' => $rows,
            'mine' => $mine,
        ]);
    }

    public function upsert(Request $request)
    {
        SuperAdminAudit::denyMutation($request);
        $actor = $request->user()->loadMissing('profile');
        if (! app(UserController::class)->canIssueActivityAttendance($actor) && $actor->role !== 'WSPO Staff') {
            // Allow WSPO Staff broadly; prefer coordinator path when available.
            if ($actor->role !== 'WSPO Staff') {
                return response()->json(['message' => 'Only WSPO staff can assign assembly year representatives.'], 403);
            }
        }

        $validated = $request->validate([
            'year_level' => 'required|integer|min:1|max:4',
            'user_id' => 'required|integer|exists:users,id',
        ]);

        $year = (int) $validated['year_level'];
        $userId = (int) $validated['user_id'];
        $student = User::query()->with('profile')->where('role', 'Student')->find($userId);
        if (! $student) {
            return response()->json(['message' => 'Assembly representatives must be working students.'], 422);
        }

        $studentYear = (int) ($student->profile?->year_level ?? 0);
        if ($studentYear !== $year) {
            return response()->json([
                'message' => $student->name.' is year '.$studentYear.', not year '.$year.'.',
            ], 422);
        }

        $row = DB::transaction(function () use ($year, $userId) {
            AssemblyYearRepresentative::query()->where('user_id', $userId)->delete();

            return AssemblyYearRepresentative::query()->updateOrCreate(
                ['year_level' => $year],
                ['user_id' => $userId],
            );
        });

        return response()->json([
            'message' => 'Assembly year representative saved.',
            'representative' => $this->present($row->load('student.profile')),
        ]);
    }

    public function destroy(Request $request, int $yearLevel)
    {
        SuperAdminAudit::denyMutation($request);
        $actor = $request->user()->loadMissing('profile');
        if ($actor->role !== 'WSPO Staff') {
            return response()->json(['message' => 'Only WSPO staff can remove assembly year representatives.'], 403);
        }

        if ($yearLevel < 1 || $yearLevel > 4) {
            return response()->json(['message' => 'Year level must be 1–4.'], 422);
        }

        AssemblyYearRepresentative::query()->where('year_level', $yearLevel)->delete();

        return response()->json(['message' => 'Assembly year representative cleared.']);
    }

    private function present(AssemblyYearRepresentative $row): array
    {
        $row->loadMissing('student.profile');
        $student = $row->student;

        return [
            'id' => $row->id,
            'year_level' => (int) $row->year_level,
            'year_label' => RenderedHours::yearLabel((int) $row->year_level),
            'user_id' => (int) $row->user_id,
            'student' => $student ? [
                'id' => $student->id,
                'name' => $student->name,
                'student_id_number' => $student->profile?->student_id_number,
                'year_level' => $student->profile?->year_level,
                'assigned_office' => $student->profile?->assigned_office,
            ] : null,
        ];
    }
}
