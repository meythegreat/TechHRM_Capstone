<?php

namespace App\Support;

use App\Models\Attendance;
use App\Models\RenderedHourEvent;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Before/after camera proof for janitorial duty and daily cleaning activities.
 * Photos must be live-camera captures with a visible date/time stamp burned in at shutter.
 */
class CleaningProof
{
    public const PHASE_BEFORE = 'before';

    public const PHASE_AFTER = 'after';

    public const CAPTURE_SOURCE_LIVE_CAMERA = 'live_camera';

    public const STORAGE_PREFIX = 'cleaning-proofs/';

    public const MAX_BYTES = 5_242_880; // 5 MB

    /**
     * Shifts that require before + after evidence before hours can clear.
     */
    public static function requiredFor(Attendance $attendance): bool
    {
        if (self::isJanitorialAttendance($attendance)) {
            return true;
        }

        if (! $attendance->rendered_hour_event_id) {
            return false;
        }

        $event = $attendance->relationLoaded('renderedHourEvent')
            ? $attendance->renderedHourEvent
            : RenderedHourEvent::query()->find($attendance->rendered_hour_event_id);

        return $event && $event->kind === RenderedHourEvent::DAILY_CLEANING;
    }

    public static function isJanitorialAttendance(Attendance $attendance): bool
    {
        $dutyType = $attendance->attendance_type ?: ($attendance->work_type ?: '');

        return strcasecmp((string) $dutyType, 'Janitorial') === 0
            || (int) ($attendance->janitorial_group_id ?? 0) > 0;
    }

    public static function hasCompleteProof(Attendance $attendance): bool
    {
        return filled($attendance->cleaning_before_path)
            && filled($attendance->cleaning_after_path);
    }

    /**
     * Missing phases for a shift that requires proof, or [] when complete / not required.
     *
     * @return list<string>
     */
    public static function missingPhases(Attendance $attendance): array
    {
        if (! self::requiredFor($attendance)) {
            return [];
        }

        $missing = [];
        if (! filled($attendance->cleaning_before_path)) {
            $missing[] = self::PHASE_BEFORE;
        }
        if (! filled($attendance->cleaning_after_path)) {
            $missing[] = self::PHASE_AFTER;
        }

        return $missing;
    }

    /**
     * Block clock-out / time-out until both photos exist.
     */
    public static function denialMessage(Attendance $attendance): ?string
    {
        $missing = self::missingPhases($attendance);
        if ($missing === []) {
            return null;
        }

        $label = self::isJanitorialAttendance($attendance)
            ? 'janitorial'
            : 'daily cleaning';

        if (count($missing) === 2) {
            return 'Capture before and after cleaning photos with the live camera (date and time stamped) before you can finish this '.$label.' shift.';
        }

        $phase = $missing[0];

        return 'Capture the '.$phase.' cleaning photo with the live camera (date and time stamped) before you can finish this '.$label.' shift.';
    }

    /**
     * Persist a live-camera JPEG/PNG and record paths + captured_at on the attendance.
     *
     * @return array{attendance: Attendance, phase: string, path: string, captured_at: string}
     */
    public static function store(
        Attendance $attendance,
        string $phase,
        UploadedFile $photo,
        string $captureSource,
        Carbon $capturedAt,
    ): array {
        $phase = strtolower(trim($phase));
        if (! in_array($phase, [self::PHASE_BEFORE, self::PHASE_AFTER], true)) {
            throw new \InvalidArgumentException('Proof phase must be before or after.');
        }

        if ($captureSource !== self::CAPTURE_SOURCE_LIVE_CAMERA) {
            throw new \InvalidArgumentException(
                'Only live camera captures are accepted. Gallery or file uploads are not allowed.'
            );
        }

        if (! self::requiredFor($attendance)) {
            throw new \InvalidArgumentException(
                'Cleaning proof photos are only required for janitorial or daily cleaning shifts.'
            );
        }

        if ($attendance->time_out) {
            throw new \InvalidArgumentException('This shift is already closed.');
        }

        if ($phase === self::PHASE_AFTER && ! filled($attendance->cleaning_before_path)) {
            throw new \InvalidArgumentException('Capture the before photo first, then the after photo.');
        }

        $pathColumn = $phase === self::PHASE_BEFORE ? 'cleaning_before_path' : 'cleaning_after_path';
        $atColumn = $phase === self::PHASE_BEFORE ? 'cleaning_before_captured_at' : 'cleaning_after_captured_at';

        $previous = $attendance->{$pathColumn};
        $stored = $photo->storeAs(
            rtrim(self::STORAGE_PREFIX, '/').'/'.$attendance->id,
            $phase.'-'.now()->format('YmdHis').'.'.$photo->getClientOriginalExtension(),
            'local'
        );

        if (! is_string($stored) || $stored === '') {
            throw new \RuntimeException('Could not store cleaning proof photo.');
        }

        if (is_string($previous) && $previous !== '' && Storage::disk('local')->exists($previous)) {
            Storage::disk('local')->delete($previous);
        }

        $attendance->update([
            $pathColumn => $stored,
            $atColumn => $capturedAt,
        ]);

        return [
            'attendance' => $attendance->fresh(),
            'phase' => $phase,
            'path' => $stored,
            'captured_at' => $capturedAt->toIso8601String(),
        ];
    }

    /**
     * Compact status for API clients.
     *
     * @return array{
     *   required: bool,
     *   complete: bool,
     *   before_path: ?string,
     *   after_path: ?string,
     *   before_captured_at: ?string,
     *   after_captured_at: ?string,
     *   missing: list<string>
     * }
     */
    public static function status(Attendance $attendance): array
    {
        $required = self::requiredFor($attendance);

        return [
            'required' => $required,
            'complete' => $required ? self::hasCompleteProof($attendance) : true,
            'before_path' => $attendance->cleaning_before_path,
            'after_path' => $attendance->cleaning_after_path,
            'before_captured_at' => optional($attendance->cleaning_before_captured_at)?->toIso8601String(),
            'after_captured_at' => optional($attendance->cleaning_after_captured_at)?->toIso8601String(),
            'missing' => self::missingPhases($attendance),
        ];
    }
}
