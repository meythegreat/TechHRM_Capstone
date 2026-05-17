<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\ScheduleController;
use App\Http\Controllers\SecureFileController;

// =========================================================
// PUBLIC ROUTES
// =========================================================
Route::post('/login', [AuthController::class, 'login']);

// =========================================================
// PROTECTED ROUTES (Requires valid Sanctum token)
// =========================================================
Route::middleware('auth:sanctum')->group(function () {

    // --- 1. GENERAL ACCESS (Everyone) ---
    Route::post('/logout', [AuthController::class, 'logout']);

    // Fetch current user with their profile (Used for the locked Settings tab!)
    Route::get('/user', function (Request $request) {
        return $request->user()->load('profile');
    });

    // Profile Picture Upload
    Route::post('/user/avatar', [UserController::class, 'uploadAvatar']);

    // Private file vault (avatars, requirement documents) — auth required
    Route::get('/secure-file', [SecureFileController::class, 'show']);

    // Personal Attendance & Schedule (Student Dashboard)
    Route::post('/attendance/clock-in', [AttendanceController::class, 'clockIn']);
    Route::post('/attendance/clock-out', [AttendanceController::class, 'clockOut']);
    Route::get('/attendance/my-history', [AttendanceController::class, 'myHistory']);
    Route::get('/schedule/my-schedule', [ScheduleController::class, 'mySchedule']);

    // --- STUDENT ACCESS ---
    Route::get('/my-schedule', [\App\Http\Controllers\ScheduleController::class, 'mySchedule']);
    Route::post('/my-schedule/{id}/request-edit', [\App\Http\Controllers\ScheduleController::class, 'requestEdit']);

    // --- 2. SUPERVISOR, WSPO STAFF, & SUPER ADMIN ---
    // (Filtering logic is handled securely inside the controllers)
    Route::get('/admin/stats', [DashboardController::class, 'getStats']);
    Route::get('/attendance', [\App\Http\Controllers\AttendanceController::class, 'index']);
    Route::get('/attendance/all', [AttendanceController::class, 'allHistory']);

    // --- 3. WSPO STAFF & SUPER ADMIN ONLY ---
    // (If you have a custom role middleware, you can wrap this, otherwise the React frontend hides the button)
    Route::get('/logs', [ActivityLogController::class, 'index']);
    Route::patch('/schedules/{id}/resolve-request', [\App\Http\Controllers\ScheduleController::class, 'resolveRequest']);
    Route::patch('/attendance/{id}/approve', [\App\Http\Controllers\AttendanceController::class, 'approve']);

    // --- 4. SUPER ADMIN ONLY (User Management) ---
    // (We use exact HTTP verbs instead of apiResource to prevent overlap)
    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/users/{id}', [UserController::class, 'update']);
    Route::delete('/users/{id}', [UserController::class, 'destroy']);
    Route::get('/schedules', [ScheduleController::class, 'index']);
    Route::post('/schedules', [ScheduleController::class, 'store']);
    Route::delete('/schedules/{id}', [ScheduleController::class, 'destroy']);

    // --- SUPER ADMIN COMMAND CENTER ---
    Route::get('/admin/dashboard-stats', [\App\Http\Controllers\AdminController::class, 'getStats']);

    // --- NOTIFICATIONS ---
    Route::get('/notifications', [\App\Http\Controllers\NotificationController::class, 'index']);
    Route::patch('/notifications/{id}/read', [\App\Http\Controllers\NotificationController::class, 'markAsRead']);

    // --- REQUIREMENTS (WSPO DOCUMENTS) ---
    Route::post('/requirements/upload', [\App\Http\Controllers\RequirementController::class, 'upload']);
    Route::get('/my-requirements', [\App\Http\Controllers\RequirementController::class, 'myRequirements']);

    // Admin review routes
    Route::get('/requirements', [\App\Http\Controllers\RequirementController::class, 'index']);
    Route::patch('/requirements/{id}/status', [\App\Http\Controllers\RequirementController::class, 'updateStatus']);
});
