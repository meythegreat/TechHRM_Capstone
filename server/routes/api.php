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
Route::post('/apply', [\App\Http\Controllers\ApplicationController::class, 'publicApply']);


// =========================================================
// PROTECTED ROUTES (Requires valid Sanctum token)
// =========================================================

Route::middleware('auth:sanctum')->group(function () {

    // --- STAGE 1: WSPO APPLICATION MODULE (Student) ---
    Route::post('/applications', [\App\Http\Controllers\ApplicationController::class, 'store']);
    Route::get('/applications/my-status', [\App\Http\Controllers\ApplicationController::class, 'myApplication']);

    // --- STAGE 2: Daily Operations (Student) ---
    Route::get('/tasks/my-tasks', [\App\Http\Controllers\TaskController::class, 'myTasks']);
    Route::put('/tasks/{id}/status', [\App\Http\Controllers\TaskController::class, 'updateStatus']);

    // --- STAGE 5: Discipline & Compliance (Student) ---
    Route::get('/disciplinary/my-records', [\App\Http\Controllers\DisciplinaryController::class, 'myRecords']);
    Route::post('/disciplinary/{id}/appeal', [\App\Http\Controllers\DisciplinaryController::class, 'submitAppeal']);

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

    // --- STAGE 3 & 4: Advanced Attendance ---
    Route::post('/attendance/secure-clock-in', [\App\Http\Controllers\AdvancedAttendanceController::class, 'secureClockIn']);
    Route::put('/attendance/secure-clock-out/{id}', [\App\Http\Controllers\AdvancedAttendanceController::class, 'secureClockOut']);
    Route::get('/attendance/hours-summary', [\App\Http\Controllers\AdvancedAttendanceController::class, 'getWorkHourSummary']);

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

        Route::post('/attendance/generate-token', [\App\Http\Controllers\AdvancedAttendanceController::class, 'generateToken']);
        Route::get('/attendance/anomalies', [\App\Http\Controllers\AdvancedAttendanceController::class, 'getAnomalyLogs']);

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

        // =================================================
        // STAGE 1: Application Pipeline (Coordinator)
        // =================================================

        Route::get('/applications', [\App\Http\Controllers\ApplicationController::class, 'index']);
        Route::put('/applications/{id}/status', [\App\Http\Controllers\ApplicationController::class, 'updateStatus']);
        Route::put('/applications/{id}/schedule', [\App\Http\Controllers\ApplicationController::class, 'scheduleInterview']);
        Route::put('/applications/{id}/placement', [\App\Http\Controllers\ApplicationController::class, 'assignPlacement']);
        Route::get('/applications/{id}/match', [\App\Http\Controllers\ApplicationController::class, 'getMatchingSuggestions']);

        // =================================================
        // STAGE 2: Daily Operations (Supervisor)
        // =================================================

        Route::get('/tasks', [\App\Http\Controllers\TaskController::class, 'index']);
        Route::post('/tasks', [\App\Http\Controllers\TaskController::class, 'store']);
        Route::put('/tasks/{id}/notes', [\App\Http\Controllers\TaskController::class, 'addSupervisorNote']);

        // =================================================
        // STAGE 5: Discipline & Compliance (Supervisor)
        // =================================================

        Route::get('/disciplinary', [\App\Http\Controllers\DisciplinaryController::class, 'index']);
        Route::post('/disciplinary', [\App\Http\Controllers\DisciplinaryController::class, 'store']);
        Route::post('/disciplinary/{id}/resolve', [\App\Http\Controllers\DisciplinaryController::class, 'resolve']);

    });

    // =====================================================
    // WSPO STAFF + SUPER ADMIN
    // =====================================================
    Route::middleware(['role:WSPO Staff,Super Admin'])->group(function () {
        Route::post('/users', [UserController::class, 'store']);
        Route::put('/users/{id}', [UserController::class, 'update']);

        Route::delete('/users/{id}', [UserController::class, 'destroy']);

        // STAGE 6: Reports & Analytics
        Route::get('/analytics/dashboard', [\App\Http\Controllers\AnalyticsController::class, 'getDashboardStats']);
        Route::get('/analytics/export-attendance', [\App\Http\Controllers\AnalyticsController::class, 'exportAttendance']);
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
