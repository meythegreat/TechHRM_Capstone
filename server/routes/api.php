<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\LogController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\AdminDashboardController;
use App\Http\Controllers\ActivityLogController;

// --- PUBLIC ROUTES ---
Route::post('/login', [AuthController::class, 'login']);

// --- PROTECTED ROUTES (Requires valid Sanctum token) ---
Route::middleware('auth:sanctum')->group(function () {

    Route::get('/users', [\App\Http\Controllers\UserController::class, 'index']);
    Route::post('/users', [\App\Http\Controllers\UserController::class, 'store']);
    Route::put('/users/{id}', [\App\Http\Controllers\UserController::class, 'update']); // For Editing
    Route::delete('/users/{id}', [\App\Http\Controllers\UserController::class, 'destroy']); // For Deleting
    Route::get('/logs', [ActivityLogController::class, 'index']); // Fixes "failed to load"
    Route::post('/user/avatar', [\App\Http\Controllers\UserController::class, 'uploadAvatar']);

    // =========================================================
    // 1. GENERAL ACCESS (Working Students, Admins, Super Admins)
    // =========================================================
    Route::post('/logout', [AuthController::class, 'logout']);

    // Personal Attendance
    Route::post('/attendance/clock-in', [AttendanceController::class, 'clockIn']);
    Route::post('/attendance/clock-out', [AttendanceController::class, 'clockOut']);
    Route::get('/attendance/my-history', [AttendanceController::class, 'myHistory']);
    Route::get('/schedule/my-schedule', [\App\Http\Controllers\ScheduleController::class, 'mySchedule']);

    // =========================================================
    // 2. ADMIN & SUPER ADMIN ACCESS ONLY
    // =========================================================
    // EXACT match with the database strings: 'Admin' and 'Super Admin'
    Route::middleware('role:Admin,Super Admin')->group(function () {

        // User Management (Except Delete)
        Route::apiResource('users', UserController::class)->except(['destroy']);

        // Log Management
        Route::get('/logs', [LogController::class, 'index']);

        // Global Attendance & Dashboards
        Route::get('/attendance/all', [\App\Http\Controllers\AttendanceController::class, 'allHistory']);
        Route::get('/attendance/export', [AttendanceController::class, 'export']);
        Route::get('/admin/dashboard-metrics', [AdminDashboardController::class, 'getMetrics']);
        Route::get('/admin/stats', [App\Http\Controllers\DashboardController::class, 'getStats']);
    });

    // =========================================================
    // 3. SUPER ADMIN ACCESS ONLY
    // =========================================================
    // EXACT match with the database string: 'Super Admin'
    Route::middleware('role:Super Admin')->group(function () {

        // ONLY Super Admins can delete users
        Route::delete('/users/{user}', [UserController::class, 'destroy']);

    });
});
