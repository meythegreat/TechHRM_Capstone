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
use App\Http\Controllers\AdminController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\RequirementController;

// =========================================================
// PUBLIC ROUTES
// =========================================================

Route::post('/login', [AuthController::class, 'login']);
Route::post('/mobile/login', [\App\Http\Controllers\AuthController::class, 'mobileLogin']);


// =========================================================
// PROTECTED ROUTES (Requires valid Sanctum token)
// =========================================================

Route::middleware('auth:sanctum')->group(function () {

    // =====================================================
    // GENERAL ACCESS (ALL AUTHENTICATED USERS)
    // =====================================================

    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/user', function (Request $request) {
        return $request->user()->load('profile');
    });

    Route::post('/user/avatar', [UserController::class, 'uploadAvatar']);

    Route::get('/secure-file', [SecureFileController::class, 'show']);

    // =====================================================
    // NOTIFICATIONS (ALL AUTHENTICATED USERS)
    // =====================================================

    Route::get('/notifications', [NotificationController::class, 'index']);

    Route::patch('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);

    // =====================================================
    // WORKING STUDENT FEATURES
    // =====================================================

    Route::post('/attendance/clock-in', [AttendanceController::class, 'clockIn']);

    Route::post('/attendance/clock-out', [AttendanceController::class, 'clockOut']);

    Route::get('/attendance/my-history', [AttendanceController::class, 'myHistory']);

    Route::get('/schedule/my-schedule', [ScheduleController::class, 'mySchedule']);

    Route::get('/my-schedule', [ScheduleController::class, 'mySchedule']);

    Route::post('/my-schedule/{id}/request-edit', [ScheduleController::class, 'requestEdit']);

    // =====================================================
    // REQUIREMENT UPLOADS
    // =====================================================

    Route::post('/requirements/upload', [RequirementController::class, 'upload']);

    Route::get('/my-requirements', [RequirementController::class, 'myRequirements']);

    // =====================================================
    // SUPERVISOR / WSPO STAFF / SUPER ADMIN
    // =====================================================

    Route::middleware(['role:Supervisor,WSPO Staff,Super Admin'])->group(function () {

        // =================================================
        // ATTENDANCE MONITORING
        // =================================================

        Route::get('/attendance', [AttendanceController::class, 'index']);

        Route::get('/attendance/all', [AttendanceController::class, 'allHistory']);

        Route::patch('/attendance/{id}/approve', [AttendanceController::class, 'approve']);

        // =================================================
        // SCHEDULE MANAGEMENT
        // =================================================

        Route::get('/schedules', [ScheduleController::class, 'index']);

        Route::post('/schedules', [ScheduleController::class, 'store']);

        Route::delete('/schedules/{id}', [ScheduleController::class, 'destroy']);

        Route::patch('/schedules/{id}/resolve-request', [ScheduleController::class, 'resolveRequest']);

        // =================================================
        // STUDENT VIEWING
        // =================================================

        Route::get('/users', [UserController::class, 'index']);

        // =================================================
        // LOGS
        // =================================================

        Route::get('/logs', [ActivityLogController::class, 'index']);

    });

    // =====================================================
    // WSPO STAFF + SUPER ADMIN
    // =====================================================
    Route::middleware(['role:WSPO Staff,Super Admin'])->group(function () {
        Route::post('/users', [UserController::class, 'store']);
        Route::put('/users/{id}', [UserController::class, 'update']);

        // NEW: Moved here so WSPO Staff can delete
        Route::delete('/users/{id}', [UserController::class, 'destroy']);
    });

    // =====================================================
    // SUPER ADMIN ONLY
    // =====================================================

    Route::middleware(['role:Super Admin'])->group(function () {

        // =================================================
        // ADMIN DASHBOARD
        // =================================================

        Route::get('/admin/dashboard-stats', [AdminController::class, 'getStats']);

        Route::get('/admin/stats', [DashboardController::class, 'getStats']);

        // =================================================
        // REQUIREMENTS MANAGEMENT
        // =================================================

        Route::get('/requirements', [RequirementController::class, 'index']);

        Route::patch('/requirements/{id}/status', [RequirementController::class, 'updateStatus']);

    });

});
