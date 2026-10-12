import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme_controller.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';
import '../notifications/notification_center.dart';
import '../shared/account_screens.dart';
import '../staff/staff_admin.dart';
import '../staff/staff_operations.dart';
import '../student/student_portal.dart';

class Destination {
  const Destination(this.label, this.icon, this.page);
  final String label;
  final IconData icon;
  final Widget page;
}

List<Destination> destinationsFor(String? role) {
  if (role == 'Student') {
    return const [
      Destination('Dashboard', Icons.dashboard_outlined, StudentOverviewScreen()),
      Destination('Attendance / DTR', Icons.access_time, StudentAttendanceScreen()),
      Destination('Hours Rendered', Icons.payments_outlined, StudentHoursScreen()),
      Destination('My Schedule', Icons.calendar_month_outlined, StudentScheduleScreen()),
      Destination('My Tasks', Icons.task_alt, StudentTasksScreen()),
      Destination('Requirements', Icons.description_outlined, StudentRequirementsScreen()),
      Destination('Disciplinary Records', Icons.gavel_outlined, StudentDisciplinaryScreen()),
      Destination('Application Status', Icons.assignment_outlined, StudentApplicationScreen()),
      Destination('Settings', Icons.settings_outlined, ProfileSettingsScreen()),
    ];
  }

  final admin = role == 'WSPO Staff' || role == 'Super Admin';
  return [
    const Destination('Dashboard', Icons.dashboard_outlined, StaffDashboardScreen()),
    const Destination('Timesheets', Icons.fact_check_outlined, TimesheetsScreen()),
    const Destination('Schedules', Icons.calendar_month_outlined, SchedulesScreen()),
    if (role == 'Super Admin') const Destination('Document Review', Icons.folder_open_outlined, DocumentReviewScreen()),
    if (admin) const Destination('Applications', Icons.how_to_reg_outlined, ApplicationsScreen()),
    const Destination('Task Management', Icons.task_alt, TasksScreen()),
    const Destination('Attendance Hub', Icons.qr_code_2, AttendanceHubScreen()),
    const Destination('Compliance', Icons.gavel_outlined, ComplianceScreen()),
    if (admin) ...[
      const Destination('Audit Trail', Icons.history, AuditLogsScreen()),
      const Destination('User Management', Icons.group_outlined, UsersScreen()),
      const Destination('Offices', Icons.apartment_outlined, OfficesScreen()),
      const Destination('Reports & Analytics', Icons.insights_outlined, AnalyticsScreen()),
      const Destination('Hours Rendered', Icons.payments_outlined, FinancialScreen()),
    ],
    const Destination('Profile Settings', Icons.settings_outlined, ProfileSettingsScreen()),
  ];
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  NotificationCenter? _notes;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _notes ??= NotificationCenter(context.read<AuthProvider>().api)..start();
  }

  @override
  void dispose() {
    _notes?.dispose();
    super.dispose();
  }

  void _openNotice(AppNotification item) {
    final notes = _notes;
    if (notes == null) return;
    notes.markRead(item);
    notes.close();
    final role = context.read<AuthProvider>().userRole;
    final title = item.title;
    String? label;
    if (role == 'Supervisor' && title.contains('Working Student Assigned')) {
      label = 'Dashboard';
    } else if (title.contains('Schedule') || title.contains('Working Student') || title.contains('Office Assignment')) {
      label = role == 'Student' ? 'My Schedule' : 'Schedules';
    } else if (title.contains('Timesheet') || title.contains('Signed In') || title.contains('Signed Out')) {
      label = role == 'Student' ? 'Attendance / DTR' : 'Timesheets';
    } else if (title.contains('Requirement')) {
      label = role == 'Super Admin' ? 'Document Review' : 'Requirements';
    } else if (title.contains('Signup') || title.contains('Application')) {
      label = role == 'Student' ? 'Application Status' : 'Applications';
    } else if (title.contains('Account')) {
      label = 'User Management';
    } else if (title.contains('Appeal') || title.contains('Disciplinary')) {
      label = role == 'Student' ? 'Disciplinary Records' : 'Compliance';
    }
    if (label == null) return;
    final next = destinationsFor(role).indexWhere((destination) => destination.label == label);
    if (next >= 0) setState(() => _index = next);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final theme = context.watch<ThemeController>();
    final notes = _notes!;
    final scheme = Theme.of(context).colorScheme;
    final items = destinationsFor(auth.userRole);
    final index = _index >= items.length ? 0 : _index;
    final current = items[index];

    return AnimatedBuilder(
      animation: notes,
      builder: (context, _) {
        return Scaffold(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          appBar: AppBar(
            title: Text(current.label),
            bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1)),
            actions: [
              IconButton(
                tooltip: theme.isDark ? 'Light mode' : 'Dark mode',
                onPressed: theme.toggle,
                icon: Icon(theme.isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
              ),
              IconButton(
                tooltip: 'Notifications',
                onPressed: notes.toggle,
                icon: Badge(
                  isLabelVisible: notes.unread > 0,
                  label: Text('${notes.unread}'),
                  child: const Icon(Icons.notifications_none_rounded),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: IconButton(
                  tooltip: 'Sign out',
                  onPressed: () async {
                    if (!await confirm(context, 'Sign out of TechHRM?')) return;
                    if (context.mounted) await context.read<AuthProvider>().logout();
                  },
                  icon: const Icon(Icons.logout_rounded),
                ),
              ),
            ],
          ),
          drawer: Drawer(
            shape: const RoundedRectangleBorder(),
            child: SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFF1E3A8A), Color(0xFF2563EB)]),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('TechHRM', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.4)),
                        const SizedBox(height: 10),
                        Text(auth.userName ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 2),
                        Text('${auth.userRole ?? ''} · ${auth.userDepartment ?? ''}', style: const TextStyle(color: Color(0xFFDBEAFE), fontSize: 12, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  ListTile(
                    leading: Icon(theme.isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined, color: scheme.onSurfaceVariant),
                    title: Text(theme.isDark ? 'Light mode' : 'Dark mode', style: TextStyle(fontWeight: FontWeight.w700, color: scheme.onSurface)),
                    subtitle: const Text('Follows sunrise and sunset in Roxas City'),
                    onTap: theme.toggle,
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      children: [
                        for (var i = 0; i < items.length; i++)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: ListTile(
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                              selected: i == index,
                              selectedTileColor: scheme.primary.withValues(alpha: 0.12),
                              leading: Icon(items[i].icon, color: i == index ? scheme.primary : scheme.onSurfaceVariant),
                              title: Text(items[i].label, style: TextStyle(fontWeight: i == index ? FontWeight.w800 : FontWeight.w600, color: i == index ? scheme.primary : scheme.onSurface)),
                              onTap: () {
                                setState(() => _index = i);
                                Navigator.pop(context);
                              },
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          body: Stack(
            children: [
              current.page,
              if (notes.open)
                Positioned.fill(
                  child: GestureDetector(onTap: notes.close, behavior: HitTestBehavior.opaque, child: const SizedBox.expand()),
                ),
              if (notes.live != null)
                Positioned(
                  top: 12,
                  right: 12,
                  child: LiveNotice(
                    item: notes.live!,
                    onDismiss: notes.hideLive,
                    onRead: () => notes.markRead(notes.live!),
                    onDelete: () => notes.dismiss(notes.live!.id),
                  ),
                ),
              if (notes.open)
                Positioned(
                  top: 8,
                  right: 12,
                  child: NotificationPanel(center: notes, onOpen: _openNotice),
                ),
            ],
          ),
        );
      },
    );
  }
}
