<?php

namespace App\Services;

use App\Http\Controllers\UserController;
use App\Models\Notification;
use App\Models\User;

class DepartmentAssignmentNotifier
{
    /**
     * Tell every supervisor of this department that a working student was assigned.
     */
    public function notify(User $student, string $department, ?string $dutyLabel = null): void
    {
        $department = trim($department);
        if ($department === '') {
            return;
        }

        $dutyLabel = trim((string) $dutyLabel);
        $message = $dutyLabel !== ''
            ? "{$student->name} has been assigned to {$department} as a working student for {$dutyLabel}."
            : "{$student->name} has been assigned to {$department} as a working student.";

        $this->notifyMessage($department, 'Working Student Assigned', $message);
    }

    public function notifyMessage(string $department, string $title, string $message, ?int $exceptUserId = null): void
    {
        $department = trim($department);
        if ($department === '') {
            return;
        }

        foreach ($this->supervisorsFor($department) as $supervisor) {
            if ($exceptUserId !== null && $supervisor->id === $exceptUserId) {
                continue;
            }

            Notification::create([
                'user_id' => $supervisor->id,
                'title' => $title,
                'message' => $message,
            ]);
        }
    }

    /** @return \Illuminate\Support\Collection<int, User> */
    private function supervisorsFor(string $department)
    {
        $targets = array_map([$this, 'normalize'], $this->aliases($department));

        return User::with('profile')
            ->whereIn('role', ['Supervisor', 'WSPO Staff'])
            ->get()
            ->filter(function (User $supervisor) use ($targets) {
                foreach ($this->departmentsOf($supervisor) as $assigned) {
                    if (in_array($this->normalize($assigned), $targets, true)) {
                        return true;
                    }
                }

                return false;
            })
            ->values();
    }

    /** @return list<string> */
    private function departmentsOf(User $supervisor): array
    {
        $configured = $supervisor->profile?->supervised_departments;
        $departments = is_array($configured) ? $configured : [];

        if ($supervisor->role === 'WSPO Staff') {
            $position = trim((string) ($supervisor->profile?->assigned_office ?? ''));
            if ($position === '' || strcasecmp($position, 'WSPO Coordinator') === 0 || strcasecmp($position, 'WSPO') === 0) {
                $departments[] = 'WSPO';
            }
        } elseif ($departments === [] && $supervisor->profile?->assigned_office) {
            $departments[] = $supervisor->profile->assigned_office;
        }

        return array_values(array_unique(array_filter(array_map(
            fn ($department) => is_string($department) ? trim($department) : '',
            $departments
        ))));
    }

    /** @return list<string> */
    private function aliases(string $department): array
    {
        return app(UserController::class)->officeNames($department);
    }

    private function normalize(string $department): string
    {
        return strtolower((string) preg_replace('/[^a-z0-9]/i', '', $department));
    }
}
