<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\RecordsActivity;

class Requirement extends Model
{
    use RecordsActivity;

    protected $fillable = ['user_id', 'document_type', 'file_path', 'status', 'remarks'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
