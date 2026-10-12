import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/json_util.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';

class StaffDashboardScreen extends StatelessWidget {
  const StaffDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final superAdmin = auth.userRole == 'Super Admin';
    return FetchView(
      loader: () async {
        if (superAdmin) {
          final stats = await auth.api.get('/admin/dashboard-stats');
          final roster = await auth.api.get('/admin/enrolled-roster');
          final active = await auth.api.get('/admin/active-now');
          return {'stats': stats, 'roster': roster, 'active': active};
        }
        final stats = await auth.api.get('/admin/stats');
        final active = await auth.api.get('/admin/active-now');
        return {'stats': stats, 'active': active};
      },
      builder: (context, data, reload) {
        final payload = asMap(data);
        final stats = asMap(payload['stats']);
        final activePayload = asMap(payload['active']);
        final active = asMaps(activePayload['students']);
        final signedIn = asMaps(activePayload['signed_in']);
        final staffOnline = asMaps(activePayload['staff']);
        if (superAdmin) {
          final departments = asMaps(stats['department_stats']);
          final roster = asMaps(payload['roster']);
          return PageBody(
            onRefresh: reload,
            children: [
              Text(auth.userName ?? 'Admin', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
              Text(auth.userRole ?? ''),
              const SizedBox(height: 12),
              Row(children: [
                StatCard(label: 'Students', value: '${stats['total_students'] ?? 0}', icon: Icons.school),
                const SizedBox(width: 10),
                StatCard(label: 'Active now', value: '${stats['active_now'] ?? 0}', icon: Icons.bolt, color: Colors.green.shade700),
              ]),
              const SizedBox(height: 10),
              Row(children: [
                StatCard(label: 'Hours', value: numOf(stats['total_hours']).toStringAsFixed(1), icon: Icons.timer),
                const SizedBox(width: 10),
                StatCard(label: 'Equivalent', value: '₱${numOf(stats['estimated_equivalent_value']).toStringAsFixed(0)}', icon: Icons.payments),
              ]),
              const SizedBox(height: 16),
              const SectionTitle('On duty'),
              if (active.isEmpty) const EmptyNote('Nobody is clocked in.'),
              for (final person in active)
                RecordCard(title: personName(person), subtitle: textOf(person['device'], ''), trailing: whenOf(person['time_in'])),
              const SectionTitle('Signed in'),
              for (final person in signedIn)
                RecordCard(title: textOf(person['name']), subtitle: textOf(person['office']), trailing: textOf(person['device'], '')),
              const SectionTitle('Staff online'),
              for (final person in staffOnline)
                RecordCard(title: textOf(person['name']), subtitle: '${textOf(person['role'])} · ${textOf(person['office'])}'),
              const SectionTitle('Offices'),
              for (final office in departments)
                RecordCard(title: textOf(office['department']), trailing: '${office['student_count'] ?? 0} students'),
              const SectionTitle('Enrolled roster'),
              for (final group in roster) ...[
                Text(textOf(group['office']), style: const TextStyle(fontWeight: FontWeight.w700)),
                for (final student in asMaps(group['students']))
                  RecordCard(title: textOf(student['name']), subtitle: '${textOf(student['course'])} · ${textOf(student['student_id_number'])}'),
              ],
            ],
          );
        }
        final activity = asMaps(stats['recentStudentActivity']);
        final assigned = asMaps(stats['assignedStudents']);
        return PageBody(
          onRefresh: reload,
          children: [
            Text(auth.userName ?? 'Staff', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
            Text('${auth.userRole} · ${auth.userDepartment}'),
            const SizedBox(height: 12),
            Row(children: [
              StatCard(label: 'Students', value: '${stats['activeStudents'] ?? 0}', icon: Icons.people),
              const SizedBox(width: 10),
              StatCard(label: 'Hours this week', value: numOf(stats['totalHoursThisWeek']).toStringAsFixed(1), icon: Icons.timer, color: Colors.green.shade700),
            ]),
            const SizedBox(height: 16),
            const SectionTitle('Currently on duty'),
            if (active.isEmpty) const EmptyNote('Nobody is clocked in.'),
            for (final person in active)
              RecordCard(title: personName(person), subtitle: textOf(person['device'], ''), trailing: whenOf(person['time_in'])),
            for (final person in signedIn)
              RecordCard(title: textOf(person['name']), subtitle: 'Signed in · ${textOf(person['office'])}'),
            const SectionTitle('Recent activity'),
            for (final item in activity)
              RecordCard(title: textOf(item['student_name']), subtitle: '${textOf(item['action'])} ${textOf(item['description'], '')}', trailing: whenOf(item['created_at'])),
            if (assigned.isNotEmpty) const SectionTitle('My team'),
            for (final student in assigned)
              RecordCard(title: textOf(student['name']), subtitle: '${textOf(student['course'])} · ${textOf(student['student_id_number'])}', trailing: textOf(student['year_level'], '')),
          ],
        );
      },
    );
  }
}

class TimesheetsScreen extends StatefulWidget {
  const TimesheetsScreen({super.key});

