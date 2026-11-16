import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/json_util.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';
import 'media_tools.dart';

class HourLimitsScreen extends StatelessWidget {
  const HourLimitsScreen({super.key, this.staff = false});
  final bool staff;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(staff ? 'Hour-limit approvals' : 'Hour limits')),
      body: HourLimitsPanel(staff: staff),
    );
  }
}

class HourLimitsPanel extends StatelessWidget {
  const HourLimitsPanel({super.key, this.staff = false});

  final bool staff;

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    if (staff) {
      return FetchView(
        loader: () => api.get('/hour-limits/approvals'),
        builder: (context, data, reload) {
          final rows = asMaps(asMap(data)['approvals']);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionTitle('Hour-limit approvals'),
              FilledButton(onPressed: () => _grant(context, reload), child: const Text('Grant an extension')),
              if (rows.isEmpty) const EmptyNote('No extension requests.'),
              for (final row in rows)
                RecordCard(
                  title: textOf(row['student_name']),
                  subtitle: '${textOf(row['week_start'])} – ${textOf(row['week_end'])} · ${numOf(row['weekly_hours']).toStringAsFixed(1)} / ${numOf(row['weekly_extended']).toStringAsFixed(0)} hrs',
                  trailing: textOf(row['status']),
                  children: [
                    if (textOf(row['reason'], '').isNotEmpty) Text(textOf(row['reason'], '')),
                    if (textOf(row['status']).toLowerCase() == 'pending')
                      Wrap(children: [
                        TextButton(
                          onPressed: () => runAction(context, () => api.patch('/hour-limits/approvals/${row['id']}', {'status': 'approved', 'approved_hours': numOf(row['weekly_extended']) == 0 ? 25 : numOf(row['weekly_extended'])}), success: 'Approved.', reload: reload),
                          child: const Text('Approve'),
                        ),
                        TextButton(
                          onPressed: () async {
                            final note = await promptText(context, 'Decline note', required: false);
                            if (note == null || !context.mounted) return;
                            await runAction(context, () => api.patch('/hour-limits/approvals/${row['id']}', {'status': 'rejected', 'decision_note': note}), success: 'Declined.', reload: reload);
                          },
                          child: const Text('Decline'),
                        ),
                      ]),
                  ],
                ),
            ],
          );
        },
      );
    }
    return FetchView(
      loader: () => api.get('/hour-limits'),
      builder: (context, data, reload) {
        final row = asMap(data);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SectionTitle('Weekly and monthly limits'),
            Text('This week ${numOf(row['weekly_hours']).toStringAsFixed(1)} / ${numOf(row['weekly_cap']).toStringAsFixed(0)} hrs · remaining ${numOf(row['weekly_remaining']).toStringAsFixed(1)}'),
            Text('This month ${numOf(row['monthly_hours']).toStringAsFixed(1)} / ${numOf(row['monthly_cap']).toStringAsFixed(0)} hrs · remaining ${numOf(row['monthly_remaining']).toStringAsFixed(1)}'),
            const SizedBox(height: 8),
            if (row['extension_pending'] == true) const Text('An extension request is waiting for approval.'),
            if (row['extension_approved'] == true || row['extra_hours_approved'] == true)
              Text('Extended week is approved${textOf(row['extra_hours_period_label'], '').isEmpty ? '.' : ' · ${row['extra_hours_period_label']}'}'),
            if (row['can_request_extension'] == true)
              FilledButton(
                onPressed: () async {
                  final reason = await promptText(context, 'Request a weekly extension', label: 'Reason', required: false);
                  if (reason == null || !context.mounted) return;
                  await runAction(context, () => api.post('/hour-limits/request', {'reason': reason}), success: 'Extension requested.', reload: reload);
                },
                child: const Text('Request extension past 20 hours'),
              ),
          ],
        );
      },
    );
  }

  Future<void> _grant(BuildContext context, Future<void> Function() reload) async {
    final people = asMaps(await context.read<AuthProvider>().api.get('/personnel'));
    if (!context.mounted || people.isEmpty) return;
    var userId = numOf(people.first['id']).toInt();
    final hours = TextEditingController(text: '25');
    final note = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Grant extension'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<int>(
              initialValue: userId,
              items: people.map((person) => DropdownMenuItem(value: numOf(person['id']).toInt(), child: Text(textOf(person['name'])))).toList(),
              onChanged: (value) => setLocal(() => userId = value ?? userId),
            ),
            TextField(controller: hours, decoration: const InputDecoration(labelText: 'Approved hours'), keyboardType: TextInputType.number),
            TextField(controller: note, decoration: const InputDecoration(labelText: 'Note')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Grant')),
          ],
        ),
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => context.read<AuthProvider>().api.post('/hour-limits/grant', {
        'user_id': userId,
        'approved_hours': num.tryParse(hours.text) ?? 25,
        'decision_note': note.text.trim(),
      }), success: 'Extension granted.', reload: reload);
    }
    hours.dispose();
    note.dispose();
  }
}

