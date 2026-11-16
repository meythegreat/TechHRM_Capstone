<?php

namespace App\Http\Controllers;

use App\Models\JanitorialGroup;
use App\Models\ManualAttendanceRequest;
use App\Models\ManualAttendanceRequestShift;
use App\Models\Notification;
use App\Models\User;
use App\Support\ClassHoursDuty;
use App\Support\ManualDtrEntry;
use App\Support\SuperAdminAudit;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ManualAttendanceRequestController extends Controller
{
    /** Student: list own offline manual attendance requests. */
    public function mine(Request $request)
    {
        $user = $request->user();
        if ($user->role !== 'Student') {
            return response()->json(['message' => 'Only working students can view their offline attendance requests.'], 403);
        }

        $rows = ManualAttendanceRequest::query()
            ->with(['shifts', 'reviewer:id,name'])
            ->where('user_id', $user->id)
            ->orderByRaw("CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END")
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (ManualAttendanceRequest $row) => $this->serialize($row));

        return response()->json(['requests' => $rows]);
    }

    /** Supervisor / WSPO: list requests in scope (pending first). */
    public function index(Request $request)
    {
        $actor = $request->user()->loadMissing('profile');
        if (!in_array($actor->role, ['Supervisor', 'WSPO Staff', 'Super Admin'], true)) {
            return response()->json(['message' => 'Not allowed.'], 403);
        }

        $accounts = app(UserController::class);
        $query = ManualAttendanceRequest::query()
            ->with([
                'student:id,name',
                'student.profile:id,user_id,student_id_number,assigned_office,year_level,duty_type',
                'shifts',
                'reviewer:id,name',
            ])
            ->orderByRaw("CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END")
            ->orderByDesc('created_at');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $query->where(function ($builder) {
            $builder->whereNull('request_type')
                ->orWhere('request_type', '!=', ManualAttendanceRequest::TYPE_JANITORIAL);
        });

        if ($accounts->usesSupervisorScope($actor)) {
            $areas = $accounts->supervisedOfficeAreas($actor);
            if ($areas === []) {
                $query->whereRaw('0 = 1');
            } else {
                $query->whereHas('student', function ($owner) use ($areas, $accounts) {
                    $accounts->constrainPlacedIn($owner, $areas);
                });
            }
        }

        $rows = $query->limit(100)->get()->map(fn (ManualAttendanceRequest $row) => $this->serialize($row, true));

        return response()->json(['requests' => $rows]);
    }

    /** Student: submit offline manual attendance (one or more shifts). */
    public function store(Request $request)
    {
        $user = $request->user()->loadMissing('profile');
        if ($user->role !== 'Student') {
            return response()->json(['message' => 'Only working students can submit offline attendance requests.'], 403);
        }

        $validated = $request->validate([
            'request_type' => 'nullable|in:regular,janitorial,class_hours',
            'reason' => 'nullable|string|max:1000',
            'shifts' => 'required|array|min:1|max:10',
            'shifts.*.date' => 'required|date_format:Y-m-d',
            'shifts.*.time_in' => ['required', 'regex:/^\d{2}:\d{2}$/'],
            'shifts.*.time_out' => ['required', 'regex:/^\d{2}:\d{2}$/'],
            'shifts.*.janitorial_area' => 'nullable|string|max:120',
            'shifts.*.janitorial_group_id' => 'nullable|integer|exists:janitorial_groups,id',
        ]);

        $requestType = $validated['request_type'] ?? ManualAttendanceRequest::TYPE_REGULAR;
        $janitorialGroup = null;
        if ($requestType === ManualAttendanceRequest::TYPE_JANITORIAL) {
            $eligible = JanitorialGroup::query()
                ->where(function ($query) use ($user) {
                    $query->where('supervisor_user_id', $user->id)
                        ->orWhereHas('members', fn ($members) => $members->where('users.id', $user->id));
                })
                ->orderBy('area')
                ->get();
            if ($eligible->isEmpty()) {
                return response()->json([
                    'message' => 'You must be assigned to a janitorial group before submitting a janitorial offline request.',
                ], 422);
            }

            $requestedIds = collect($validated['shifts'])
                ->pluck('janitorial_group_id')
                ->filter(fn ($id) => $id !== null && $id !== '')
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values();
            if ($requestedIds->count() > 1) {
                return response()->json([
                    'message' => 'Submit one janitorial group per offline request.',
                ], 422);
            }

            if ($requestedIds->count() === 1) {
                $janitorialGroup = $eligible->firstWhere('id', $requestedIds->first());
                if (! $janitorialGroup) {
                    return response()->json([
                        'message' => 'Choose a janitorial group you belong to.',
                    ], 422);
                }
            } elseif ($eligible->count() === 1) {
                $janitorialGroup = $eligible->first();
            } else {
                return response()->json([
                    'message' => 'Choose which janitorial group this offline duty was for.',
                ], 422);
            }
        }

        $shiftRows = [];
        foreach (array_values($validated['shifts']) as $index => $shift) {
            if ($requestType === ManualAttendanceRequest::TYPE_JANITORIAL) {
                $start = \Carbon\Carbon::createFromFormat('Y-m-d H:i', $shift['date'].' '.$shift['time_in']);
                if (! $start) {
                    return response()->json([
                        'message' => 'Shift '.($index + 1).': Enter a valid time in.',
                    ], 422);
                }
                $shift['time_out'] = \App\Support\DutyHours::janitorialCreditedEnd($start)->format('H:i');
            }

            [$timeIn, $timeOut, $error] = ManualDtrEntry::resolveTimes(
                $shift['date'],
                $shift['time_in'],
                $shift['time_out'],
                $requestType === ManualAttendanceRequest::TYPE_JANITORIAL,
            );
            if ($error) {
                return response()->json([
                    'message' => 'Shift '.($index + 1).': '.$error,
                ], 422);
            }

            foreach ($shiftRows as $prior) {
                if ($prior['time_in_at']->lt($timeOut) && $prior['time_out_at']->gt($timeIn)) {
                    return response()->json([
                        'message' => 'Shift '.($index + 1).' overlaps another shift in this request.',
                    ], 422);
                }
            }

            if (ManualDtrEntry::overlaps((int) $user->id, $timeIn, $timeOut)) {
                return response()->json([
                    'message' => 'Shift '.($index + 1).' overlaps an existing DTR entry.',
                ], 422);
            }

            $area = trim((string) ($shift['janitorial_area'] ?? ''));
            $groupId = isset($shift['janitorial_group_id']) ? (int) $shift['janitorial_group_id'] : null;
            if ($requestType === ManualAttendanceRequest::TYPE_JANITORIAL) {
                if ($area === '') {
                    $area = (string) $janitorialGroup->area;
                }
                if (! $groupId) {
                    $groupId = (int) $janitorialGroup->id;
                }
                if ($groupId !== (int) $janitorialGroup->id) {
                    return response()->json([
                        'message' => 'Shift '.($index + 1).': use your assigned janitorial group.',
                    ], 422);
                }
            }

            if ($requestType === ManualAttendanceRequest::TYPE_CLASS_HOURS) {
                $block = null;
                $cursor = $timeIn->copy();
                while ($cursor->lt($timeOut)) {
                    $block = ClassHoursDuty::overlappingClass((int) $user->id, $cursor);
                    if ($block) {
                        break;
                    }
                    $cursor->addMinutes(15);
                }
                if (! $block) {
                    $block = ClassHoursDuty::overlappingClass((int) $user->id, $timeOut->copy()->subMinute());
                }
                if (! $block) {
                    return response()->json([
                        'message' => 'Shift '.($index + 1).': class-hours duty requests are only for times that overlap your class schedule.',
                    ], 422);
                }
            }

            $beforePhoto = null;
            $afterPhoto = null;
            $beforeCapturedAt = null;
            $afterCapturedAt = null;
            if ($requestType === ManualAttendanceRequest::TYPE_JANITORIAL) {
                $beforePhoto = $request->file('shifts.'.$index.'.before_photo');
                $afterPhoto = $request->file('shifts.'.$index.'.after_photo');
                if ($request->input('shifts.'.$index.'.capture_source') !== 'live_camera') {
                    return response()->json([
                        'message' => 'Shift '.($index + 1).': capture the before and after photos with the live camera. Gallery uploads are not allowed.',
                    ], 422);
                }
                if (! $beforePhoto instanceof UploadedFile || ! $afterPhoto instanceof UploadedFile) {
                    return response()->json([
                        'message' => 'Shift '.($index + 1).': capture the before and after surroundings photos with the camera.',
                    ], 422);
                }
                foreach (['before' => $beforePhoto, 'after' => $afterPhoto] as $label => $photo) {
                    $photoError = $this->photoError($photo, $label);
                    if ($photoError) {
                        return response()->json([
                            'message' => 'Shift '.($index + 1).': '.$photoError,
                        ], 422);
                    }
                }

                $beforeCaptured = $request->input('shifts.'.$index.'.before_captured_at');
                $afterCaptured = $request->input('shifts.'.$index.'.after_captured_at');
                if (! is_string($beforeCaptured) || trim($beforeCaptured) === '' || ! is_string($afterCaptured) || trim($afterCaptured) === '') {
                    return response()->json([
                        'message' => 'Shift '.($index + 1).': enter the date and time on the before photo, the date and time on the after photo, and your time in.',
                    ], 422);
                }
                try {
                    $beforeCapturedAt = \Carbon\Carbon::parse($beforeCaptured);
                    $afterCapturedAt = \Carbon\Carbon::parse($afterCaptured);
                } catch (\Throwable) {
                    return response()->json([
                        'message' => 'Shift '.($index + 1).': enter a valid date and time for each photo.',
                    ], 422);
                }
                if ($afterCapturedAt->lessThanOrEqualTo($beforeCapturedAt)) {
                    return response()->json([
                        'message' => 'Shift '.($index + 1).': the after photo time must be later than the before photo time.',
                    ], 422);
                }
            }

            $shiftRows[] = [
                'work_date' => $shift['date'],
                'time_in' => $shift['time_in'],
                'time_out' => $shift['time_out'],
                'janitorial_area' => $area !== '' ? $area : null,
                'janitorial_group_id' => $groupId,
                'before_photo' => $beforePhoto,
                'after_photo' => $afterPhoto,
                'before_captured_at' => $beforeCapturedAt,
                'after_captured_at' => $afterCapturedAt,
                'sort_order' => $index,
                'time_in_at' => $timeIn,
                'time_out_at' => $timeOut,
            ];
        }

        $reason = trim((string) ($validated['reason'] ?? ''));
        if ($reason === '') {
            $reason = match ($requestType) {
                ManualAttendanceRequest::TYPE_CLASS_HOURS => ManualAttendanceRequest::CLASS_HOURS_REASON,
                ManualAttendanceRequest::TYPE_JANITORIAL => 'Janitorial offline duty; office had no internet.',
                default => ManualAttendanceRequest::DEFAULT_REASON,
            };
        }

        $row = DB::transaction(function () use ($user, $reason, $shiftRows, $requestType) {
            $requestRow = ManualAttendanceRequest::create([
                'user_id' => $user->id,
                'request_type' => $requestType,
                'reason' => $reason,
                'status' => ManualAttendanceRequest::PENDING,
            ]);

            foreach ($shiftRows as $shift) {
                $beforePath = $shift['before_photo'] instanceof UploadedFile
                    ? $this->storeOfflinePhoto($shift['before_photo'], (int) $requestRow->id, (int) $shift['sort_order'], 'before')
                    : null;
                $afterPath = $shift['after_photo'] instanceof UploadedFile
                    ? $this->storeOfflinePhoto($shift['after_photo'], (int) $requestRow->id, (int) $shift['sort_order'], 'after')
                    : null;

                ManualAttendanceRequestShift::create([
                    'manual_attendance_request_id' => $requestRow->id,
                    'work_date' => $shift['work_date'],
                    'time_in' => $shift['time_in'],
                    'time_out' => $shift['time_out'],
                    'janitorial_area' => $shift['janitorial_area'],
                    'janitorial_group_id' => $shift['janitorial_group_id'],
                    'before_photo_path' => $beforePath,
                    'after_photo_path' => $afterPath,
                    'before_captured_at' => $shift['before_captured_at'],
                    'after_captured_at' => $shift['after_captured_at'],
                    'sort_order' => $shift['sort_order'],
                ]);
            }

            return $requestRow->load(['shifts', 'reviewer:id,name']);
        });

        $title = match ($requestType) {
            ManualAttendanceRequest::TYPE_JANITORIAL => 'Janitorial offline attendance request',
            ManualAttendanceRequest::TYPE_CLASS_HOURS => 'Class-hours duty request',
            default => 'Offline attendance request',
        };
        if ($requestType === ManualAttendanceRequest::TYPE_JANITORIAL && $janitorialGroup) {
            Notification::create([
                'user_id' => $janitorialGroup->supervisor_user_id,
                'title' => $title,
                'message' => $user->name.' submitted a janitorial offline request with '
                    .count($shiftRows).(count($shiftRows) === 1 ? ' shift' : ' shifts')
                    .' for '.$janitorialGroup->area.'. Accepting it records exactly 4 hours from clock-in.',
            ]);
        } else {
            $this->notifyReviewers(
                $user,
                $title,
                $user->name.' submitted a '.$requestType.' attendance request with '
                    .count($shiftRows).(count($shiftRows) === 1 ? ' shift' : ' shifts').' for approval.',
            );
        }

        $message = match ($requestType) {
            ManualAttendanceRequest::TYPE_JANITORIAL => 'Janitorial offline request submitted. Your janitorial supervisor approves it. If accepted, the DTR records exactly 4 hours from your time in.',
            ManualAttendanceRequest::TYPE_CLASS_HOURS => 'Class-hours duty request submitted. Hours appear on DTR after supervisor approval.',
            default => 'Offline attendance request submitted. It will appear on your DTR after your supervisor approves it.',
        };

        return response()->json([
            'message' => $message,
            'request' => $this->serialize($row),
        ], 201);
    }

    /** Student: withdraw a pending request. */
    public function destroy(Request $request, ManualAttendanceRequest $manualAttendanceRequest)
    {
        $user = $request->user();
        if ($user->role !== 'Student' || (int) $manualAttendanceRequest->user_id !== (int) $user->id) {
            return response()->json(['message' => 'You can only cancel your own pending requests.'], 403);
        }

        if (!$manualAttendanceRequest->isPending()) {
            return response()->json(['message' => 'Only pending requests can be cancelled.'], 422);
        }

        $manualAttendanceRequest->load('shifts');
        foreach ($manualAttendanceRequest->shifts as $shift) {
            foreach ([$shift->before_photo_path, $shift->after_photo_path] as $path) {
                if (is_string($path) && $path !== '' && Storage::disk('local')->exists($path)) {
                    Storage::disk('local')->delete($path);
                }
            }
        }

        $manualAttendanceRequest->delete();

        return response()->json(['message' => 'Offline attendance request cancelled.']);
    }

    /** Supervisor / WSPO: approve (credit DTR) or reject. */
    public function decide(Request $request, ManualAttendanceRequest $manualAttendanceRequest)
    {
        SuperAdminAudit::denyMutation($request);

        $reviewer = $request->user()->loadMissing('profile');
        $manualAttendanceRequest->load(['student.profile', 'shifts']);
        $student = $manualAttendanceRequest->student;
        if (!$student) {
            return response()->json(['message' => 'Student account was not found.'], 404);
        }

        $requestType = $manualAttendanceRequest->request_type ?: ManualAttendanceRequest::TYPE_REGULAR;
        if ($requestType === ManualAttendanceRequest::TYPE_JANITORIAL) {
            if (! $this->janitorialSupervisorCanReview($reviewer, $manualAttendanceRequest)) {
                return response()->json([
                    'message' => 'Only this group\'s janitorial supervisor can approve or decline this offline request.',
                ], 403);
            }
        } elseif (! in_array($reviewer->role, ['Supervisor', 'WSPO Staff'], true)) {
            return response()->json(['message' => 'Only a supervisor or WSPO staff can decide this request.'], 403);
        } elseif (! $this->canReviewStudent($reviewer, $student)) {
            return response()->json(['message' => 'You can only review offline attendance for students in your scope.'], 403);
        }

        if (!$manualAttendanceRequest->isPending()) {
            return response()->json(['message' => 'This request was already decided.'], 422);
        }

        $validated = $request->validate([
            'status' => 'required|in:Approved,Rejected',
            'decision_note' => 'nullable|string|max:1000',
        ]);

        if ($validated['status'] === ManualAttendanceRequest::REJECTED) {
            $manualAttendanceRequest->update([
                'status' => ManualAttendanceRequest::REJECTED,
                'decision_note' => trim((string) ($validated['decision_note'] ?? '')) ?: null,
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
            ]);

            Notification::create([
                'user_id' => $student->id,
                'title' => 'Offline attendance declined',
                'message' => $requestType === ManualAttendanceRequest::TYPE_JANITORIAL
                    ? 'Your janitorial supervisor declined the offline request.'
                    : 'Your offline manual attendance request was declined by your supervisor.',
            ]);

            return response()->json([
                'message' => 'Offline attendance request declined.',
                'request' => $this->serialize($manualAttendanceRequest->fresh(['shifts', 'student.profile', 'reviewer:id,name']), true),
            ]);
        }

        $noteBase = trim((string) ($manualAttendanceRequest->reason ?: ManualAttendanceRequest::DEFAULT_REASON));
        $createdIds = [];

        try {
            DB::transaction(function () use ($manualAttendanceRequest, $student, $reviewer, $validated, $noteBase, $requestType, &$createdIds) {
                foreach ($manualAttendanceRequest->shifts as $index => $shift) {
                    $date = $shift->work_date->toDateString();
                    $options = match ($requestType) {
                        ManualAttendanceRequest::TYPE_JANITORIAL => [
                            'attendance_type' => 'Janitorial',
                            'work_type' => 'Janitorial',
                            'janitorial_group_id' => $shift->janitorial_group_id,
                            'janitorial_area' => $shift->janitorial_area,
                            'skip_schedule_match' => true,
                            'apply_lunch' => false,
                            'cap_at_schedule_end' => false,
                        ],
                        ManualAttendanceRequest::TYPE_CLASS_HOURS => [
                            'attendance_type' => 'Regular',
                            'apply_lunch' => true,
                            'cap_at_schedule_end' => false,
                        ],
                        default => [],
                    };

                    $created = ManualDtrEntry::createClosedShift(
                        $student,
                        $date,
                        $shift->time_in,
                        $shift->time_out,
                        $noteBase,
                        'accepted',
                        null,
                        $options,
                    );

                    if (! $created['ok']) {
                        throw new \RuntimeException(
                            'Shift '.($index + 1).' ('.$date.' '.$shift->time_in.'–'.$shift->time_out.'): '.$created['message']
                        );
                    }

                    if ($requestType === ManualAttendanceRequest::TYPE_JANITORIAL) {
                        $created['attendance']->update([
                            'cleaning_before_path' => $shift->before_photo_path,
                            'cleaning_after_path' => $shift->after_photo_path,
                            'cleaning_before_captured_at' => $shift->before_captured_at,
                            'cleaning_after_captured_at' => $shift->after_captured_at,
                        ]);
                    }

                    $shift->update(['attendance_id' => $created['attendance']->id]);
                    $createdIds[] = $created['attendance']->id;
                }

                $manualAttendanceRequest->update([
                    'status' => ManualAttendanceRequest::APPROVED,
                    'decision_note' => trim((string) ($validated['decision_note'] ?? '')) ?: null,
                    'reviewed_by' => $reviewer->id,
                    'reviewed_at' => now(),
                ]);
            });
        } catch (\RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        $approvedTitle = match ($requestType) {
            ManualAttendanceRequest::TYPE_JANITORIAL => 'Janitorial offline attendance approved',
            ManualAttendanceRequest::TYPE_CLASS_HOURS => 'Class-hours duty approved',
            default => 'Offline attendance approved',
        };

        Notification::create([
            'user_id' => $student->id,
            'title' => $approvedTitle,
            'message' => 'Your '.$requestType.' attendance request was approved. '
                .count($createdIds).(count($createdIds) === 1 ? ' shift was' : ' shifts were')
                .' credited on your DTR.',
        ]);

        return response()->json([
            'message' => 'Request approved. Hours were credited on the student DTR.',
            'request' => $this->serialize($manualAttendanceRequest->fresh(['shifts', 'student.profile', 'reviewer:id,name']), true),
            'attendance_ids' => $createdIds,
        ]);
    }

    /** Janitorial leader: offline requests for the groups they supervise. */
    public function janitorialQueue(Request $request)
    {
        $user = $request->user();
        if ($user->role !== 'Student') {
            return response()->json(['requests' => []]);
        }

        $groupIds = JanitorialGroup::query()
            ->where('supervisor_user_id', $user->id)
            ->pluck('id');
        if ($groupIds->isEmpty()) {
            return response()->json(['requests' => []]);
        }

        $rows = ManualAttendanceRequest::query()
            ->with([
                'student:id,name',
                'student.profile:id,user_id,student_id_number,assigned_office,year_level',
                'shifts',
                'reviewer:id,name',
            ])
            ->where('request_type', ManualAttendanceRequest::TYPE_JANITORIAL)
            ->whereHas('shifts', fn ($shifts) => $shifts->whereIn('janitorial_group_id', $groupIds))
            ->orderByRaw("CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END")
            ->orderByDesc('created_at')
            ->limit(40)
            ->get()
            ->map(fn (ManualAttendanceRequest $row) => $this->serialize($row, true));

        return response()->json(['requests' => $rows]);
    }

    private function janitorialSupervisorCanReview(User $reviewer, ManualAttendanceRequest $manualAttendanceRequest): bool
    {
        if ($reviewer->role !== 'Student') {
            return false;
        }

        $groupIds = $manualAttendanceRequest->shifts
            ->pluck('janitorial_group_id')
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        if ($groupIds->isEmpty()) {
            return false;
        }

        $supervised = JanitorialGroup::query()
            ->whereIn('id', $groupIds)
            ->where('supervisor_user_id', $reviewer->id)
            ->count();

        return $supervised === $groupIds->count();
    }

    private function photoError(UploadedFile $photo, string $label): ?string
    {
        if (! $photo->isValid()) {
            return 'The '.$label.' photo could not be uploaded.';
        }

        if ($photo->getSize() > 5_242_880) {
            return 'The '.$label.' photo must be 5 MB or smaller.';
        }

        $mime = strtolower((string) $photo->getMimeType());
        if (! in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            return 'The '.$label.' photo must be a JPEG, PNG, or WebP image.';
        }

        return null;
    }

    private function storeOfflinePhoto(UploadedFile $photo, int $requestId, int $index, string $phase): string
    {
        $extension = strtolower($photo->getClientOriginalExtension() ?: 'jpg');
        if (! in_array($extension, ['jpg', 'jpeg', 'png', 'webp'], true)) {
            $extension = 'jpg';
        }

        $stored = $photo->storeAs(
            'cleaning-proofs/offline/'.$requestId,
            $index.'-'.$phase.'.'.$extension,
            'local',
        );

        if (! is_string($stored) || $stored === '') {
            abort(500, 'Could not store the '.$phase.' photo.');
        }

        return $stored;
    }

    private function canReviewStudent(User $actor, User $student): bool
    {
        if ($actor->role === 'WSPO Staff') {
            return true;
        }

        return app(UserController::class)->supervisorCanAccessStudent($actor, $student);
    }

    private function notifyReviewers(User $student, string $title, string $message): void
    {
        $accounts = app(UserController::class);
        $reviewers = User::query()
            ->whereIn('role', ['Supervisor', 'WSPO Staff'])
            ->with('profile')
            ->get()
            ->filter(function (User $reviewer) use ($accounts, $student) {
                if ($reviewer->role === 'WSPO Staff') {
                    return true;
                }

                return $accounts->supervisorCanAccessStudent($reviewer, $student);
            });

        foreach ($reviewers as $reviewer) {
            Notification::create([
                'user_id' => $reviewer->id,
                'title' => $title,
                'message' => $message,
            ]);
        }
    }

    private function serialize(ManualAttendanceRequest $row, bool $includeStudent = false): array
    {
        $payload = [
            'id' => $row->id,
            'user_id' => $row->user_id,
            'request_type' => $row->request_type ?: ManualAttendanceRequest::TYPE_REGULAR,
            'reason' => $row->reason,
            'status' => $row->status,
            'decision_note' => $row->decision_note,
            'reviewed_by' => $row->reviewer?->name,
            'reviewed_at' => $row->reviewed_at,
            'created_at' => $row->created_at,
            'updated_at' => $row->updated_at,
            'shifts' => $row->shifts->map(fn (ManualAttendanceRequestShift $shift) => [
                'id' => $shift->id,
                'date' => $shift->work_date?->toDateString(),
                'time_in' => $shift->time_in,
                'time_out' => $shift->time_out,
                'janitorial_area' => $shift->janitorial_area,
                'janitorial_group_id' => $shift->janitorial_group_id,
                'before_photo_path' => $shift->before_photo_path,
                'after_photo_path' => $shift->after_photo_path,
                'before_captured_at' => optional($shift->before_captured_at)?->toIso8601String(),
                'after_captured_at' => optional($shift->after_captured_at)?->toIso8601String(),
                'sort_order' => (int) $shift->sort_order,
                'attendance_id' => $shift->attendance_id,
            ])->values()->all(),
        ];

        if ($includeStudent) {
            $payload['student_name'] = $row->student?->name;
            $payload['student_id_number'] = $row->student?->profile?->student_id_number;
            $payload['assigned_office'] = $row->student?->profile?->assigned_office;
            $payload['year_level'] = $row->student?->profile?->year_level;
        }

        return $payload;
    }
}