  @override
  State<TimesheetsScreen> createState() => _TimesheetsScreenState();
}

class _TimesheetsScreenState extends State<TimesheetsScreen> {
  String _date = DateTime.now().toIso8601String().split('T').first;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final api = auth.api;
    final canManageHolidays = auth.userRole == 'WSPO Staff' || auth.userRole == 'Super Admin';
    return FetchView(
      key: ValueKey(_date),
      loader: () async {
        final rows = await api.get('/attendance', {'date': _date});
        final pending = await api.get('/attendance/pending-dates');
        final holidays = canManageHolidays ? await api.get('/holidays') : [];
        dynamic people = [];
        try {
          people = await api.get('/personnel');
        } catch (_) {}
        return {'rows': rows, 'pending': pending, 'holidays': holidays, 'people': people};
      },
      builder: (context, data, reload) {
        final payload = asMap(data);
        final rows = asMaps(payload['rows']);
        final pending = asMaps(payload['pending']);
        final holidays = asMaps(payload['holidays']);
        final people = asMaps(payload['people']);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Timesheets'),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('Date: $_date'),
              trailing: const Icon(Icons.calendar_today),
              onTap: () async {
                final picked = await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime(2100), initialDate: DateTime.tryParse(_date) ?? DateTime.now());
                if (picked != null) setState(() => _date = picked.toIso8601String().split('T').first);
              },
            ),
            if (pending.isNotEmpty) const Text('Dates waiting for a decision', style: TextStyle(fontWeight: FontWeight.w700)),
            Wrap(spacing: 6, children: [
              for (final day in pending)
                ActionChip(label: Text('${day['attendance_date']} (${day['pending_count']})'), onPressed: () => setState(() => _date = textOf(day['attendance_date']))),
            ]),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: () => _manual(context, people, reload), child: const Text('Add manual time')),
            if (rows.isEmpty) const EmptyNote('No attendance for this date.'),
            for (final row in rows)
              RecordCard(
                title: personName(row),
                subtitle: 'In ${whenOf(row['time_in'])} · Out ${whenOf(row['time_out'])}',
                trailing: textOf(row['status']),
                children: [
                  if (row['time_out'] != null && textOf(row['status']).toLowerCase() == 'pending')
                    Row(children: [
                      TextButton(onPressed: () => runAction(context, () => api.patch('/attendance/${row['id']}/approve', {'status': 'accepted'}), success: 'Accepted.', reload: reload), child: const Text('Accept')),
                      TextButton(onPressed: () => runAction(context, () => api.patch('/attendance/${row['id']}/approve', {'status': 'rejected'}), success: 'Rejected.', reload: reload), child: const Text('Reject')),
                    ]),
                  TextButton(
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StudentDtrScreen(studentId: (row['user'] is Map ? row['user']['id'] : row['user_id']).toString(), name: personName(row)))),
                    child: const Text('Open DTR'),
                  ),
                ],
              ),
            if (canManageHolidays) ...[
              const SectionTitle('Holidays'),
              FilledButton(
                onPressed: () async {
                  final name = await promptText(context, 'Holiday name', label: 'Name');
                  if (name == null || !context.mounted) return;
                  final date = await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime(2100), initialDate: DateTime.now());
                  if (date == null || !context.mounted) return;
                  await runAction(context, () => api.post('/holidays', {'name': name, 'date': date.toIso8601String().split('T').first}), success: 'Holiday saved.', reload: reload);
                },
                child: const Text('Add holiday'),
              ),
              for (final holiday in holidays)
                RecordCard(
                  title: textOf(holiday['name']),
                  subtitle: textOf(holiday['date']),
                  children: [
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () async {
                          if (!await confirm(context, 'Remove this holiday?')) return;
                          if (!context.mounted) return;
                          await runAction(context, () => api.delete('/holidays/${holiday['id']}'), success: 'Holiday removed.', reload: reload);
                        },
                        child: const Text('Remove'),
                      ),
                    ),
                  ],
                ),
            ],
          ],
        );
      },
    );
  }

  Future<void> _manual(BuildContext context, List<Map<String, dynamic>> people, Future<void> Function() reload) async {
    if (people.isEmpty) {
      toast(context, 'No students are available for a manual entry.', error: true);
      return;
    }
    var studentId = people.first['id'].toString();
    final note = TextEditingController();
    final timeIn = TextEditingController(text: '08:00');
    final timeOut = TextEditingController(text: '12:00');
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Manual time entry'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              initialValue: studentId,
              items: people.map((person) => DropdownMenuItem(value: person['id'].toString(), child: Text(textOf(person['name'])))).toList(),
              onChanged: (value) => studentId = value ?? studentId,
            ),
            TextField(controller: timeIn, decoration: const InputDecoration(labelText: 'Time in (HH:mm)')),
            TextField(controller: timeOut, decoration: const InputDecoration(labelText: 'Time out (HH:mm)')),
            TextField(controller: note, decoration: const InputDecoration(labelText: 'Task note')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
        ],
      ),
    );
    if (saved != true || !context.mounted) {
      note.dispose();
      timeIn.dispose();
      timeOut.dispose();
      return;
    }
    await runAction(context, () => context.read<AuthProvider>().api.post('/attendance/manual', {
      'user_id': int.parse(studentId),
      'date': _date,
      'time_in': timeIn.text.trim(),
      'time_out': timeOut.text.trim(),
      'task_description': note.text.trim(),
    }), success: 'Manual time saved.', reload: reload);
    note.dispose();
    timeIn.dispose();
    timeOut.dispose();
  }
}

