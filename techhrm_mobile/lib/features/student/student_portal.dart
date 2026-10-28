import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/json_util.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';

class StudentOverviewScreen extends StatelessWidget {
  const StudentOverviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return FetchView(
      loader: () => auth.api.get('/student/dashboard'),
      builder: (context, data, reload) {
        final overview = asMap(data);
        final shifts = asMaps(overview['upcoming_schedules']);
        return PageBody(
          onRefresh: reload,
          children: [
            Text('Welcome back,', style: TextStyle(color: Colors.grey.shade600)),
            Text(auth.userName ?? 'Student', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(auth.userDepartment ?? 'Unassigned office'),
            const SizedBox(height: 16),
            Row(children: [
              StatCard(label: 'Credited hours', value: numOf(overview['total_hours_rendered']).toStringAsFixed(1), icon: Icons.timer, color: Colors.green.shade700),
              const SizedBox(width: 10),
              StatCard(label: 'Required', value: numOf(overview['required_hours']).toStringAsFixed(0), icon: Icons.flag, color: Colors.orange.shade800),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              StatCard(label: 'Performance', value: '${overview['performance_score'] ?? 0}', icon: Icons.insights),
              const SizedBox(width: 10),
              StatCard(label: 'Open cases', value: '${overview['violations'] ?? 0}', icon: Icons.gavel, color: Colors.red.shade700),
            ]),
            const SizedBox(height: 16),
            const SectionTitle('Upcoming shifts'),
            if (shifts.isEmpty) const EmptyNote('No shifts assigned yet.'),
            for (final shift in shifts)
              RecordCard(
                title: textOf(shift['day']),
                subtitle: '${textOf(shift['time_start'])} – ${textOf(shift['time_end'])}',
                trailing: textOf(shift['location'], ''),
              ),
          ],
        );
      },
    );
  }
}

class StudentAttendanceScreen extends StatefulWidget {
  const StudentAttendanceScreen({super.key});

  @override
  State<StudentAttendanceScreen> createState() => _StudentAttendanceScreenState();
}

