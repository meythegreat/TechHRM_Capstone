<?php

namespace App\Http\Controllers;

use App\Models\Requirement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class SecureFileController extends Controller
{
    private const ALLOWED_PREFIXES = ['avatars/', 'requirements/'];

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
            return $user->profile_picture === $path;
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

        return false;
    }
}