class StudentDtrScreen extends StatelessWidget {
  const StudentDtrScreen({super.key, required this.studentId, required this.name});
  final String studentId;
  final String name;

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return Scaffold(
      appBar: AppBar(title: Text(name), backgroundColor: Colors.white, foregroundColor: kInk, surfaceTintColor: Colors.white),
      body: FetchView(
        loader: () => api.get('/attendance/student/$studentId'),
        builder: (context, data, reload) {
          final payload = asMap(data);
          final history = asMaps(payload['history']);
          return PageBody(
            onRefresh: reload,
            children: [
              Text('Duty deductions: ${numOf(payload['duty_deduction_hours']).toStringAsFixed(2)} hrs'),
              if (history.isEmpty) const EmptyNote('No DTR rows.'),
              for (final row in history)
                RecordCard(
                  title: whenOf(row['time_in']),
                  subtitle: 'Out ${whenOf(row['time_out'])} · ${numOf(row['rendered_hours']).toStringAsFixed(2)} hrs',
                  trailing: textOf(row['status']),
                ),
            ],
          );
        },
      ),
    );
  }
}

class SchedulesScreen extends StatelessWidget {
  const SchedulesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final api = auth.api;
    final audit = auth.userRole == 'Super Admin';
    return FetchView(
      loader: () async {
        final schedules = await api.get('/schedules', audit ? {'audit': '1'} : {'page': '1'});
        final staffing = await api.get('/staffing-requests');
        dynamic people = [];
        try {
          people = await api.get('/personnel');
        } catch (_) {}
        return {'schedules': schedules, 'staffing': staffing, 'people': people};
      },
      builder: (context, data, reload) {
        final payload = asMap(data);
        final shifts = asMaps(payload['schedules']);
        final requests = asMaps(payload['staffing']);
        final people = asMaps(payload['people']);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Schedules'),
            FilledButton(onPressed: () => _assign(context, people, reload), child: const Text('Assign shift')),
            if (auth.userRole == 'Supervisor')
              OutlinedButton(onPressed: () => _requestStaff(context, reload), child: const Text('Request a working student')),
            if (shifts.isEmpty) const EmptyNote('No shifts yet.'),
            for (final shift in shifts)
              RecordCard(
                title: '${personName(shift)} · ${textOf(shift['day'])}',
                subtitle: '${textOf(shift['time'])} · ${textOf(shift['department'])} · ${textOf(shift['duty_type'])}',
                trailing: textOf(shift['edit_request_status'], ''),
                children: [
                  if (textOf(shift['edit_request_note'], '').isNotEmpty) Text(shift['edit_request_note'].toString()),
                  Row(children: [
                    if (textOf(shift['edit_request_status']) == 'pending')
                      TextButton(onPressed: () => runAction(context, () => api.patch('/schedules/${shift['id']}/resolve-request'), success: 'Request cleared.', reload: reload), child: const Text('Clear request')),
                    TextButton(
                      onPressed: () async {
                        if (!await confirm(context, 'Delete this shift?')) return;
                        if (!context.mounted) return;
                        await runAction(context, () => api.delete('/schedules/${shift['id']}'), success: 'Shift deleted.', reload: reload);
                      },
                      child: const Text('Delete'),
                    ),
                  ]),
                ],
              ),
            const SectionTitle('Staffing requests'),
            if (requests.isEmpty) const EmptyNote('No staffing requests.'),
            for (final request in requests)
              RecordCard(
                title: '${textOf(request['duty_type'])} · ${request['quantity'] ?? 1}',
                subtitle: textOf(request['department'] ?? request['office']),
                trailing: textOf(request['status']),
                children: [
                  if (auth.userRole == 'WSPO Staff')
                    Wrap(children: [
                      TextButton(onPressed: () => _fulfill(context, request, people, reload), child: const Text('Fulfill')),
                      TextButton(onPressed: () => runAction(context, () => api.patch('/staffing-requests/${request['id']}', {'status': 'Declined'}), success: 'Request declined.', reload: reload), child: const Text('Decline')),
                    ]),
                ],
              ),
          ],
        );
      },
    );
  }

  Future<void> _assign(BuildContext context, List<Map<String, dynamic>> people, Future<void> Function() reload) async {
    if (people.isEmpty) {
      toast(context, 'No students are available to schedule.', error: true);
      return;
    }
    var studentId = people.first['id'].toString();
    var day = 'Monday';
    var duty = 'Clerical';
    final time = TextEditingController(text: '8:00 AM - 12:00 PM');
    final department = TextEditingController(text: context.read<AuthProvider>().userDepartment ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Assign shift'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              initialValue: studentId,
              items: people.map((person) => DropdownMenuItem(value: person['id'].toString(), child: Text(textOf(person['name'])))).toList(),
              onChanged: (value) => studentId = value ?? studentId,
            ),
            DropdownButtonFormField<String>(
              initialValue: day,
              items: const ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
              onChanged: (value) => day = value ?? day,
            ),
            DropdownButtonFormField<String>(
              initialValue: duty,
              items: const ['Clerical', 'Janitorial', 'Request'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
              onChanged: (value) => duty = value ?? duty,
            ),
            TextField(controller: time, decoration: const InputDecoration(labelText: 'Time, e.g. 8:00 AM - 12:00 PM')),
            TextField(controller: department, decoration: const InputDecoration(labelText: 'Office')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
        ],
      ),
    );
    if (saved == true && context.mounted) {
      final auth = context.read<AuthProvider>();
      await runAction(context, () => auth.api.post('/schedules', {
        'user_id': int.parse(studentId),
        'day': day,
        'time': time.text.trim(),
        'duty_type': duty,
        'department': department.text.trim(),
        'supervisor': auth.userName ?? 'Supervisor',
      }), success: 'Shift assigned.', reload: reload);
    }
    time.dispose();
    department.dispose();
  }

  Future<void> _requestStaff(BuildContext context, Future<void> Function() reload) async {
    var duty = 'Clerical';
    var quantity = 1;
    final genders = <String>['Male'];
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Request students'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              initialValue: duty,
              items: const ['Clerical', 'Janitorial', 'Request'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
              onChanged: (value) => setLocal(() => duty = value ?? duty),
            ),
            DropdownButtonFormField<int>(
              initialValue: quantity,
              items: List.generate(5, (index) => index + 1).map((item) => DropdownMenuItem(value: item, child: Text('$item'))).toList(),
              onChanged: (value) => setLocal(() {
                quantity = value ?? quantity;
                while (genders.length < quantity) {
                  genders.add('Male');
                }
                while (genders.length > quantity) {
                  genders.removeLast();
                }
              }),
            ),
            for (var i = 0; i < genders.length; i++)
              DropdownButtonFormField<String>(
                initialValue: genders[i],
                decoration: InputDecoration(labelText: 'Student ${i + 1}'),
                items: const ['Male', 'Female'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                onChanged: (value) => setLocal(() => genders[i] = value ?? genders[i]),
              ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Send')),
          ],
        ),
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => context.read<AuthProvider>().api.post('/staffing-requests', {
        'duty_type': duty,
        'quantity': quantity,
        'requested_genders': genders,
      }), success: 'Staffing request sent.', reload: reload);
    }
  }

  Future<void> _fulfill(BuildContext context, Map<String, dynamic> request, List<Map<String, dynamic>> people, Future<void> Function() reload) async {
    final needed = int.tryParse('${request['quantity']}') ?? 1;
    final selected = <int>{};
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text('Select $needed student(s)'),
          content: SizedBox(
            width: double.maxFinite,
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final person in people)
                  CheckboxListTile(
                    value: selected.contains(person['id']),
                    title: Text(textOf(person['name'])),
                    onChanged: (checked) => setLocal(() {
                      final id = person['id'] as int;
                      if (checked == true) {
                        selected.add(id);
                      } else {
                        selected.remove(id);
                      }
                    }),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Fulfill')),
          ],
        ),
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => context.read<AuthProvider>().api.patch('/staffing-requests/${request['id']}', {
        'status': 'Fulfilled',
        'student_ids': selected.toList(),
      }), success: 'Staffing request updated.', reload: reload);
    }
  }
}

