import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_provider.dart';

class StudentDashboard extends StatefulWidget {
  const StudentDashboard({super.key});

  @override
  State<StudentDashboard> createState() => _StudentDashboardState();
}

class _StudentDashboardState extends State<StudentDashboard> {
  int _selectedIndex = 0;
  bool _isClockedIn = false; // We will tie this to real backend data later

  final Color primaryBlue = const Color(0xFF1E3A8A); // FCU Blue

  // Function to handle Clock In / Clock Out (Mockup for now)
  void _toggleTimeLog() {
    setState(() {
      _isClockedIn = !_isClockedIn;
    });
    
    // Show a success toast
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(_isClockedIn ? 'Successfully Clocked In!' : 'Successfully Clocked Out!'),
        backgroundColor: _isClockedIn ? Colors.green[700] : Colors.orange[800],
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // watch() ensures the UI updates if the user data changes
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        backgroundColor: primaryBlue,
        elevation: 0,
        title: const Text(
          'TechHRM',
          style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_none, color: Colors.white),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: () => auth.logout(), // Instantly logs them out via Provider
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // --- WELCOME HEADER ---
              Text(
                'Welcome back,',
                style: TextStyle(fontSize: 14, color: Colors.grey[600], fontWeight: FontWeight.w600),
              ),
              Text(
                // Uses the real name from the database!
                auth.userName ?? 'Student', 
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.black87),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.blue[200]!),
                ),
                child: Text(
                  // Uses the real assigned department from the database!
                  auth.userDepartment ?? 'Unassigned Office',
                  style: TextStyle(fontSize: 12, color: primaryBlue, fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(height: 24),

              // --- CLOCK IN / OUT ACTION CARD ---
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: _isClockedIn 
                        ? [Colors.orange[400]!, Colors.orange[600]!] // Warning colors when clocked in
                        : [primaryBlue, const Color(0xFF2563EB)],   // FCU Blue when ready to clock in
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 10, offset: const Offset(0, 5)),
                  ],
                ),
                child: Column(
                  children: [
                    Text(
                      _isClockedIn ? 'YOU ARE ON DUTY' : 'READY TO WORK?',
                      style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.5),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      '10:24 AM', // We will replace this with a real-time clock later
                      style: TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w900, height: 1),
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton.icon(
                      onPressed: _toggleTimeLog,
                      icon: Icon(_isClockedIn ? Icons.stop_circle_outlined : Icons.play_circle_fill, color: _isClockedIn ? Colors.orange[800] : primaryBlue),
                      label: Text(
                        _isClockedIn ? 'CLOCK OUT' : 'CLOCK IN',
                        style: TextStyle(fontWeight: FontWeight.bold, color: _isClockedIn ? Colors.orange[800] : primaryBlue),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // --- STATS ROW ---
              Row(
                children: [
                  _buildStatCard('Hours Rendered', '42.5', Icons.timer, Colors.green),
                  const SizedBox(width: 16),
                  _buildStatCard('Remaining', '57.5', Icons.pending_actions, Colors.orange),
                ],
              ),
              const SizedBox(height: 32),

              // --- RECENT SCHEDULE / LOGS ---
              const Text(
                'Today\'s Schedule',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.black87),
              ),
              const SizedBox(height: 12),
              _buildScheduleTile('System Maintenance', '8:00 AM - 12:00 PM', 'CCS Lab 1'),
              _buildScheduleTile('Inventory Check', '1:00 PM - 3:00 PM', 'Dean\'s Office'),
            ],
          ),
        ),
      ),
      
      // --- BOTTOM NAVIGATION BAR ---
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (index) => setState(() => _selectedIndex = index),
        selectedItemColor: primaryBlue,
        unselectedItemColor: Colors.grey,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.calendar_month), label: 'Schedule'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }

  // UI Helper for the Stat Cards
  Widget _buildStatCard(String title, String value, IconData icon, MaterialColor color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.grey[200]!),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color[600], size: 24),
            const SizedBox(height: 12),
            Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            Text(title, style: TextStyle(fontSize: 12, color: Colors.grey[600], fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }

  // UI Helper for Schedule List
  Widget _buildScheduleTile(String task, String time, String location) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 4, offset: const Offset(0, 2))],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.blue[50], borderRadius: BorderRadius.circular(10)),
            child: Icon(Icons.work_outline, color: primaryBlue),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(task, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                const SizedBox(height: 4),
                Text('$time • $location', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
              ],
            ),
          ),
        ],
      ),
    );
  }
}