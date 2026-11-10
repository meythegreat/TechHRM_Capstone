import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// macOS data-protection keychain needs a signed keychain entitlement.
/// The legacy keychain works inside the app sandbox without that.
const FlutterSecureStorage kSecureStorage = FlutterSecureStorage(
  mOptions: MacOsOptions(usesDataProtectionKeychain: false),
);

class ApiException implements Exception {
  ApiException(this.message, [this.statusCode]);
  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  static const int apiPort = 8000;
  final _storage = kSecureStorage;

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

  Future<Map<String, String>> _headers({bool json = true}) async {
    final token = await _storage.read(key: 'auth_token');
    return {
      'Accept': 'application/json',
      if (json) 'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<dynamic> get(String endpoint, [Map<String, String>? query]) {
    return _send('GET', endpoint, query: query);
  }

  Future<dynamic> post(String endpoint, [Map<String, dynamic>? data]) {
    return _send('POST', endpoint, body: data);
  }

  Future<dynamic> put(String endpoint, [Map<String, dynamic>? data]) {
    return _send('PUT', endpoint, body: data);
  }

  Future<dynamic> patch(String endpoint, [Map<String, dynamic>? data]) {
    return _send('PATCH', endpoint, body: data);
  }

  Future<dynamic> delete(String endpoint) {
    return _send('DELETE', endpoint);
  }

  Future<dynamic> upload(
    String endpoint, {
    String method = 'POST',
    Map<String, String> fields = const {},
    List<http.MultipartFile> files = const [],
  }) async {
    final request = http.MultipartRequest(method, Uri.parse('$baseUrl$endpoint'));
    request.headers.addAll(await _headers(json: false));
    request.fields.addAll(fields);
    request.files.addAll(files);
    final streamed = await request.send();
    final response = await http.Response.fromStream(streamed);
    return _decode(response);
  }

  Future<dynamic> _send(
    String method,
    String endpoint, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
  }) async {
    final uri = Uri.parse('$baseUrl$endpoint').replace(
      queryParameters: query == null || query.isEmpty ? null : query,
    );
    final headers = await _headers();
    final encoded = body == null ? null : jsonEncode(body);
    late http.Response response;
    switch (method) {
      case 'POST':
        response = await http.post(uri, headers: headers, body: encoded ?? '{}');
      case 'PUT':
        response = await http.put(uri, headers: headers, body: encoded ?? '{}');
      case 'PATCH':
        response = await http.patch(uri, headers: headers, body: encoded ?? '{}');
      case 'DELETE':
        response = await http.delete(uri, headers: headers);
      default:
        response = await http.get(uri, headers: headers);
    }
    return _decode(response);
  }

  dynamic _decode(http.Response response) {
    dynamic body;
    try {
      body = response.body.isEmpty ? null : jsonDecode(response.body);
    } catch (_) {
      body = response.body;
    }
    if (response.statusCode >= 200 && response.statusCode < 300) return body;
    throw ApiException(_message(body, response.statusCode), response.statusCode);
  }

  String _message(dynamic body, int code) {
    if (body is Map) {
      final errors = body['errors'];
      if (errors is Map && errors.isNotEmpty) {
        final first = errors.values.first;
        if (first is List && first.isNotEmpty) return first.first.toString();
        return first.toString();
      }
      if (body['message'] != null) return body['message'].toString();
    }
    if (body is String && body.trim().isNotEmpty && !body.trim().startsWith('<')) {
      return body;
    }
    return 'Request failed ($code).';
  }
}
