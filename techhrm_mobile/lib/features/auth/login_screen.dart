import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme_controller.dart';
import '../../core/json_util.dart';
import '../../core/widgets/common.dart';
import 'auth_provider.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  String? _errorMessage;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    setState(() => _errorMessage = null);
    final username = _usernameController.text.trim();
    final password = _passwordController.text;
    if (username.isEmpty || password.isEmpty) {
      setState(() => _errorMessage = 'Please enter a username or email, and a password.');
      return;
    }
    final error = await context.read<AuthProvider>().login(username, password);
    if (error != null && mounted) setState(() => _errorMessage = error);
  }

  Future<void> _forgot() async {
    await showDialog<void>(
      context: context,
      barrierColor: const Color(0x660F172A),
      builder: (context) => _AccountRecoveryDialog(initialUsername: _usernameController.text.trim()),
    );
  }

  InputDecoration _field(String label, IconData icon, {Widget? suffix}) {
    final scheme = Theme.of(context).colorScheme;
    const border = OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(16)),
      borderSide: BorderSide(color: Color(0xFFE2E8F0)),
    );
    return InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon, color: scheme.onSurfaceVariant),
      suffixIcon: suffix,
      filled: true,
      fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
      contentPadding: const EdgeInsets.fromLTRB(12, 22, 12, 14),
      labelStyle: TextStyle(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w500, fontSize: 16),
      floatingLabelStyle: const TextStyle(color: Color(0xFF4F46E5), fontWeight: FontWeight.w600),
      enabledBorder: border,
      border: border,
      focusedBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
        borderSide: BorderSide(color: Color(0xFF4F46E5), width: 1.6),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = context.watch<AuthProvider>().isLoading;
    final wide = MediaQuery.sizeOf(context).width >= 980;
    final form = _LoginForm(
      usernameController: _usernameController,
      passwordController: _passwordController,
      obscurePassword: _obscurePassword,
      isLoading: isLoading,
      errorMessage: _errorMessage,
      field: _field,
      onTogglePassword: () => setState(() => _obscurePassword = !_obscurePassword),
      onLogin: _handleLogin,
      onForgot: _forgot,
      onApply: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ApplyScreen())),
      onTrack: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TrackScreen())),
    );

    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surface,
      body: wide
          ? Row(
              children: [
                const Expanded(child: _BrandPanel()),
                Expanded(child: form),
              ],
            )
          : form,
    );
  }
}

class _BrandPanel extends StatelessWidget {
  const _BrandPanel();

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset('assets/fcu.jpg', fit: BoxFit.cover, color: const Color(0xFF020617), colorBlendMode: BlendMode.luminosity),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x66020617), Color(0xCC020617), Color(0xFF020617)],
            ),
          ),
        ),
        const Positioned(top: 80, left: 40, child: _Glow(color: Color(0x664F46E5), size: 280)),
        const Positioned(bottom: 80, right: 20, child: _Glow(color: Color(0x4D3B82F6), size: 260)),
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 48),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.verified_user_outlined, color: Color(0xFF34D399), size: 16),
                      SizedBox(width: 8),
                      Text('SECURE ENTERPRISE PORTAL', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.4)),
                    ],
                  ),
                ),
                const SizedBox(height: 28),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(28), boxShadow: const [BoxShadow(color: Color(0x664F46E5), blurRadius: 40)]),
                  child: ClipRRect(borderRadius: BorderRadius.circular(20), child: Image.asset('assets/logo.jpg', width: 112, height: 112, fit: BoxFit.cover)),
                ),
                const SizedBox(height: 28),
                const Text('TechHRM', style: TextStyle(color: Colors.white, fontSize: 48, fontWeight: FontWeight.w600, letterSpacing: -1)),
                const SizedBox(height: 12),
                const Text(
                  'A Work-Study Program Organization Information System for Filamer Christian University, Inc.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 18, height: 1.45, fontWeight: FontWeight.w500),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Glow extends StatelessWidget {
  const _Glow({required this.color, required this.size});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(child: Container(width: size, height: size, decoration: BoxDecoration(shape: BoxShape.circle, color: color, boxShadow: [BoxShadow(color: color, blurRadius: 80, spreadRadius: 20)])));
  }
}

