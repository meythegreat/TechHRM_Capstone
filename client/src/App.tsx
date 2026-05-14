import { useState, useEffect } from 'react';
import axios from 'axios';
import Login from './components/Login';
import UserManagement from './components/UserManagement';
import ActivityLogs from './components/ActivityLogs';
import StudentDashboard from './components/StudentDashboard';
import AttendanceMonitor from './components/AttendanceMonitor';
import AdminDashboard from './pages/Admin/AdminDashboard';
import Sidebar from './components/Sidebar';

function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(localStorage.getItem('auth_token')));
  const [userRole, setUserRole] = useState<string>(() => localStorage.getItem('user_role') || '');
  
  // REFRESH FIX: Load initial tab from localStorage
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('admin_active_tab') || 'dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // REFRESH FIX: Save tab every time it changes
  useEffect(() => {
      localStorage.setItem('admin_active_tab', activeTab);
  }, [activeTab]);

  // FULL LOGOUT FUNCTION (No placeholders!)
  const handleLogout = async () => {
    try {
      await axios.post('/api/logout');
    } catch (err) {
        console.error("Logout error", err);
    } finally {
      localStorage.clear(); 
      delete axios.defaults.headers.common.Authorization;
      setHasToken(false);
      setUserRole('');
    }
  };

  if (!hasToken) {
    return (
        <div className="min-h-screen font-sans">
            <Login onLoggedIn={(role) => {
                setUserRole(role);
                // We set local storage here inside Login component usually, 
                // but setting token state triggers the re-render.
                setHasToken(true);
            }} />
        </div>
    );
  }

  // Students get their own portal
  if (userRole === 'Student') {
      return <StudentDashboard />;
  }

  // --- ADMIN & SUPERVISOR NAVIGATION ---
  const adminNavItems = [
      { id: 'dashboard', label: 'Dashboard', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
      { id: 'attendance', label: 'Timesheets', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  ];

  if (userRole === 'Super Admin' || userRole === 'WSPO Staff') {
      adminNavItems.push({ id: 'logs', label: 'Audit Trail', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> });
  }

  if (userRole === 'Super Admin') {
      adminNavItems.push({ id: 'users', label: 'User Management', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /> });
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
        <Sidebar 
            isSidebarOpen={isSidebarOpen} 
            activeTab={activeTab} 
            setActiveTab={setActiveTab} 
            handleLogout={handleLogout} 
            navItems={adminNavItems} 
        />
        
        <div className="flex-1 flex flex-col overflow-hidden">
            <header className="h-20 bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 mr-4 text-gray-500 hover:bg-gray-100 rounded-lg">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
                <h2 className="text-xl font-bold text-gray-800 capitalize tracking-tight">
                    {activeTab.replace('-', ' ')}
                </h2>
            </header>

            <main className="flex-1 overflow-y-auto p-4 sm:p-8">
                {activeTab === 'dashboard' && <AdminDashboard />}
                {activeTab === 'attendance' && <AttendanceMonitor />}
                {activeTab === 'logs' && <ActivityLogs />}
                {activeTab === 'users' && <UserManagement />}
            </main>
        </div>
    </div>
  );
}

export default App;