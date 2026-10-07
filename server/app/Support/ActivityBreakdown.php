<?php

namespace App\Support;

use App\Models\ActivityLog;
use App\Models\Application;
use App\Models\Attendance;
use App\Models\Requirement;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class ActivityBreakdown
{
    private array $resolvedNames = [];

    public function attach(Collection $logs): void
    {
        $userNames = $this->userNames($logs);

        $logs->each(function (ActivityLog $log) use ($userNames): void {
            $log->setAttribute('breakdown', [
                'steps' => $this->steps($log, $userNames),
                'documents' => $this->documents($log),
            ]);
        });
    }

    private function steps(ActivityLog $log, array $userNames): array
    {
        $action = $log->action ?? '';
        $module = $log->module ?: $this->moduleFromAction($action);
        $new = $this->values($log->new_values);
        $old = $this->values($log->old_values);

        if (str_contains($action, 'Login')) {
            return [
                $this->step('Session', 'Signed in to the system.'),
                $this->step('Network', $log->ip_address ? "From {$log->ip_address}." : 'IP address was not recorded.'),
            ];
        }

        if (str_contains($action, 'Logout')) {
            return [
                $this->step('Session', 'Signed out of the system.'),
                $this->step('Network', $log->ip_address ? "From {$log->ip_address}." : 'IP address was not recorded.'),
            ];
        }

        if ($module === 'Attendance') {
            return $this->attendanceSteps($log, $new, $old, $userNames);
        }

        if ($module === 'Requirement') {
            return $this->requirementSteps($log, $new, $old, $userNames);
        }

        if ($module === 'Application' || $action === 'Submit Application') {
            return $this->applicationSteps($log, $new);
        }

        $diff = $this->diffSteps($old, $new, $userNames);
        if ($diff !== []) {
            return $diff;
        }

        return [
            $this->step('Summary', $log->description ?: 'No further detail was stored for this trail.'),
        ];
    }

    private function attendanceSteps(ActivityLog $log, array $new, array $old, array $userNames): array
    {
        $record = $log->record_id ? Attendance::find($log->record_id) : null;
        $snapshot = $new !== [] ? $new : $old;
        $student = $this->accountName($snapshot['user_id'] ?? $record?->user_id, $userNames);

        if ($this->isCreate($log) && empty($snapshot['time_out'])) {
            $steps = [
                $this->step('Account', "{$student} started a shift."),
            ];

            $method = $snapshot['check_in_method'] ?? null;
            if ($method === 'qr') {
                $steps[] = $this->step('Check-in', 'Scanned the live QR code on the supervisor screen.');
            } elseif ($method === 'passcode') {
                $steps[] = $this->step('Check-in', 'Entered a supervisor passcode.');
            }

            if (!empty($snapshot['verification_code_used'])) {
                $steps[] = $this->step('Passcode', (string) $snapshot['verification_code_used']);
            }

            if (!empty($snapshot['attendance_type'])) {
                $steps[] = $this->step('Duty type', (string) $snapshot['attendance_type']);
            }

            if (!empty($snapshot['time_in'])) {
                $steps[] = $this->step('Time in', $this->formatValue('time_in', $snapshot['time_in']));
            }

            if (!empty($snapshot['status'])) {
                $steps[] = $this->step('Record status', ucfirst((string) $snapshot['status']));
            }

            $steps[] = $this->anomalyStep($snapshot);

            return $steps;
        }

        if ($this->isCreate($log) && !empty($snapshot['time_out'])) {
            return array_values(array_filter([
                $this->step('Account', "A completed shift was entered for {$student}."),
                !empty($snapshot['attendance_type']) ? $this->step('Duty type', (string) $snapshot['attendance_type']) : null,
                !empty($snapshot['time_in']) ? $this->step('Time in', $this->formatValue('time_in', $snapshot['time_in'])) : null,
                $this->step('Time out', $this->formatValue('time_out', $snapshot['time_out'])),
                $this->hoursStep($snapshot),
                !empty($snapshot['task_description']) ? $this->step('Task', (string) $snapshot['task_description']) : null,
                !empty($snapshot['status']) ? $this->step('Record status', ucfirst((string) $snapshot['status'])) : null,
                $this->anomalyStep($snapshot),
            ]));
        }

        if (array_key_exists('time_out', $new) && empty($old['time_out'])) {
            $timeIn = $old['time_in'] ?? $record?->time_in;
            $merged = array_merge($old, $new);

            return array_values(array_filter([
                $this->step('Account', "{$student} ended the shift."),
                $timeIn ? $this->step('Time in', $this->formatValue('time_in', $timeIn)) : null,
                $this->step('Time out', $this->formatValue('time_out', $new['time_out'])),
                $this->hoursStep($merged),
                $this->anomalyStep($merged),
            ]));
        }

        $changes = $this->diffSteps($old, $new, $userNames);
        if ($student !== 'Unknown account') {
            array_unshift($changes, $this->step('Account', $student));
        }

        return $changes !== [] ? $changes : [
            $this->step('Summary', $log->description ?: 'Attendance was updated.'),
        ];
    }

    private function requirementSteps(ActivityLog $log, array $new, array $old, array $userNames): array
    {
        $student = $this->accountName($new['user_id'] ?? $old['user_id'] ?? null, $userNames);
        $type = $new['document_type'] ?? $old['document_type'] ?? 'document';

        if ($this->isCreate($log) || array_key_exists('file_path', $new)) {
            $steps = [
                $this->step('Submission', "{$student} submitted {$type}."),
                $this->step('Document', 'The file is attached below and can be opened.'),
            ];

            if (!empty($new['status'])) {
                $steps[] = $this->step('Review status', ucfirst((string) $new['status']));
            }

            return $steps;
        }

        $steps = $this->diffSteps($old, $new, $userNames);
        if ($steps === []) {
            $steps[] = $this->step('Summary', $log->description ?: 'Requirement was updated.');
        }

        array_unshift($steps, $this->step('Document', "{$type} for {$student}. Open the submitted file below."));

        return $steps;
    }

    private function applicationSteps(ActivityLog $log, array $new): array
    {
        $documents = $this->documentList($new);
        $count = count($documents);

        $steps = [
            $this->step(
                'Submission',
                $count > 0
                    ? "Application submitted with {$count} document".($count === 1 ? '' : 's').'.'
                    : ($log->description ?: 'Application submitted.')
            ),
        ];

        if (!empty($new['preferred_department'])) {
            $steps[] = $this->step('Preferred department', (string) $new['preferred_department']);
        }

        if (!empty($new['status'])) {
            $steps[] = $this->step('Status', (string) $new['status']);
        }

        if (!empty($new['reason_for_applying'])) {
            $steps[] = $this->step('Reason for applying', (string) $new['reason_for_applying']);
        }

        if ($count > 0) {
            $steps[] = $this->step('Documents', 'Each submitted file is listed below and can be opened.');
        }

        return $steps;
    }

    private function documents(ActivityLog $log): array
    {
        $new = $this->values($log->new_values);
        $documents = $this->documentList($new);

        $path = $new['file_path'] ?? null;
        if (is_string($path) && $this->isOpenablePath($path)) {
            $documents[] = [
                'name' => (string) ($new['document_type'] ?? basename($path)),
                'path' => $path,
            ];
        }

        if ($documents === [] && $log->module === 'Requirement' && $log->record_id) {
            $requirement = Requirement::find($log->record_id);
            if ($requirement && $this->isOpenablePath((string) $requirement->file_path)) {
                $documents[] = [
                    'name' => $requirement->document_type ?: basename($requirement->file_path),
                    'path' => $requirement->file_path,
                ];
            }
        }

        if ($documents === [] && ($log->module === 'Application' || $log->action === 'Submit Application') && $log->record_id) {
            $application = Application::with('documents')->find($log->record_id);
            foreach ($application?->documents ?? [] as $document) {
                if ($this->isOpenablePath((string) $document->file_path)) {
                    $documents[] = [
                        'name' => $document->original_name ?: basename($document->file_path),
                        'path' => $document->file_path,
                    ];
                }
            }
        }

        $unique = [];
        foreach ($documents as $document) {
            $unique[$document['path']] = $document;
        }

        return array_values($unique);
    }

    private function documentList(array $values): array
    {
        $documents = [];
        foreach ($values['documents'] ?? [] as $document) {
            if (!is_array($document)) {
                continue;
            }

            $path = $document['path'] ?? $document['file_path'] ?? null;
            if (!is_string($path) || !$this->isOpenablePath($path)) {
                continue;
            }

            $documents[] = [
                'name' => (string) ($document['name'] ?? $document['original_name'] ?? basename($path)),
                'path' => $path,
            ];
        }

        return $documents;
    }

    private function diffSteps(array $old, array $new, array $userNames): array
    {
        $steps = [];
        $keys = array_unique(array_merge(array_keys($old), array_keys($new)));

        foreach ($keys as $key) {
            if ($this->skipField($key)) {
                continue;
            }

            $before = $old[$key] ?? null;
            $after = $new[$key] ?? null;
            if ($before == $after) {
                continue;
            }

            $label = $this->label($key);
            if ($key === 'user_id') {
                $before = $before !== null ? $this->accountName($before, $userNames) : null;
                $after = $after !== null ? $this->accountName($after, $userNames) : null;
            } else {
                $before = $before !== null && $before !== '' ? $this->formatValue($key, $before) : null;
                $after = $after !== null && $after !== '' ? $this->formatValue($key, $after) : null;
            }

            if ($before && $after) {
                $steps[] = $this->step($label, "Changed from {$before} to {$after}.");
            } elseif ($after) {
                $steps[] = $this->step($label, $after);
            } elseif ($before) {
                $steps[] = $this->step($label, "Removed {$before}.");
            }
        }

        return $steps;
    }

    private function userNames(Collection $logs): array
    {
        $ids = [];
        foreach ($logs as $log) {
            foreach ([$log->old_values, $log->new_values] as $values) {
                $userId = $this->values($values)['user_id'] ?? null;
                if ($userId) {
                    $ids[] = (int) $userId;
                }
            }
        }

        if ($ids === []) {
            return [];
        }

        return User::withTrashed()
            ->whereIn('id', array_unique($ids))
            ->pluck('name', 'id')
            ->all();
    }

    private function accountName(mixed $userId, array $userNames): string
    {
        if (!$userId) {
            return 'Unknown account';
        }

        $id = (int) $userId;
        if (isset($this->resolvedNames[$id])) {
            return $this->resolvedNames[$id];
        }

        $name = $userNames[$id] ?? User::withTrashed()->find($id)?->name ?? "Account #{$id}";
        $this->resolvedNames[$id] = $name;

        return $name;
    }

    private function anomalyStep(array $values): ?array
    {
        $flagged = filter_var($values['is_anomaly'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if (!$flagged) {
            return $this->step('Anomaly check', 'No anomaly was recorded.');
        }

        return $this->step('Anomaly', (string) ($values['anomaly_reason'] ?: 'Flagged for review.'));
    }

    private function hoursStep(array $values): ?array
    {
        $hours = $values['computed_hours'] ?? $values['rendered_hours'] ?? null;
        if ($hours === null || $hours === '') {
            return null;
        }

        return $this->step('Hours', number_format((float) $hours, 2).' hours recorded.');
    }

    private function values(mixed $values): array
    {
        return is_array($values) ? $values : [];
    }

    private function isCreate(ActivityLog $log): bool
    {
        return str_starts_with($log->action ?? '', 'Create');
    }

    private function moduleFromAction(string $action): ?string
    {
        foreach (['Attendance', 'Requirement', 'Application', 'User', 'Schedule', 'Profile', 'UserProfile'] as $module) {
            if (str_contains($action, $module)) {
                return $module;
            }
        }

        return null;
    }

    private function skipField(string $key): bool
    {
        return in_array($key, [
            'id',
            'password',
            'remember_token',
            'file_path',
            'documents',
            'created_at',
            'updated_at',
            'deleted_at',
            'code_owner_id',
        ], true);
    }

    private function label(string $key): string
    {
        return match ($key) {
            'user_id' => 'Account',
            'time_in' => 'Time in',
            'time_out' => 'Time out',
            'attendance_type' => 'Duty type',
            'verification_code_used' => 'Passcode',
            'check_in_method' => 'Check-in method',
            'work_type' => 'Work type',
            'task_description' => 'Task',
            'rendered_hours', 'computed_hours' => 'Hours',
            'is_anomaly' => 'Anomaly',
            'anomaly_reason' => 'Anomaly reason',
            'document_type' => 'Document type',
            'preferred_department' => 'Preferred department',
            'reason_for_applying' => 'Reason for applying',
            'available_schedules' => 'Available schedule',
            default => ucfirst(str_replace('_', ' ', $key)),
        };
    }

    private function formatValue(string $key, mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }

        if ($key === 'check_in_method') {
            return $value === 'qr' ? 'QR code' : ($value === 'passcode' ? 'Passcode' : (string) $value);
        }

        if (is_array($value)) {
            $flat = array_filter($value, fn ($item) => is_scalar($item));

            return $flat !== [] ? implode(', ', $flat) : json_encode($value);
        }

        if (is_string($value) && $this->looksLikeDate($key, $value)) {
            try {
                return Carbon::parse($value)->timezone(config('app.timezone'))->format('M j, Y g:i A');
            } catch (\Throwable) {
                return $value;
            }
        }

        return (string) $value;
    }

    private function looksLikeDate(string $key, string $value): bool
    {
        if (in_array($key, ['time_in', 'time_out', 'interview_date'], true)) {
            return true;
        }

        return (bool) preg_match('/^\d{4}-\d{2}-\d{2}[T ]/', $value);
    }

    private function isOpenablePath(string $path): bool
    {
        return str_starts_with($path, 'requirements/')
            || str_starts_with($path, 'application-documents/');
    }

    private function step(string $title, string $detail): array
    {
        return [
            'title' => $title,
            'detail' => $detail,
        ];
    }
}
