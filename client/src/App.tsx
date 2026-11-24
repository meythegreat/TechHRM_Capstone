import { useState, useEffect, Component, type ReactNode } from 'react';
import axios from 'axios';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import PageTransition from './components/PageTransition';
import { Menu, ShieldCheck, Mail } from 'lucide-react';
import { FinancialManagement } from './components/FinancialManagement';
import { REALTIME_EVENT } from './utils/realtime';

import Login from './components/Login';
import GoogleCalendarCallback from './components/GoogleCalendarCallback';
import LandingPage from './components/LandingPage';
import ForcePasswordChange from './components/ForcePasswordChange';
import Toast from './components/Toast';
import PublicApplication from './components/PublicApplication';
import ApplicationStatusLookup from './components/ApplicationStatusLookup';
import UserManagement from './components/UserManagement';
import ActivityLogs from './components/ActivityLogs';
import StudentDashboard from './components/StudentDashboard';
import AttendanceMonitor from './components/AttendanceMonitor';
import SuperAdminTimesheets from './components/SuperAdminTimesheets';
import SuperAdminAttendanceAudit from './components/SuperAdminAttendanceAudit';
import AdminDashboard from './pages/Admin/AdminDashboard';
import Sidebar from './components/Sidebar';
import NotificationBell from './components/NotificationBell';
import SyncStatus from './components/SyncStatus';
import RequirementManagement from './components/RequirementManagement';
import SecureImage from './components/SecureImage';
import ScheduleManagement from './components/ScheduleManagement';
import { normalizeFilePath } from './utils/secureFile';
import { firstPathSegment, resolveStaffPath } from './config/routes';
import { storeActivityAttendanceCapability } from './utils/wspoActivityAccess';
import { clearStudentDashboardCache } from './utils/studentDashboardCache';

const STAFF_PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  attendance: 'Timesheets',
  schedules: 'Schedules',
  requirements: 'Document Review',
  pipeline: 'Applications',
  'attendance-hub': 'Attendance Hub',
  compliance: 'Compliance',
  evaluations: 'Evaluation',
  logs: 'Audit Trail',
  users: 'User Management',
  offices: 'Offices',
  analytics: 'Reports & Analytics',
  financial: 'Hours Rendered',
  messages: 'Messages',
  help: 'Help',
  settings: 'Profile Settings',
  bulletins: 'Bulletins',
};

