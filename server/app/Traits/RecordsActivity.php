<?php

namespace App\Traits;

use App\Models\ActivityLog;
use Illuminate\Support\Facades\Auth;

trait RecordsActivity
{
    public static function bootRecordsActivity(): void
    {
        static::created(function ($model): void {
            static::writeActivityLog($model, 'Create', null, static::normalizeValues($model->getAttributes()));
        });

        static::updated(function ($model): void {
            $changes = $model->getChanges();
            unset($changes['updated_at']);

            if ($changes === []) {
                return;
            }

            $original = array_intersect_key($model->getOriginal(), $changes);

            static::writeActivityLog(
                $model,
                'Update',
                static::normalizeValues($original),
                static::normalizeValues($changes)
            );
        });

        static::deleted(function ($model): void {
            static::writeActivityLog($model, 'Delete', static::normalizeValues($model->getOriginal()), null);
        });
    }

    protected static function writeActivityLog($model, string $action, ?array $oldValues, ?array $newValues): void
    {
        $user = Auth::user();

        if (!$user) {
            return;
        }

        $moduleName = class_basename($model);
        $actorName = $user->name ?? $user->username ?? 'System';
        $recordId = $model->getKey();

        try {
            ActivityLog::create([
                'admin_id' => $user->id,
                'admin_name' => $actorName,
                'action' => "{$action} {$moduleName}",
                'module' => $moduleName,
                'record_id' => $recordId,
                'description' => "{$actorName} {$action}d {$moduleName} record #{$recordId}.",
                'old_values' => $oldValues,
                'new_values' => $newValues,
                'ip_address' => request()?->ip(),
            ]);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    protected static function normalizeValues(array $values): array
    {
        unset($values['created_at'], $values['updated_at'], $values['deleted_at']);

        foreach (['password', 'remember_token'] as $hiddenField) {
            if (array_key_exists($hiddenField, $values)) {
                $values[$hiddenField] = '[hidden]';
            }
        }

        return $values;
    }
}
