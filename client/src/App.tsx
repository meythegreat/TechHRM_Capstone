import { useState, useEffect } from 'react';
import axios from 'axios';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';

import Login from './components/Login';
import PublicApplication from './components/PublicApplication';
import UserManagement from './components/UserManagement';
import ActivityLogs from './components/ActivityLogs';
import StudentDashboard from './components/StudentDashboard';
import AttendanceMonitor from './components/AttendanceMonitor';
import AdminDashboard from './pages/Admin/AdminDashboard';
import Sidebar from './components/Sidebar';
import NotificationBell from './components/NotificationBell';
import RequirementManagement from './components/RequirementManagement';
import SecureImage from './components/SecureImage';
import ScheduleManagement from './components/ScheduleManagement';
import { normalizeFilePath } from './utils/secureFile';
import { firstPathSegment, resolveStaffPath } from './config/routes';
import ApplicationManager from './components/ApplicationManager';
import TaskAssignmentManager from './components/TaskAssignmentManager';
import SupervisorAttendanceHub from './components/SupervisorAttendanceHub';
import DisciplinaryManager from './components/DisciplinaryManager';
import AdminAnalyticsDashboard from './components/AdminAnalyticsDashboard';

function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(localStorage.getItem('auth_token')));
  const [userRole, setUserRole] = useState<string>(() => localStorage.getItem('user_role') || '');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);

  const [adminName, setAdminName] = useState(() => localStorage.getItem('user_name') || 'Admin');
  const [adminAvatar, setAdminAvatar] = useState<string | null>(() =>
    normalizeFilePath(localStorage.getItem('profile_picture'))
  );
  const adminFirstName = adminName.split(' ')[0];

  const location = useLocation();
  const navigate = useNavigate();

  const isStudent = userRole === 'Student';
  const isStaff = hasToken && !isStudent;
  const pathSegment = firstPathSegment(location.pathname);
  const currentPath = isStaff ? resolveStaffPath(pathSegment, userRole) : 'dashboard';
  const canManageUsers = userRole === 'Super Admin' || userRole === 'WSPO Staff';

  useEffect(() => {
    if (!hasToken || !isStaff) return;

    if (!pathSegment) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const resolved = resolveStaffPath(pathSegment, userRole);
    if (resolved !== pathSegment) {
      navigate(`/${resolved}`, { replace: true });
    }
  }, [hasToken, isStaff, pathSegment, userRole, navigate]);

  useEffect(() => {
    if (hasToken && !isStudent) {
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
          console.error('Failed to fetch admin profile details', error);
        }
      };
      fetchAdminProfile();
    }
  }, [hasToken, isStudent]);

  const handleLogout = async () => {
    try {
      await axios.post('/api/logout');
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      localStorage.clear();
      delete axios.defaults.headers.common.Authorization;
      setHasToken(false);
      setUserRole('');
      setAdminAvatar(null);
      navigate('/', { replace: true });
    }
  };

  if (!hasToken) {
    if (showApplyForm) {
      return <PublicApplication onBackToLogin={() => setShowApplyForm(false)} />;
    }

    return (
      <div className="min-h-screen font-sans">
        <Login
          onLoggedIn={(role) => {
            setUserRole(role);
            setHasToken(true);
            navigate('/dashboard');
          }}
          onGoToApply={() => setShowApplyForm(true)}
        />
      </div>
    );
  }

  if (isStudent) {
    return <StudentDashboard onLogout={handleLogout} />;
  }

  const staffNavItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      ),
    },
    {
      id: 'attendance',
      label: 'Timesheets',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      ),
    },
    {
      id: 'schedules',
      label: 'Schedules',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      ),
    },
    {
      id: 'requirements',
      label: 'Document Review',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      ),
    },
    {
      id: 'pipeline',
      label: 'Application Pipeline',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      ),
    },
    {
      id: 'tasks',
      label: 'Task Management',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      ),
    },
    {
      id: 'attendance-hub',
      label: 'Attendance Hub',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      ),
    },
    {
      id: 'compliance',
      label: 'Compliance & Discipline',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      ),
    },
  ];

  if (canManageUsers) {
    staffNavItems.push({
      id: 'logs',
      label: 'Audit Trail',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      ),
    });
    staffNavItems.push({
      id: 'users',
      label: 'User Management',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      ),
    });
    staffNavItems.push({
      id: 'analytics',
      label: 'Reports & Analytics',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      ),
    });
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeTab={currentPath}
        setActiveTab={(path) => navigate(`/${path}`)}
        handleLogout={handleLogout}
        navItems={staffNavItems}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-20 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 relative z-50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="text-xl font-bold text-gray-800 capitalize tracking-tight hidden sm:block">
              {currentPath.replace('-', ' ')}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <NotificationBell onNavigate={(path) => navigate(`/${path}`)} />

            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{userRole}</p>
              <p className="text-sm font-bold text-gray-900">{adminName}</p>
            </div>

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
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<AdminDashboard />} />
            <Route path="/attendance" element={<AttendanceMonitor />} />
            <Route path="/schedules" element={<ScheduleManagement />} />
            <Route path="/requirements" element={<RequirementManagement />} />
            <Route path="/pipeline" element={<ApplicationManager />} />
            <Route path="/tasks" element={<TaskAssignmentManager />} />
            <Route path="/attendance-hub" element={<SupervisorAttendanceHub />} />
            <Route path="/compliance" element={<DisciplinaryManager />} />
            {canManageUsers && (
              <>
                <Route path="/logs" element={<ActivityLogs />} />
                <Route path="/users" element={<UserManagement />} />
                <Route path="/analytics" element={<AdminAnalyticsDashboard />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