class TasksScreen extends StatelessWidget {
  const TasksScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final api = auth.api;
    return FetchView(
      loader: () async {
        final tasks = await api.get('/tasks');
        dynamic people = [];
        if (auth.userRole == 'Supervisor') {
          try {
            people = await api.get('/personnel');
          } catch (_) {}
        }
        return {'tasks': tasks, 'people': people};
      },
      builder: (context, data, reload) {
        final payload = asMap(data);
        final tasks = asMaps(payload['tasks']);
        final people = asMaps(payload['people']);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Task management'),
            if (auth.userRole == 'Supervisor') FilledButton(onPressed: () => _assign(context, people, reload), child: const Text('Assign task')),
            if (tasks.isEmpty) const EmptyNote('No tasks.'),
            for (final task in tasks)
              RecordCard(
                title: textOf(task['title']),
                subtitle: '${personName(task, 'student')} · ${textOf(task['description'], '')}',
                trailing: textOf(task['status']),
                children: [
                  Text('Due ${whenOf(task['due_date'])} · ${textOf(task['priority'])}'),
                  if (auth.userRole == 'Supervisor' && task['status'] != 'Verified')
                    TextButton(
                      onPressed: () async {
                        final note = await promptText(context, 'Send for verification', label: 'Evaluation');
                        if (note == null || !context.mounted) return;
                        await runAction(context, () => api.put('/tasks/${task['id']}/notes', {'supervisor_notes': note}), success: 'Sent to WSPO.', reload: reload);
                      },
                      child: const Text('Send evaluation'),
                    ),
                  if (auth.userRole == 'WSPO Staff' && task['status'] == 'For Verification')
                    TextButton(
                      onPressed: () async {
                        final note = await promptText(context, 'Verify task', label: 'Notes', required: false);
                        if (note == null || !context.mounted) return;
                        await runAction(context, () => api.put('/tasks/${task['id']}/verify', {'evaluation_notes': note}), success: 'Task verified.', reload: reload);
                      },
                      child: const Text('Verify'),
                    ),
                ],
              ),
          ],
        );
      },
    );
  }

  Future<void> _assign(BuildContext context, List<Map<String, dynamic>> people, Future<void> Function() reload) async {
    if (people.isEmpty) {
      toast(context, 'No students are in your office.', error: true);
      return;
    }
    var studentId = people.first['id'].toString();
    var priority = 'Medium';
    final title = TextEditingController();
    final description = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Assign task'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              initialValue: studentId,
              items: people.map((person) => DropdownMenuItem(value: person['id'].toString(), child: Text(textOf(person['name'])))).toList(),
              onChanged: (value) => studentId = value ?? studentId,
            ),
            TextField(controller: title, decoration: const InputDecoration(labelText: 'Title')),
            TextField(controller: description, decoration: const InputDecoration(labelText: 'Description')),
            DropdownButtonFormField<String>(
              initialValue: priority,
              items: const ['Low', 'Medium', 'High'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
              onChanged: (value) => priority = value ?? priority,
            ),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Assign')),
        ],
      ),
    );
    if (saved == true && context.mounted) {
      await runAction(context, () => context.read<AuthProvider>().api.post('/tasks', {
        'student_id': int.parse(studentId),
        'title': title.text.trim(),
        'description': description.text.trim(),
        'priority': priority,
      }), success: 'Task assigned.', reload: reload);
    }
    title.dispose();
    description.dispose();
  }
}

