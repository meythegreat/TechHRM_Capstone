import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/json_util.dart';
import '../../core/offline/offline_attendance_outbox.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';
import '../sync/media_tools.dart';
import '../sync/student_extras.dart';

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
        final currentActivities = asMaps(overview['current_activities']);
        final upcomingActivities = asMaps(overview['upcoming_activities']);
        return PageBody(
          onRefresh: reload,
          children: [
            if (currentActivities.isNotEmpty) ...[
              for (final act in currentActivities)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF064E3B), Color(0xFF0F766E)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'HAPPENING NOW · ${textOf(act['kind_label'], 'ACTIVITY').toUpperCase()}',
                        style: const TextStyle(
                          color: Color(0xFFA7F3D0),
                          fontWeight: FontWeight.w800,
                          fontSize: 11,
                          letterSpacing: 1.0,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        textOf(act['title'], 'Campus activity'),
                        style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${whenOf(act['starts_at'])} – ${whenOf(act['ends_at'])} · +${numOf(act['hours']).toStringAsFixed(1)} hrs · ${textOf(act['audience_label'])}',
                        style: const TextStyle(color: Colors.white70, fontSize: 13),
                      ),
                    ],
                  ),
                ),
            ],
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
            const SectionTitle('Campus & group activities'),
            if (currentActivities.isEmpty && upcomingActivities.isEmpty)
              const EmptyNote('No ongoing or upcoming activities right now.'),
            for (final act in [...currentActivities, ...upcomingActivities])
              RecordCard(
                title: textOf(act['title']),
                subtitle: '${textOf(act['kind_label'])} · ${textOf(act['event_date'])} · ${whenOf(act['starts_at'])}–${whenOf(act['ends_at'])}',
                trailing: act['is_happening_now'] == true ? 'LIVE NOW' : '+${numOf(act['hours']).toStringAsFixed(1)}h',
              ),
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

class _StudentAttendanceScreenState extends State<StudentAttendanceScreen> with WidgetsBindingObserver {
  final _code = TextEditingController();
  final _outbox = OfflineAttendanceOutbox();
  List<Map<String, dynamic>> _pending = [];
  bool _syncing = false;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;
  Future<void> Function()? _reloadHours;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshPending();
    _connectivitySub = Connectivity().onConnectivityChanged.listen((results) {
      if (results.any((result) => result != ConnectivityResult.none)) {
        _flushPending(quiet: true);
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _flushPending(quiet: true));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _connectivitySub?.cancel();
    _code.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _flushPending(quiet: true);
    }
  }

  Future<void> _refreshPending() async {
    final rows = await _outbox.list();
    if (!mounted) return;
    setState(() => _pending = rows);
  }

