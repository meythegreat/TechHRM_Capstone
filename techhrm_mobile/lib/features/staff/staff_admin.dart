import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/json_util.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';

class ComplianceScreen extends StatelessWidget {
  const ComplianceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final api = auth.api;
    return DefaultTabController(
      length: 3,
      child: Column(children: [
        const TabBar(tabs: [Tab(text: 'Cases'), Tab(text: 'Performance'), Tab(text: 'Awards')]),
        Expanded(
          child: TabBarView(children: [
            FetchView(
              loader: () async {
                final records = await api.get('/disciplinary');
                final catalog = await api.get('/disciplinary/catalog');
                dynamic people = [];
                try {
                  people = await api.get('/personnel');
                } catch (_) {}
                return {'records': records, 'catalog': catalog, 'people': people};
              },
              builder: (context, data, reload) {
                final payload = asMap(data);
                final records = asMaps(payload['records']);
                final catalog = asMap(payload['catalog']);
                final people = asMaps(payload['people']);
                final offenses = <String>[
                  ...asMaps(catalog['minor']).map((item) => textOf(item['name'] ?? item)),
                  ...(catalog['minor'] is List ? (catalog['minor'] as List).map((item) => item is Map ? textOf(item['name']) : item.toString()) : <String>[]),
                  ...(catalog['major'] is List ? (catalog['major'] as List).map((item) => item is Map ? textOf(item['name']) : item.toString()) : <String>[]),
                ].where((item) => item != '—').toSet().toList();
                return PageBody(
                  onRefresh: reload,
                  children: [
                    FilledButton(onPressed: () => _logCase(context, people, offenses, reload), child: const Text('Log infraction')),
                    if (records.isEmpty) const EmptyNote('No disciplinary records.'),
                    for (final row in records)
                      RecordCard(
                        title: '${personName(row, 'student')} · ${textOf(row['violation_type'])}',
                        subtitle: textOf(row['description']),
                        trailing: textOf(row['status']),
                        children: [
                          Text('Penalty: ${textOf(row['penalty'])}'),
                          if (auth.userRole == 'WSPO Staff' && row['status'] != 'Resolved' && row['status'] != 'Dismissed')
                            TextButton(onPressed: () => _decide(context, row, reload), child: const Text('Decide')),
                        ],
                      ),
                  ],
                );
              },
            ),
            FetchView(
              loader: () => api.get('/disciplinary/performance'),
              builder: (context, data, reload) {
                final rows = asMaps(data);
                return PageBody(
                  onRefresh: reload,
                  children: [
                    FilledButton(onPressed: () => _review(context, reload), child: const Text('Record performance')),
                    if (rows.isEmpty) const EmptyNote('No performance reviews.'),
                    for (final row in rows)
                      RecordCard(title: personName(row, 'student'), subtitle: '${textOf(row['school_year'])} · ${textOf(row['rating'])}', trailing: textOf(row['target_department'], '')),
                  ],
                );
              },
            ),
            FetchView(
              loader: () => api.get('/disciplinary/awards'),
              builder: (context, data, reload) {
                final rows = asMaps(data);
                return PageBody(
                  onRefresh: reload,
                  children: [
                    if (auth.userRole == 'WSPO Staff') FilledButton(onPressed: () => _award(context, reload), child: const Text('Record award')),
                    if (rows.isEmpty) const EmptyNote('No awards.'),
                    for (final row in rows)
                      RecordCard(title: personName(row, 'student'), subtitle: textOf(row['title'] ?? row['citation']), trailing: textOf(row['school_year'])),
                  ],
                );
              },
            ),
          ]),
        ),
      ]),
    );
  }

  Future<List<Map<String, dynamic>>> _people(BuildContext context) async {
    final data = await context.read<AuthProvider>().api.get('/personnel');
    return asMaps(data);
  }

  Future<void> _logCase(BuildContext context, List<Map<String, dynamic>> people, List<String> offenses, Future<void> Function() reload) async {
    if (people.isEmpty || offenses.isEmpty) {
      toast(context, 'Students and the offense catalog are required before logging a case.', error: true);
      return;
    }
    var studentId = people.first['id'].toString();
    var offense = offenses.first;
    final description = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Log infraction'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(initialValue: studentId, items: people.map((person) => DropdownMenuItem(value: person['id'].toString(), child: Text(textOf(person['name'])))).toList(), onChanged: (value) => studentId = value ?? studentId),
            DropdownButtonFormField<String>(initialValue: offense, items: offenses.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(), onChanged: (value) => offense = value ?? offense),
            TextField(controller: description, decoration: const InputDecoration(labelText: 'Description'), maxLines: 3),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
        ],
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => context.read<AuthProvider>().api.post('/disciplinary', {
        'student_id': int.parse(studentId),
        'violation_type': offense,
        'description': description.text.trim(),
      }), success: 'Infraction logged.', reload: reload);
    }
    description.dispose();
  }

  Future<void> _decide(BuildContext context, Map<String, dynamic> row, Future<void> Function() reload) async {
    var penalty = 'DTR Deduction';
    final hours = TextEditingController(text: '1');
    final remarks = TextEditingController();
    final reason = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Decide case'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              initialValue: penalty,
              items: const ['DTR Deduction', 'Suspension', 'Dismissed'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
              onChanged: (value) => setLocal(() => penalty = value ?? penalty),
            ),
            if (penalty == 'DTR Deduction') TextField(controller: hours, decoration: const InputDecoration(labelText: 'Deduction hours'), keyboardType: TextInputType.number),
            if (penalty == 'Suspension') TextField(controller: reason, decoration: const InputDecoration(labelText: 'Suspension reason')),
            TextField(controller: remarks, decoration: const InputDecoration(labelText: 'Remarks')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (saved == true && context.mounted) {
      final body = <String, dynamic>{'penalty': penalty, 'resolution_remarks': remarks.text.trim()};
      if (penalty == 'DTR Deduction') body['penalty_hours'] = num.tryParse(hours.text) ?? 1;
      if (penalty == 'Suspension') {
        body['suspension_span'] = 'days';
        body['suspension_days'] = 3;
        body['suspension_reason'] = reason.text.trim();
      }
      await runAction(context, () => context.read<AuthProvider>().api.post('/disciplinary/${row['id']}/decide', body), success: 'Decision saved.', reload: reload);
    }
    hours.dispose();
    remarks.dispose();
    reason.dispose();
  }

  Future<void> _review(BuildContext context, Future<void> Function() reload) async {
    final people = await _people(context);
    if (!context.mounted || people.isEmpty) return;
    var studentId = people.first['id'].toString();
    var rating = 'ok';
    final year = TextEditingController(text: '${DateTime.now().year - 1}-${DateTime.now().year}');
    final office = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Performance review'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          DropdownButtonFormField<String>(initialValue: studentId, items: people.map((person) => DropdownMenuItem(value: person['id'].toString(), child: Text(textOf(person['name'])))).toList(), onChanged: (value) => studentId = value ?? studentId),
          TextField(controller: year, decoration: const InputDecoration(labelText: 'School year (YYYY-YYYY)')),
          DropdownButtonFormField<String>(initialValue: rating, items: const [
            DropdownMenuItem(value: 'ok', child: Text('Ok performance')),
            DropdownMenuItem(value: 'needs_training', child: Text('Needs training')),
            DropdownMenuItem(value: 'bad', child: Text('Bad performance')),
          ], onChanged: (value) => rating = value ?? rating),
          TextField(controller: office, decoration: const InputDecoration(labelText: 'Reassign to office (required if bad)')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
        ],
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => context.read<AuthProvider>().api.post('/disciplinary/performance', {
        'student_id': int.parse(studentId),
        'school_year': year.text.trim(),
        'rating': rating,
        if (rating == 'bad') 'target_department': office.text.trim(),
      }), success: 'Review saved.', reload: reload);
    }
    year.dispose();
    office.dispose();
  }

  Future<void> _award(BuildContext context, Future<void> Function() reload) async {
    final people = await _people(context);
    if (!context.mounted || people.isEmpty) return;
    var studentId = people.first['id'].toString();
    final year = TextEditingController(text: '${DateTime.now().year - 1}-${DateTime.now().year}');
    final title = TextEditingController(text: 'Year-end award');
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Record award'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          DropdownButtonFormField<String>(initialValue: studentId, items: people.map((person) => DropdownMenuItem(value: person['id'].toString(), child: Text(textOf(person['name'])))).toList(), onChanged: (value) => studentId = value ?? studentId),
          TextField(controller: year, decoration: const InputDecoration(labelText: 'School year')),
          TextField(controller: title, decoration: const InputDecoration(labelText: 'Title')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
        ],
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => context.read<AuthProvider>().api.post('/disciplinary/awards', {
        'student_id': int.parse(studentId),
        'school_year': year.text.trim(),
        'title': title.text.trim(),
      }), success: 'Award recorded.', reload: reload);
    }
    year.dispose();
    title.dispose();
  }
}