class _LoginForm extends StatelessWidget {
  const _LoginForm({
    required this.usernameController,
    required this.passwordController,
    required this.obscurePassword,
    required this.isLoading,
    required this.errorMessage,
    required this.field,
    required this.onTogglePassword,
    required this.onLogin,
    required this.onForgot,
    required this.onApply,
    required this.onTrack,
  });

  final TextEditingController usernameController;
  final TextEditingController passwordController;
  final bool obscurePassword;
  final bool isLoading;
  final String? errorMessage;
  final InputDecoration Function(String label, IconData icon, {Widget? suffix}) field;
  final VoidCallback onTogglePassword;
  final VoidCallback onLogin;
  final VoidCallback onForgot;
  final VoidCallback onApply;
  final VoidCallback onTrack;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 980;
    final ink = Theme.of(context).colorScheme.onSurface;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Stack(
      children: [
        const Positioned.fill(child: CustomPaint(painter: _DotPainter())),
        Positioned(
          top: 8,
          right: 8,
          child: SafeArea(
            child: IconButton(
              tooltip: context.watch<ThemeController>().isDark ? 'Light mode' : 'Dark mode',
              onPressed: () => context.read<ThemeController>().toggle(),
              icon: Icon(context.watch<ThemeController>().isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
            ),
          ),
        ),
        SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (!wide) ...[
                      Center(child: ClipRRect(borderRadius: BorderRadius.circular(18), child: Image.asset('assets/logo.jpg', width: 80, height: 80, fit: BoxFit.cover))),
                      const SizedBox(height: 16),
                      Text('TechHRM', textAlign: TextAlign.center, style: TextStyle(fontSize: 30, fontWeight: FontWeight.w600, color: ink, letterSpacing: -0.6)),
                      const SizedBox(height: 6),
                      const Text('FCU WORK-STUDY PORTAL', textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF4F46E5), fontWeight: FontWeight.w800, letterSpacing: 1.6, fontSize: 12)),
                      const SizedBox(height: 36),
                    ],
                    Row(
                      children: [
                        Text('Welcome back', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w600, color: ink, letterSpacing: -0.8)),
                        SizedBox(width: 8),
                        Icon(Icons.auto_awesome, color: Color(0xFF6366F1), size: 22),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text('Please enter your credentials to securely access your account.', style: TextStyle(color: muted, fontSize: 16, fontWeight: FontWeight.w500, height: 1.4)),
                    if (errorMessage != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFFECACA))),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline, color: Color(0xFFB91C1C), size: 20),
                            const SizedBox(width: 8),
                            Expanded(child: Text(errorMessage!, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w700))),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 28),
                    TextField(controller: usernameController, textInputAction: TextInputAction.next, style: TextStyle(fontWeight: FontWeight.w700, color: ink), decoration: field('Username or Email', Icons.person_outline)),
                    const SizedBox(height: 16),
                    TextField(
                      controller: passwordController,
                      obscureText: obscurePassword,
                      onSubmitted: (_) => onLogin(),
                      style: TextStyle(fontWeight: FontWeight.w700, color: ink),
                      decoration: field(
                        'Password',
                        Icons.lock_outline,
                        suffix: IconButton(
                          onPressed: onTogglePassword,
                          icon: Icon(obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined, color: const Color(0xFF94A3B8)),
                        ),
                      ),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: isLoading ? null : onForgot,
                        style: TextButton.styleFrom(foregroundColor: const Color(0xFF4F46E5)),
                        child: const Text('Forgot password?'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [Color(0xFF4F46E5), Color(0xFF2563EB)]),
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: const [BoxShadow(color: Color(0x404F46E5), blurRadius: 18, offset: Offset(0, 8))],
                      ),
                      child: ElevatedButton(
                        onPressed: isLoading ? null : onLogin,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.transparent,
                          shadowColor: Colors.transparent,
                          disabledBackgroundColor: Colors.transparent,
                          foregroundColor: Colors.white,
                          minimumSize: const Size.fromHeight(56),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                        child: isLoading
                            ? const Row(mainAxisAlignment: MainAxisAlignment.center, children: [SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)), SizedBox(width: 10), Text('Authenticating...')])
                            : const Row(mainAxisAlignment: MainAxisAlignment.center, children: [Text('Sign In to Dashboard', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)), SizedBox(width: 8), Icon(Icons.arrow_forward, size: 18)]),
                      ),
                    ),
                    const SizedBox(height: 36),
                    const Divider(color: Color(0xFFF1F5F9), height: 1),
                    const SizedBox(height: 28),
                    Text('Interested in joining the Work-Study Program?', textAlign: TextAlign.center, style: TextStyle(color: muted, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 14),
                    OutlinedButton(
                      onPressed: onApply,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF4338CA),
                        backgroundColor: const Color(0xFFF8FAFC),
                        side: const BorderSide(color: Color(0xFFE2E8F0)),
                        minimumSize: const Size.fromHeight(52),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [Text('Submit an Application'), SizedBox(width: 6), Icon(Icons.arrow_forward, size: 16)]),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton(
                      onPressed: onTrack,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF334155),
                        backgroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xFFE2E8F0)),
                        minimumSize: const Size.fromHeight(52),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: const Text('Track an Application'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DotPainter extends CustomPainter {
  const _DotPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = const Color(0xFFE5E7EB);
    for (var y = 8.0; y < size.height; y += 16) {
      for (var x = 8.0; x < size.width; x += 16) {
        canvas.drawCircle(Offset(x, y), 0.8, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _AccountRecoveryDialog extends StatefulWidget {
  const _AccountRecoveryDialog({required this.initialUsername});
  final String initialUsername;

  @override
  State<_AccountRecoveryDialog> createState() => _AccountRecoveryDialogState();
}

class _AccountRecoveryDialogState extends State<_AccountRecoveryDialog> {
  late final TextEditingController _username = TextEditingController(text: widget.initialUsername);
  bool _busy = false;
  String? _error;
  String? _success;
  String? _maskedEmail;
  String? _account;

  @override
  void dispose() {
    _username.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final message = await context.read<AuthProvider>().forgotPassword(_username.text.trim());
    if (!mounted) return;
    final failed = message == null || message.toLowerCase().contains('no account') || message.toLowerCase().contains('could not') || message.toLowerCase().contains('cannot');
    setState(() {
      _busy = false;
      if (failed) {
        _error = message ?? 'Could not send the password reset.';
      } else {
        _success = message;
        _account = _username.text.trim();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.all(24),
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28), side: const BorderSide(color: Color(0xFFE2E8F0))),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFFE0E7FF))),
                    child: const Icon(Icons.mail_outline, color: Color(0xFF4338CA)),
                  ),
                  const SizedBox(width: 14),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Account Recovery', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: Color(0xFF0F172A))),
                        SizedBox(height: 2),
                        Text("We'll email you a temporary password.", style: TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w500)),
                      ],
                    ),
                  ),
                  IconButton(onPressed: _busy ? null : () => Navigator.pop(context), icon: const Icon(Icons.close)),
                ],
              ),
              const SizedBox(height: 24),
              if (_success != null) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: const Color(0xFFECFDF5), borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFFA7F3D0))),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('A temporary password has been successfully dispatched.', style: TextStyle(color: Color(0xFF065F46), fontWeight: FontWeight.w800)),
                      if (_account != null) ...[
                        const SizedBox(height: 12),
                        const Text('REQUESTED ACCOUNT', style: TextStyle(color: Color(0xFF059669), fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.1)),
                        Text(_account!, style: const TextStyle(color: Color(0xFF064E3B), fontWeight: FontWeight.w800)),
                      ],
                      if (_maskedEmail != null) ...[
                        const SizedBox(height: 12),
                        const Text('DELIVERED TO', style: TextStyle(color: Color(0xFF059669), fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.1)),
                        Text(_maskedEmail!, textAlign: TextAlign.center, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800)),
                      ],
                      const SizedBox(height: 12),
                      const Text('Sign in with it, then you will be prompted to choose a new secure password.', style: TextStyle(color: Color(0xFF065F46), fontWeight: FontWeight.w500)),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => Navigator.pop(context), style: FilledButton.styleFrom(backgroundColor: const Color(0xFF4F46E5)), child: const Text('Return to Sign In')),
              ] else ...[
                TextField(
                  controller: _username,
                  decoration: const InputDecoration(labelText: 'Username or Email', prefixIcon: Icon(Icons.person_outline)),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w700)),
                ],
                const SizedBox(height: 16),
                DecoratedBox(
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFF4F46E5), Color(0xFF2563EB)]), borderRadius: BorderRadius.circular(14)),
                  child: ElevatedButton(
                    onPressed: _busy ? null : _send,
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.transparent, shadowColor: Colors.transparent, foregroundColor: Colors.white, minimumSize: const Size.fromHeight(52)),
                    child: Text(_busy ? 'Sending Recovery Email...' : 'Send Temporary Password', style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class ApplyScreen extends StatelessWidget {
  const ApplyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Working student application'), backgroundColor: Colors.white, foregroundColor: kInk, surfaceTintColor: Colors.white),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          Text(
            'Submit on the TechHRM website',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: kInk),
          ),
          SizedBox(height: 12),
          Text(
            'Work-Study applications now use the official personal information sheet and parents consent, with five required documents (application letter, report card or grades, birth certificate, 2 x 2 picture, and certificate of indigency).',
            style: TextStyle(height: 1.45, fontWeight: FontWeight.w600, color: Color(0xFF475569)),
          ),
          SizedBox(height: 12),
          Text(
            'Open the TechHRM website on a computer or phone browser, choose Apply, attach each required file, and save your tracking code after submission. You can still track that application from this app.',
            style: TextStyle(height: 1.45, fontWeight: FontWeight.w600, color: Color(0xFF475569)),
          ),
        ],
      ),
    );
  }
}