class _StudentAttendanceScreenState extends State<StudentAttendanceScreen> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _clock(BuildContext context, Map<String, dynamic>? open, Future<void> Function() reload, {String method = 'passcode'}) async {
    final raw = _code.text.trim();
    if (raw.isEmpty) {
      toast(context, 'Enter the passcode or scan the QR code.', error: true);
      return;
    }
    final api = context.read<AuthProvider>().api;
    await runAction(context, () async {
      if (open == null) {
        await api.post('/attendance/secure-clock-in', {
          'token_code': raw,
          'method': method,
        });
      } else {
        await api.put('/attendance/secure-clock-out/${open['id']}', {
          'token_code': raw,
          'method': method,
        });
      }
      _code.clear();
    }, success: open == null ? 'Shift started.' : 'Shift ended.', reload: reload);
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () async {
        final summary = await api.get('/attendance/hours-summary');
        dynamic leader;
        try {
          leader = await api.get('/attendance/leader-activities');
        } catch (_) {
          leader = {'is_leader': false, 'events': []};
        }
        final events = asMaps(asMap(leader)['events']);
        Map<String, dynamic> passcode = const {};
        Map<String, dynamic> qr = const {};
        if (events.isNotEmpty) {
          final eventId = events.first['id'];
          try {
            passcode = asMap(await api.get('/attendance/activity-passcode', {'event_id': eventId}));
          } catch (error) {
            passcode = {'error': errorText(error)};
          }
          try {
            qr = asMap(await api.get('/attendance/activity-qr', {'event_id': eventId}));
          } catch (error) {
            qr = {'error': errorText(error)};
          }
        }
        return {
          'summary': summary,
          'leader': leader,
          'passcode': passcode,
          'qr': qr,
        };
      },
      builder: (context, data, reload) {
        final payload = asMap(data);
        final summary = asMap(payload['summary']);
        final leader = asMap(payload['leader']);
        final leaderEvents = asMaps(leader['events']);
        final isLeader = leader['is_leader'] == true;
        final passcode = asMap(payload['passcode']);
        final qr = asMap(payload['qr']);
        final history = asMaps(summary['history']);
        final dtr = history.where((row) {
          final label = '${row['attendance_type'] ?? ''} ${row['work_type'] ?? ''}'.toLowerCase();
          return row['rendered_hour_event_id'] == null && !label.contains('meeting');
        });
        Map<String, dynamic>? open;
        for (final row in history) {
          if (row['time_out'] == null && row['rendered_hour_event_id'] == null) {
            open = row;
            break;
          }
        }
        return PageBody(
          onRefresh: reload,
          children: [
            Row(children: [
              StatCard(label: 'Credited hours', value: numOf(summary['total_rendered']).toStringAsFixed(1), icon: Icons.timer),
              const SizedBox(width: 10),
              StatCard(label: 'Remaining', value: numOf(summary['remaining_hours']).toStringAsFixed(1), icon: Icons.hourglass_bottom, color: Colors.orange.shade800),
            ]),
            if (isLeader) ...[
              const SizedBox(height: 16),
              const SectionTitle('Cleaning group access'),
              if (leaderEvents.isEmpty)
                const EmptyNote('No daily cleaning activity is scheduled for your group today.')
              else ...[
                RecordCard(
                  title: textOf(leaderEvents.first['title']),
                  subtitle: '${numOf(leaderEvents.first['hours']).toStringAsFixed(0)} hrs · same on-time rules as Attendance Hub',
                ),
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
                const Text('Group mates enter this passcode or scan the QR code.'),
              ],
            ],
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: open == null ? const [Color(0xFF1E3A8A), Color(0xFF2563EB)] : const [Color(0xFFC2410C), Color(0xFFEA580C)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(open == null ? 'READY TO WORK' : 'YOU ARE ON DUTY', style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w800, letterSpacing: 1.1, fontSize: 12)),
                  const SizedBox(height: 6),
                  Text(open == null ? 'Enter the office passcode or scan the QR code.' : 'Confirm the code again to end this shift.', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
                    child: Column(
                      children: [
                        TextField(controller: _code, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Passcode or QR payload')),
                        const SizedBox(height: 12),
                        Row(children: [
                          Expanded(child: FilledButton(onPressed: () => _clock(context, open, reload), child: Text(open == null ? 'Clock in' : 'Clock out'))),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () async {
                                final scanned = await Navigator.push<String>(context, MaterialPageRoute(builder: (_) => const QrScanScreen()));
                                if (scanned == null || !context.mounted) return;
                                _code.text = scanned;
                                await _clock(context, open, reload, method: 'qr');
                              },
                              icon: const Icon(Icons.qr_code_scanner),
                              label: const Text('Scan QR'),
                            ),
                          ),
                        ]),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const SectionTitle('Daily time record'),
            if (dtr.isEmpty) const EmptyNote('No attendance yet.'),
            for (final row in dtr)
              RecordCard(
                title: whenOf(row['time_in']),
                subtitle: 'Out: ${whenOf(row['time_out'])} · ${textOf(row['attendance_type'] ?? row['work_type'])}',
                trailing: textOf(row['status']),
              ),
          ],
        );
      },
    );
  }
}

class QrScanScreen extends StatelessWidget {
  const QrScanScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan attendance QR'), backgroundColor: Colors.white, foregroundColor: kInk, surfaceTintColor: Colors.white),
      body: MobileScanner(
        onDetect: (capture) {
          final raw = capture.barcodes.isEmpty ? '' : (capture.barcodes.first.rawValue ?? '');
          if ((raw.startsWith('THRM1|') || raw.startsWith('THRM1A|')) && raw.length > 10) {
            Navigator.pop(context, raw);
          }
        },
      ),
    );
  }
}

class StudentHoursScreen extends StatefulWidget {
  const StudentHoursScreen({super.key});

  @override
  State<StudentHoursScreen> createState() => _StudentHoursScreenState();
}