  Future<void> _flushPending({bool quiet = false}) async {
    if (_syncing) return;
    setState(() => _syncing = true);
    try {
      final api = context.read<AuthProvider>().api;
      final result = await _outbox.flush(api);
      if (!mounted) return;
      setState(() => _pending = result.remaining);
      if (result.uploaded > 0) {
        toast(
          context,
          result.uploaded == 1
              ? 'Uploaded 1 saved offline request.'
              : 'Uploaded ${result.uploaded} saved offline requests.',
        );
        await _reloadHours?.call();
      } else if (!quiet && result.errors.isNotEmpty) {
        toast(context, result.errors.first, error: true);
      }
    } catch (error) {
      if (!quiet && mounted) toast(context, errorText(error), error: true);
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  bool _needsCleaningProof(Map<String, dynamic>? row) {
    if (row == null) return false;
    final label = '${row['attendance_type'] ?? ''} ${row['work_type'] ?? ''}'.toLowerCase();
    return label.contains('janitorial') || row['janitorial_group_id'] != null || label.contains('daily cleaning');
  }

  bool _cleaningProofReady(Map<String, dynamic>? row) {
    if (row == null) return true;
    return row['cleaning_before_path'] != null &&
        row['cleaning_before_path'].toString().isNotEmpty &&
        row['cleaning_after_path'] != null &&
        row['cleaning_after_path'].toString().isNotEmpty;
  }

  Future<void> _clock(BuildContext context, Map<String, dynamic>? open, Future<void> Function() reload, {String method = 'passcode'}) async {
    final raw = _code.text.trim();
    if (raw.isEmpty) {
      toast(context, 'Enter the passcode or scan the QR code.', error: true);
      return;
    }
    if (open != null && _needsCleaningProof(open) && !_cleaningProofReady(open)) {
      toast(context, 'Capture the before and after surroundings photos below before you clock out.', error: true);
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
      loader: () => api.get('/attendance/hours-summary'),
      builder: (context, data, reload) {
        _reloadHours = reload;
        final summary = asMap(data);
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
          onRefresh: () async {
            await reload();
            await _refreshPending();
            await _flushPending(quiet: true);
          },
          children: [
            Row(children: [
              StatCard(label: 'Credited hours', value: numOf(summary['total_rendered']).toStringAsFixed(1), icon: Icons.timer),
              const SizedBox(width: 10),
              StatCard(label: 'Remaining', value: numOf(summary['remaining_hours']).toStringAsFixed(1), icon: Icons.hourglass_bottom, color: Colors.orange.shade800),
            ]),
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
                  if (open != null && _needsCleaningProof(open)) ...[
                    const SizedBox(height: 10),
                    Text(
                      _cleaningProofReady(open)
                          ? 'Cleaning proof complete. You can clock out.'
                          : 'Capture a live before photo and a live after photo. The date and time are stamped on each one.',
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                    ),
                    const SizedBox(height: 8),
                    FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: kInk),
                      onPressed: () => _captureProof(context, open!, reload),
                      child: Text(_cleaningProofReady(open) ? 'Replace cleaning photo' : (open['cleaning_before_path'] == null ? 'Capture before photo' : 'Capture after photo')),
                    ),
                  ],
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
            OutlinedButton.icon(
              onPressed: () => _offlineRequest(context, reload),
              icon: const Icon(Icons.wifi_off),
              label: const Text('Offline manual attendance'),
            ),
            if (_pending.isNotEmpty) ...[
              const SizedBox(height: 16),
              const SectionTitle('Pending upload'),
              Text(
                'Saved on this device. They upload when you are online again.',
                style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.tonalIcon(
                  onPressed: _syncing ? null : () => _flushPending(),
                  icon: const Icon(Icons.cloud_upload_outlined),
                  label: Text(_syncing ? 'Uploading…' : 'Upload now'),
                ),
              ),
              for (final item in _pending)
                RecordCard(
                  title: textOf(item['reason'], 'Offline attendance'),
                  subtitle: [
                    for (final shift in asMaps(item['shifts']))
                      '${textOf(shift['date'])} · ${whenOf(shift['time_in'])}–${whenOf(shift['time_out'])}',
                  ].join('\n'),
                  trailing: 'Queued',
                  onTap: () async {
                    final discard = await showDialog<bool>(
                      context: context,
                      builder: (dialogContext) => AlertDialog(
                        title: const Text('Discard saved request?'),
                        content: const Text('This removes the request from this device. It will not be uploaded.'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Keep')),
                          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Discard')),
                        ],
                      ),
                    );
                    if (discard != true || !mounted) return;
                    final next = await _outbox.remove(textOf(item['client_request_id']));
                    if (!mounted) return;
                    setState(() => _pending = next);
                    toast(context, 'Discarded the saved offline request.');
                  },
                ),
            ],
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => _janitorialPhoto(context, reload, open),
              icon: const Icon(Icons.photo_camera_outlined),
              label: Text(open == null ? 'Janitorial photo clock-in' : 'Janitorial photo clock-out'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HourLimitsScreen())), child: const Text('Weekly and monthly hour limits')),
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

  Future<void> _offlineRequest(BuildContext context, Future<void> Function() reload) async {
    final shifts = <Map<String, TextEditingController>>[
      {
        'date': TextEditingController(text: DateTime.now().toIso8601String().split('T').first),
        'time_in': TextEditingController(text: '08:00'),
        'time_out': TextEditingController(text: '12:00'),
      },
    ];
    final reason = TextEditingController(text: 'Office had no internet; submitted for supervisor approval.');
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setLocal) => AlertDialog(
            title: const Text('Offline manual attendance'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Use this when the office had no internet. If you are offline, the request stays on this device and uploads when you reconnect. Hours appear on your DTR only after supervisor approval.',
                  ),
                  const SizedBox(height: 12),
                  for (var i = 0; i < shifts.length; i++) ...[
                    Align(alignment: Alignment.centerLeft, child: Text('Shift ${i + 1}', style: const TextStyle(fontWeight: FontWeight.w700))),
                    TextField(controller: shifts[i]['date'], decoration: const InputDecoration(labelText: 'Date (YYYY-MM-DD)')),
                    ClockField(controller: shifts[i]['time_in']!, label: 'Time in'),
                    ClockField(controller: shifts[i]['time_out']!, label: 'Time out'),
                    if (shifts.length > 1)
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: () {
                            setLocal(() {
                              for (final c in shifts[i].values) {
                                c.dispose();
                              }
                              shifts.removeAt(i);
                            });
                          },
                          child: const Text('Remove shift'),
                        ),
                      ),
                    const SizedBox(height: 8),
                  ],
                  if (shifts.length < 10)
                    TextButton(
                      onPressed: () {
                        setLocal(() {
                          shifts.add({
                            'date': TextEditingController(text: DateTime.now().toIso8601String().split('T').first),
                            'time_in': TextEditingController(text: '13:00'),
                            'time_out': TextEditingController(text: '17:00'),
                          });
                        });
                      },
                      child: const Text('Add another shift'),
                    ),
                  TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason'), maxLines: 2),
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
              FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Submit')),
            ],
          ),
        );
      },
    );
    if (saved != true || !context.mounted) {
      for (final shift in shifts) {
        for (final c in shift.values) {
          c.dispose();
        }
      }
      reason.dispose();
      return;
    }
    final payload = <String, dynamic>{
      'client_request_id': _outbox.newClientRequestId(),
      'request_type': 'regular',
      'reason': reason.text.trim(),
      'shifts': [
        for (final shift in shifts)
          {
            'date': shift['date']!.text.trim(),
            'time_in': shift['time_in']!.text.trim(),
            'time_out': shift['time_out']!.text.trim(),
          },
      ],
    };
    for (final shift in shifts) {
      for (final c in shift.values) {
        c.dispose();
      }
    }
    reason.dispose();

    try {
      await context.read<AuthProvider>().api.post('/attendance/manual-requests', payload);
      if (!context.mounted) return;
      toast(context, 'Request submitted for supervisor approval.');
      await reload();
    } catch (error) {
      if (shouldQueueOfflineAttendance(error)) {
        final next = await _outbox.enqueue(payload);
        if (!context.mounted) return;
        setState(() => _pending = next);
        toast(context, 'Saved on this device — will upload when online.');
        return;
      }
      if (context.mounted) toast(context, errorText(error), error: true);
    }
  }

  Future<void> _captureProof(BuildContext context, Map<String, dynamic> open, Future<void> Function() reload) async {
    final phase = open['cleaning_before_path'] == null ? 'before' : 'after';
    final shot = await captureStampedPhoto();
    if (shot == null || !context.mounted) return;
    await runAction(
      context,
      () => context.read<AuthProvider>().api.upload('/attendance/${open['id']}/cleaning-proof', fields: {
        'phase': phase,
        'capture_source': 'live_camera',
        'captured_at': shot.capturedAt.toUtc().toIso8601String(),
      }, files: [shot.file('photo', '$phase-cleaning.jpg')]),
      success: '${phase == 'before' ? 'Before' : 'After'} photo saved.',
      reload: reload,
    );
  }

  Future<void> _janitorialPhoto(BuildContext context, Future<void> Function() reload, Map<String, dynamic>? open) async {
    final groups = asMaps(asMap(await context.read<AuthProvider>().api.get('/attendance/janitorial-groups'))['groups']);
    if (!context.mounted) return;
    final mine = groups.where((group) => asMaps(group['members']).any((member) => numOf(member['id']).toInt() == context.read<AuthProvider>().userId) || numOf(asMap(group['supervisor'])['id']).toInt() == context.read<AuthProvider>().userId).toList();
    int? groupId = mine.isEmpty ? null : numOf(mine.first['id']).toInt();
    if (open == null && mine.length > 1) {
      groupId = await showDialog<int>(
        context: context,
        builder: (context) => SimpleDialog(
          title: const Text('Which area?'),
          children: [
            for (final group in mine)
              SimpleDialogOption(
                onPressed: () => Navigator.pop(context, numOf(group['id']).toInt()),
                child: Text(textOf(group['area'], textOf(group['name']))),
              ),
          ],
        ),
      );
      if (groupId == null || !context.mounted) return;
    }
    final shot = await captureStampedPhoto();
    if (shot == null || !context.mounted) return;
    final phase = open == null ? 'before' : 'after';
    await runAction(
      context,
      () => context.read<AuthProvider>().api.upload('/attendance/janitorial-photo', fields: {
        'phase': phase,
        'capture_source': 'live_camera',
        'captured_at': shot.capturedAt.toUtc().toIso8601String(),
        if (groupId != null) 'group_id': '$groupId',
      }, files: [shot.file('photo', '$phase-janitorial.jpg')]),
      success: phase == 'before' ? 'Janitorial clock-in started from the photo.' : 'Janitorial clock-out saved. Your leader reviews the photos.',
      reload: reload,
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
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HourLimitsScreen())), child: const Text('Week and month limits')),
            ),
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
                trailing: const {'pending', 'approved', 'rejected'}.contains(textOf(shift['edit_request_status']))
                    ? textOf(shift['edit_request_status'])
                    : '',
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
                children: [
                  if (textOf(row['file_path'], '').isNotEmpty)
                    TextButton(onPressed: () => openSecureFile(context, textOf(row['file_path'], ''), title: textOf(row['document_type'])), child: const Text('Open file')),
                ],
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

