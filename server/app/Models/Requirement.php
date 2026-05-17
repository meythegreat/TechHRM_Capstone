<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Requirement extends Model
{
    protected $fillable = ['user_id', 'document_type', 'file_path', 'status', 'remarks'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
