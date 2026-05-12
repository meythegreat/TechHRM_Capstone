import { useState } from 'react';
import axios from 'axios';
import Login from './components/Login';
import UserManagement from './components/UserManagement';
import ActivityLogs from './components/ActivityLogs';
import StudentDashboard from './components/StudentDashboard';
import AttendanceMonitor from './components/AttendanceMonitor';
import AdminDashboard from './pages/Admin/AdminDashboard'; // Your new component

function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(localStorage.getItem('auth_token')));
  const [userRole, setUserRole] = useState<string>(() => localStorage.getItem('user_role') || '');
  const [userName, setUserName] = useState<string>(() => localStorage.getItem('user_name') || '');
  
  // 1. Updated the state type to include 'dashboard' and set it as the default
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'logs' | 'attendance'>('dashboard');

  const handleLogout = async () => {
    try {
      await axios.post('/api/logout');
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_name');
      delete axios.defaults.headers.common.Authorization;
      setHasToken(false);
      setUserRole('');
      setUserName('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {hasToken ? (
        <div>
          <nav className="bg-white shadow-sm border-b border-gray-100 px-8 py-4 flex justify-between items-center">
            <div className="flex items-center gap-8">
                <h1 className="text-xl font-bold text-blue-600 tracking-tight">TechHRM</h1>
                
                {/* Only show these tabs if the user is an Admin */}
                {userRole === 'Admin' && (
                    <div className="flex gap-4">
                        {/* 2. Added the new Dashboard Tab Button */}
                        <button 
                            onClick={() => setActiveTab('dashboard')}
                            className={`text-sm font-semibold transition-colors ${activeTab === 'dashboard' ? 'text-gray-900 border-b-2 border-blue-600 pb-1' : 'text-gray-500 hover:text-gray-900 pb-1'}`}
                        >
                            Dashboard
                        </button>
                        <button 
                            onClick={() => setActiveTab('users')}
                            className={`text-sm font-semibold transition-colors ${activeTab === 'users' ? 'text-gray-900 border-b-2 border-blue-600 pb-1' : 'text-gray-500 hover:text-gray-900 pb-1'}`}
                        >
                            User Management
                        </button>
                        <button 
                            onClick={() => setActiveTab('attendance')}
                            className={`text-sm font-semibold transition-colors ${activeTab === 'attendance' ? 'text-gray-900 border-b-2 border-blue-600 pb-1' : 'text-gray-500 hover:text-gray-900 pb-1'}`}
                        >
                            Timesheets
                        </button>
                        <button 
                            onClick={() => setActiveTab('logs')}
                            className={`text-sm font-semibold transition-colors ${activeTab === 'logs' ? 'text-gray-900 border-b-2 border-blue-600 pb-1' : 'text-gray-500 hover:text-gray-900 pb-1'}`}
                        >
                            Audit Trail
                        </button>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-6">
                <span className="text-sm font-medium text-gray-700">Hello, {userName}</span>
                <button
                    onClick={handleLogout}
                    className="text-sm font-bold text-gray-500 hover:text-red-600 transition-colors"
                >
                    Sign Out
                </button>
            </div>
          </nav>

          <main className="max-w-7xl mx-auto py-6">
            {/* 3. Added the condition to display the AdminDashboard */}
            {userRole === 'Admin' ? (
                <>
                    {activeTab === 'dashboard' && <AdminDashboard />}
                    {activeTab === 'users' && <UserManagement />}
                    {activeTab === 'attendance' && <AttendanceMonitor />}
                    {activeTab === 'logs' && <ActivityLogs />}
                </>
            ) : (
                <StudentDashboard />
            )}
          </main>
        </div>
      ) : (
        <Login onLoggedIn={(role, name) => {
            setUserRole(role);
            setUserName(name);
            setHasToken(true);
        }} />
      )}
    </div>
  );
}

export default App;