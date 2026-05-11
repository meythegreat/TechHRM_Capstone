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
    <div className="App">
      {hasToken ? (
        <div style={{ maxWidth: 400, margin: '50px auto', fontFamily: 'sans-serif' }}>
          <div style={{ padding: 20, border: '1px solid #ccc', borderRadius: 8 }}>
            <h2 style={{ textAlign: 'center' }}>You are logged in</h2>
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#2c3e50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '16px',
              }}
            >
              Logout
            </button>
          </div>
        </div>
      ) : (
        <Login onLoggedIn={() => setHasToken(true)} />
      )}
    </div>
  );
}

export default App;