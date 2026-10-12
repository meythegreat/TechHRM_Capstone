import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import 'api/api_client.dart';

/// Filamer Christian University, Roxas City.
const double campusLatitude = 11.5854;
const double campusLongitude = 122.7511;
const String _overrideKey = 'techhrm-theme-override';

class ThemeController extends ChangeNotifier {
  ThemeController() {
    _load();
  }

  bool _dark = false;
  Timer? _timer;

  bool get isDark => _dark;

  Future<void> _load() async {
    _dark = await _resolve();
    _schedule();
    notifyListeners();
  }

  Future<void> toggle() async {
    final next = !_dark;
    final until = nextSunChange().millisecondsSinceEpoch;
    await kSecureStorage.write(key: _overrideKey, value: jsonEncode({'theme': next ? 'dark' : 'light', 'until': until}));
    _dark = next;
    _schedule();
    notifyListeners();
  }

  Future<bool> _resolve([DateTime? now]) async {
    final moment = now ?? DateTime.now();
    final override = await _readOverride(moment);
    return override ?? !isDaylight(moment);
  }

  Future<bool?> _readOverride(DateTime now) async {
    try {
      final raw = await kSecureStorage.read(key: _overrideKey);
      if (raw == null || raw.isEmpty) return null;
      final parsed = jsonDecode(raw);
      if (parsed is! Map) return null;
      final theme = parsed['theme'];
      final until = parsed['until'];
      final expiry = until is num ? until.toInt() : int.tryParse('$until') ?? 0;
      if ((theme != 'light' && theme != 'dark') || expiry <= now.millisecondsSinceEpoch) {
        await kSecureStorage.delete(key: _overrideKey);
        return null;
      }
      return theme == 'dark';
    } catch (_) {
      return null;
    }
  }

  void _schedule() {
    _timer?.cancel();
    final wait = nextSunChange().difference(DateTime.now()) + const Duration(seconds: 1);
    _timer = Timer(wait.isNegative ? const Duration(seconds: 1) : wait, () async {
      _dark = await _resolve();
      notifyListeners();
      _schedule();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

bool isDaylight(DateTime date) {
  final times = campusSunTimes(date);
  return !date.isBefore(times.$1) && date.isBefore(times.$2);
}

DateTime nextSunChange([DateTime? from]) {
  final date = from ?? DateTime.now();
  final times = campusSunTimes(date);
  if (date.isBefore(times.$1)) return times.$1;
  if (date.isBefore(times.$2)) return times.$2;
  final tomorrow = DateTime(date.year, date.month, date.day + 1);
  return campusSunTimes(tomorrow).$1;
}

(DateTime, DateTime) campusSunTimes(DateTime date) {
  return (_solar(date, true), _solar(date, false));
}

DateTime _solar(DateTime date, bool rising) {
  const zenith = 90.833;
  const toRad = math.pi / 180;
  const toDeg = 180 / math.pi;
  final n = _dayOfYear(date);
  final lngHour = campusLongitude / 15;
  final t = n + ((rising ? 6 : 18) - lngHour) / 24;
  final meanAnomaly = 0.9856 * t - 3.289;
  var sunLongitude = meanAnomaly + 1.916 * math.sin(meanAnomaly * toRad) + 0.02 * math.sin(2 * meanAnomaly * toRad) + 282.634;
  sunLongitude = (sunLongitude + 360) % 360;
  var rightAscension = toDeg * math.atan(0.91764 * math.tan(sunLongitude * toRad));
  rightAscension = (rightAscension + 360) % 360;
  final longitudeQuadrant = (sunLongitude / 90).floor() * 90;
  final ascensionQuadrant = (rightAscension / 90).floor() * 90;
  rightAscension = (rightAscension + (longitudeQuadrant - ascensionQuadrant)) / 15;
  final sinDeclination = 0.39782 * math.sin(sunLongitude * toRad);
  final cosDeclination = math.cos(math.asin(sinDeclination));
  final cosHour = (math.cos(zenith * toRad) - sinDeclination * math.sin(campusLatitude * toRad)) / (cosDeclination * math.cos(campusLatitude * toRad));
  final clamped = cosHour.clamp(-1.0, 1.0);
  final hourAngle = (rising ? 360 - toDeg * math.acos(clamped) : toDeg * math.acos(clamped)) / 15;
  var localMean = hourAngle + rightAscension - 0.06571 * t - 6.622;
  localMean = ((localMean % 24) + 24) % 24;
  final universalTime = localMean - lngHour;
  final utcMidnight = DateTime.utc(date.year, date.month, date.day);
  return utcMidnight.add(Duration(milliseconds: (universalTime * 3600000).round())).toLocal();
}

int _dayOfYear(DateTime date) {
  final start = DateTime.utc(date.year, 1, 0);
  final today = DateTime.utc(date.year, date.month, date.day);
  return today.difference(start).inDays;
}
