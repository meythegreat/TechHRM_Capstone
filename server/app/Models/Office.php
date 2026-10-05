<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Office extends Model
{
    protected $fillable = ['name'];

    /** Official office names, in display order. */
    public static function names(): array
    {
        return static::query()->orderBy('name')->pluck('name')->all();
    }
}
