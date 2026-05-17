import { useState, useEffect } from 'react';
import axios from 'axios';
import Login from './components/Login';
import UserManagement from './components/UserManagement';
import ActivityLogs from './components/ActivityLogs';
import StudentDashboard from './components/StudentDashboard';
import AttendanceMonitor from './components/AttendanceMonitor';
import AdminDashboard from './pages/Admin/AdminDashboard';
import Sidebar from './components/Sidebar';
import NotificationBell from './components/NotificationBell';
import RequirementManagement from './components/RequirementManagement';
import SecureImage from './components/SecureImage.tsx';
import { normalizeFilePath } from './utils/secureFile';
import ScheduleManagement from './components/ScheduleManagement';

function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(localStorage.getItem('auth_token')));
  const [userRole, setUserRole] = useState<string>(() => localStorage.getItem('user_role') || '');
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('admin_active_tab') || 'dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- NEW: STATE FOR LOGGED-IN ADMIN PROFILE ---
  const [adminName, setAdminName] = useState(() => localStorage.getItem('user_name') || 'Admin');
  const [adminAvatar, setAdminAvatar] = useState<string | null>(() => normalizeFilePath(localStorage.getItem('profile_picture')));
  const adminFirstName = adminName.split(' ')[0];

  // REFRESH FIX: Save tab every time it changes
  useEffect(() => {
      localStorage.setItem('admin_active_tab', activeTab);
  }, [activeTab]);

  // --- NEW: FETCH ADMIN PROFILE DETAILS ON LOAD ---
  useEffect(() => {
    if (hasToken && userRole !== 'Student') {
        const fetchAdminProfile = async () => {
            try {
                const response = await axios.get('/api/user');
                const user = response.data;
                if (user.name) {
                    setAdminName(user.name);
                    localStorage.setItem('user_name', user.name);
                }
                if (user.profile_picture) {
                    const path = normalizeFilePath(user.profile_picture);
                    setAdminAvatar(path);
                    if (path) localStorage.setItem('profile_picture', path);
                }
            } catch (error) {
                console.error("Failed to fetch admin profile details", error);
            }
        };
        fetchAdminProfile();
    }
  }, [hasToken, userRole]);

  // FULL LOGOUT FUNCTION
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
      setAdminAvatar(null);
    }
  };

  if (!hasToken) {
    return (
        <div className="min-h-screen font-sans">
            <Login onLoggedIn={(role) => {
                setUserRole(role);
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
      { id: 'schedules', label: 'Schedules', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
      { 
        id: 'requirements', 
        label: 'Document Review', 
        icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> 
      },
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
            setIsSidebarOpen={setIsSidebarOpen} 
            activeTab={activeTab} 
            setActiveTab={setActiveTab} 
            handleLogout={handleLogout} 
            navItems={adminNavItems} 
        />
        
        <div className="flex-1 flex flex-col overflow-hidden">
            <header className="h-20 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 relative z-50">
                {/* LEFT SIDE: Menu Toggle & Title */}
                <div className="flex items-center gap-4">
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    <h2 className="text-xl font-bold text-gray-800 capitalize tracking-tight hidden sm:block">
                        {activeTab.replace('-', ' ')}
                    </h2>
                </div>

                {/* RIGHT SIDE: Notification Bell & Admin Secure Avatar */}
                <div className="flex items-center gap-4">
                    <NotificationBell onNavigate={setActiveTab} />
                    
                    <div className="text-right hidden sm:block">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{userRole}</p>
                        <p className="text-sm font-bold text-gray-900">{adminName}</p>
                    </div>

                    {/* NEW FORT KNOX AVATAR CONTAINER */}
                    <div className="w-10 h-10 bg-blue-100 border-2 border-blue-600 rounded-full flex items-center justify-center text-blue-800 font-bold shadow-sm overflow-hidden shrink-0">
                        {adminAvatar ? (
                            <SecureImage filePath={adminAvatar} altText="Admin Avatar" className="w-full h-full object-cover" />
                        ) : (
                            adminFirstName.charAt(0).toUpperCase()
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 sm:p-8">
                {activeTab === 'dashboard' && <AdminDashboard />}
                {activeTab === 'attendance' && <AttendanceMonitor />}
                {activeTab === 'schedules' && <ScheduleManagement />}
                {activeTab === 'logs' && <ActivityLogs />}
                {activeTab === 'users' && <UserManagement />}
                {activeTab === 'requirements' && <RequirementManagement />}
            </main>
        </div>
    </div>
  );
}

export default App;