class AttendanceHubScreen extends StatelessWidget {
  const AttendanceHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () async {
        dynamic passcode;
        dynamic qr;
        try {
          passcode = await api.get('/attendance/passcode', {'type': 'Daily Clock'});
        } catch (error) {
          passcode = {'error': errorText(error)};
        }
        try {
          qr = await api.get('/attendance/qr-code', {'type': 'Daily Clock'});
        } catch (error) {
          qr = {'error': errorText(error)};
        }
        final anomalies = await api.get('/attendance/anomalies');
        return {'passcode': passcode, 'qr': qr, 'anomalies': anomalies};
      },
      builder: (context, data, reload) {
        final payload = asMap(data);
        final passcode = asMap(payload['passcode']);
        final qr = asMap(payload['qr']);
        final anomalies = asMaps(payload['anomalies']);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Attendance hub'),
            RecordCard(
              title: 'Live passcode',
              subtitle: textOf(passcode['token_code'] ?? passcode['error']),
              trailing: passcode['seconds_remaining'] == null ? '' : '${passcode['seconds_remaining']}s',
            ),
            RecordCard(
              title: 'Live QR payload',
              subtitle: textOf(qr['payload'] ?? qr['error']),
              trailing: qr['seconds_remaining'] == null ? '' : '${qr['seconds_remaining']}s',
            ),
            const Text('Students enter this passcode or scan the QR code shown on the desktop hub.'),
            const SectionTitle('Anomalies'),
            if (anomalies.isEmpty) const EmptyNote('No attendance anomalies.'),
            for (final row in anomalies)
              RecordCard(title: personName(row), subtitle: textOf(row['anomaly_reason']), trailing: whenOf(row['time_in'])),
          ],
        );
      },
    );
  }
}
