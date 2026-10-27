<?php

namespace App\Http\Controllers;

use App\Models\ApplicationDocument;
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

        $mime = Storage::disk('local')->mimeType($path) ?: 'application/octet-stream';
        $absolutePath = Storage::disk('local')->path($path);

        return response()->file($absolutePath, [
            'Content-Type' => $mime,
            'Cache-Control' => 'private, no-cache, no-store, must-revalidate',
            'Pragma' => 'no-cache',
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
            $document = ApplicationDocument::with('application')->where('file_path', $path)->first();

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

        return false;
    }
}