class YearActivitiesScreen extends StatelessWidget {
  const YearActivitiesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () => api.get('/attendance/my-year-activities'),
      builder: (context, data, reload) {
        final payload = asMap(data);
        final events = asMaps(payload['events']);
        if (payload['leader'] != true) {
          return const PageBody(children: [
            SectionTitle('Year activities'),
            EmptyNote('Only a group leader can open attendance QR codes and passcodes for their group.'),
          ]);
        }
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Year activities'),
            Text('Group leader for ${textOf(payload['group_name'], 'your group')} (${textOf(payload['year_label'], 'year')}). Hours are added only when a student times out.'),
            if (events.isEmpty) const EmptyNote('No activities for your group right now.'),
            for (final event in events)
              RecordCard(
                title: textOf(event['title']),
                subtitle: '${textOf(event['kind_label'])} · ${textOf(event['event_date'])} · ${numOf(event['hours']).toStringAsFixed(2)} hrs',
                children: [
                  if (event['uses_attendance'] == true)
                    _ActivityCode(eventId: numOf(event['id']).toInt()),
                  for (final entry in asMaps(event['entries']))
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(textOf(entry['name'])),
                      subtitle: Text('${textOf(entry['status'], 'Not marked')} · in ${textOf(entry['time_in'], '—')} · out ${textOf(entry['time_out'], '—')}'),
                      trailing: Text('${numOf(entry['hours_delta']).toStringAsFixed(2)}'),
                    ),
                  if (event['uses_attendance'] == true)
                    Wrap(children: [
                      TextButton(
                        onPressed: () => _correct(context, event, reload, timeIn: true),
                        child: const Text('Correct a time in'),
                      ),
                      TextButton(
                        onPressed: () => _correct(context, event, reload, timeIn: false),
                        child: const Text('Correct a time out'),
                      ),
                    ]),
                ],
              ),
          ],
        );
      },
    );
  }

  Future<void> _correct(BuildContext context, Map<String, dynamic> event, Future<void> Function() reload, {required bool timeIn}) async {
    final entries = asMaps(event['entries']);
    if (entries.isEmpty) return;
    var userId = numOf(entries.first['user_id']).toInt();
    final picked = await showDialog<int>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text(timeIn ? 'Whose time in?' : 'Whose time out?'),
          content: DropdownButtonFormField<int>(
            initialValue: userId,
            items: entries.map((entry) => DropdownMenuItem(value: numOf(entry['user_id']).toInt(), child: Text(textOf(entry['name'])))).toList(),
            onChanged: (value) => setLocal(() => userId = value ?? userId),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, userId), child: const Text('Continue')),
          ],
        ),
      ),
    );
    if (picked == null || !context.mounted) return;
    final time = await promptText(context, timeIn ? 'Clock-in time (HH:MM)' : 'Time-out (HH:MM)', label: 'Time');
    if (time == null || !context.mounted) return;
    final path = timeIn ? 'time' : 'timeout';
    await runAction(
      context,
      () => context.read<AuthProvider>().api.patch('/financial/hour-events/${event['id']}/$path', {'user_id': picked, 'time': time}),
      success: 'Time saved.',
      reload: reload,
    );
  }
}

class _ActivityCode extends StatefulWidget {
  const _ActivityCode({required this.eventId});
  final int eventId;

  @override
  State<_ActivityCode> createState() => _ActivityCodeState();
}

class _ActivityCodeState extends State<_ActivityCode> {
  Map<String, dynamic> _pass = {};
  Map<String, dynamic> _qr = {};
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final api = context.read<AuthProvider>().api;
    try {
      final pass = asMap(await api.get('/attendance/activity-passcode', {'event_id': widget.eventId.toString()}));
      final qr = asMap(await api.get('/attendance/activity-qr', {'event_id': '${widget.eventId}'}));
      if (mounted) {
        setState(() {
          _pass = pass;
          _qr = qr;
        });
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        RecordCard(title: 'Passcode', subtitle: textOf(_pass['token_code'] ?? _pass['error']), trailing: _pass['seconds_remaining'] == null ? '' : '${_pass['seconds_remaining']}s'),
        QrPayloadCard(title: 'Activity QR', payload: textOf(_qr['payload'], ''), seconds: _qr['seconds_remaining']?.toString()),
      ],
    );
  }
}

class JanitorialCodeScreen extends StatefulWidget {
  const JanitorialCodeScreen({super.key});

  @override
  State<JanitorialCodeScreen> createState() => _JanitorialCodeScreenState();
}

