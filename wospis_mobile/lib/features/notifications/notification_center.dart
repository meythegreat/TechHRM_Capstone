import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/json_util.dart';
import '../../core/widgets/common.dart';

class AppNotification {
  AppNotification(this.id, this.title, this.message, this.read, this.createdAt);
  final int id;
  final String title;
  final String message;
  final bool read;
  final String createdAt;

  AppNotification copy({bool? read}) => AppNotification(id, title, message, read ?? this.read, createdAt);
}

class NotificationCenter extends ChangeNotifier {
  NotificationCenter(this.api);
  final ApiClient api;
  final List<AppNotification> items = [];
  AppNotification? live;
  bool open = false;
  Timer? _timer;
  Set<int>? _seen;

  int get unread => items.where((item) => !item.read).length;

  void start() {
    refresh();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => refresh());
  }

  Future<void> refresh() async {
    try {
      final data = await api.get('/notifications');
      final next = asMaps(data).map((row) {
        final flag = row['is_read'];
        final read = flag == true || flag == 1 || flag == '1';
        return AppNotification(
          int.tryParse('${row['id']}') ?? 0,
          textOf(row['title']),
          textOf(row['message'], ''),
          read,
          textOf(row['created_at'], ''),
        );
      }).toList();
      final fresh = _seen == null ? <AppNotification>[] : next.where((item) => !_seen!.contains(item.id) && !item.read);
      if (fresh.isNotEmpty) live = fresh.first;
      _seen = next.map((item) => item.id).toSet();
      items
        ..clear()
        ..addAll(next);
      notifyListeners();
    } catch (_) {}
  }

  void toggle() {
    open = !open;
    notifyListeners();
  }

  void close() {
    open = false;
    notifyListeners();
  }

  Future<void> markRead(AppNotification item) async {
    final index = items.indexWhere((row) => row.id == item.id);
    if (index >= 0) items[index] = item.copy(read: true);
    if (live?.id == item.id) live = null;
    notifyListeners();
    try {
      await api.patch('/notifications/${item.id}/read');
    } catch (_) {
      refresh();
    }
  }

  Future<void> markAllRead() async {
    for (var i = 0; i < items.length; i++) {
      items[i] = items[i].copy(read: true);
    }
    live = null;
    notifyListeners();
    try {
      await api.patch('/notifications/read-all');
    } catch (_) {
      refresh();
    }
  }

  Future<void> dismiss(int id) async {
    items.removeWhere((item) => item.id == id);
    if (live?.id == id) live = null;
    notifyListeners();
    try {
      await api.delete('/notifications/$id');
    } catch (_) {
      refresh();
    }
  }

  Future<void> clearAll() async {
    items.clear();
    live = null;
    open = false;
    notifyListeners();
    try {
      await api.delete('/notifications');
    } catch (_) {
      refresh();
    }
  }

  void hideLive() {
    live = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

class NotificationPanel extends StatelessWidget {
  const NotificationPanel({super.key, required this.center, required this.onOpen});
  final NotificationCenter center;
  final void Function(AppNotification item) onOpen;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      elevation: 12,
      borderRadius: BorderRadius.circular(20),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 380, maxHeight: 460),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
              child: Row(
                children: [
                  Text('Notifications', style: TextStyle(fontWeight: FontWeight.w800, color: scheme.onSurface)),
                  const Spacer(),
                  if (center.unread > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(color: const Color(0xFFDBEAFE), borderRadius: BorderRadius.circular(999)),
                      child: Text('${center.unread} NEW', style: const TextStyle(color: kBlue, fontSize: 10, fontWeight: FontWeight.w800)),
                    ),
                  IconButton(onPressed: center.close, icon: const Icon(Icons.close, size: 18)),
                ],
              ),
            ),
            const Divider(height: 1),
            if (center.items.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  children: [
                    TextButton(onPressed: center.unread == 0 ? null : center.markAllRead, child: const Text('MARK ALL READ')),
                    TextButton(onPressed: center.clearAll, style: TextButton.styleFrom(foregroundColor: const Color(0xFFE11D48)), child: const Text('CLEAR ALL')),
                  ],
                ),
              ),
            Flexible(
              child: center.items.isEmpty
                  ? const Padding(padding: EdgeInsets.all(28), child: Text("You're all caught up!", style: TextStyle(fontWeight: FontWeight.w600)))
                  : ListView.separated(
                      shrinkWrap: true,
                      itemCount: center.items.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final item = center.items[index];
                        return ListTile(
                          onTap: () => onOpen(item),
                          tileColor: item.read ? null : const Color(0x144F46E5),
                          title: Text(item.title, style: TextStyle(fontWeight: item.read ? FontWeight.w600 : FontWeight.w800, color: scheme.onSurface)),
                          subtitle: Text(item.message, maxLines: 3, overflow: TextOverflow.ellipsis),
                          trailing: IconButton(onPressed: () => center.dismiss(item.id), icon: const Icon(Icons.close, size: 16)),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class LiveNotice extends StatelessWidget {
  const LiveNotice({super.key, required this.item, required this.onRead, required this.onDelete, required this.onDismiss});
  final AppNotification item;
  final VoidCallback onRead;
  final VoidCallback onDelete;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      elevation: 10,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        width: 320,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: const Color(0xFFBFDBFE))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('NEW NOTIFICATION', style: TextStyle(color: kBlue, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1)),
                const Spacer(),
                IconButton(onPressed: onDismiss, icon: const Icon(Icons.close, size: 16)),
              ],
            ),
            Text(item.title, style: TextStyle(fontWeight: FontWeight.w800, color: scheme.onSurface)),
            const SizedBox(height: 4),
            Text(item.message, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
            Row(
              children: [
                TextButton(onPressed: onRead, child: const Text('MARK READ')),
                TextButton(onPressed: onDelete, style: TextButton.styleFrom(foregroundColor: const Color(0xFFE11D48)), child: const Text('DELETE')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
