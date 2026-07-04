import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_provider.dart';

class SupervisorDashboard extends StatefulWidget {
  const SupervisorDashboard({super.key});

  @override
  State<SupervisorDashboard> createState() => _SupervisorDashboardState();
}

class _SupervisorDashboardState extends State<SupervisorDashboard> {
  int _selectedIndex = 0;
  final Color primaryBlue = const Color(0xFF1E3A8A);

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthProvider>();

    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        backgroundColor: primaryBlue,
        elevation: 0,
        title: const Text(
          'TechHRM Supervisor',
          style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: () => auth.logout(),
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
                'Department Head',
                style: TextStyle(fontSize: 14, color: Colors.grey[600], fontWeight: FontWeight.w600),
              ),
              Text(
                auth.userName ?? 'Supervisor',
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.black87),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.orange[50],
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.orange[200]!),
                ),
                child: Text(
                  auth.userDepartment ?? 'Unassigned Office',
                  style: TextStyle(fontSize: 12, color: Colors.orange[800], fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(height: 32),

              // --- STATS ROW ---
              Row(
                children: [
                  _buildStatCard('Active Now', '3', Icons.people, Colors.green),
                  const SizedBox(width: 16),
                  _buildStatCard('Pending Approvals', '12', Icons.pending_actions, Colors.orange),
                ],
              ),
              const SizedBox(height: 32),

              // --- ACTIVE WORKERS SECTION ---
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Currently On Duty',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.black87),
                  ),
                  TextButton(
                    onPressed: () {},
                    child: Text('View All', style: TextStyle(color: primaryBlue)),
                  )
                ],
              ),
              const SizedBox(height: 12),
              
              // MOCK DATA: We will replace this with an API call later
              _buildActiveWorkerTile('Ian Miguel Dumangon', 'Started at 8:00 AM'),
              _buildActiveWorkerTile('Yvan Dale Lastimoso', 'Started at 9:30 AM'),
              _buildActiveWorkerTile('Mc Jersy Dela Cruz', 'Started at 10:15 AM'),
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
          BottomNavigationBarItem(icon: Icon(Icons.fact_check), label: 'Approvals'),
          BottomNavigationBarItem(icon: Icon(Icons.people), label: 'My Team'),
        ],
      ),
    );
  }

  // UI Helper for Stat Cards
  Widget _buildStatCard(String title, String value, IconData icon, MaterialColor color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.grey[200]!),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 4, offset: const Offset(0, 2))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color[600], size: 28),
            const SizedBox(height: 12),
            Text(value, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
            Text(title, style: TextStyle(fontSize: 12, color: Colors.grey[600], fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  // UI Helper for Active Worker List
  Widget _buildActiveWorkerTile(String name, String timeInfo) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: Colors.green[100],
            child: Text(name[0], style: TextStyle(color: Colors.green[800], fontWeight: FontWeight.bold)),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                const SizedBox(height: 4),
                Text(timeInfo, style: TextStyle(fontSize: 12, color: Colors.green[700], fontWeight: FontWeight.w500)),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.message, color: Colors.grey),
            onPressed: () {}, // Future feature: Message student
          )
        ],
      ),
    );
  }
}