class _JanitorialCodeScreenState extends State<JanitorialCodeScreen> {
  int? _groupId;
  Timer? _timer;
  Map<String, dynamic> _pass = {};
  Map<String, dynamic> _qr = {};

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _refreshCode());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refreshCode() async {
    final id = _groupId;
    if (id == null) return;
    final api = context.read<AuthProvider>().api;
    try {
      final pass = asMap(await api.get('/attendance/janitorial-passcode', {'group_id': '$id'}));
      final qr = asMap(await api.get('/attendance/janitorial-qr', {'group_id': '$id'}));
      if (mounted) {
        setState(() {
          _pass = pass;
          _qr = qr;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _pass = {'error': errorText(error)});
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    final userId = context.watch<AuthProvider>().userId;
    return FetchView(
      loader: () async {
        final groups = asMap(await api.get('/attendance/janitorial-groups'));
        final reviews = asMap(await api.get('/attendance/janitorial-reviews'));
        final offline = asMap(await api.get('/attendance/janitorial-offline-requests'));
        return {'groups': groups, 'reviews': reviews, 'offline': offline};
      },
      builder: (context, data, reload) {
        final payload = asMap(data);
        final groups = asMaps(asMap(payload['groups'])['groups']).where((group) => numOf(asMap(group['supervisor'])['id']).toInt() == userId).toList();
        final reviews = asMaps(asMap(payload['reviews'])['entries']);
        final offline = asMaps(asMap(payload['offline'])['requests']).where((row) => textOf(row['status']) == 'Pending').toList();
        if (groups.isEmpty) {
          return const PageBody(children: [
            SectionTitle('Janitorial code'),
            EmptyNote('This page is for the student assigned as a janitorial group leader.'),
          ]);
        }
        _groupId ??= numOf(groups.first['id']).toInt();
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Janitorial code'),
            const Text('Members normally clock with surroundings photos. Show this code only when you are with the group and they choose Supervisor code. An accepted entry is exactly 4 hours from clock-in.'),
            DropdownButtonFormField<int>(
              initialValue: _groupId,
              items: groups.map((group) => DropdownMenuItem(value: numOf(group['id']).toInt(), child: Text('${textOf(group['area'])} · ${textOf(group['name'])}'))).toList(),
              onChanged: (value) {
                setState(() => _groupId = value);
                _refreshCode();
              },
            ),
            RecordCard(title: 'Passcode', subtitle: textOf(_pass['token_code'] ?? _pass['error'], 'Loading…'), trailing: _pass['seconds_remaining'] == null ? '' : '${_pass['seconds_remaining']}s'),
            QrPayloadCard(title: 'Janitorial QR', payload: textOf(_qr['payload'], ''), seconds: _qr['seconds_remaining']?.toString()),
            FilledButton(onPressed: _refreshCode, child: const Text('Refresh code')),
            const SectionTitle('Photo review'),
            if (reviews.isEmpty) const EmptyNote('No surroundings photos waiting.'),
            for (final row in reviews)
              RecordCard(
                title: textOf(row['student_name']),
                subtitle: '${textOf(row['area'])} · in ${whenOf(row['time_in'])} · out ${whenOf(row['time_out'])}',
                trailing: textOf(row['status']),
                children: [
                  Wrap(children: [
                    TextButton(onPressed: () => openSecureFile(context, textOf(row['before_path'], ''), title: 'Before'), child: const Text('Before photo')),
                    TextButton(onPressed: () => openSecureFile(context, textOf(row['after_path'], ''), title: 'After'), child: const Text('After photo')),
                    if (textOf(row['status']).toLowerCase() == 'pending') ...[
                      TextButton(onPressed: () => runAction(context, () => api.patch('/attendance/janitorial-reviews/${row['id']}', {'status': 'accepted'}), success: 'Accepted. 4 hours recorded.', reload: reload), child: const Text('Accept')),
                      TextButton(onPressed: () => runAction(context, () => api.patch('/attendance/janitorial-reviews/${row['id']}', {'status': 'rejected'}), success: 'Declined.', reload: reload), child: const Text('Decline')),
                    ],
                  ]),
                ],
              ),
            const SectionTitle('Offline requests'),
            if (offline.isEmpty) const EmptyNote('No pending offline janitorial requests.'),
            for (final row in offline)
              RecordCard(
                title: personName(row, 'student'),
                subtitle: textOf(row['reason']),
                trailing: textOf(row['status']),
                children: [
                  TextButton(onPressed: () => runAction(context, () => api.patch('/attendance/janitorial-offline-requests/${row['id']}', {'status': 'Approved'}), success: 'Approved.', reload: reload), child: const Text('Accept')),
                  TextButton(onPressed: () => runAction(context, () => api.patch('/attendance/janitorial-offline-requests/${row['id']}', {'status': 'Rejected'}), success: 'Declined.', reload: reload), child: const Text('Decline')),
                ],
              ),
          ],
        );
      },
    );
  }
}
