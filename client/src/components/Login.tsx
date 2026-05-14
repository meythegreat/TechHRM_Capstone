import { useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';

type LoginProps = {
    onLoggedIn?: (role: string, name: string) => void;
};

const Login = ({ onLoggedIn }: LoginProps) => {
    const [username, setUsername] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            // Ensure CSRF handshake is made before logging in
            await axios.get('/sanctum/csrf-cookie');

            const response = await axios.post('/api/login', {
                username,
                password
            });

            const token: string | undefined = response.data?.token;
            if (token) {
                // Store using the new flattened structure from Laravel
                localStorage.setItem('auth_token', token);
                localStorage.setItem('user_role', response.data.role);
                localStorage.setItem('user_name', response.data.name);
                
                // Save the assigned office for the Student Dashboard
                localStorage.setItem('assigned_office', response.data.office || 'Unassigned');

                // Tell Axios to attach this token to all future requests
                axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            }

            // Pass the flat structure up to App.tsx
            onLoggedIn?.(response.data.role, response.data.name);

        } catch (err: any) { 
            if (err.response?.status === 419) {
                setError('Security session expired. Please refresh.');
            } else if (err.response?.status === 401) {
                setError('Invalid username or password.');
            } else {
                setError('Connection error. Is the server running?');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        // --- WSPO LOGO BACKGROUND (logo.jpg) --- 
        // Updated with whole-page background blur using a blurred overlay
        <div 
            className="min-h-screen flex items-center justify-center bg-gray-100 bg-cover bg-center bg-no-repeat relative font-sans"
            style={{ backgroundImage: `url('/logo.jpg')` }}
        >
            {/* Dark Blue Blurred Overlay to make the background subtle and content pop */}
            <div className="absolute inset-0 bg-gray-700/85 mix-blend-multiply backdrop-blur-lg"></div>

            {/* FROSTED GLASS CONTAINER - Less transparent for better readability */}
            <div className="relative z-10 w-full max-w-md p-8 space-y-6 bg-white/95 rounded-3xl shadow-2xl border border-white/30">
                
                {/* --- NEW LOGO & TITLE SECTION --- */}
                <div className="text-center flex flex-col items-center">
                    {/* Circular Logos with Shadow */}
                    <div className="flex justify-center gap-6 mb-8">
                        <img 
                            src="/fcu.jpg" 
                            alt="Filamer Christian University Logo"
                            className="w-24 h-24 rounded-full shadow-lg border-4 border-white/50 object-cover" 
                        />
                        <img 
                            src="/logo.jpg" 
                            alt="Working Students Program Office Logo"
                            className="w-24 h-24 rounded-full shadow-lg border-4 border-white/50 object-cover" 
                        />
                    </div>

                    <h1 className="text-4xl font-extrabold text-blue-700 tracking-tight mb-2">TechHRM</h1>
                    <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Working Students Program Office
                    </p>
                    {/* --- NEW SUBTITLE --- */}
                    <p className="mt-3 text-[11px] font-medium text-gray-500 leading-relaxed max-w-sm">
                        A Work-Study Program Organization Information System for 
                        <span className='font-semibold'> Filamer Christian University, Inc.</span>
                    </p>
                </div>
                {/* ---------------------------------- */}

                {error && (
                    <div className="p-3 text-sm text-red-700 font-medium bg-red-50 border border-red-200 rounded-lg animate-pulse text-center">
                        {error}
                    </div>
                )}

                <form className="space-y-5" onSubmit={handleLogin}>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2 ml-1">
                            Username
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 shadow-sm"
                            placeholder="Enter your username"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2 ml-1">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 shadow-sm"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-4 px-6 mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Authenticating...
                            </span>
                        ) : (
                            'Secure Login'
                        )}
                    </button>
                </form>
                
                <div className="text-center pt-6 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-500">
                        Filamer Christian University, Inc.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;