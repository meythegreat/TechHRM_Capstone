import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import '../../core/json_util.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';
import 'media_tools.dart';

class ActivityToolsScreen extends StatelessWidget {
  const ActivityToolsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Campus activities'),
          bottom: const TabBar(tabs: [
            Tab(text: 'Groups'),
            Tab(text: 'Assembly'),
            Tab(text: 'New activity'),
          ]),
        ),
        body: TabBarView(children: [
          _GroupsTab(api: api),
          _AssemblyTab(api: api),
          _NewActivityTab(api: api),
        ]),
      ),
    );
  }
}

class _GroupsTab extends StatelessWidget {
  const _GroupsTab({required this.api});
  final dynamic api;

  @override
  Widget build(BuildContext context) {
    return FetchView(
      loader: () async {
        final groups = await api.get('/financial/cleaning-groups');
        final students = await api.get('/financial/hour-events/students');
        return {'groups': groups, 'students': students};
      },
      builder: (context, data, reload) {
        final payload = asMap(data);
        final groups = asMaps(payload['groups'] is Map ? asMap(payload['groups'])['groups'] ?? payload['groups'] : payload['groups']);
        final students = asMaps(payload['students'] is Map ? asMap(payload['students'])['students'] ?? payload['students'] : payload['students']);
        return PageBody(
          onRefresh: reload,
          children: [
            const Text('Choose one leader, then the members. That leader opens the activity QR.'),
            FilledButton(onPressed: () => _edit(context, reload, students, null), child: const Text('New group')),
            if (groups.isEmpty) const EmptyNote('No activity groups yet.'),
            for (final group in groups)
              RecordCard(
                title: textOf(group['name']),
                subtitle: '${group['student_count'] ?? asMaps(group['students']).length} students',
                children: [
                  Text(asMaps(group['students']).map((student) => '${textOf(student['name'])}${student['is_leader'] == true ? ' (leader)' : ''}').join(', ')),
                  TextButton(onPressed: () => _edit(context, reload, students, group), child: const Text('Edit')),
                  TextButton(
                    onPressed: () async {
                      if (!await confirm(context, 'Remove ${group['name']}?')) return;
                      if (!context.mounted) return;
                      await runAction(context, () => api.delete('/financial/cleaning-groups/${group['id']}'), success: 'Group removed.', reload: reload);
                    },
                    child: const Text('Delete'),
                  ),
                ],
              ),
          ],
        );
      },
    );
  }

