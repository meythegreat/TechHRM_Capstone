<?php

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
use App\Http\Controllers\FinancialController;
use App\Http\Controllers\OfficeController;

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

    // Student work-hour assessment route
    Route::get('/financial/records', [FinancialController::class, 'index']);
    Route::post('/financial/compute-period', [FinancialController::class, 'computePeriod']);

    // --- STAGE 1: WSPO APPLICATION MODULE (Student) ---
    Route::post('/applications', [\App\Http\Controllers\ApplicationController::class, 'store']);
    Route::get('/applications/my-status', [\App\Http\Controllers\ApplicationController::class, 'myApplication']);

    // --- STAGE 2: Daily Operations (Student) ---
    Route::get('/tasks/my-tasks', [\App\Http\Controllers\TaskController::class, 'myTasks']);
    Route::put('/tasks/{id}/status', [\App\Http\Controllers\TaskController::class, 'updateStatus']);

    // --- STAGE 5: Discipline & Compliance (Student) ---
    Route::get('/disciplinary/my-records', [\App\Http\Controllers\DisciplinaryController::class, 'myRecords']);
    Route::get('/my-disciplinary-records', [\App\Http\Controllers\DisciplinaryController::class, 'myRecords']);
    Route::post('/disciplinary/{id}/appeal', [\App\Http\Controllers\DisciplinaryController::class, 'submitAppeal']);
    Route::put('/disciplinary/{id}/appeal', [\App\Http\Controllers\DisciplinaryController::class, 'submitAppeal']);

    // =====================================================
    // GENERAL ACCESS (ALL AUTHENTICATED USERS)
    // =====================================================

    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/user', [UserController::class, 'me']);

    Route::put('/user', [UserController::class, 'updateSelf']);
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

    Route::get('/student/dashboard', [DashboardController::class, 'studentOverview']);

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

        Route::get('/attendance/student/{id}', [AttendanceController::class, 'studentHistory']);

        Route::post('/attendance/manual', [AttendanceController::class, 'storeManual']);
        Route::patch('/attendance/{id}/times', [AttendanceController::class, 'updateTimes']);

        Route::post('/attendance/generate-token', [\App\Http\Controllers\AdvancedAttendanceController::class, 'generateToken']);
        Route::get('/attendance/qr-code', [\App\Http\Controllers\AdvancedAttendanceController::class, 'currentQr']);
        Route::get('/attendance/anomalies', [\App\Http\Controllers\AdvancedAttendanceController::class, 'getAnomalyLogs']);
        Route::patch('/attendance/{id}/approve', [AttendanceController::class, 'approve']);

        // =================================================
        // SCHEDULE MANAGEMENT
        // =================================================

        Route::get('/schedules', [ScheduleController::class, 'index']);

        Route::post('/schedules', [ScheduleController::class, 'store']);

        Route::delete('/schedules/{id}', [ScheduleController::class, 'destroy']);

        Route::patch('/schedules/{id}/resolve-request', [ScheduleController::class, 'resolveRequest']);
        Route::get('/staffing-requests', [\App\Http\Controllers\StaffingRequestController::class, 'index']);

        // =================================================
        // STUDENT VIEWING
        // =================================================

        Route::get('/users', [UserController::class, 'index']);

        // Department personnel is used by both the schedule and task screens.
        Route::get('/personnel', [UserController::class, 'personnel']);
        Route::get('/department-supervisors', [UserController::class, 'departmentSupervisors']);
        Route::get('/admin/stats', [DashboardController::class, 'getStats']);

        Route::get('/tasks', [\App\Http\Controllers\TaskController::class, 'index']);

        // =================================================
        // STAGE 5: Discipline & Compliance (Supervisor)
        // =================================================

        Route::get('/disciplinary/catalog', [\App\Http\Controllers\DisciplinaryController::class, 'catalog']);
        Route::get('/disciplinary/performance', [\App\Http\Controllers\DisciplinaryController::class, 'performanceIndex']);
        Route::post('/disciplinary/performance', [\App\Http\Controllers\DisciplinaryController::class, 'storePerformance']);
        Route::get('/disciplinary/awards', [\App\Http\Controllers\DisciplinaryController::class, 'awardsIndex']);
        Route::post('/disciplinary/awards', [\App\Http\Controllers\DisciplinaryController::class, 'storeAward']);
        Route::get('/disciplinary', [\App\Http\Controllers\DisciplinaryController::class, 'index']);
        Route::post('/disciplinary', [\App\Http\Controllers\DisciplinaryController::class, 'store']);
        Route::post('/disciplinary/{id}/decide', [\App\Http\Controllers\DisciplinaryController::class, 'decide']);
        Route::post('/disciplinary/{id}/resolve', [\App\Http\Controllers\DisciplinaryController::class, 'resolve']);
        Route::put('/disciplinary/{id}/resolve', [\App\Http\Controllers\DisciplinaryController::class, 'resolve']);

    });

    // =====================================================
    // WSPO STAFF + SUPER ADMIN
    // =====================================================
    Route::middleware(['role:WSPO Staff,Super Admin'])->group(function () {
        Route::post('/users', [UserController::class, 'store']);
        Route::put('/users/{id}', [UserController::class, 'update']);
        Route::delete('/users/{id}', [UserController::class, 'destroy']);
        Route::get('/logs', [ActivityLogController::class, 'index']);
        Route::get('/departments', fn () => \App\Models\Department::orderBy('name')->get(['id', 'name']));
        Route::get('/offices', [OfficeController::class, 'index']);

        // Only WSPO coordinates student-to-department placement and final task verification.
        Route::get('/applications', [\App\Http\Controllers\ApplicationController::class, 'index']);
        Route::delete('/applications/{id}', [\App\Http\Controllers\ApplicationController::class, 'destroy']);
        Route::put('/applications/{id}/status', [\App\Http\Controllers\ApplicationController::class, 'updateStatus']);
        Route::put('/applications/{id}/schedule', [\App\Http\Controllers\ApplicationController::class, 'scheduleInterview']);
        Route::put('/applications/{id}/placement', [\App\Http\Controllers\ApplicationController::class, 'assignPlacement']);
        Route::get('/applications/{id}/match', [\App\Http\Controllers\ApplicationController::class, 'getMatchingSuggestions']);
        Route::put('/students/{id}/department', [UserController::class, 'assignDepartment']);
        Route::get('/staffing-candidates', [\App\Http\Controllers\StaffingRequestController::class, 'candidates']);
        Route::patch('/staffing-requests/{staffingRequest}', [\App\Http\Controllers\StaffingRequestController::class, 'updateStatus']);
        Route::put('/tasks/{id}/verify', [\App\Http\Controllers\TaskController::class, 'verifyTask']);

        // Stage 1: work-hour assessment records with disciplinary penalty deductions
        Route::get('/financial/records', [FinancialController::class, 'index']);
        Route::post('/financial/compute-period', [FinancialController::class, 'computePeriod']);
        Route::put('/financial/records/{id}/adjustments', [FinancialController::class, 'updateAdjustments']);
        Route::get('/financial/export-csv', [FinancialController::class, 'exportCsv']);

        // STAGE 6: Reports & Analytics
        Route::get('/analytics/dashboard', [\App\Http\Controllers\AnalyticsController::class, 'getDashboardStats']);
        Route::get('/analytics/export-attendance', [\App\Http\Controllers\AnalyticsController::class, 'exportAttendance']);
    });

    Route::middleware(['role:Supervisor'])->group(function () {
        Route::post('/staffing-requests', [\App\Http\Controllers\StaffingRequestController::class, 'store']);
        Route::post('/tasks', [\App\Http\Controllers\TaskController::class, 'store']);
        Route::put('/tasks/{id}/notes', [\App\Http\Controllers\TaskController::class, 'addSupervisorNote']);
    });

    // =====================================================
    // SUPER ADMIN ONLY
    // =====================================================

    Route::middleware(['role:Super Admin'])->group(function () {

        // =================================================
        // ADMIN DASHBOARD
        // =================================================

        Route::get('/admin/dashboard-stats', [AdminController::class, 'getStats']);
        Route::post('/offices', [OfficeController::class, 'store']);
        Route::put('/offices/{office}', [OfficeController::class, 'update']);
        Route::delete('/offices/{office}', [OfficeController::class, 'destroy']);

        // =================================================
        // REQUIREMENTS MANAGEMENT
        // =================================================

        Route::get('/requirements', [RequirementController::class, 'index']);

        Route::patch('/requirements/{id}/status', [RequirementController::class, 'updateStatus']);

    });

});