class DocumentReviewScreen extends StatelessWidget {
  const DocumentReviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () => api.get('/requirements'),
      builder: (context, data, reload) {
        final rows = asMaps(data);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Document review'),
            if (rows.isEmpty) const EmptyNote('No documents to review.'),
            for (final row in rows)
              RecordCard(
                title: '${personName(row)} · ${textOf(row['document_type'])}',
                subtitle: textOf(row['remarks'], 'No remarks'),
                trailing: textOf(row['status']),
                children: [
                  Row(children: [
                    TextButton(onPressed: () => runAction(context, () => api.patch('/requirements/${row['id']}/status', {'status': 'verified'}), success: 'Verified.', reload: reload), child: const Text('Verify')),
                    TextButton(
                      onPressed: () async {
                        final remarks = await promptText(context, 'Rejection remarks', label: 'Remarks', required: false);
                        if (remarks == null || !context.mounted) return;
                        await runAction(context, () => api.patch('/requirements/${row['id']}/status', {'status': 'rejected', 'remarks': remarks}), success: 'Rejected.', reload: reload);
                      },
                      child: const Text('Reject'),
                    ),
                  ]),
                ],
              ),
          ],
        );
      },
    );
  }
}

class ApplicationsScreen extends StatelessWidget {
  const ApplicationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () => api.get('/applications'),
      builder: (context, data, reload) {
        final payload = asMap(data);
        final active = asMaps(payload['data'] ?? data);
        final archive = asMaps(payload['archive']);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Applications'),
            if (active.isEmpty) const EmptyNote('No active applications.'),
            for (final app in active) _card(context, app, reload, archived: false),
            const SectionTitle('Archive'),
            for (final app in archive) _card(context, app, reload, archived: true),
          ],
        );
      },
    );
  }

  Widget _card(BuildContext context, Map<String, dynamic> app, Future<void> Function() reload, {required bool archived}) {
    final api = context.read<AuthProvider>().api;
    final name = [app['first_name'], app['last_name']].where((part) => part != null && '$part'.isNotEmpty).join(' ');
    return RecordCard(
      title: name.isEmpty ? textOf(app['email']) : name,
      subtitle: '${textOf(app['email'])} · ${textOf(app['preferred_department'], 'No preference')}',
      trailing: textOf(app['status']),
      children: [
        if (!archived)
          Wrap(children: [
            for (final status in ['Interview', 'Training', 'For Result', 'Approved'])
              TextButton(onPressed: () => runAction(context, () => api.put('/applications/${app['id']}/status', {'status': status}), success: 'Moved to $status.', reload: reload), child: Text(status)),
            TextButton(
              onPressed: () async {
                final reason = await promptText(context, 'Reject application', label: 'Reason');
                if (reason == null || !context.mounted) return;
                await runAction(context, () => api.put('/applications/${app['id']}/status', {'status': 'Rejected', 'rejection_reason': reason}), success: 'Application rejected.', reload: reload);
              },
              child: const Text('Reject'),
            ),
            TextButton(
              onPressed: () async {
                final when = await showDatePicker(context: context, firstDate: DateTime.now().subtract(const Duration(days: 1)), lastDate: DateTime.now().add(const Duration(days: 365)), initialDate: DateTime.now());
                if (when == null || !context.mounted) return;
                await runAction(context, () => api.put('/applications/${app['id']}/schedule', {'interview_date': when.toIso8601String()}), success: 'Interview scheduled.', reload: reload);
              },
              child: const Text('Schedule interview'),
            ),
            TextButton(onPressed: () => _place(context, app, reload), child: const Text('Place')),
          ]),
      ],
    );
  }

  Future<void> _place(BuildContext context, Map<String, dynamic> app, Future<void> Function() reload) async {
    final offices = asMaps(await context.read<AuthProvider>().api.get('/offices'));
    if (!context.mounted || offices.isEmpty) return;
    var office = textOf(offices.first['name']);
    var duty = 'Clerical';
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Assign placement'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          DropdownButtonFormField<String>(initialValue: office, items: offices.map((item) => DropdownMenuItem(value: textOf(item['name']), child: Text(textOf(item['name'])))).toList(), onChanged: (value) => office = value ?? office),
          DropdownButtonFormField<String>(initialValue: duty, items: const ['Clerical', 'Janitorial', 'Request'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(), onChanged: (value) => duty = value ?? duty),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Assign')),
        ],
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => context.read<AuthProvider>().api.put('/applications/${app['id']}/placement', {
        'assigned_department': office,
        'duty_type': duty,
        'first_name': app['first_name'],
        'middle_name': app['middle_name'],
        'last_name': app['last_name'],
        'email': app['email'],
        'age': app['age'],
        'gender': app['gender'],
        'address': app['address'],
      }), success: 'Placement saved.', reload: reload);
    }
  }
}