const STUDENT_PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  attendance: 'Attendance / DTR',
  'janitorial-code': 'Janitorial code',
  'janitorial-approval': 'Janitorial approval',
  'year-activities': 'Year Activities',
  hours: 'Hours Rendered',
  schedule: 'My Schedule',
  requirements: 'Requirements',
  disciplinary: 'Disciplinary Records',
  application: 'Application Status',
  messages: 'Messages',
  help: 'Help',
  settings: 'Settings',
};
import ApplicationManager from './components/ApplicationManager';
import SupervisorAttendanceHub from './components/SupervisorAttendanceHub';
import DisciplinaryManager from './components/DisciplinaryManager';
import AdminAnalyticsDashboard from './components/AdminAnalyticsDashboard';
import StaffProfileSettings from './components/StaffProfileSettings';
import OfficeDirectory from './components/OfficeDirectory';
import HelpPage from './components/HelpPage';
import EvaluationPage from './components/EvaluationPage';
import MessagesPage from './components/MessagesPage';
import ChatPresence from './components/ChatPresence';
import ChatHeads from './components/ChatHeads';
import { BulletinPopup } from './components/Bulletins';
import BulletinManagement from './components/BulletinManagement';
import InstallAppPrompt from './components/InstallAppPrompt';
import PhoneNotificationPrompt from './components/PhoneNotificationPrompt';
import { unsubscribePhoneNotifications } from './phoneNotifications';
import { chatService } from './services/chatService';

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto my-8 max-w-2xl overflow-hidden rounded-[2rem] border border-slate-200/90 bg-white shadow-xl">
          <div className="relative overflow-hidden bg-slate-950 px-6 py-6 text-white sm:px-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                backgroundSize: '18px 18px',
              }}
              aria-hidden="true"
            />
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-rose-500/25 blur-3xl" aria-hidden="true" />
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-rose-300">
                Screen Recovery
              </span>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white">
                Something on this screen failed to load.
              </h2>
            </div>
          </div>
          <div className="p-6 sm:p-8">
            <p className="max-w-xl text-sm font-medium leading-relaxed text-slate-600">
              Your session is still active. Open another section from the sidebar, or try loading this page again.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(localStorage.getItem('auth_token')));
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('user_role'));
  const [showEvaluation, setShowEvaluation] = useState(
    () => localStorage.getItem('can_file_evaluations') === '1' || localStorage.getItem('can_review_evaluations') === '1',
  );
  const [guestView, setGuestView] = useState<'home' | 'login' | 'apply' | 'track'>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileNoticeHidden, setProfileNoticeHidden] = useState(
    () => sessionStorage.getItem('wospis_profile_notice_hidden') === '1',
  );
  const [passwordToast, setPasswordToast] = useState<string | null>(null);

  const [adminName, setAdminName] = useState(localStorage.getItem('user_name') || 'Admin');
  const [adminAvatar, setAdminAvatar] = useState<string | null>(() => normalizeFilePath(localStorage.getItem('profile_picture')));
  
  const adminFirstName = String(adminName || 'Admin').split(' ')[0];

  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const pageEase = [0.22, 1, 0.36, 1] as const;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const overlays = document.querySelectorAll<HTMLElement>('[data-popup-overlay="true"]');
      const top = overlays[overlays.length - 1] as (HTMLElement & { onpopupclose?: () => void }) | undefined;
      top?.onpopupclose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setIsVerifying(false);
      return;
    }

    axios.get('/api/user', { timeout: 8000 })
      .then(response => {
        const role = response.data.role;
        setUserRole(role);
        if (role) localStorage.setItem('user_role', role);
        if (response.data.name) {
          setAdminName(response.data.name);
          localStorage.setItem('user_name', response.data.name);
        }
        if (role === 'Department Secretary') {
          localStorage.setItem('secretary_acting', '1');
        } else {
          localStorage.removeItem('secretary_acting');
        }
        const canFileEvaluation = Boolean(response.data.can_file_evaluations);
        const canReviewEvaluation = Boolean(response.data.can_review_evaluations);
        localStorage.setItem('can_file_evaluations', canFileEvaluation ? '1' : '0');
        localStorage.setItem('can_review_evaluations', canReviewEvaluation ? '1' : '0');
        setShowEvaluation(canFileEvaluation || canReviewEvaluation);
        storeActivityAttendanceCapability(response.data);
        setMustChangePassword(Boolean(response.data.must_change_password));
        setProfileNotice(response.data.profile_notice || null);
        
        if (response.data.profile_picture) {
           const path = normalizeFilePath(response.data.profile_picture);
           setAdminAvatar(path);
           if (path) localStorage.setItem('profile_picture', path);
        } else {
           setAdminAvatar(null);
           localStorage.removeItem('profile_picture');
        }
      })
      .catch((error) => {
        // A server or network failure is not an expired login. Signing out here
        // deletes the session, so a reload after a failed save lands on the login page.
        if (error?.response?.status === 401) {
          handleLogout();
        }
      })
      .finally(() => {
        setIsVerifying(false);
      });
  }, []);

  useEffect(() => {
    if (!hasToken || !userRole || userRole === 'Student') return;
    const refreshProfile = () => {
      axios.get('/api/user')
        .then((response) => {
          if (response.data.name) {
            setAdminName(response.data.name);
            localStorage.setItem('user_name', response.data.name);
          }
          if (response.data.role === 'Department Secretary') {
            localStorage.setItem('secretary_acting', '1');
          }
          storeActivityAttendanceCapability(response.data);
          setProfileNotice(response.data.profile_notice || null);
          if (response.data.profile_picture) {
            const path = normalizeFilePath(response.data.profile_picture);
            setAdminAvatar(path);
            if (path) localStorage.setItem('profile_picture', path);
          } else {
            setAdminAvatar(null);
            localStorage.removeItem('profile_picture');
          }
        })
        .catch(() => {});
    };
    const interval = setInterval(refreshProfile, 5000);
    window.addEventListener(REALTIME_EVENT, refreshProfile);
    return () => {
      clearInterval(interval);
      window.removeEventListener(REALTIME_EVENT, refreshProfile);
    };
  }, [hasToken, userRole]);

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

  useEffect(() => {
    if (!hasToken) {
      document.title = guestView === 'apply'
        ? 'Apply · WoSPIS'
        : guestView === 'track'
          ? 'Track application · WoSPIS'
          : guestView === 'login'
            ? 'Sign in · WoSPIS'
            : 'WoSPIS';
      return;
    }
    const segment = firstPathSegment(location.pathname);
    const titles = userRole === 'Student' ? STUDENT_PAGE_TITLES : STAFF_PAGE_TITLES;
    const feature = titles[segment];
    document.title = feature ? `${feature} · WoSPIS` : 'WoSPIS';
  }, [hasToken, guestView, userRole, location.pathname]);

  const handleLoginSuccess = (token: string, role: string, name: string, profilePic: string | null, mustChangePassword = false, profileNotice: string | null = null) => {
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
    setShowEvaluation(
      localStorage.getItem('can_file_evaluations') === '1' || localStorage.getItem('can_review_evaluations') === '1',
    );
    setAdminName(name);
    setMustChangePassword(mustChangePassword);
    if (profileNotice) {
      sessionStorage.removeItem('wospis_profile_notice_hidden');
      setProfileNoticeHidden(false);
      setProfileNotice(profileNotice);
    } else {
      setProfileNotice(null);
    }
  };

  const handleLogout = async () => {
    try {
      await chatService.leavePresence().catch(() => undefined);
      await unsubscribePhoneNotifications();
      await axios.post('/api/logout');
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_name');
      localStorage.removeItem('profile_picture');
      localStorage.removeItem('can_check_activity_attendance');
      localStorage.removeItem('can_manage_activity_groups');
      localStorage.removeItem('can_manage_janitorial_groups');
      localStorage.removeItem('can_issue_daily_attendance');
      localStorage.removeItem('is_student_officer');
      localStorage.removeItem('must_clock_as_student');
      localStorage.removeItem('officer_position');
      localStorage.removeItem('assigned_office');
      localStorage.removeItem('can_file_evaluations');
      localStorage.removeItem('can_review_evaluations');
      setShowEvaluation(false);
      clearStudentDashboardCache();
      localStorage.removeItem('secretary_acting');
      setHasToken(false);
      setUserRole(null);
      setAdminAvatar(null);
      setMustChangePassword(false);
      setProfileNotice(null);
      sessionStorage.removeItem('wospis_profile_notice_hidden');
      setProfileNoticeHidden(false);
      setGuestView('home');
      navigate('/');
    }
  };

  const canManageUsers = userRole === 'Super Admin' || userRole === 'WSPO Staff';
  const currentPath = firstPathSegment(location.pathname) || 'dashboard';
  const screen = isVerifying ? 'verify' : hasToken ? 'session' : 'guest';
  const shellMotion = reduceMotion
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: { duration: 0 } }
    : screen === 'session'
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.4, ease: pageEase } }
      : {
          initial: { opacity: 0, y: screen === 'guest' ? 18 : 0 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: screen === 'guest' ? -12 : 0 },
          transition: { duration: 0.45, ease: pageEase },
        };

  return (
    <>
    <InstallAppPrompt />
    <PhoneNotificationPrompt enabled={hasToken} />
    <AnimatePresence mode="wait" initial={false}>
    <motion.div key={screen} {...shellMotion} className={screen === 'session' ? 'h-screen print:h-auto' : 'min-h-screen'}>
    {isVerifying ? (
      <div className="relative flex h-screen items-center justify-center overflow-hidden bg-slate-950 font-sans text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-blue-600/25 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex flex-col items-center gap-4 rounded-[2rem] border border-white/10 bg-white/[0.05] px-10 py-8 backdrop-blur-xl shadow-2xl">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-white/15" />
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-blue-400 border-r-indigo-400" />
          </div>
          <div className="text-center">
            <p className="text-xs font-extrabold uppercase tracking-widest text-blue-300">WoSPIS</p>
            <p className="mt-1 text-sm font-bold text-slate-200">Verifying Secure Session</p>
          </div>
        </div>
      </div>
    ) : location.pathname === '/calendar/google/callback' ? (
      <GoogleCalendarCallback />
    ) : !hasToken ? (
      <PageTransition pageKey={guestView}>
        {guestView === 'home' ? (
          <LandingPage
            onSignIn={() => setGuestView('login')}
            onApply={() => setGuestView('apply')}
            onTrack={() => setGuestView('track')}
          />
        ) : guestView === 'apply' ? (
          <PublicApplication onBackToLogin={() => setGuestView('login')} />
        ) : guestView === 'track' ? (
          <ApplicationStatusLookup
            onBackToLogin={() => setGuestView('login')}
            onNavigateToApply={() => setGuestView('apply')}
          />
        ) : (
          <Login
            onLoginSuccess={handleLoginSuccess}
            onNavigateToApply={() => setGuestView('apply')}
            onNavigateToTrack={() => setGuestView('track')}
            onBackToPortal={() => setGuestView('home')}
          />
        )}
      </PageTransition>
    ) : userRole === 'Student' ? (
      <>
        <ChatPresence enabled />
        <ChatHeads />
        <BulletinPopup />
        <StudentDashboard onLogout={handleLogout} />
      </>
    ) : (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans selection:bg-blue-200 selection:text-blue-900 print:h-auto print:overflow-visible print:bg-white">
      <ChatPresence enabled />
      <ChatHeads />
      <BulletinPopup />
      <Sidebar 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
        activeTab={currentPath}
        setActiveTab={(path) => navigate(`/${path}`)}
        handleLogout={handleLogout}
        userRole={userRole}
        showEvaluation={showEvaluation}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden print:h-auto print:overflow-visible">
        
        {/* FROSTED TOP NAVIGATION BAR */}
        <header className="sticky top-0 z-40 flex h-[4.5rem] shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl sm:px-6 print:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
              aria-label="Toggle navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentPath}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: pageEase }}
                className="hidden items-center gap-2 sm:flex"
              >
                <span className="h-2 w-2 rounded-full bg-blue-600" />
                <h2 className="text-sm font-extrabold tracking-tight text-slate-900">
                  {STAFF_PAGE_TITLES[currentPath] ?? currentPath.replace('-', ' ')}
                </h2>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <SyncStatus />
            <NotificationBell onNavigate={(path) => navigate(`/${path}`)} />

            <div className="hidden text-right sm:block">
              <p className="flex items-center justify-end gap-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                <ShieldCheck className="h-3 w-3 text-blue-500" /> {userRole}
              </p>
              <p className="text-sm font-bold text-slate-900">{adminName}</p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="group flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 font-bold text-slate-600 shadow-xs transition hover:border-blue-400"
              title="Profile settings"
            >
              {adminAvatar ? (
                <SecureImage
                  filePath={adminAvatar}
                  altText="Admin Avatar"
                  className="h-full w-full object-cover transition-transform group-hover:scale-110"
                  fallback={adminFirstName.charAt(0).toUpperCase()}
                />
              ) : (
                adminFirstName.charAt(0).toUpperCase()
              )}
            </button>
          </div>
        </header>

        {/* MAIN CONTENT AREA */}
        <main
          className={`app-content-frame install-clearance relative min-w-0 flex-1 custom-scrollbar print:h-auto print:overflow-visible ${
            currentPath === 'messages' ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto'
          }`}
        >
          {/* Subtle background texture for the entire admin area */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] pointer-events-none -z-10 print:hidden"></div>
          
          <div className={`relative ${currentPath === 'messages' ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
            <PageTransition
              pageKey={location.pathname}
              className={currentPath === 'messages' ? 'flex min-h-0 h-full flex-1 flex-col' : ''}
            >
            <PageErrorBoundary>
              <Routes location={location}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<AdminDashboard />} />
                <Route path="/attendance" element={userRole === 'Super Admin' ? <SuperAdminTimesheets /> : <AttendanceMonitor userRole={userRole} />} />
                <Route path="/schedules" element={<ScheduleManagement />} />
                <Route path="/requirements" element={<RequirementManagement />} />
                <Route path="/pipeline" element={<ApplicationManager />} />
                <Route path="/attendance-hub" element={userRole === 'Super Admin' ? <SuperAdminAttendanceAudit /> : <SupervisorAttendanceHub />} />
                <Route path="/compliance" element={<DisciplinaryManager />} />
                <Route path="/evaluations" element={<EvaluationPage />} />
                
                {userRole === 'Super Admin' && (
                  <Route path="/bulletins" element={<BulletinManagement />} />
                )}
                {canManageUsers && (
                  <>
                    <Route path="/logs" element={<ActivityLogs />} />
                    <Route path="/users" element={<UserManagement />} />
                    <Route path="/offices" element={<OfficeDirectory />} />
                    <Route path="/analytics" element={<AdminAnalyticsDashboard />} />
                    <Route path="/financial" element={<FinancialManagement />} />
                  </>
                )}
                <Route path="/messages" element={<MessagesPage />} />
                <Route path="/help" element={<HelpPage userRole={userRole} />} />
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
            </PageErrorBoundary>
            </PageTransition>
          </div>
        </main>
      </div>
    </div>
    )}
    {hasToken && profileNotice && !profileNoticeHidden && (
      <div className="fixed bottom-4 left-1/2 z-[70] w-[min(40rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-xl shadow-amber-900/10 print:hidden">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold">Add your email and personal information</p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-amber-900">{profileNotice}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="rounded-xl bg-amber-900 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-white"
              >
                Open settings
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem('wospis_profile_notice_hidden', '1');
                  setProfileNoticeHidden(true);
                }}
                className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-amber-900"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    {hasToken && mustChangePassword && (
      <ForcePasswordChange onChanged={() => {
        setMustChangePassword(false);
        setPasswordToast('Your password has been updated.');
      }} />
    )}
    <Toast message={passwordToast} type="success" onClose={() => setPasswordToast(null)} />
    </motion.div>
    </AnimatePresence>
    </>
  );

}

export default App;
