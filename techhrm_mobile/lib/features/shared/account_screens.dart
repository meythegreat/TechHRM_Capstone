import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import '../../core/json_util.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications'), backgroundColor: Colors.white, foregroundColor: kInk, surfaceTintColor: Colors.white),
      body: FetchView(
        loader: () => api.get('/notifications'),
        builder: (context, data, reload) {
          final items = asMaps(data);
          return PageBody(
            onRefresh: reload,
            children: [
              Row(children: [
                TextButton(onPressed: () => runAction(context, () => api.patch('/notifications/read-all'), success: 'Marked as read.', reload: reload), child: const Text('Mark all read')),
                TextButton(
                  onPressed: () async {
                    if (!await confirm(context, 'Clear every notification?')) return;
                    if (!context.mounted) return;
                    await runAction(context, () => api.delete('/notifications'), success: 'Notifications cleared.', reload: reload);
                  },
                  child: const Text('Clear all'),
                ),
              ]),
              if (items.isEmpty) const EmptyNote('No notifications.'),
              for (final item in items)
                RecordCard(
                  title: textOf(item['title']),
                  subtitle: textOf(item['message']),
                  trailing: item['is_read'] == true ? 'Read' : 'New',
                  children: [
                    Text(whenOf(item['created_at'])),
                    Row(children: [
                      if (item['is_read'] != true)
                        TextButton(onPressed: () => runAction(context, () => api.patch('/notifications/${item['id']}/read'), reload: reload), child: const Text('Mark read')),
                      TextButton(onPressed: () => runAction(context, () => api.delete('/notifications/${item['id']}'), reload: reload), child: const Text('Delete')),
                    ]),
                  ],
                ),
            ],
          );
        },
      ),
    );
  }
}

class ProfileSettingsScreen extends StatefulWidget {
  const ProfileSettingsScreen({super.key});

  @override
  State<ProfileSettingsScreen> createState() => _ProfileSettingsScreenState();
}

class _ProfileSettingsScreenState extends State<ProfileSettingsScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _current = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _ready = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    final auth = context.read<AuthProvider>();
    _name.text = auth.userName ?? '';
    _phone.text = auth.phone ?? '';
    _ready = true;
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _current.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
        const SectionTitle('Profile settings'),
        Text('${auth.userRole ?? ''} · ${auth.userDepartment ?? ''}'),
        const SizedBox(height: 12),
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Full name')),
        const SizedBox(height: 8),
        TextField(controller: _phone, decoration: const InputDecoration(labelText: 'Phone number')),
        const SizedBox(height: 8),
        TextField(controller: _current, obscureText: true, decoration: const InputDecoration(labelText: 'Current password (only if changing it)')),
        const SizedBox(height: 8),
        TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'New password')),
        const SizedBox(height: 8),
        TextField(controller: _confirm, obscureText: true, decoration: const InputDecoration(labelText: 'Confirm new password')),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: () async {
            final body = <String, dynamic>{
              'name': _name.text.trim(),
              'phone_number': _phone.text.trim(),
            };
            if (_password.text.isNotEmpty) {
              body['password'] = _password.text;
              body['password_confirmation'] = _confirm.text;
              body['current_password'] = _current.text;
            }
            await runAction(context, () async {
              await auth.api.put('/user', body);
              await auth.refreshProfile();
            }, success: 'Profile updated.');
          },
          child: const Text('Save profile'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () async {
            final file = await FilePicker.pickFile(type: FileType.image);
            final path = file?.path;
            if (path == null || !context.mounted) return;
            await runAction(context, () async {
              await auth.api.upload('/user/avatar', files: [await http.MultipartFile.fromPath('avatar', path)]);
              await auth.refreshProfile();
            }, success: 'Photo updated.');
          },
          icon: const Icon(Icons.photo_camera_outlined),
          label: const Text('Change photo'),
        ),
        TextButton(
          onPressed: () => runAction(context, () async {
            await auth.api.delete('/user/avatar');
            await auth.refreshProfile();
          }, success: 'Photo removed.'),
          child: const Text('Remove photo'),
        ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