class AuditLogsScreen extends StatefulWidget {
  const AuditLogsScreen({super.key});

  @override
  State<AuditLogsScreen> createState() => _AuditLogsScreenState();
}

class _AuditLogsScreenState extends State<AuditLogsScreen> {
  String _category = 'all';
  final _name = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      key: ValueKey('$_category|${_name.text}'),
      loader: () => api.get('/logs', {'category': _category, 'name': _name.text.trim(), 'page': '1'}),
      builder: (context, data, reload) {
        final logs = asMaps(data);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Audit trail'),
            TextField(
              controller: _name,
              decoration: InputDecoration(labelText: 'Filter by name', suffixIcon: IconButton(onPressed: () => setState(() {}), icon: const Icon(Icons.search))),
              onSubmitted: (_) => setState(() {}),
            ),
            DropdownButtonFormField<String>(
              initialValue: _category,
              items: const ['all', 'session', 'attendance', 'documents', 'schedules', 'accounts'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
              onChanged: (value) => setState(() => _category = value ?? _category),
            ),
            if (logs.isEmpty) const EmptyNote('No log entries.'),
            for (final log in logs)
              RecordCard(title: '${textOf(log['admin_name'] ?? (log['admin'] is Map ? log['admin']['name'] : null))} · ${textOf(log['action'])}', subtitle: textOf(log['description']), trailing: whenOf(log['created_at'])),
          ],
        );
      },
    );
  }
}

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      key: ValueKey(_search.text),
      loader: () => api.get('/users', {'search': _search.text.trim(), 'page': '1'}),
      builder: (context, data, reload) {
        final users = asMaps(data);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('User management'),
            TextField(controller: _search, decoration: InputDecoration(labelText: 'Search', suffixIcon: IconButton(onPressed: () => setState(() {}), icon: const Icon(Icons.search))), onSubmitted: (_) => setState(() {})),
            FilledButton(onPressed: () => _create(context, reload), child: const Text('Add user')),
            if (users.isEmpty) const EmptyNote('No users match.'),
            for (final user in users)
              RecordCard(
                title: textOf(user['name']),
                subtitle: '${textOf(user['role'])} · ${textOf(user['email'])}',
                trailing: textOf(user['username']),
                children: [
                  TextButton(
                    onPressed: () async {
                      if (!await confirm(context, 'Delete ${user['name']}?')) return;
                      if (!context.mounted) return;
                      await runAction(context, () => api.delete('/users/${user['id']}'), success: 'User removed.', reload: reload);
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

  Future<void> _create(BuildContext context, Future<void> Function() reload) async {
    final name = TextEditingController();
    final username = TextEditingController();
    final email = TextEditingController();
    final password = TextEditingController();
    final phone = TextEditingController();
    final studentId = TextEditingController();
    final course = TextEditingController();
    final office = TextEditingController();
    final year = TextEditingController(text: '1');
    var role = 'Student';
    var gender = 'Male';
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Add user'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
              TextField(controller: username, decoration: const InputDecoration(labelText: 'Username')),
              TextField(controller: email, decoration: const InputDecoration(labelText: 'Email')),
              TextField(controller: password, decoration: const InputDecoration(labelText: 'Temporary password')),
              DropdownButtonFormField<String>(
                initialValue: role,
                items: const ['Student', 'Supervisor', 'WSPO Staff'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                onChanged: (value) => setLocal(() => role = value ?? role),
              ),
              if (role == 'Student' || role == 'Supervisor') ...[
                TextField(controller: phone, decoration: const InputDecoration(labelText: 'Phone')),
                TextField(controller: office, decoration: const InputDecoration(labelText: 'Assigned office')),
              ],
              if (role == 'Student') ...[
                DropdownButtonFormField<String>(initialValue: gender, items: const ['Male', 'Female'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(), onChanged: (value) => setLocal(() => gender = value ?? gender)),
                TextField(controller: studentId, decoration: const InputDecoration(labelText: 'Student ID')),
                TextField(controller: course, decoration: const InputDecoration(labelText: 'Course')),
                TextField(controller: year, decoration: const InputDecoration(labelText: 'Year level (1-4)')),
              ],
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Create')),
          ],
        ),
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => context.read<AuthProvider>().api.post('/users', {
        'name': name.text.trim(),
        'username': username.text.trim(),
        'email': email.text.trim(),
        'password': password.text,
        'role': role,
        if (role != 'WSPO Staff') 'phone_number': phone.text.trim(),
        if (role != 'WSPO Staff') 'assigned_office': office.text.trim(),
        if (role == 'Student') ...{
          'gender': gender,
          'student_id_number': studentId.text.trim(),
          'course': course.text.trim(),
          'year_level': int.tryParse(year.text.trim()) ?? 1,
        },
      }), success: 'User created.', reload: reload);
    }
    name.dispose();
    username.dispose();
    email.dispose();
    password.dispose();
    phone.dispose();
    studentId.dispose();
    course.dispose();
    office.dispose();
    year.dispose();
  }
}

class OfficesScreen extends StatelessWidget {
  const OfficesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final api = auth.api;
    final canEdit = auth.userRole == 'Super Admin';
    return FetchView(
      loader: () => api.get('/offices'),
      builder: (context, data, reload) {
        final offices = asMaps(data);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Offices'),
            if (canEdit)
              FilledButton(
                onPressed: () async {
                  final name = await promptText(context, 'New office', label: 'Name');
                  if (name == null || !context.mounted) return;
                  await runAction(context, () => api.post('/offices', {'name': name}), success: 'Office added.', reload: reload);
                },
                child: const Text('Add office'),
              ),
            if (offices.isEmpty) const EmptyNote('No offices.'),
            for (final office in offices)
              RecordCard(
                title: textOf(office['name']),
                subtitle: '${office['student_count'] ?? 0} students · ${office['supervisor_count'] ?? 0} supervisors',
                children: [
                  TextButton(onPressed: () => _breakdown(context, office), child: const Text('Breakdown')),
                  if (canEdit)
                    TextButton(
                      onPressed: () async {
                        if (!await confirm(context, 'Delete ${office['name']}?')) return;
                        if (!context.mounted) return;
                        await runAction(context, () => api.delete('/offices/${office['id']}'), success: 'Office deleted.', reload: reload);
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

  Future<void> _breakdown(BuildContext context, Map<String, dynamic> office) async {
    final data = await context.read<AuthProvider>().api.get('/offices/${office['id']}/breakdown');
    if (!context.mounted) return;
    final payload = asMap(data);
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(textOf(office['name'])),
        content: SingleChildScrollView(child: Text(payload.isEmpty ? textOf(data) : payload.entries.map((entry) => '${entry.key}: ${entry.value}').join('\n'))),
        actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
      ),
    );
  }
}

class AnalyticsScreen extends StatelessWidget {
  const AnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () => api.get('/analytics/dashboard'),
      builder: (context, data, reload) {
        final payload = asMap(data);
        final summary = asMap(payload['summary']);
        final workload = asMaps(payload['department_workload']);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Reports and analytics'),
            Row(children: [
              StatCard(label: 'Students', value: '${summary['total_students'] ?? 0}', icon: Icons.school),
              const SizedBox(width: 10),
              StatCard(label: 'Pending apps', value: '${summary['pending_applications'] ?? 0}', icon: Icons.pending_actions, color: Colors.orange.shade800),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              StatCard(label: 'Hours', value: numOf(summary['total_hours_rendered']).toStringAsFixed(1), icon: Icons.timer),
              const SizedBox(width: 10),
              StatCard(label: 'Anomalies', value: '${summary['active_anomalies'] ?? 0}', icon: Icons.warning_amber, color: Colors.red.shade700),
            ]),
            const SizedBox(height: 8),
            Text('Active penalties: ${summary['active_penalties'] ?? 0}'),
            const SectionTitle('Hours by office'),
            for (final row in workload)
              RecordCard(title: textOf(row['department']), trailing: numOf(row['total_hours']).toStringAsFixed(2)),
            OutlinedButton(
              onPressed: () async {
                try {
                  final csv = await api.get('/analytics/export-attendance');
                  if (!context.mounted) return;
                  await showDialog<void>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Attendance export'),
                      content: SingleChildScrollView(child: Text(csv.toString())),
                      actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
                    ),
                  );
                } catch (error) {
                  if (context.mounted) toast(context, errorText(error), error: true);
                }
              },
              child: const Text('Export attendance CSV'),
            ),
          ],
        );
      },
    );
  }
}

