import 'dart:convert';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Burn a date and time into a live camera photo, matching the web attendance stamp.
Uint8List stampPhoto(Uint8List bytes, DateTime when) {
  final decoded = img.decodeImage(bytes);
  if (decoded == null) return bytes;
  final oriented = img.bakeOrientation(decoded);
  final label = _stampLabel(when.toLocal());
  final font = oriented.width < 900 ? img.arial24 : img.arial48;
  final pad = 16;
  final textHeight = font.lineHeight + 8;
  img.fillRect(
    oriented,
    x1: 8,
    y1: oriented.height - textHeight - pad,
    x2: oriented.width - 8,
    y2: oriented.height - 8,
    color: img.ColorRgba8(15, 23, 42, 180),
  );
  img.drawString(
    oriented,
    label,
    font: font,
    x: 16,
    y: oriented.height - textHeight - 8,
    color: img.ColorRgb8(255, 255, 255),
  );
  return Uint8List.fromList(img.encodeJpg(oriented, quality: 82));
}

/// Small JPEG data URL for the official 2 x 2 application photo.
String jpegDataUrl(Uint8List bytes, {int maxEdge = 480}) {
  final decoded = img.decodeImage(bytes);
  if (decoded == null) {
    return 'data:image/jpeg;base64,${base64Encode(bytes)}';
  }
  final oriented = img.bakeOrientation(decoded);
  final longest = oriented.width > oriented.height ? oriented.width : oriented.height;
  final scale = longest > maxEdge ? maxEdge / longest : 1.0;
  final resized = scale < 1
      ? img.copyResize(
          oriented,
          width: (oriented.width * scale).round().clamp(1, maxEdge),
          height: (oriented.height * scale).round().clamp(1, maxEdge),
        )
      : oriented;
  final jpg = img.encodeJpg(resized, quality: 72);
  return 'data:image/jpeg;base64,${base64Encode(jpg)}';
}

String _stampLabel(DateTime when) {
  String two(int value) => value.toString().padLeft(2, '0');
  return '${when.year}-${two(when.month)}-${two(when.day)} ${two(when.hour)}:${two(when.minute)}:${two(when.second)}';
}
