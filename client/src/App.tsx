import Login from './components/Login';
import axios from 'axios';
import { useState } from 'react';

function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(localStorage.getItem('auth_token')));

  const handleLogout = async () => {
    try {
      await axios.post('/api/logout');
    } finally {
      localStorage.removeItem('auth_token');
      delete axios.defaults.headers.common.Authorization;
      setHasToken(false);
    }
  };

 return (
  <div className="min-h-screen bg-gray-50 font-sans flex items-center justify-center">
    <div className="App w-full max-w-md px-4">
      {hasToken ? (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 text-center space-y-6">
          <div className="space-y-2">
            <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              {/* This represents a dynamic avatar placeholder */}
              M
            </div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome Back!</h2>
            <p className="text-sm text-gray-500 font-medium">You are currently managed as an Administrator.</p>
          </div>

          <div className="pt-4">
            <button
              onClick={handleLogout}
              className="w-full py-3 px-6 bg-white border-2 border-gray-200 hover:border-red-200 hover:text-red-600 text-gray-600 font-bold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        <Login onLoggedIn={() => setHasToken(true)} />
      )}
    </div>
  </div>
);
}

export default App;