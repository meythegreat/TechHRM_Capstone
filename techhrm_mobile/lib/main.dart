import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'features/auth/auth_provider.dart';
import 'features/auth/login_screen.dart';
import 'features/dashboard/student_dashboard.dart';
import 'features/dashboard/supervisor_dashboard.dart';

void main() {
  runApp(
    MultiProvider(
      providers: [
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
    return MaterialApp(
      title: 'TechHRM Mobile',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1E3A8A)), // FCU Blue
        useMaterial3: true,
      ),
      home: const AuthGate(),
    );
  }
}

// AuthGate decides which screen to show based on login status
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    if (auth.isAuthenticated) {
      if (auth.userRole == 'Student') {
        return const StudentDashboard();
      } else if (auth.userRole == 'Supervisor') {
        return const SupervisorDashboard(); // <-- UPDATED!
      }
    }
    
    // If not authenticated, show the shiny new Login Screen!
    return const LoginScreen();
  }
}