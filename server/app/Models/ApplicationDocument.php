<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApplicationDocument extends Model
{
    protected $fillable = [
        'application_id',
        'original_name',
        'file_path',
        'mime_type',
        'file_size',
    ];

    public function application()
    {
        return $this->belongsTo(Application::class);
    }
}
