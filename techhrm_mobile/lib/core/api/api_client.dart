import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  static const int apiPort = 8000;
  final _storage = const FlutterSecureStorage();

  /// API host follows the address used to open the app.
  /// On this computer that is 127.0.0.1. On a phone it is the Mac's current
  /// LAN address, so a new Wi-Fi or Ethernet IP does not need a code change.
  static String get baseUrl {
    if (kIsWeb) {
      final host = Uri.base.host;
      final apiHost = (host.isEmpty || host == 'localhost') ? '127.0.0.1' : host;
      final formatted = apiHost.contains(':') ? '[$apiHost]' : apiHost;
      return 'http://$formatted:$apiPort/api';
    }
    return 'http://127.0.0.1:$apiPort/api';
  }

  // Helper to get headers with the Sanctum token
  Future<Map<String, String>> _getHeaders() async {
    String? token = await _storage.read(key: 'auth_token');
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  // Generic POST Request
  Future<http.Response> post(String endpoint, Map<String, dynamic> data) async {
    final headers = await _getHeaders();
    final url = Uri.parse('$baseUrl$endpoint');
    
    return await http.post(
      url,
      headers: headers,
      body: jsonEncode(data),
    );
  }

  // Generic GET Request
  Future<http.Response> get(String endpoint) async {
    final headers = await _getHeaders();
    final url = Uri.parse('$baseUrl$endpoint');
    
    return await http.get(url, headers: headers);
  }
}