import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/photo_stamp.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';

class QrPayloadCard extends StatelessWidget {
  const QrPayloadCard({super.key, required this.title, required this.payload, this.seconds});

  final String title;
  final String payload;
  final String? seconds;

  @override
  Widget build(BuildContext context) {
    final ready = payload.isNotEmpty && payload != '—';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w800))),
                if (seconds != null && seconds!.isNotEmpty)
                  Text('${seconds}s', style: const TextStyle(color: kBlue, fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: 12),
            if (ready)
              Center(
                child: QrImageView(
                  data: payload,
                  size: 220,
                  backgroundColor: Colors.white,
                ),
              )
            else
              const EmptyNote('Code is not available yet.'),
            if (ready) ...[
              const SizedBox(height: 8),
              SelectableText(payload, style: const TextStyle(color: kMuted, fontSize: 12)),
            ],
          ],
        ),
      ),
    );
  }
}

class StampedShot {
  const StampedShot(this.bytes, this.capturedAt);
  final Uint8List bytes;
  final DateTime capturedAt;

  http.MultipartFile file(String field, String filename) {
    return http.MultipartFile.fromBytes(
      field,
      bytes,
      filename: filename,
      contentType: MediaType('image', 'jpeg'),
    );
  }
}

Future<StampedShot?> captureStampedPhoto() async {
  final shot = await ImagePicker().pickImage(
    source: ImageSource.camera,
    preferredCameraDevice: CameraDevice.rear,
    imageQuality: 85,
  );
  if (shot == null) return null;
  final when = DateTime.now();
  return StampedShot(stampPhoto(await shot.readAsBytes(), when), when);
}

Future<void> openSecureFile(BuildContext context, String? path, {String title = 'Document'}) async {
  final stored = (path ?? '').trim();
  if (stored.isEmpty) {
    toast(context, 'No file is attached.', error: true);
    return;
  }
  try {
    final bytes = await context.read<AuthProvider>().api.getBytes('/secure-file', {'path': stored});
    if (!context.mounted) return;
    final lower = stored.toLowerCase();
    final isImage = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SizedBox(
          width: 420,
          child: isImage
              ? InteractiveViewer(child: Image.memory(bytes))
              : Text('File ready (${bytes.length} bytes). Open the web app if you need a full PDF preview.'),
        ),
        actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
      ),
    );
  } catch (error) {
    if (context.mounted) toast(context, errorText(error), error: true);
  }
}
