<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\LogController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\AdminDashboardController;

// Public route
Route::post('/login', [AuthController::class, 'login']);

// Protected routes (Requires valid Sanctum token)
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

    // This single line automatically registers all 5 CRUD endpoints (GET, POST, PUT, DELETE)
    Route::apiResource('users', UserController::class);

    Route::get('/logs', [LogController::class, 'index']);

    // Admin Routes
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::apiResource('users', UserController::class);
    Route::get('/logs', [LogController::class, 'index']);

    // --- Attendance Routes ---
    Route::post('/attendance/clock-in', [AttendanceController::class, 'clockIn']);
    Route::post('/attendance/clock-out', [AttendanceController::class, 'clockOut']);
    Route::get('/attendance/my-history', [AttendanceController::class, 'myHistory']);

    // NEW EXPORT ROUTE (Place it here!)
    Route::get('/attendance/export', [AttendanceController::class, 'export']);

    Route::get('/attendance/all', [AttendanceController::class, 'index']);

    Route::get('/admin/dashboard-metrics', [AdminDashboardController::class, 'getMetrics']);
});
