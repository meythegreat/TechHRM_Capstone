List<Map<String, dynamic>> asMaps(dynamic data, [String? key]) {
  dynamic source = data;
  if (key != null && data is Map) source = data[key];
  if (source is Map && source['data'] is List) source = source['data'];
  if (source is! List) return [];
  return source.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList();
}

Map<String, dynamic> asMap(dynamic data) {
  if (data is Map) return Map<String, dynamic>.from(data);
  return {};
}

String textOf(dynamic value, [String fallback = '—']) {
  if (value == null) return fallback;
  final text = value.toString().trim();
  return text.isEmpty ? fallback : text;
}

String whenOf(dynamic value) {
  final raw = textOf(value, '');
  if (raw.isEmpty) return '—';
  return raw.replaceFirst('T', ' ').split('.').first;
}

String personName(Map<String, dynamic> row, [String nested = 'user']) {
  final direct = row['name'] ?? row['student_name'] ?? row['applicant_name'];
  if (direct != null && direct.toString().trim().isNotEmpty) return direct.toString();
  final child = row[nested] ?? row['student'] ?? row['admin'];
  if (child is Map && child['name'] != null) return child['name'].toString();
  return 'Unknown';
}

num numOf(dynamic value) {
  if (value is num) return value;
  return num.tryParse(value?.toString() ?? '') ?? 0;
}