  Future<void> _edit(BuildContext context, Future<void> Function() reload, List<Map<String, dynamic>> students, Map<String, dynamic>? group) async {
    final name = TextEditingController(text: textOf(group?['name'], ''));
    final existing = asMaps(group?['students']);
    var leader = existing.where((row) => row['is_leader'] == true).map((row) => numOf(row['id']).toInt()).cast<int?>().firstOrNull ?? (students.isEmpty ? null : numOf(students.first['id']).toInt());
    final members = existing.map((row) => numOf(row['id']).toInt()).toSet();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text(group == null ? 'New group' : 'Edit group'),
          content: SizedBox(
            width: 420,
            child: ListView(
              shrinkWrap: true,
              children: [
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Group name')),
                if (students.isNotEmpty && leader != null)
                  DropdownButtonFormField<int>(
                    initialValue: leader,
                    decoration: const InputDecoration(labelText: 'Leader'),
                    items: students.map((student) => DropdownMenuItem(value: numOf(student['id']).toInt(), child: Text(textOf(student['name'])))).toList(),
                    onChanged: (value) => setLocal(() => leader = value),
                  ),
                for (final student in students)
                  CheckboxListTile(
                    value: members.contains(numOf(student['id']).toInt()),
                    title: Text(textOf(student['name'])),
                    onChanged: (value) => setLocal(() {
                      final id = numOf(student['id']).toInt();
                      if (value == true) {
                        members.add(id);
                      } else {
                        members.remove(id);
                      }
                    }),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (saved == true && context.mounted && leader != null) {
      final body = {'name': name.text.trim(), 'leader_user_id': leader, 'user_ids': members.toList()};
      await runAction(
        context,
        () => group == null ? api.post('/financial/cleaning-groups', body) : api.put('/financial/cleaning-groups/${group['id']}', body),
        success: 'Group saved.',
        reload: reload,
      );
    }
    name.dispose();
  }
}

class _AssemblyTab extends StatelessWidget {
  const _AssemblyTab({required this.api});
  final dynamic api;

  @override
  Widget build(BuildContext context) {
    return FetchView(
      loader: () async {
        final reps = await api.get('/attendance/assembly-year-representatives');
        final students = await api.get('/financial/hour-events/students');
        return {'reps': reps, 'students': students};
      },
      builder: (context, data, reload) {
        final payload = asMap(data);
        final reps = asMaps(asMap(payload['reps'])['representatives']);
        final students = asMaps(payload['students'] is Map ? asMap(payload['students'])['students'] ?? payload['students'] : payload['students']);
        return PageBody(
          onRefresh: reload,
          children: [
            const Text('One working student represents each year at assembly.'),
            for (var year = 1; year <= 4; year++)
              RecordCard(
                title: '$year${year == 1 ? 'st' : year == 2 ? 'nd' : year == 3 ? 'rd' : 'th'} year',
                subtitle: textOf(reps.cast<Map<String, dynamic>?>().firstWhere((row) => numOf(row?['year_level']) == year, orElse: () => null)?['name'] ?? reps.where((row) => numOf(row['year_level']) == year).map((row) => asMap(row['student'])['name'] ?? row['name']).firstOrNull, 'No representative'),
                children: [
                  TextButton(
                    onPressed: () async {
                      final pool = students.where((student) => numOf(student['year_level']).toInt() == year).toList();
                      if (pool.isEmpty) {
                        toast(context, 'No year $year students loaded.', error: true);
                        return;
                      }
                      var userId = numOf(pool.first['id']).toInt();
                      final picked = await showDialog<int>(
                        context: context,
                        builder: (context) => StatefulBuilder(
                          builder: (context, setLocal) => AlertDialog(
                            title: Text('Year $year representative'),
                            content: DropdownButtonFormField<int>(
                              initialValue: userId,
                              items: pool.map((student) => DropdownMenuItem(value: numOf(student['id']).toInt(), child: Text(textOf(student['name'])))).toList(),
                              onChanged: (value) => setLocal(() => userId = value ?? userId),
                            ),
                            actions: [
                              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                              FilledButton(onPressed: () => Navigator.pop(context, userId), child: const Text('Save')),
                            ],
                          ),
                        ),
                      );
                      if (picked == null || !context.mounted) return;
                      await runAction(context, () => api.put('/attendance/assembly-year-representatives', {'year_level': year, 'user_id': picked}), success: 'Representative saved.', reload: reload);
                    },
                    child: const Text('Assign'),
                  ),
                  TextButton(onPressed: () => runAction(context, () => api.delete('/attendance/assembly-year-representatives/$year'), success: 'Representative removed.', reload: reload), child: const Text('Remove')),
                ],
              ),
          ],
        );
      },
    );
  }
}

class _NewActivityTab extends StatefulWidget {
  const _NewActivityTab({required this.api});
  final dynamic api;

  @override
  State<_NewActivityTab> createState() => _NewActivityTabState();
}

class _NewActivityTabState extends State<_NewActivityTab> {
  String _kind = 'daily_cleaning';
  int? _groupId;
  int? _year;
  final _title = TextEditingController();
  final _date = TextEditingController();
  final _start = TextEditingController(text: '05:00');
  final _end = TextEditingController(text: '06:00');
  final _hours = TextEditingController(text: '1');
  String _direction = 'add';
  final _selected = <int>{};
  List<Map<String, dynamic>> _groups = [];
  List<Map<String, dynamic>> _students = [];

  @override
  void initState() {
    super.initState();
    _date.text = DateTime.now().toIso8601String().split('T').first;
    _load();
  }

  @override
  void dispose() {
    _title.dispose();
    _date.dispose();
    _start.dispose();
    _end.dispose();
    _hours.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final groups = asMaps(await widget.api.get('/financial/cleaning-groups'));
    final rawStudents = await widget.api.get('/financial/hour-events/students');
    final students = asMaps(rawStudents is Map ? asMap(rawStudents)['students'] ?? rawStudents : rawStudents);
    final groupRows = groups.isNotEmpty ? groups : asMaps(asMap(await widget.api.get('/financial/cleaning-groups'))['groups']);
    if (!mounted) return;
    setState(() {
      _groups = groupRows;
      _students = students;
      _groupId ??= groupRows.isEmpty ? null : numOf(groupRows.first['id']).toInt();
    });
  }

  @override
  Widget build(BuildContext context) {
    return PageBody(
      children: [
        const Text('Special request needs chosen students. Other activities cover a group and credit hours at time-out.'),
        DropdownButtonFormField<String>(
          initialValue: _kind,
          items: const [
            DropdownMenuItem(value: 'special_request', child: Text('Special request')),
            DropdownMenuItem(value: 'daily_cleaning', child: Text('Daily cleaning')),
            DropdownMenuItem(value: 'general_cleaning', child: Text('General cleaning')),
            DropdownMenuItem(value: 'devotional', child: Text('Devotional meeting')),
            DropdownMenuItem(value: 'meeting_assembly', child: Text('Meeting assembly')),
          ],
          onChanged: (value) => setState(() => _kind = value ?? _kind),
        ),
        TextField(controller: _title, decoration: const InputDecoration(labelText: 'Title')),
        TextField(controller: _date, decoration: const InputDecoration(labelText: 'Date (YYYY-MM-DD)')),
        if (_kind == 'special_request') ...[
          TextField(controller: _hours, decoration: const InputDecoration(labelText: 'Hours'), keyboardType: TextInputType.number),
          DropdownButtonFormField<String>(
            initialValue: _direction,
            items: const [DropdownMenuItem(value: 'add', child: Text('Add hours')), DropdownMenuItem(value: 'deduct', child: Text('Deduct hours'))],
            onChanged: (value) => setState(() => _direction = value ?? _direction),
          ),
          for (final student in _students)
            CheckboxListTile(
              value: _selected.contains(numOf(student['id']).toInt()),
              title: Text(textOf(student['name'])),
              onChanged: (value) => setState(() {
                final id = numOf(student['id']).toInt();
                if (value == true) {
                  _selected.add(id);
                } else {
                  _selected.remove(id);
                }
              }),
            ),
        ] else ...[
          if (_groups.isNotEmpty && _groupId != null)
            DropdownButtonFormField<int>(
              initialValue: _groupId,
              decoration: const InputDecoration(labelText: 'Group'),
              items: _groups.map((group) => DropdownMenuItem(value: numOf(group['id']).toInt(), child: Text(textOf(group['name'])))).toList(),
              onChanged: (value) => setState(() => _groupId = value),
            ),
          DropdownButtonFormField<int?>(
            initialValue: _year,
            decoration: const InputDecoration(labelText: 'Year level'),
            items: const [
              DropdownMenuItem(value: null, child: Text('All years in the group')),
              DropdownMenuItem(value: 1, child: Text('1st year')),
              DropdownMenuItem(value: 2, child: Text('2nd year')),
              DropdownMenuItem(value: 3, child: Text('3rd year')),
              DropdownMenuItem(value: 4, child: Text('4th year')),
            ],
            onChanged: (value) => setState(() => _year = value),
          ),
          TextField(controller: _start, decoration: const InputDecoration(labelText: 'Official time in (HH:MM)')),
          TextField(controller: _end, decoration: const InputDecoration(labelText: 'End time (HH:MM)')),
        ],
        const SizedBox(height: 12),
        FilledButton(onPressed: _save, child: const Text('Save activity')),
      ],
    );
  }

  Future<void> _save() async {
    final body = <String, dynamic>{
      'kind': _kind,
      'title': _title.text.trim(),
      'event_date': _date.text.trim(),
      if (_kind == 'special_request') ...{
        'hours': num.tryParse(_hours.text) ?? 1,
        'direction': _direction,
        'user_ids': _selected.toList(),
      } else ...{
        'group_id': _groupId,
        if (_year != null) 'year_level': _year,
        'starts_at': _start.text.trim(),
        'ends_at': _end.text.trim(),
      },
    };
    await runAction(context, () => widget.api.post('/financial/hour-events', body), success: 'Activity saved.');
  }
}

class JanitorialAdminScreen extends StatelessWidget {
  const JanitorialAdminScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return Scaffold(
      appBar: AppBar(title: const Text('Janitorial leaders')),
      body: FetchView(
        loader: () async {
          final payload = asMap(await api.get('/attendance/janitorial-groups'));
          final people = asMaps(await api.get('/personnel'));
          return {'payload': payload, 'people': people};
        },
        builder: (context, data, reload) {
          final payload = asMap(asMap(data)['payload']);
          final leaders = asMaps(payload['leaders']);
          final groups = asMaps(payload['groups']);
          final people = asMaps(asMap(data)['people']);
          return PageBody(
            onRefresh: reload,
            children: [
              const Text('Add a student leader, mark them present, then add up to 3 groups in different areas.'),
              FilledButton(
                onPressed: () async {
                  if (people.isEmpty) return;
                  var userId = numOf(people.first['id']).toInt();
                  final picked = await showDialog<int>(
                    context: context,
                    builder: (context) => StatefulBuilder(
                      builder: (context, setLocal) => AlertDialog(
                        title: const Text('Add leader'),
                        content: DropdownButtonFormField<int>(
                          initialValue: userId,
                          items: people.map((person) => DropdownMenuItem(value: numOf(person['id']).toInt(), child: Text(textOf(person['name'])))).toList(),
                          onChanged: (value) => setLocal(() => userId = value ?? userId),
                        ),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                          FilledButton(onPressed: () => Navigator.pop(context, userId), child: const Text('Add')),
                        ],
                      ),
                    ),
                  );
                  if (picked == null || !context.mounted) return;
                  await runAction(context, () => api.post('/attendance/janitorial-leaders', {'user_id': picked}), success: 'Leader added.', reload: reload);
                },
                child: const Text('Add leader'),
              ),
              for (final leader in leaders)
                RecordCard(
                  title: textOf(asMap(leader['user'])['name']),
                  subtitle: '${leader['group_count'] ?? asMaps(leader['groups']).length} groups · ${leader['is_present'] == true ? 'Present' : 'Absent'}',
                  children: [
                    TextButton(
                      onPressed: () => runAction(context, () => api.patch('/attendance/janitorial-leaders/${leader['id']}', {'is_present': leader['is_present'] != true}), success: 'Presence updated.', reload: reload),
                      child: Text(leader['is_present'] == true ? 'Mark absent' : 'Mark present'),
                    ),
                    TextButton(onPressed: () => _group(context, api, reload, people, leader), child: const Text('Add group')),
                    TextButton(onPressed: () => runAction(context, () => api.delete('/attendance/janitorial-leaders/${leader['id']}'), success: 'Leader removed.', reload: reload), child: const Text('Remove leader')),
                  ],
                ),
              const SectionTitle('Groups'),
              for (final group in groups)
                RecordCard(
                  title: textOf(group['area'], textOf(group['name'])),
                  subtitle: '${textOf(asMap(group['supervisor'])['name'])} · ${group['member_count'] ?? asMaps(group['members']).length} members',
                  children: [
                    TextButton(
                      onPressed: () async {
                        if (!await confirm(context, 'Delete this janitorial group?')) return;
                        if (!context.mounted) return;
                        await runAction(context, () => api.delete('/attendance/janitorial-groups/${group['id']}'), success: 'Group deleted.', reload: reload);
                      },
                      child: const Text('Delete group'),
                    ),
                  ],
                ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _group(BuildContext context, dynamic api, Future<void> Function() reload, List<Map<String, dynamic>> people, Map<String, dynamic> leader) async {
    final area = TextEditingController();
    final supervisorId = numOf(asMap(leader['user'])['id']).toInt();
    final members = <int>{};
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Janitorial group'),
          content: SizedBox(
            width: 420,
            child: ListView(
              shrinkWrap: true,
              children: [
                TextField(controller: area, decoration: const InputDecoration(labelText: 'Area')),
                for (final person in people)
                  CheckboxListTile(
                    value: members.contains(numOf(person['id']).toInt()),
                    title: Text(textOf(person['name'])),
                    onChanged: (value) => setLocal(() {
                      final id = numOf(person['id']).toInt();
                      if (value == true) {
                        members.add(id);
                      } else {
                        members.remove(id);
                      }
                    }),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => api.post('/attendance/janitorial-groups', {
        'name': area.text.trim(),
        'area': area.text.trim(),
        'supervisor_user_id': supervisorId,
        'member_ids': members.toList(),
      }), success: 'Group saved.', reload: reload);
    }
    area.dispose();
  }
}

class ExtraHoursScreen extends StatelessWidget {
  const ExtraHoursScreen({super.key, required this.canReview, required this.canCreate});
  final bool canReview;
  final bool canCreate;

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return Scaffold(
      appBar: AppBar(title: const Text('Extra Hours')),
      body: FetchView(
        loader: () async {
          final requests = await api.get('/extra-hours');
          final meta = canCreate ? await api.get('/extra-hours/meta') : {};
          final students = canCreate ? await api.get('/extra-hours/candidates') : {};
          final signs = canCreate ? await api.get('/extra-hours/signatories') : {};
          return {'requests': requests, 'meta': meta, 'students': students, 'signs': signs};
        },
        builder: (context, data, reload) {
          final payload = asMap(data);
          final rows = asMaps(asMap(payload['requests'])['requests']);
          final meta = asMap(payload['meta']);
          final students = asMaps(asMap(payload['students'])['students']);
          final signs = asMap(payload['signs']);
          return PageBody(
            onRefresh: reload,
            children: [
              const Text('Extra Hours raises the weekly cap from 20 to 25 after a wet-signed letter is recorded. 100 hours a month stays the maximum.'),
              if (canCreate) FilledButton(onPressed: () => _draft(context, api, reload, meta, students, signs), child: const Text('New Extra Hours letter')),
              if (rows.isEmpty) const EmptyNote('No Extra Hours requests.'),
              for (final row in rows)
                RecordCard(
                  title: textOf(row['department']),
                  subtitle: '${textOf(row['period_label'])} · ${textOf(row['duty_description'])}',
                  trailing: textOf(row['status']),
                  children: [
                    Text((asMaps(row['students']).map((student) => textOf(student['name'])).join(', '))),
                    if (textOf(row['status']) == 'Draft' && canCreate) ...[
                      TextButton(onPressed: () => _finalize(context, api, reload, row), child: const Text('Attach signed letter')),
                      TextButton(onPressed: () => runAction(context, () => api.delete('/extra-hours/${row['id']}'), success: 'Draft deleted.', reload: reload), child: const Text('Delete draft')),
                    ],
                    if (canReview && textOf(row['status']) == 'Pending') ...[
                      TextButton(onPressed: () => runAction(context, () => api.patch('/extra-hours/${row['id']}', {'status': 'Approved'}), success: 'Approved for 25 hours/week.', reload: reload), child: const Text('Approve 25')),
                      TextButton(
                        onPressed: () async {
                          final note = await promptText(context, 'Decline note', required: false);
                          if (note == null || !context.mounted) return;
                          await runAction(context, () => api.patch('/extra-hours/${row['id']}', {'status': 'Rejected', 'decision_note': note}), success: 'Declined.', reload: reload);
                        },
                        child: const Text('Decline'),
                      ),
                    ],
                    if (textOf(row['approval_letter_path'], '').isNotEmpty)
                      TextButton(onPressed: () => openSecureFile(context, textOf(row['approval_letter_path'], ''), title: 'Signed letter'), child: const Text('View letter')),
                  ],
                ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _draft(BuildContext context, dynamic api, Future<void> Function() reload, Map<String, dynamic> meta, List<Map<String, dynamic>> students, Map<String, dynamic> signs) async {
    final duty = TextEditingController();
    final label = TextEditingController(text: textOf(meta['period_label'], ''));
    final start = TextEditingController(text: textOf(asMap(meta['semester'])['starts_on'], ''));
    final end = TextEditingController(text: textOf(asMap(meta['semester'])['ends_on'], ''));
    final title = TextEditingController(text: 'Department Supervisor');
    final chosen = <int>{};
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Extra Hours draft'),
          content: SizedBox(
            width: 460,
            child: ListView(
              shrinkWrap: true,
              children: [
                const Text('Save the draft, show the letter for wet signatures, then attach the signed scan.'),
                TextField(controller: duty, decoration: const InputDecoration(labelText: 'Duty description'), maxLines: 3),
                TextField(controller: label, decoration: const InputDecoration(labelText: 'Period label')),
                TextField(controller: start, decoration: const InputDecoration(labelText: 'Start')),
                TextField(controller: end, decoration: const InputDecoration(labelText: 'End')),
                TextField(controller: title, decoration: const InputDecoration(labelText: 'Your title')),
                for (final student in students)
                  CheckboxListTile(
                    value: chosen.contains(numOf(student['id']).toInt()),
                    title: Text(textOf(student['name'])),
                    onChanged: (value) => setLocal(() {
                      final id = numOf(student['id']).toInt();
                      if (value == true) {
                        chosen.add(id);
                      } else {
                        chosen.remove(id);
                      }
                    }),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save draft')),
          ],
        ),
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => api.post('/extra-hours', {
        'as_draft': true,
        'duty_description': duty.text.trim(),
        'period_label': label.text.trim(),
        'period_start': start.text.trim(),
        'period_end': end.text.trim(),
        'requester_title': title.text.trim(),
        'student_ids': chosen.toList(),
      }), success: 'Draft saved. Collect wet signatures on the letter.');
      if (context.mounted) {
        await Navigator.push(context, MaterialPageRoute(builder: (_) => LetterPreviewScreen(
          heading: 'Extra Hours permission',
          lines: [
            'Period: ${label.text.trim()} (${start.text.trim()} to ${end.text.trim()})',
            'Duty: ${duty.text.trim()}',
            'Students: ${students.where((student) => chosen.contains(numOf(student['id']).toInt())).map((student) => textOf(student['name'])).join(', ')}',
            'Requested weekly cap: ${numOf(meta['weekly_extended']).toStringAsFixed(0)} hours. Monthly maximum stays ${numOf(meta['monthly_max']).toStringAsFixed(0)}.',
            'Endorsed: ${textOf(signs['coordinator'], 'WSPO Coordinator')}',
            'Noted: EXEQUIEL A. CALIMUTAN, MAT, OIC, VP-Administration',
            'Noted: PHOEBE F. SANTIAGO, LPT, MAEd, RGC, Director, Guidance & Counselling Center',
            'Recommending approval: ESTHER S. ARCEÑO, CPA, MPA, VP-Finance',
            'Approved: GEORGE O. CORTEL, MBA, Ph.D., University President',
          ],
        )));
        await reload();
      }
    }
    duty.dispose();
    label.dispose();
    start.dispose();
    end.dispose();
    title.dispose();
  }

  Future<void> _finalize(BuildContext context, dynamic api, Future<void> Function() reload, Map<String, dynamic> row) async {
    final letter = await _letterFile();
    if (letter == null || !context.mounted) return;
    await runAction(
      context,
      () => api.upload('/extra-hours/${row['id']}/finalize', fields: {
        'duty_description': textOf(row['duty_description'], ''),
        'period_label': textOf(row['period_label'], ''),
        'period_start': textOf(row['period_start'], ''),
        'period_end': textOf(row['period_end'], ''),
        'requester_title': textOf(row['requester_title'], ''),
        for (var i = 0; i < asMaps(row['students']).length; i++) 'student_ids[$i]': '${asMaps(row['students'])[i]['id']}',
      }, files: [letter]),
      success: 'Signed letter sent to WSPO.',
      reload: reload,
    );
  }
}

class LetterPreviewScreen extends StatelessWidget {
  const LetterPreviewScreen({super.key, required this.heading, required this.lines});
  final String heading;
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Letter preview')),
      body: PageBody(
        children: [
          const Text('FILAMER CHRISTIAN UNIVERSITY, INC.', style: TextStyle(fontWeight: FontWeight.w800)),
          const Text('WORK STUDY PROGRAM OFFICE'),
          const Text('Roxas Avenue, Roxas City, Capiz, Philippines 5800'),
          const SizedBox(height: 16),
          Text(heading, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          const Text('Show this letter for wet signatures, then attach a photo of the signed copy.'),
          const SizedBox(height: 12),
          for (final line in lines) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(line, style: const TextStyle(height: 1.4))),
          const SizedBox(height: 24),
          const Text('Signature lines stay blank until they are signed by hand.'),
        ],
      ),
    );
  }
}

class ExtraServiceSheet extends StatefulWidget {
  const ExtraServiceSheet({super.key});

  @override
  State<ExtraServiceSheet> createState() => _ExtraServiceSheetState();
}

class _ExtraServiceSheetState extends State<ExtraServiceSheet> {
  final _event = TextEditingController();
  final _start = TextEditingController();
  final _end = TextEditingController();
  final _hours = TextEditingController(text: '4');
  final _reason = TextEditingController();
  int _quantity = 1;
  final _genders = <String>['Male'];
  int? _draftId;
  String _coordinator = '';

  @override
  void initState() {
    super.initState();
    final today = DateTime.now().toIso8601String().split('T').first;
    _start.text = today;
    _end.text = today;
    context.read<AuthProvider>().api.get('/staffing-requests/signatories').then((data) {
      if (mounted) setState(() => _coordinator = textOf(asMap(data)['coordinator'], ''));
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _event.dispose();
    _start.dispose();
    _end.dispose();
    _hours.dispose();
    _reason.dispose();
    super.dispose();
  }

  Map<String, dynamic> get _body => {
        'duty_type': 'Request',
        'event_title': _event.text.trim(),
        'duty_period': '${_start.text.trim()} to ${_end.text.trim()}',
        'duty_start_date': _start.text.trim(),
        'duty_end_date': _end.text.trim(),
        'hours_per_day': num.tryParse(_hours.text) ?? 4,
        'reason': _reason.text.trim(),
        'duty_request': _reason.text.trim(),
        'quantity': _quantity,
        'requested_genders': _genders,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Extra Service letter')),
      body: PageBody(
        children: [
          const Text('Save a draft, collect wet signatures from the supervisor, WSPO Coordinator, Guidance Committee Chair, VP-Administration, VP-Finance, and the University President, then attach the signed scan.'),
          TextField(controller: _event, decoration: const InputDecoration(labelText: 'Event title')),
          TextField(controller: _start, decoration: const InputDecoration(labelText: 'Duty start')),
          TextField(controller: _end, decoration: const InputDecoration(labelText: 'Duty end')),
          TextField(controller: _hours, decoration: const InputDecoration(labelText: 'Hours per day'), keyboardType: TextInputType.number),
          TextField(controller: _reason, decoration: const InputDecoration(labelText: 'Reason'), maxLines: 3),
          DropdownButtonFormField<int>(
            initialValue: _quantity,
            items: List.generate(5, (index) => index + 1).map((item) => DropdownMenuItem(value: item, child: Text('$item students'))).toList(),
            onChanged: (value) => setState(() {
              _quantity = value ?? _quantity;
              while (_genders.length < _quantity) {
                _genders.add('Male');
              }
              while (_genders.length > _quantity) {
                _genders.removeLast();
              }
            }),
          ),
          for (var i = 0; i < _genders.length; i++)
            DropdownButtonFormField<String>(
              initialValue: _genders[i],
              decoration: InputDecoration(labelText: 'Student ${i + 1}'),
              items: const ['Male', 'Female'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
              onChanged: (value) => setState(() => _genders[i] = value ?? _genders[i]),
            ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _saveDraft, child: const Text('Save and preview letter')),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: _draftId == null ? null : _attach, child: const Text('Attach signed scan and send')),
        ],
      ),
    );
  }

  Future<void> _saveDraft() async {
    final api = context.read<AuthProvider>().api;
    final fields = {
      'duty_type': 'Request',
      'as_draft': '1',
      'event_title': _event.text.trim(),
      'duty_period': '${_start.text.trim()} to ${_end.text.trim()}',
      'duty_start_date': _start.text.trim(),
      'duty_end_date': _end.text.trim(),
      'hours_per_day': _hours.text.trim(),
      'reason': _reason.text.trim(),
      'duty_request': _reason.text.trim(),
      'quantity': '$_quantity',
      for (var i = 0; i < _genders.length; i++) 'requested_genders[$i]': _genders[i],
    };
    await runAction(context, () async {
      final data = _draftId == null
          ? await api.upload('/staffing-requests', fields: fields)
          : await api.patch('/staffing-requests/$_draftId/draft', _body);
      final id = numOf(asMap(asMap(data)['request'])['id']).toInt();
      if (id > 0) _draftId = id;
    }, success: 'Draft saved.');
    if (!mounted) return;
    await Navigator.push(context, MaterialPageRoute(builder: (_) => LetterPreviewScreen(
      heading: 'WSA Extra Service Request · FCU-EOMS-WP-001-F',
      lines: [
        'Event: ${_event.text.trim()}',
        'Duty period: ${_start.text.trim()} to ${_end.text.trim()} · ${_hours.text.trim()} hours/day',
        'Students requested: $_quantity (${_genders.join(', ')})',
        'Reason: ${_reason.text.trim()}',
        'Noted: ${_coordinator.isEmpty ? 'WSPO Coordinator' : _coordinator}',
        'Committee Chair: PHOEBE F. SANTIAGO, LPT, MAEd, RGC',
        'Recommended: EXEQUIEL A. CALIMUTAN, MAT · ESTHER S. ARCEÑO, CPA, MPA',
        'Approved: GEORGE O. CORTEL, MBA, Ph.D., University President',
      ],
    )));
  }

  Future<void> _attach() async {
    final letter = await _letterFile();
    if (letter == null || !mounted || _draftId == null) return;
    final api = context.read<AuthProvider>().api;
    await runAction(context, () => api.upload('/staffing-requests/$_draftId/finalize', fields: {
      'event_title': _event.text.trim(),
      'duty_period': '${_start.text.trim()} to ${_end.text.trim()}',
      'duty_start_date': _start.text.trim(),
      'duty_end_date': _end.text.trim(),
      'hours_per_day': _hours.text.trim(),
      'reason': _reason.text.trim(),
      'quantity': '$_quantity',
      for (var i = 0; i < _genders.length; i++) 'requested_genders[$i]': _genders[i],
    }, files: [letter]), success: 'Extra Service request sent to WSPO.');
  }
}

Future<http.MultipartFile?> _letterFile() async {
  final picked = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png']);
  final path = picked?.path;
  if (path == null) return null;
  return http.MultipartFile.fromPath('approval_letter', path);
}

class ForceClockOutScreen extends StatefulWidget {
  const ForceClockOutScreen({super.key});

  @override
  State<ForceClockOutScreen> createState() => _ForceClockOutScreenState();
}

class _ForceClockOutScreenState extends State<ForceClockOutScreen> {
  final _selected = <int>{};

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return Scaffold(
      appBar: AppBar(title: const Text('Force clock-out')),
      body: FetchView(
        loader: () => api.get('/admin/open-sessions'),
        builder: (context, data, reload) {
          final sessions = asMaps(asMap(data)['sessions']);
          return PageBody(
            onRefresh: reload,
            children: [
              const Text('Close forgotten open regular, janitorial, and activity sessions. This is the Super Admin write exception.'),
              FilledButton(
                onPressed: () async {
                  if (!await confirm(context, 'Clock out every open session?')) return;
                  if (!context.mounted) return;
                  await runAction(context, () => api.post('/admin/force-clock-out', {'mode': 'bulk'}), success: 'Open sessions closed.', reload: reload);
                  setState(() => _selected.clear());
                },
                child: const Text('Clock out everyone'),
              ),
              OutlinedButton(
                onPressed: _selected.isEmpty
                    ? null
                    : () => runAction(context, () => api.post('/admin/force-clock-out', {'mode': 'selected', 'attendance_ids': _selected.toList()}), success: 'Selected sessions closed.', reload: () async {
                          setState(() => _selected.clear());
                          await reload();
                        }),
                child: Text('Clock out selected (${_selected.length})'),
              ),
              if (sessions.isEmpty) const EmptyNote('No open sessions.'),
              for (final row in sessions)
                CheckboxListTile(
                  value: _selected.contains(numOf(row['id']).toInt()),
                  title: Text(textOf(row['student_name'])),
                  subtitle: Text('${textOf(row['session_kind'])} · ${textOf(row['office'])} · in ${whenOf(row['time_in'])}'),
                  onChanged: (value) => setState(() {
                    final id = numOf(row['id']).toInt();
                    if (value == true) {
                      _selected.add(id);
                    } else {
                      _selected.remove(id);
                    }
                  }),
                ),
            ],
          );
        },
      ),
    );
  }
}

class OrganizationCalendar extends StatefulWidget {
  const OrganizationCalendar({super.key});

  @override
  State<OrganizationCalendar> createState() => _OrganizationCalendarState();
}

class _OrganizationCalendarState extends State<OrganizationCalendar> {
  Map<String, dynamic> _payload = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = asMap(await context.read<AuthProvider>().api.get('/organization-schedules'));
      if (mounted) setState(() {
        _payload = data;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = asMaps(_payload['schedules']);
    final semester = asMap(_payload['semester']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle('Organization calendar'),
        if (_loading) const LinearProgressIndicator(),
        Text(semester.isEmpty ? 'No semester is set.' : '${textOf(semester['label'])} · ${textOf(semester['starts_on'])} to ${textOf(semester['ends_on'])}'),
        if (!_loading && rows.isEmpty) const EmptyNote('No work or class blocks in this view.'),
        for (final row in rows.take(40))
          RecordCard(
            title: '${textOf(row['student_name'])} · ${textOf(row['day'])}',
            subtitle: '${textOf(row['time'])} · ${textOf(row['kind'])} · ${textOf(row['assignment_label'] ?? row['department'])}',
            trailing: textOf(row['duty_type'] ?? row['subject'], ''),
          ),
        if (rows.length > 40) Text('Showing 40 of ${rows.length} blocks.'),
      ],
    );
  }
}

class SemesterEditor extends StatefulWidget {
  const SemesterEditor({super.key});

  @override
  State<SemesterEditor> createState() => _SemesterEditorState();
}

class _SemesterEditorState extends State<SemesterEditor> {
  final _label = TextEditingController();
  final _start = TextEditingController();
  final _end = TextEditingController();
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = asMap(await context.read<AuthProvider>().api.get('/semester'));
    final term = asMap(data['semester']);
    _label.text = textOf(term['label'], '');
    _start.text = textOf(term['starts_on'], '');
    _end.text = textOf(term['ends_on'], '');
    if (mounted) setState(() => _ready = true);
  }

  @override
  void dispose() {
    _label.dispose();
    _start.dispose();
    _end.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator());
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle('Semester'),
        TextField(controller: _label, decoration: const InputDecoration(labelText: 'Label, such as 1st Semester')),
        TextField(controller: _start, decoration: const InputDecoration(labelText: 'Starts on')),
        TextField(controller: _end, decoration: const InputDecoration(labelText: 'Ends on')),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: () => runAction(context, () => context.read<AuthProvider>().api.put('/semester', {
            'label': _label.text.trim(),
            'starts_on': _start.text.trim(),
            'ends_on': _end.text.trim(),
          }), success: 'Semester saved.'),
          child: const Text('Save semester'),
        ),
      ],
    );
  }
}

