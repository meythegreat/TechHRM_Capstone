<?php

namespace App\Http\Controllers;

use App\Models\ApplicationDocument;
use App\Models\Attendance;
use App\Models\Requirement;
use App\Models\StaffingRequest;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class SecureFileController extends Controller
{
    private const ALLOWED_PREFIXES = [
        'avatars/',
        'requirements/',
        'application-documents/',
        'staffing-approvals/',
        'extra-hours-approvals/',
        'cleaning-proofs/',
    ];

    public function show(Request $request): BinaryFileResponse
    {
        $request->validate([
            'path' => 'required|string|max:500',
        ]);

        $path = $this->sanitizePath($request->query('path'));

        if (!$this->isAllowedPath($path)) {
            abort(403, 'Access denied.');
        }

        if (!Storage::disk('local')->exists($path)) {
            abort(404, 'File not found.');
        }

        if (!$this->userCanAccess($request->user(), $path)) {
            abort(403, 'You do not have permission to view this file.');
        }

        $mime = $this->contentType($path);
        $absolutePath = Storage::disk('local')->path($path);
        $filename = $this->safeFilename($this->recordedDownloadName($path), $path);

        return response()->file($absolutePath, [
            'Content-Type' => $mime,
            'Content-Disposition' => 'inline; filename="'.$filename.'"',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, max-age=120',
        ]);
    }

    private function sanitizePath(string $path): string
    {
        $path = str_replace('\\', '/', $path);
        $path = preg_replace('#/+#', '/', $path) ?? $path;

        if (str_contains($path, '..')) {
            abort(400, 'Invalid file path.');
        }

        return ltrim($path, '/');
    }

    private function isAllowedPath(string $path): bool
    {
        foreach (self::ALLOWED_PREFIXES as $prefix) {
            if (str_starts_with($path, $prefix)) {
                return true;
            }
        }

        return false;
    }

    private function userCanAccess($user, string $path): bool
    {
        if (str_starts_with($path, 'avatars/')) {
            if ($user->profile_picture === $path) {
                return true;
            }

            return User::withTrashed()->where('profile_picture', $path)->exists();
        }

        if (str_starts_with($path, 'requirements/')) {
            $requirement = Requirement::where('file_path', $path)->first();

            if (!$requirement) {
                return false;
            }

            if ($requirement->user_id === $user->id) {
                return true;
            }

            return in_array($user->role, ['Super Admin', 'WSPO Staff', 'Supervisor'], true);
        }

        if (str_starts_with($path, 'application-documents/')) {
            // Archived (soft-deleted) applications still show in the Applications
            // archive; keep their uploaded files readable for staff review.
            $document = ApplicationDocument::with([
                'application' => fn ($query) => $query->withTrashed(),
            ])->where('file_path', $path)->first();

            if (!$document?->application) {
                return false;
            }

            if ($document->application->user_id === $user->id) {
                return true;
            }

            return in_array($user->role, ['Super Admin', 'WSPO Staff'], true);
        }

        if (str_starts_with($path, 'staffing-approvals/')) {
            $staffingRequest = StaffingRequest::where('approval_letter_path', $path)->first();

            if (!$staffingRequest) {
                return false;
            }

            if ((int) $staffingRequest->requested_by === (int) $user->id) {
                return true;
            }

            return in_array($user->role, ['Super Admin', 'WSPO Staff'], true);
        }

        if (str_starts_with($path, 'extra-hours-approvals/')) {
            $extraHours = \App\Models\ExtraHoursRequest::where('approval_letter_path', $path)->first();

            if (!$extraHours) {
                return false;
            }

            if ((int) $extraHours->requested_by === (int) $user->id) {
                return true;
            }

            return in_array($user->role, ['Super Admin', 'WSPO Staff'], true);
        }

        if (str_starts_with($path, 'cleaning-proofs/')) {
            $attendance = Attendance::query()
                ->where(function ($query) use ($path) {
                    $query->where('cleaning_before_path', $path)
                        ->orWhere('cleaning_after_path', $path);
                })
                ->first();

            if (! $attendance) {
                $shift = \App\Models\ManualAttendanceRequestShift::query()
                    ->with('request')
                    ->where(function ($query) use ($path) {
                        $query->where('before_photo_path', $path)
                            ->orWhere('after_photo_path', $path);
                    })
                    ->first();
                if (! $shift?->request) {
                    return false;
                }

                if ((int) $shift->request->user_id === (int) $user->id) {
                    return true;
                }

                if (in_array($user->role, ['Super Admin', 'WSPO Staff', 'Supervisor'], true)) {
                    return true;
                }

                if ((int) ($shift->janitorial_group_id ?? 0) > 0) {
                    return \App\Models\JanitorialGroup::query()
                        ->where('id', $shift->janitorial_group_id)
                        ->where('supervisor_user_id', $user->id)
                        ->exists();
                }

                return false;
            }

            if ((int) $attendance->user_id === (int) $user->id) {
                return true;
            }

            if (in_array($user->role, ['Super Admin', 'WSPO Staff', 'Supervisor'], true)) {
                return true;
            }

            // Janitorial student supervisors may review their group's cleaning photos.
            if ((int) ($attendance->janitorial_group_id ?? 0) > 0) {
                return \App\Models\JanitorialGroup::query()
                    ->where('id', $attendance->janitorial_group_id)
                    ->where('supervisor_user_id', $user->id)
                    ->exists();
            }

            return false;
        }

        return false;
    }

    private function contentType(string $path): string
    {
        $fromExtension = match (strtolower(pathinfo($path, PATHINFO_EXTENSION))) {
            'pdf' => 'application/pdf',
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            default => null,
        };

        if ($fromExtension) {
            return $fromExtension;
        }

        $recorded = strtolower(trim((string) $this->recordedMime($path)));
        if ($this->isDisplayMime($recorded)) {
            return $recorded;
        }

        $detected = Storage::disk('local')->mimeType($path);

        return is_string($detected) && $this->isDisplayMime(strtolower($detected))
            ? strtolower($detected)
            : 'application/octet-stream';
    }

    private function recordedMime(string $path): ?string
    {
        if (!str_starts_with($path, 'application-documents/')) {
            return null;
        }

        $mime = ApplicationDocument::where('file_path', $path)->value('mime_type');

        return is_string($mime) && $mime !== '' ? $mime : null;
    }

    private function recordedDownloadName(string $path): ?string
    {
        if (str_starts_with($path, 'application-documents/')) {
            $name = ApplicationDocument::where('file_path', $path)->value('original_name');

            return is_string($name) && trim($name) !== '' ? $name : null;
        }

        if (str_starts_with($path, 'requirements/')) {
            $name = Requirement::where('file_path', $path)->value('document_type');
            if (!is_string($name) || trim($name) === '') {
                return null;
            }

            $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
            if ($extension !== '' && !str_ends_with(strtolower($name), '.'.$extension)) {
                return $name.'.'.$extension;
            }

            return $name;
        }

        return null;
    }

    private function safeFilename(?string $name, string $path): string
    {
        $candidate = trim((string) ($name ?: basename($path)));
        $candidate = str_replace(["\r", "\n", '"', '\\'], '', $candidate);
        $candidate = preg_replace('/[^\x20-\x7E]+/', '_', $candidate) ?? '';
        $candidate = trim($candidate, ". \t");

        if ($candidate === '') {
            $candidate = 'document';
        }

        return substr($candidate, 0, 180);
    }

    private function isDisplayMime(string $mime): bool
    {
        return $mime !== ''
            && $mime !== 'application/octet-stream'
            && $mime !== 'text/plain'
            && $mime !== 'text/html'
            && !str_contains($mime, ' ');
    }
}
