import { useState, useEffect, Component, type ReactNode } from 'react';
import axios from 'axios';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Menu, ShieldCheck } from 'lucide-react';
import { FinancialManagement } from './components/FinancialManagement';

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
import StaffProfileSettings from './components/StaffProfileSettings';
import OfficeDirectory from './components/OfficeDirectory';

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">This page could not be shown</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">Something on this screen failed to load.</h2>
          <p className="mt-2 max-w-xl text-sm font-medium text-slate-600">
            Your session is still active. Open another section from the sidebar, or try this page again.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-6 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(localStorage.getItem('auth_token')));
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('user_role'));
  const [isPublicApp, setIsPublicApp] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);

  const [adminName, setAdminName] = useState(localStorage.getItem('user_name') || 'Admin');
  const [adminAvatar, setAdminAvatar] = useState<string | null>(() => normalizeFilePath(localStorage.getItem('profile_picture')));
  
  const adminFirstName = String(adminName || 'Admin').split(' ')[0];

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setIsVerifying(false);
      return;
    }

    axios.get('/api/user')
      .then(response => {
        const role = response.data.role;
        setUserRole(role);
        setAdminName(response.data.name);
        
        if (response.data.profile_picture) {
           const path = normalizeFilePath(response.data.profile_picture);
           setAdminAvatar(path);
           if (path) localStorage.setItem('profile_picture', path);
        }
      })
      .catch(() => {
        handleLogout();
      })
      .finally(() => {
        setIsVerifying(false);
      });
  }, []);

  useEffect(() => {
    if (hasToken && userRole && userRole !== 'Student') {
        const segment = firstPathSegment(location.pathname);
        if (!segment) {
            navigate('/dashboard', { replace: true });
            return;
        }
        const resolved = resolveStaffPath(segment, userRole);
        if (resolved !== segment) {
            navigate(`/${resolved}`, { replace: true });
        }
    }
  }, [hasToken, userRole, location.pathname, navigate]);

  const handleLoginSuccess = (token: string, role: string, name: string, profilePic: string | null) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_role', role);
    localStorage.setItem('user_name', name);
    if (profilePic) {
      const normalizedPath = normalizeFilePath(profilePic);
      if (normalizedPath) {
        localStorage.setItem('profile_picture', normalizedPath);
        setAdminAvatar(normalizedPath);
      }
    } else {
      localStorage.removeItem('profile_picture');
      setAdminAvatar(null);
    }
    
    setHasToken(true);
    setUserRole(role);
    setAdminName(name);
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/logout');
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_name');
      localStorage.removeItem('profile_picture');
      setHasToken(false);
      setUserRole(null);
      setAdminAvatar(null);
      navigate('/');
    }
  };

  // PREMIUM LOADING SCREEN
  if (isVerifying) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 font-sans">
        <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-slate-500 font-bold animate-pulse tracking-widest uppercase text-sm">Verifying Secure Session</p>
        </div>
      </div>
    );
  }

  // PUBLIC ROUTES
  if (!hasToken) {
    return isPublicApp ? (
      <PublicApplication onBackToLogin={() => setIsPublicApp(false)} />
    ) : (
      <Login 
        onLoginSuccess={handleLoginSuccess} 
        onNavigateToApply={() => setIsPublicApp(true)} 
      />
    );
  }

  // STUDENT LAYOUT
  if (userRole === 'Student') {
    return <StudentDashboard onLogout={handleLogout} />;
  }

  // ADMIN / SUPERVISOR / WSPO STAFF LAYOUT
  const canManageUsers = userRole === 'Super Admin' || userRole === 'WSPO Staff';
  const currentPath = firstPathSegment(location.pathname) || 'dashboard';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans selection:bg-blue-200 selection:text-blue-900 print:h-auto print:overflow-visible print:bg-white">
      
      <Sidebar 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
        activeTab={currentPath}
        setActiveTab={(path) => navigate(`/${path}`)}
        handleLogout={handleLogout}
        userRole={userRole}
      />

      <div className="flex-1 flex flex-col overflow-hidden relative print:overflow-visible print:h-auto">
        
        {/* TOP NAVIGATION HEADER */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-6 sm:px-8 z-40 sticky top-0 shadow-sm print:hidden">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-black text-slate-800 capitalize tracking-tight hidden sm:block">
              {currentPath === 'financial' ? 'Hours Rendered' : currentPath.replace('-', ' ')}
            </h2>
          </div>

          <div className="flex items-center gap-5">
            <NotificationBell onNavigate={(path) => navigate(`/${path}`)} />
            
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center justify-end gap-1">
                <ShieldCheck className="w-3 h-3" /> {userRole}
              </p>
              <p className="text-sm font-extrabold text-slate-900">{adminName}</p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="w-10 h-10 bg-slate-100 border-2 border-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold shadow-sm overflow-hidden group cursor-pointer hover:border-blue-400 transition-colors"
              title="Profile settings"
            >
              {adminAvatar ? (
                <SecureImage filePath={adminAvatar} altText="Admin Avatar" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
              ) : (
                adminFirstName.charAt(0).toUpperCase()
              )}
            </button>
          </div>
        </header>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto relative custom-scrollbar print:overflow-visible print:h-auto">
          {/* Subtle background texture for the entire admin area */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] pointer-events-none z-0 print:hidden"></div>
          
          <div className="relative z-10">
            <PageErrorBoundary key={location.pathname}>
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<AdminDashboard />} />
                <Route path="/attendance" element={<AttendanceMonitor userRole={userRole} />} />
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
                    <Route path="/offices" element={<OfficeDirectory />} />
                    <Route path="/analytics" element={<AdminAnalyticsDashboard />} />
                    <Route path="/financial" element={<FinancialManagement />} />
                  </>
                )}
                <Route
                  path="/settings"
                  element={
                    <StaffProfileSettings
                      onProfileUpdated={(name, avatarPath) => {
                        setAdminName(name);
                        setAdminAvatar(avatarPath);
                      }}
                    />
                  }
                />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AnimatePresence>
            </PageErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );

}

export default App;