class _StudentHoursScreenState extends State<StudentHoursScreen> {
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);

  String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    final start = DateTime(_month.year, _month.month, 1);
    final end = DateTime(_month.year, _month.month + 1, 0);
    final monthLabel = '${_month.year}-${_month.month.toString().padLeft(2, '0')}';
    return FetchView(
      key: ValueKey(monthLabel),
      loader: () => api.get('/financial/my-hours', {
        'period_start': _date(start),
        'period_end': _date(end),
      }),
      builder: (context, data, reload) {
        final payload = asMap(data);
        final student = asMap(payload['student']);
        final activities = asMaps(payload['activities']);
        final grand = numOf(student['grand_total']);
        final meeting = numOf(student['general_cleaning']) + numOf(student['devotional']) + numOf(student['meeting_assembly']);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Period breakdown'),
            Row(
              children: [
                IconButton(onPressed: () => setState(() => _month = DateTime(_month.year, _month.month - 1)), icon: const Icon(Icons.chevron_left)),
                Expanded(child: Text(monthLabel, textAlign: TextAlign.center)),
                IconButton(onPressed: () => setState(() => _month = DateTime(_month.year, _month.month + 1)), icon: const Icon(Icons.chevron_right)),
              ],
            ),
            Row(children: [
              StatCard(label: 'Grand total', value: grand.toStringAsFixed(2), icon: Icons.schedule),
              const SizedBox(width: 10),
              StatCard(label: 'At ₱28/hr', value: '₱${(grand * 28).toStringAsFixed(2)}', icon: Icons.payments, color: Colors.green.shade700),
            ]),
            const SizedBox(height: 8),
            Text('DTR ${numOf(student['dtr_hours']).toStringAsFixed(2)} · Duty deduction ${numOf(student['duty_deduction']).toStringAsFixed(2)}'),
            Text('Special ${numOf(student['special_request']).toStringAsFixed(2)} · Daily cleaning ${numOf(student['daily_cleaning']).toStringAsFixed(2)} · General meeting ${meeting.toStringAsFixed(2)}'),
            const SizedBox(height: 12),
            const SectionTitle('Activity hours'),
            if (activities.isEmpty) const EmptyNote('No activity hours in this month.'),
            for (final row in activities)
              RecordCard(
                title: textOf(row['title']),
                subtitle: '${textOf(row['kind_label'])} · ${whenOf(row['event_date'])} · ${textOf(row['status'])}',
                trailing: '${numOf(row['hours_delta']).toStringAsFixed(2)} hrs',
              ),
          ],
        );
      },
    );
  }
}

class StudentScheduleScreen extends StatelessWidget {
  const StudentScheduleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () => api.get('/schedule/my-schedule'),
      builder: (context, data, reload) {
        final rows = asMaps(data);
        final shifts = rows.where((shift) => textOf(shift['kind'], 'work') != 'class').toList();
        final classes = rows.where((shift) => textOf(shift['kind'], 'work') == 'class').toList();
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Work schedule'),
            const Text('Official duty shifts. A change request goes to WSPO for review. Clock-in follows this schedule.'),
            const SizedBox(height: 8),
            if (shifts.isEmpty) const EmptyNote('No shifts assigned yet.'),
            for (final shift in shifts)
              RecordCard(
                title: '${textOf(shift['day'])} · ${textOf(shift['time'])}',
                subtitle: '${textOf(shift['department'])} · ${textOf(shift['duty_type'])}',
                trailing: textOf(shift['edit_request_status'], ''),
                children: [
                  if (textOf(shift['edit_request_note'], '').isNotEmpty) Text('Request: ${shift['edit_request_note']}'),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () async {
                        final note = await promptText(context, 'Request a schedule edit');
                        if (note == null || !context.mounted) return;
                        await runAction(context, () => api.post('/my-schedule/${shift['id']}/request-edit', {'note': note}), success: 'Edit request sent.', reload: reload);
                      },
                      child: const Text('Request edit'),
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 16),
            const SectionTitle('Class schedule'),
            const Text('Class hours recorded beside your work schedule. They do not change clock-in.'),
            const SizedBox(height: 8),
            if (classes.isEmpty) const EmptyNote('No class schedule yet.'),
            for (final shift in classes)
              RecordCard(
                title: '${textOf(shift['day'])} · ${textOf(shift['time'])}',
                subtitle: [
                  textOf(shift['subject'], textOf(shift['duty_type'])),
                  textOf(shift['room'], ''),
                  textOf(shift['instructor'], textOf(shift['supervisor'], '')),
                ].where((part) => part.isNotEmpty).join(' · '),
                trailing: 'Class',
              ),
          ],
        );
      },
    );
  }
}

class StudentRequirementsScreen extends StatelessWidget {
  const StudentRequirementsScreen({super.key});

