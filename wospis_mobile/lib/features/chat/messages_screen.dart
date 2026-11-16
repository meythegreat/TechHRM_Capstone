import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/json_util.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';

class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  bool _archived = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      key: ValueKey(_archived),
      loader: () => api.get('/chat/conversations', _archived ? {'scope': 'archived'} : null),
      builder: (context, data, reload) {
        final rows = asMaps(data);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Messages'),
            Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => setState(() => _archived = false), child: Text(_archived ? 'Inbox' : 'Inbox · on'))),
              const SizedBox(width: 8),
              Expanded(child: OutlinedButton(onPressed: () => setState(() => _archived = true), child: Text(_archived ? 'Archived · on' : 'Archived'))),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: FilledButton.icon(onPressed: () => _newDirect(context, reload), icon: const Icon(Icons.person_add_alt), label: const Text('New message'))),
              const SizedBox(width: 8),
              Expanded(child: OutlinedButton.icon(onPressed: () => _newGroup(context, reload), icon: const Icon(Icons.group_add), label: const Text('New group'))),
            ]),
            const SizedBox(height: 12),
            if (rows.isEmpty) EmptyNote(_archived ? 'No archived chats.' : 'No conversations yet.'),
            for (final row in rows) _conversationTile(context, row, reload),
          ],
        );
      },
    );
  }

  Widget _conversationTile(BuildContext context, Map<String, dynamic> row, Future<void> Function() reload) {
    final isGroup = row['is_group'] == true || row['type'] == 'group';
    final title = textOf(row['title'] ?? row['name'] ?? asMap(row['peer'])['name'], 'Conversation');
    final preview = textOf(row['last_message_preview'] ?? asMap(row['last_message'])['body'], '');
    final unread = numOf(row['unread_count']).toInt();
    return RecordCard(
      title: title,
      subtitle: preview,
      trailing: unread > 0 ? '$unread' : (row['peer_typing'] == true ? 'typing' : ''),
      onTap: () async {
        await Navigator.push(context, MaterialPageRoute(builder: (_) => ChatThreadScreen(conversation: row)));
        if (context.mounted) await reload();
      },
      children: [
        Wrap(spacing: 4, children: [
          if (!_archived)
            TextButton(
              onPressed: () => runAction(context, () => context.read<AuthProvider>().api.post('/chat/conversations/${row['id']}/archive', {}), success: 'Archived.', reload: reload),
              child: const Text('Archive'),
            ),
          if (_archived)
            TextButton(
              onPressed: () => runAction(context, () => context.read<AuthProvider>().api.post('/chat/conversations/${row['id']}/restore', {}), success: 'Restored.', reload: reload),
              child: const Text('Restore'),
            ),
          TextButton(
            onPressed: () async {
              if (!await confirm(context, 'Remove this chat for you?')) return;
              if (!context.mounted) return;
              await runAction(context, () => context.read<AuthProvider>().api.delete('/chat/conversations/${row['id']}'), success: 'Chat removed.', reload: reload);
            },
            child: const Text('Delete'),
          ),
          if (isGroup) const Padding(padding: EdgeInsets.only(top: 10), child: Text('Group', style: TextStyle(color: kMuted, fontSize: 12))),
        ]),
      ],
    );
  }

  Future<void> _newDirect(BuildContext context, Future<void> Function() reload) async {
    final query = TextEditingController();
    List<Map<String, dynamic>> people = [];
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('New message'),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: query,
                  decoration: const InputDecoration(labelText: 'Search name'),
                  onSubmitted: (_) async {
                    final rows = asMaps(await dialogContext.read<AuthProvider>().api.get('/chat/users', {'q': query.text.trim()}));
                    setLocal(() => people = rows);
                  },
                ),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: () async {
                    final rows = asMaps(await dialogContext.read<AuthProvider>().api.get('/chat/users', {'q': query.text.trim()}));
                    setLocal(() => people = rows);
                  },
                  child: const Text('Search'),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 240,
                  child: ListView(
                    children: [
                      for (final person in people)
                        ListTile(
                          title: Text(textOf(person['name'])),
                          subtitle: Text('${textOf(person['role'])} · ${person['online'] == true ? 'Online' : 'Offline'}'),
                          onTap: () async {
                            final opened = asMap(await dialogContext.read<AuthProvider>().api.post('/chat/conversations', {'user_id': person['id']}));
                            if (!dialogContext.mounted) return;
                            Navigator.pop(dialogContext);
                            await Navigator.push(dialogContext, MaterialPageRoute(builder: (_) => ChatThreadScreen(conversation: opened.isEmpty ? {'id': person['id'], 'peer': person} : opened)));
                            await reload();
                          },
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))],
        ),
      ),
    );
    query.dispose();
  }

  Future<void> _newGroup(BuildContext context, Future<void> Function() reload) async {
    final name = TextEditingController();
    final query = TextEditingController();
    final selected = <int>{};
    List<Map<String, dynamic>> people = [];
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('New group'),
          content: SizedBox(
            width: 420,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: name, decoration: const InputDecoration(labelText: 'Group name')),
              TextField(controller: query, decoration: const InputDecoration(labelText: 'Search members')),
              TextButton(
                onPressed: () async {
                  final rows = asMaps(await dialogContext.read<AuthProvider>().api.get('/chat/users', {'q': query.text.trim()}));
                  setLocal(() => people = rows);
                },
                child: const Text('Search'),
              ),
              SizedBox(
                height: 220,
                child: ListView(
                  children: [
                    for (final person in people)
                      CheckboxListTile(
                        value: selected.contains(numOf(person['id']).toInt()),
                        title: Text(textOf(person['name'])),
                        onChanged: (value) => setLocal(() {
                          final id = numOf(person['id']).toInt();
                          if (value == true) {
                            selected.add(id);
                          } else {
                            selected.remove(id);
                          }
                        }),
                      ),
                  ],
                ),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Create')),
          ],
        ),
      ),
    );
    if (saved == true && context.mounted && name.text.trim().isNotEmpty && selected.isNotEmpty) {
      final opened = asMap(await context.read<AuthProvider>().api.post('/chat/groups', {
        'name': name.text.trim(),
        'member_ids': selected.toList(),
      }));
      if (!context.mounted) return;
      if (opened['id'] != null) {
        await Navigator.push(context, MaterialPageRoute(builder: (_) => ChatThreadScreen(conversation: opened)));
      }
      await reload();
    }
    name.dispose();
    query.dispose();
  }
}

