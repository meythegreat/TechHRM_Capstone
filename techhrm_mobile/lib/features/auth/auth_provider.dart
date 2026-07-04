import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/api/api_client.dart';

class AuthProvider with ChangeNotifier {
  final ApiClient _api = ApiClient();
  final _storage = const FlutterSecureStorage();
  
  bool _isLoading = false;
  String? _userRole;
  
  // NEW: Add these to hold real user data
  String? _userName;
  String? _userDepartment;

  bool get isLoading => _isLoading;
  String? get userRole => _userRole;
  String? get userName => _userName;
  String? get userDepartment => _userDepartment;
  bool get isAuthenticated => _userRole != null;

  // Login Function
  Future<String?> login(String username, String password) async {
    _isLoading = true;
    notifyListeners();

    try {
      final response = await _api.post('/mobile/login', {
        'username': username,
        'password': password,
      });

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        
        // Save Token securely
        await _storage.write(key: 'auth_token', value: data['token']);
        
        // --- NEW: EXTRACT REAL DATA FROM LARAVEL ---
        _userRole = data['user']['role'];
        _userName = data['user']['name'];
        
        // Safely extract the department from the nested profile object
        if (data['user']['profile'] != null) {
          _userDepartment = data['user']['profile']['assigned_office'] ?? 'No Department Assigned';
        } else {
          _userDepartment = 'No Department Assigned';
        }

        notifyListeners();
        return null; // Null means success
        
      } else if (response.statusCode == 403) {
        return jsonDecode(response.body)['message']; 
      } else {
        return 'Invalid username or password.';
      }
    } catch (e) {
      return 'Cannot connect to server. Check your connection.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Logout Function
  Future<void> logout() async {
    try {
      await _api.post('/logout', {}); 
    } catch (e) {
      // Ignore network errors on logout, just clear local data
    }
    
    await _storage.delete(key: 'auth_token'); 
    _userRole = null;
    _userName = null;
    _userDepartment = null;
    notifyListeners();
  }
}