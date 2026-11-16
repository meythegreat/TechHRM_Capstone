import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../api/api_client.dart';

const _prefsKey = 'wospis_offline_attendance_outbox';

bool shouldQueueOfflineAttendance(Object error) {
  if (error is ApiException) {
    final code = error.statusCode;
    if (code == null) return true;
    // Retry transport / server failures; keep validation errors for the user.
    return code >= 500 || code == 0;
  }
  return true;
}

class OfflineAttendanceOutbox {
  OfflineAttendanceOutbox({SharedPreferences? prefs}) : _prefsOverride = prefs;

  final SharedPreferences? _prefsOverride;
  static const _uuid = Uuid();

  Future<SharedPreferences> _prefs() async =>
      _prefsOverride ?? await SharedPreferences.getInstance();

  String newClientRequestId() => _uuid.v4();

  Future<List<Map<String, dynamic>>> list() async {
    final raw = (await _prefs()).getString(_prefsKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return [];
      return [
        for (final row in decoded)
          if (row is Map) Map<String, dynamic>.from(row),
      ];
    } catch (_) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> enqueue(Map<String, dynamic> item) async {
    final rows = await list();
    final id = textOf(item['client_request_id']);
    final next = [
      ...rows.where((row) => textOf(row['client_request_id']) != id),
      {
        ...item,
        'queued_at': item['queued_at'] ?? DateTime.now().toIso8601String(),
        'last_error': item['last_error'],
      },
    ];
    await _save(next);
    return next;
  }

  Future<List<Map<String, dynamic>>> remove(String clientRequestId) async {
    final next = [
      for (final row in await list())
        if (textOf(row['client_request_id']) != clientRequestId) row,
    ];
    await _save(next);
    return next;
  }

  Future<List<Map<String, dynamic>>> updateError(
    String clientRequestId,
    String? lastError,
  ) async {
    final next = [
      for (final row in await list())
        if (textOf(row['client_request_id']) == clientRequestId)
          {...row, 'last_error': lastError}
        else
          row,
    ];
    await _save(next);
    return next;
  }

  /// Upload queued requests. Returns uploaded count and remaining rows.
  Future<({int uploaded, List<Map<String, dynamic>> remaining, List<String> errors})>
      flush(ApiClient api) async {
    final rows = await list();
    if (rows.isEmpty) {
      return (uploaded: 0, remaining: const <Map<String, dynamic>>[], errors: const <String>[]);
    }

    var uploaded = 0;
    final errors = <String>[];
    var remaining = List<Map<String, dynamic>>.from(rows);

    for (final item in rows) {
      final id = textOf(item['client_request_id']);
      try {
        await api.post('/attendance/manual-requests', {
          'client_request_id': id,
          if (item['request_type'] != null) 'request_type': item['request_type'],
          if (item['reason'] != null) 'reason': item['reason'],
          'shifts': item['shifts'] ?? const [],
        });
        remaining = await remove(id);
        uploaded += 1;
      } catch (error) {
        if (shouldQueueOfflineAttendance(error)) {
          errors.add('Still offline — will retry when connected.');
          break;
        }
        final message = error is ApiException ? error.message : error.toString();
        remaining = await updateError(id, message);
        errors.add(message);
      }
    }

    return (uploaded: uploaded, remaining: remaining, errors: errors);
  }

  Future<void> _save(List<Map<String, dynamic>> rows) async {
    await (await _prefs()).setString(_prefsKey, jsonEncode(rows));
  }

  String textOf(dynamic value) => value == null ? '' : value.toString();
}