class TrackScreen extends StatefulWidget {
  const TrackScreen({super.key});

  @override
  State<TrackScreen> createState() => _TrackScreenState();
}

class _TrackScreenState extends State<TrackScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  Map<String, dynamic>? _result;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _lookup() async {
    setState(() => _busy = true);
    try {
      final data = await context.read<AuthProvider>().api.post('/apply/status', {
        'email': _email.text.trim(),
        'tracking_code': _code.text.trim(),
      });
      setState(() => _result = data is Map ? Map<String, dynamic>.from(data) : {});
    } catch (error) {
      if (mounted) toast(context, errorText(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;
    return Scaffold(
      appBar: AppBar(title: const Text('Track application'), backgroundColor: Colors.white, foregroundColor: kInk, surfaceTintColor: Colors.white),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email'), keyboardType: TextInputType.emailAddress),
          const SizedBox(height: 10),
          TextField(controller: _code, decoration: const InputDecoration(labelText: 'Tracking code')),
          const SizedBox(height: 12),
          FilledButton(onPressed: _busy ? null : _lookup, child: const Text('Look up')),
          if (result != null) ...[
            const SizedBox(height: 20),
            RecordCard(
              title: textOf(result['applicant_name']),
              subtitle: 'Stage: ${textOf(result['current_stage'] ?? result['status'])}',
              children: [
                const SizedBox(height: 8),
                Text('Preferred office: ${textOf(result['preferred_department'])}'),
                Text('Interview: ${whenOf(result['interview_date'])}'),
                if (textOf(result['rejection_reason'], '').isNotEmpty) Text('Reason: ${result['rejection_reason']}'),
              ],
            ),
            for (final event in asMaps(result['events']))
              RecordCard(title: textOf(event['status']), subtitle: textOf(event['note'], ''), trailing: whenOf(event['occurred_at'])),
          ],
        ],
      ),
    );
  }
}

class ForcePasswordScreen extends StatefulWidget {
  const ForcePasswordScreen({super.key});

  @override
  State<ForcePasswordScreen> createState() => _ForcePasswordScreenState();
}

class _ForcePasswordScreenState extends State<ForcePasswordScreen> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await context.read<AuthProvider>().api.post('/user/change-password', {
        'password': _password.text,
        'password_confirmation': _confirm.text,
      });
      if (!mounted) return;
      context.read<AuthProvider>().markPasswordChanged();
      toast(context, 'Your password has been updated.');
    } catch (error) {
      if (mounted) toast(context, errorText(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Choose a new password'), backgroundColor: Colors.white, foregroundColor: kInk, surfaceTintColor: Colors.white, automaticallyImplyLeading: false),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('This account is using a temporary password. Choose a new one before continuing.'),
          const SizedBox(height: 16),
          TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'New password')),
          const SizedBox(height: 10),
          TextField(controller: _confirm, obscureText: true, decoration: const InputDecoration(labelText: 'Confirm password')),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('Update password')),
        ],
      ),
    );
  }
}
