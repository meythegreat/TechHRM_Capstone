import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  // Use 10.0.2.2 for Android Emulator, or your computer's IP address for physical phones
  static const String baseUrl = 'http://127.0.0.1:8000/api';
  final _storage = const FlutterSecureStorage();

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