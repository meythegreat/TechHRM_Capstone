import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/theme_controller.dart';
import 'core/widgets/common.dart';
import 'features/auth/auth_provider.dart';
import 'features/auth/login_screen.dart';
import 'features/shell/home_shell.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeController()),
        ChangeNotifierProvider(create: (_) => AuthProvider()),
      ],
      child: const TechHRMApp(),
    ),
  );
}

class TechHRMApp extends StatelessWidget {
  const TechHRMApp({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeController>();
    return MaterialApp(
      title: 'TechHRM',
      debugShowCheckedModeBanner: false,
      theme: techTheme(),
      darkTheme: techDarkTheme(),
      themeMode: theme.isDark ? ThemeMode.dark : ThemeMode.light,
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (!auth.ready) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Opening your session', style: TextStyle(color: kMuted, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      );
    }
    if (!auth.isAuthenticated) return const LoginScreen();
    if (auth.mustChangePassword) return const ForcePasswordScreen();
    return const HomeShell();
  }
}
