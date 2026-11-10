import 'package:flutter/material.dart';
import '../api/api_client.dart';

const Color kBlue = Color(0xFF1D4ED8);
const Color kInk = Color(0xFF0F172A);
const Color kMuted = Color(0xFF64748B);
const Color kLine = Color(0xFFE2E8F0);
const Color kCanvas = Color(0xFFF1F5F9);
const Color kDarkCanvas = Color(0xFF0A1020);
const Color kDarkSurface = Color(0xFF141C2E);
const Color kDarkLine = Color(0xFF2A3950);
const Color kDarkInk = Color(0xFFE2E8F0);

ThemeData techTheme() => _techTheme(Brightness.light);
ThemeData techDarkTheme() => _techTheme(Brightness.dark);

ThemeData _techTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  const radius = 14.0;
  final line = dark ? kDarkLine : kLine;
  final ink = dark ? kDarkInk : kInk;
  final surface = dark ? kDarkSurface : Colors.white;
  final canvas = dark ? kDarkCanvas : kCanvas;
  final border = OutlineInputBorder(
    borderRadius: BorderRadius.circular(radius),
    borderSide: BorderSide(color: line),
  );
  final scheme = ColorScheme.fromSeed(
    seedColor: kBlue,
    brightness: brightness,
    primary: kBlue,
    surface: surface,
    onSurface: ink,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: canvas,
    splashFactory: InkRipple.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: surface,
      foregroundColor: ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(color: ink, fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: -0.2),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: line),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      labelStyle: TextStyle(color: dark ? const Color(0xFF94A3B8) : kMuted, fontWeight: FontWeight.w600),
      border: border,
      enabledBorder: border,
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radius),
        borderSide: const BorderSide(color: kBlue, width: 1.6),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: kBlue,
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: ink,
        minimumSize: const Size(0, 48),
        side: BorderSide(color: line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: kBlue, textStyle: const TextStyle(fontWeight: FontWeight.w700)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dividerTheme: DividerThemeData(color: line, space: 1),
    drawerTheme: DrawerThemeData(backgroundColor: surface),
    tabBarTheme: const TabBarThemeData(
      labelColor: kBlue,
      unselectedLabelColor: kMuted,
      indicatorColor: kBlue,
      labelStyle: TextStyle(fontWeight: FontWeight.w700),
      unselectedLabelStyle: TextStyle(fontWeight: FontWeight.w600),
    ),
  );
}

void toast(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: error ? Colors.red.shade800 : Colors.green.shade800,
      behavior: SnackBarBehavior.floating,
    ),
  );
}

String errorText(Object error) {
  if (error is ApiException) return error.message;
  return 'Cannot connect to the server. Check your connection.';
}

class FetchView extends StatefulWidget {
  const FetchView({super.key, required this.loader, required this.builder});

  final Future<dynamic> Function() loader;
  final Widget Function(BuildContext context, dynamic data, Future<void> Function() reload) builder;

  @override
  State<FetchView> createState() => _FetchViewState();
}

class _FetchViewState extends State<FetchView> {
  late Future<dynamic> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.loader();
  }

  Future<void> reload() async {
    setState(() => _future = widget.loader());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<dynamic>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return ListView(
            padding: const EdgeInsets.all(32),
            children: [
              const SizedBox(height: 48),
              const Icon(Icons.cloud_off_outlined, size: 42, color: kMuted),
              const SizedBox(height: 12),
              Text(errorText(snapshot.error!), textAlign: TextAlign.center, style: const TextStyle(color: kInk, height: 1.4)),
              const SizedBox(height: 16),
              Center(child: FilledButton(onPressed: reload, child: const Text('Try again'))),
            ],
          );
        }
        return widget.builder(context, snapshot.data, reload);
      },
    );
  }
}

class PageBody extends StatelessWidget {
  const PageBody({super.key, required this.children, this.onRefresh});

  final List<Widget> children;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final list = ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: 920, minHeight: constraints.maxHeight - 46),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
              ),
            ),
          ],
        );
        if (onRefresh == null) return list;
        return RefreshIndicator(onRefresh: onRefresh!, child: list);
      },
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 8),
      child: Text(text, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.onSurface, letterSpacing: -0.3)),
    );
  }
}

class StatCard extends StatelessWidget {
  const StatCard({super.key, required this.label, required this.value, required this.icon, this.color});

  final String label;
  final String value;
  final IconData icon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final tint = color ?? kBlue;
    final scheme = Theme.of(context).colorScheme;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Theme.of(context).dividerColor),
          boxShadow: const [BoxShadow(color: Color(0x0A0F172A), blurRadius: 12, offset: Offset(0, 4))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(color: tint.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: tint, size: 18),
            ),
            const SizedBox(height: 12),
            Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: scheme.onSurface, letterSpacing: -0.4)),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(fontSize: 12, color: kMuted, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class RecordCard extends StatelessWidget {
  const RecordCard({super.key, required this.title, this.subtitle, this.trailing, this.children = const [], this.onTap});

  final String title;
  final String? subtitle;
  final String? trailing;
  final List<Widget> children;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: Text(title, style: TextStyle(fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.onSurface, height: 1.3))),
                  if (trailing != null && trailing!.isNotEmpty && trailing != '—')
                    Container(
                      margin: const EdgeInsets.only(left: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(999)),
                      child: Text(trailing!, style: const TextStyle(color: kBlue, fontWeight: FontWeight.w700, fontSize: 11)),
                    ),
                ],
              ),
              if (subtitle != null && subtitle!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(subtitle!, style: const TextStyle(color: kMuted, height: 1.35)),
              ],
              ...children,
            ],
          ),
        ),
      ),
    );
  }
}

class EmptyNote extends StatelessWidget {
  const EmptyNote(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Text(text, textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w600)),
    );
  }
}

Future<bool> confirm(BuildContext context, String message) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Confirm'),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Continue')),
      ],
    ),
  );
  return result ?? false;
}

Future<String?> promptText(BuildContext context, String title, {String label = 'Note', bool required = true}) async {
  final controller = TextEditingController();
  final value = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: TextField(controller: controller, decoration: InputDecoration(labelText: label), maxLines: 3),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            final text = controller.text.trim();
            if (required && text.isEmpty) return;
            Navigator.pop(context, text);
          },
          child: const Text('Save'),
        ),
      ],
    ),
  );
  controller.dispose();
  return value;
}

Future<void> runAction(BuildContext context, Future<void> Function() action, {String? success, Future<void> Function()? reload}) async {
  try {
    await action();
    if (!context.mounted) return;
    if (success != null) toast(context, success);
    if (reload != null) await reload();
  } catch (error) {
    if (context.mounted) toast(context, errorText(error), error: true);
  }
}
