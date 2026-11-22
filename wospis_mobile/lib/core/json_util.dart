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
  final clock = RegExp(r'^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp][Mm]))?$').firstMatch(raw);
  if (clock != null) {
    return twelveHourLabel(int.parse(clock.group(1)!), clock.group(2)!, clock.group(3));
  }
  final parsed = DateTime.tryParse(raw);
  if (parsed == null || !raw.contains(':')) {
    return raw.replaceFirst('T', ' ').split('.').first;
  }
  final local = parsed.toLocal();
  final date = '${local.year.toString().padLeft(4, '0')}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  return '$date ${twelveHourLabel(local.hour, local.minute.toString().padLeft(2, '0'), null)}';
}

String twelveHourLabel(int hour, String minute, String? meridiem) {
  var hour24 = hour;
  if (meridiem != null) {
    final marker = meridiem.toLowerCase();
    if (marker == 'pm' && hour24 < 12) hour24 += 12;
    if (marker == 'am' && hour24 == 12) hour24 = 0;
  }
  final suffix = hour24 >= 12 ? 'PM' : 'AM';
  final hour12 = hour24 % 12 == 0 ? 12 : hour24 % 12;
  return '$hour12:$minute $suffix';
}

String clockStorage(int hour, int minute) {
  return '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';
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
