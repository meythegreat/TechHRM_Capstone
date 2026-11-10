import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';

class AuthProvider with ChangeNotifier {
  final ApiClient _api = ApiClient();
  final _storage = kSecureStorage;

  bool _ready = false;
  bool _isLoading = false;
  String? _userRole;
  String? _userName;
  String? _userDepartment;
  String? _phone;
  int? _userId;
  bool _mustChangePassword = false;

  bool get ready => _ready;
  bool get isLoading => _isLoading;
  String? get userRole => _userRole;
  String? get userName => _userName;
  String? get userDepartment => _userDepartment;
  String? get phone => _phone;
  int? get userId => _userId;
  bool get mustChangePassword => _mustChangePassword;
  bool get isAuthenticated => _userRole != null;
  ApiClient get api => _api;

  AuthProvider() {
    restore();
  }

  Future<void> restore() async {
    try {
      final token = await _storage.read(key: 'auth_token').timeout(const Duration(seconds: 2));
      if (token == null || token.isEmpty) return;
      final data = await _api.get('/user');
      if (data is Map) _applyUser(Map<String, dynamic>.from(data));
    } catch (_) {
      await _storage.delete(key: 'auth_token');
      _clear();
    } finally {
      _ready = true;
      notifyListeners();
    }
  }

  Future<String?> login(String username, String password) async {
    _isLoading = true;
    notifyListeners();
    try {
      final data = await _api.post('/mobile/login', {
        'username': username,
        'password': password,
      });
      if (data is! Map || data['token'] == null || data['user'] is! Map) {
        return 'Unexpected login response.';
      }
      await _storage.write(key: 'auth_token', value: data['token'].toString());
      _applyUser(Map<String, dynamic>.from(data['user'] as Map));
      return null;
    } on ApiException catch (error) {
      return error.message;
    } catch (error) {
      debugPrint('Login failed: $error');
      final detail = error.toString();
      if (detail.contains('SocketException') || detail.contains('Connection refused') || detail.contains('Failed host lookup')) {
        return 'Cannot connect to server. Start the API with php artisan serve, then try again.';
      }
      return 'Sign-in could not be saved on this Mac. Quit the app completely and open it again.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<String?> forgotPassword(String username) async {
    try {
      final data = await _api.post('/forgot-password', {'username': username});
      if (data is Map && data['message'] != null) return data['message'].toString();
      return 'If that account exists, a temporary password was sent.';
    } on ApiException catch (error) {
      return error.message;
    } catch (_) {
      return 'Cannot connect to server. Check your connection.';
    }
  }

  Future<void> refreshProfile() async {
    final data = await _api.get('/user');
    if (data is Map) {
      _applyUser(Map<String, dynamic>.from(data));
      notifyListeners();
    }
  }

  void markPasswordChanged() {
    _mustChangePassword = false;
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await _api.post('/logout', {});
    } catch (_) {}
    await _storage.delete(key: 'auth_token');
    _clear();
    notifyListeners();
  }

  void _applyUser(Map<String, dynamic> user) {
    _userRole = user['role']?.toString();
    _userName = user['name']?.toString();
    _phone = user['phone_number']?.toString();
    _userId = user['id'] is int ? user['id'] as int : int.tryParse('${user['id']}');
    _mustChangePassword = user['must_change_password'] == true;
    final profile = user['profile'];
    if (profile is Map) {
      _userDepartment = profile['assigned_office']?.toString() ?? 'No Department Assigned';
    } else if (_userRole == 'Super Admin') {
      _userDepartment = 'Management';
    } else {
      _userDepartment = 'No Department Assigned';
    }
  }

  void _clear() {
    _userRole = null;
    _userName = null;
    _userDepartment = null;
    _phone = null;
    _userId = null;
    _mustChangePassword = false;
  }
}