class FinancialScreen extends StatelessWidget {
  const FinancialScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () => api.get('/financial/records'),
      builder: (context, data, reload) {
        final payload = asMap(data);
        final stats = asMap(payload['stats']);
        final records = asMaps(payload['records']);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Hours rendered'),
            Row(children: [
              StatCard(label: 'Equivalent value', value: '₱${numOf(stats['total_equivalent_value']).toStringAsFixed(0)}', icon: Icons.payments, color: Colors.green.shade700),
              const SizedBox(width: 10),
              StatCard(label: 'Drafts', value: '${stats['pending_drafts'] ?? 0}', icon: Icons.edit_note),
            ]),
            const SizedBox(height: 8),
            FilledButton(onPressed: () => _compute(context, reload), child: const Text('Compute a period')),
            if (records.isEmpty) const EmptyNote('No assessment records.'),
            for (final row in records)
              RecordCard(
                title: personName(row, 'student'),
                subtitle: '${whenOf(row['period_start'])} – ${whenOf(row['period_end'])} · ${numOf(row['total_hours_rendered']).toStringAsFixed(2)} hrs',
                trailing: textOf(row['status']),
                children: [
                  Text('Equivalent ₱${numOf(row['equivalent_total_amount']).toStringAsFixed(2)}'),
                  TextButton(
                    onPressed: () async {
                      if (!await confirm(context, 'Cancel this assessment?')) return;
                      if (!context.mounted) return;
                      await runAction(context, () => api.delete('/financial/records/${row['id']}'), success: 'Record cancelled.', reload: reload);
                    },
                    child: const Text('Cancel record'),
                  ),
                ],
              ),
          ],
        );
      },
    );
  }

  Future<void> _compute(BuildContext context, Future<void> Function() reload) async {
    final now = DateTime.now();
    final start = TextEditingController(text: DateTime(now.year, now.month, 1).toIso8601String().split('T').first);
    final end = TextEditingController(text: DateTime(now.year, now.month + 1, 0).toIso8601String().split('T').first);
    final rate = TextEditingController(text: '28');
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Compute period'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: start, decoration: const InputDecoration(labelText: 'Period start (YYYY-MM-DD)')),
          TextField(controller: end, decoration: const InputDecoration(labelText: 'Period end (YYYY-MM-DD)')),
          TextField(controller: rate, decoration: const InputDecoration(labelText: 'Hourly rate'), keyboardType: TextInputType.number),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Compute')),
        ],
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => context.read<AuthProvider>().api.post('/financial/compute-period', {
        'period_start': start.text.trim(),
        'period_end': end.text.trim(),
        'hourly_rate': num.tryParse(rate.text) ?? 28,
      }), success: 'Period computed.', reload: reload);
    }
    start.dispose();
    end.dispose();
    rate.dispose();
  }
}