  static const types = [
    'Medical Clearance',
    'Parents Consent',
    'Copy of Grades',
    'Certificate of Enrollment',
    'Good Moral Character',
  ];

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () => api.get('/my-requirements'),
      builder: (context, data, reload) {
        final rows = asMaps(data);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Requirements'),
            FilledButton.icon(
              onPressed: () async {
                var type = types.first;
                final picked = await showDialog<String>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Upload document'),
                    content: StatefulBuilder(
                      builder: (context, setLocal) => DropdownButtonFormField<String>(
                        initialValue: type,
                        items: types.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
                        onChanged: (value) => setLocal(() => type = value ?? type),
                      ),
                    ),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                      FilledButton(onPressed: () => Navigator.pop(context, type), child: const Text('Choose file')),
                    ],
                  ),
                );
                if (picked == null || !context.mounted) return;
                final file = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png']);
                final path = file?.path;
                if (path == null || !context.mounted) return;
                await runAction(context, () async {
                  await api.upload('/requirements/upload', fields: {'document_type': picked}, files: [await http.MultipartFile.fromPath('file', path)]);
                }, success: 'Document uploaded.', reload: reload);
              },
              icon: const Icon(Icons.upload_file),
              label: const Text('Submit document'),
            ),
            const SizedBox(height: 12),
            if (rows.isEmpty) const EmptyNote('No documents uploaded yet.'),
            for (final row in rows)
              RecordCard(
                title: textOf(row['document_type']),
                subtitle: textOf(row['remarks'], 'No remarks'),
                trailing: textOf(row['status']),
              ),
          ],
        );
      },
    );
  }
}

class StudentDisciplinaryScreen extends StatelessWidget {
  const StudentDisciplinaryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () => api.get('/disciplinary/my-records'),
      builder: (context, data, reload) {
        final rows = asMaps(data);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Disciplinary records'),
            if (rows.isEmpty) const EmptyNote('No records on file.'),
            for (final row in rows)
              RecordCard(
                title: textOf(row['violation_type']),
                subtitle: textOf(row['description']),
                trailing: textOf(row['status']),
                children: [
                  Text('Penalty: ${textOf(row['penalty'])}'),
                  if (row['status'] == 'Active' || row['status'] == 'Resolved')
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () async {
                          final note = await promptText(context, 'Submit an appeal', label: 'Appeal');
                          if (note == null || !context.mounted) return;
                          await runAction(context, () => api.post('/disciplinary/${row['id']}/appeal', {'appeal_notes': note, 'student_appeal': note}), success: 'Appeal submitted.', reload: reload);
                        },
                        child: const Text('Appeal'),
                      ),
                    ),
                ],
              ),
          ],
        );
      },
    );
  }
}

class StudentApplicationScreen extends StatelessWidget {
  const StudentApplicationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () async {
        try {
          return await api.get('/applications/my-status');
        } on ApiException catch (error) {
          if (error.statusCode == 404) return null;
          rethrow;
        }
      },
      builder: (context, data, reload) {
        if (data == null) return const EmptyNote('No application is linked to this account.');
        final app = asMap(data);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('Application status'),
            RecordCard(
              title: textOf(app['applicant_name']),
              subtitle: 'Stage: ${textOf(app['current_stage'])}',
              trailing: textOf(app['tracking_code'], ''),
              children: [
                Text('Interview: ${whenOf(app['interview_date'])}'),
                Text('Assigned office: ${textOf(app['assigned_department'])}'),
                Text('Duty: ${textOf(app['assigned_duty'])}'),
              ],
            ),
            for (final event in asMaps(app['events']))
              RecordCard(title: textOf(event['status']), subtitle: textOf(event['note'], ''), trailing: whenOf(event['occurred_at'])),
          ],
        );
      },
    );
  }
}

class StudentTasksScreen extends StatelessWidget {
  const StudentTasksScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return FetchView(
      loader: () => api.get('/tasks/my-tasks'),
      builder: (context, data, reload) {
        final tasks = asMaps(data);
        return PageBody(
          onRefresh: reload,
          children: [
            const SectionTitle('My tasks'),
            if (tasks.isEmpty) const EmptyNote('No tasks assigned.'),
            for (final task in tasks)
              RecordCard(
                title: textOf(task['title']),
                subtitle: textOf(task['description'], ''),
                trailing: textOf(task['status']),
                children: [
                  Text('Due: ${whenOf(task['due_date'])} · ${textOf(task['priority'])}'),
                  Wrap(children: [
                    if (task['status'] == 'Pending')
                      TextButton(onPressed: () => runAction(context, () => api.put('/tasks/${task['id']}/status', {'status': 'In Progress'}), success: 'Task started.', reload: reload), child: const Text('Start')),
                    if (task['status'] == 'In Progress' || task['status'] == 'Pending')
                      TextButton(
                        onPressed: () async {
                          final log = await promptText(context, 'Completion log', label: 'What did you finish?');
                          if (log == null || !context.mounted) return;
                          await runAction(context, () => api.put('/tasks/${task['id']}/status', {'status': 'Completed', 'completion_log': log}), success: 'Task completed.', reload: reload);
                        },
                        child: const Text('Complete'),
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
