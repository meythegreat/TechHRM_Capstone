import { useState } from 'react';
import type { FormEvent } from 'react'; // Explicit type-only import
import axios from 'axios';

type LoginProps = {
    onLoggedIn?: () => void;
};

const Login = ({ onLoggedIn }: LoginProps) => {
    // Add basic state types
    const [username, setUsername] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    // Define the event type as FormEvent<HTMLFormElement>
    const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
        const response = await axios.post('/api/login', {
            username,
            password
        });

        const token: string | undefined = response.data?.token;
        if (token) {
            localStorage.setItem('auth_token', token);
        }

        alert(`Login successful! Role: ${response.data.user.role}`);
        onLoggedIn?.();
        // redirect logic here...

    } catch (err: any) {
        if (err.response?.status === 419) {
            setError('Security token error. Please try again.');
        } else if (err.response?.status === 401) {
            setError('Invalid username or password.');
        } else {
            setError('An unexpected error occurred.');
        }
    } finally {
        setIsLoading(false);
    }
};

    return (
        <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif' }}>
            <h2 style={{ textAlign: 'center' }}>System Login</h2>
            
            {error && (
                <div style={{ color: '#fff', backgroundColor: '#e74c3c', padding: '10px', marginBottom: '15px', borderRadius: '4px', textAlign: 'center' }}>
                    {error}
                </div>
            )}
            
            <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Username</label>
                    <input 
                        type="text" 
                        value={username} 
                        onChange={(e) => setUsername(e.target.value)} 
                        required 
                        style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Password</label>
                    <input 
                        type="password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                        style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>
                
                <button 
                    type="submit" 
                    disabled={isLoading}
                    style={{ 
                        width: '100%', 
                        padding: '12px', 
                        backgroundColor: isLoading ? '#95a5a6' : '#2c3e50', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '4px', 
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        fontSize: '16px'
                    }}
                >
                    {isLoading ? 'Authenticating...' : 'Secure Login'}
                </button>
            </form>
        </div>
    );
};

export default Login;