class ChatThreadScreen extends StatefulWidget {
  const ChatThreadScreen({super.key, required this.conversation});
  final Map<String, dynamic> conversation;

  @override
  State<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends State<ChatThreadScreen> {
  final _body = TextEditingController();
  List<Map<String, dynamic>> _messages = [];
  Map<String, dynamic> _state = {};
  Timer? _timer;
  bool _busy = false;

  int get _id => numOf(widget.conversation['id']).toInt();

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    _body.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _busy = true);
    try {
      final api = context.read<AuthProvider>().api;
      final messages = await api.get('/chat/conversations/$_id/messages');
      final state = await api.get('/chat/conversations/$_id/state');
      if (!mounted) return;
      setState(() {
        _messages = asMaps(messages);
        _state = asMap(state);
      });
    } catch (error) {
      if (!silent && mounted) toast(context, errorText(error), error: true);
    } finally {
      if (mounted && !silent) setState(() => _busy = false);
    }
  }

  String get _title {
    final peer = asMap(widget.conversation['peer']);
    return textOf(widget.conversation['title'] ?? widget.conversation['name'] ?? peer['name'], 'Chat');
  }

  @override
  Widget build(BuildContext context) {
    final typing = asMaps(_state['typing_names']).isNotEmpty
        ? asMaps(_state['typing_names']).map((row) => textOf(row)).join(', ')
        : (_state['peer_typing'] == true ? 'Typing…' : '');
    final names = _state['typing_names'];
    final typingLabel = names is List && names.isNotEmpty ? '${names.join(', ')} typing…' : typing;
    return Scaffold(
      appBar: AppBar(title: Text(_title), bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1))),
      body: Column(
        children: [
          if (typingLabel.isNotEmpty) Padding(padding: const EdgeInsets.all(8), child: Text(typingLabel, style: const TextStyle(color: kMuted))),
          Expanded(
            child: _busy && _messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      for (final message in _messages) _bubble(message),
                    ],
                  ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _body,
                  decoration: const InputDecoration(labelText: 'Message'),
                  onChanged: (_) => context.read<AuthProvider>().api.post('/chat/conversations/$_id/typing', {'typing': true}).catchError((_) => null),
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(onPressed: _send, icon: const Icon(Icons.send)),
            ]),
          ),
        ],
      ),
    );
  }

  Widget _bubble(Map<String, dynamic> message) {
    final mine = message['is_mine'] == true;
    final unsent = message['is_unsent'] == true;
    final body = unsent ? 'Message unsent' : textOf(message['body'], '');
    final receipt = mine
        ? (message['read_at'] != null
            ? 'Seen'
            : message['delivered_at'] != null
                ? 'Delivered'
                : 'Sent')
        : '';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        constraints: const BoxConstraints(maxWidth: 320),
        decoration: BoxDecoration(
          color: mine ? const Color(0xFFDBEAFE) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: kLine),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!mine) Text(textOf(asMap(message['sender'])['name'], ''), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
            Text(body, style: TextStyle(fontStyle: unsent ? FontStyle.italic : FontStyle.normal)),
            const SizedBox(height: 4),
            Text('${whenOf(message['created_at'])}${receipt.isEmpty ? '' : ' · $receipt'}', style: const TextStyle(color: kMuted, fontSize: 11)),
            if (mine && !unsent)
              Row(children: [
                if (message['can_edit'] == true)
                  TextButton(
                    onPressed: () async {
                      final next = await promptText(context, 'Edit message', initial: textOf(message['body'], ''), label: 'Message');
                      if (next == null || !mounted) return;
                      await runAction(context, () => context.read<AuthProvider>().api.patch('/chat/conversations/$_id/messages/${message['id']}', {'body': next}), reload: () => _load(silent: true));
                    },
                    child: const Text('Edit'),
                  ),
                if (message['can_unsend'] == true)
                  TextButton(
                    onPressed: () => runAction(context, () => context.read<AuthProvider>().api.delete('/chat/conversations/$_id/messages/${message['id']}'), success: 'Unsent.', reload: () => _load(silent: true)),
                    child: const Text('Unsend'),
                  ),
              ]),
          ],
        ),
      ),
    );
  }

  Future<void> _send() async {
    final text = _body.text.trim();
    if (text.isEmpty) return;
    _body.clear();
    await runAction(
      context,
      () async {
        await context.read<AuthProvider>().api.post('/chat/conversations/$_id/messages', {'body': text});
        await context.read<AuthProvider>().api.post('/chat/conversations/$_id/typing', {'typing': false});
      },
      reload: () => _load(silent: true),
    );
  }
}
