<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ProfileController;

Route::get('/', function () {
    return view('welcome');
});

// --- 1. WORKING STUDENT ROUTES (Lowest Access) ---
// Middleware: auth (Anyone logged in can access this)
Route::middleware(['auth'])->group(function () {

    Route::get('/dashboard', function () {
        return 'Welcome! This is the general dashboard. Working Students see this.';
    })->name('dashboard');

    // Future routes: Time-in/Time-out, View Personal Profile
});

// --- 2. ADMIN ROUTES (Employee Access) ---
// Middleware: auth + role:admin,super_admin
// (Only Admins and Super Admins can access this)
Route::middleware(['auth', 'role:admin,super_admin'])->group(function () {

    Route::get('/admin/users', function () {
        return 'Admin Area: You can view and edit student profiles here.';
    });

    // Future routes: index, create, store, edit, update for Users
});

// --- 3. SUPER ADMIN ROUTES (Developer Access) ---
// Middleware: auth + role:super_admin
// (STRICTLY Super Admins only)
Route::middleware(['auth', 'role:super_admin'])->group(function () {

    Route::get('/developer/settings', function () {
        return 'Super Admin Area: You have full destructive access.';
    });

    // Future routes: destroy user, system configurations
});

// Include default auth routes (breeze, jetstream, or custom)
// require __DIR__ . '/auth.php';
