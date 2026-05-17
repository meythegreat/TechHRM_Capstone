import { useState } from 'react';
import axios from 'axios';
import { normalizeFilePath } from '../utils/secureFile';

interface LoginProps {
    onLoggedIn: (role: string) => void;
}

const Login = ({ onLoggedIn }: LoginProps) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // The requested See/Hide password state!
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            // Get CSRF cookie first
            await axios.get('/sanctum/csrf-cookie');
            
            const response = await axios.post('/api/login', {
                username,
                password,
            });

            // EXTRACT DIRECTLY FROM response.data based on your backend JSON!
            const { token, role, name, office, profile_picture } = response.data;
            
            // Save everything to localStorage
            localStorage.setItem('auth_token', token);
            localStorage.setItem('user_role', role);
            
            // If name is null from the backend, give it a default fallback
            localStorage.setItem('user_name', name || username); 
            
            localStorage.setItem('profile_picture', normalizeFilePath(profile_picture) || '');
            localStorage.setItem('assigned_office', office || 'System Administrator');

            // Set default headers for all future requests
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

            // Trigger the App.tsx state change
            onLoggedIn(role);

        } catch (err: any) {
            // This will now accurately catch true 401 Unauthorized errors from Laravel
            setError(err.response?.data?.message || 'Invalid username or password. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-white font-sans overflow-hidden">
            
            {/* --- LEFT SIDE: Branding Panel (Hidden on Mobile) --- */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-blue-900 items-center justify-center overflow-hidden">
                {/* FCU Background Image with Overlay */}
                <div className="absolute inset-0">
                    <img 
                        src="/fcu.jpg" 
                        alt="FCU Campus" 
                        className="w-full h-full object-cover opacity-20 mix-blend-overlay" 
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-blue-900/90 via-blue-800/80 to-blue-900/40"></div>
                </div>
                
                {/* Branding Content */}
                <div className="relative z-10 flex flex-col items-center text-center px-12 slide-up">
                    <div className="bg-white p-2 rounded-full shadow-2xl mb-8">
                        <img 
                            src="/logo.jpg" 
                            alt="TechHRM Logo" 
                            className="w-28 h-28 rounded-full border-4 border-gray-50" 
                        />
                    </div>
                    <h1 className="text-5xl font-extrabold text-white tracking-tight mb-4 drop-shadow-md">
                        TechHRM
                    </h1>
                    <p className="text-lg font-medium text-blue-100 max-w-md leading-relaxed">
                        A Work-Study Program Organization Information System for Filamer Christian University, Inc.
                    </p>
                    
                    <div className="mt-12 flex items-center gap-3 bg-white/10 backdrop-blur-sm px-6 py-3 rounded-full border border-white/20">
                        <span className="text-sm font-bold text-blue-50 uppercase tracking-widest">
                            Filamer Christian University, Inc.
                        </span>
                    </div>
                </div>
            </div>

            {/* --- RIGHT SIDE: Login Form --- */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 md:p-16 bg-gray-50 lg:bg-white relative">
                
                {/* Mobile-only Header */}
                <div className="absolute top-8 left-8 lg:hidden flex items-center gap-3">
                    <img src="/logo.jpg" alt="Logo" className="w-10 h-10 rounded-full shadow-sm" />
                    <span className="font-extrabold text-blue-800 text-2xl tracking-tight">TechHRM</span>
                </div>

                <div className="w-full max-w-md space-y-8 fade-in">
                    <div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                            Welcome back
                        </h2>
                        <p className="mt-2 text-sm text-gray-500 font-medium">
                            Please enter your credentials to access your portal.
                        </p>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex items-start gap-3 animate-pulse">
                            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            <span className="text-sm font-bold text-red-700">{error}</span>
                        </div>
                    )}

                    <form className="space-y-6" onSubmit={handleLogin}>
                        
                        {/* Username Field */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" htmlFor="username">
                                Username
                            </label>
                            <input 
                                id="username"
                                type="text" 
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full p-4 bg-gray-50 lg:bg-white border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-900" 
                                placeholder="Username"
                            />
                        </div>

                        {/* Password Field with Show/Hide Toggle */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider" htmlFor="password">
                                    Password
                                </label>
                                <button type="button" className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
                                    Forgot password?
                                </button>
                            </div>
                            <div className="relative">
                                <input 
                                    id="password"
                                    type={showPassword ? "text" : "password"} 
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full p-4 bg-gray-50 lg:bg-white border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-900 pr-16" 
                                    placeholder="••••••••"
                                />
                                <button 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-4 flex items-center text-xs font-bold text-gray-400 hover:text-gray-600 focus:outline-none"
                                >
                                    {showPassword ? "HIDE" : "SHOW"}
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button 
                            type="submit" 
                            disabled={isLoading}
                            className="w-full py-4 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-lg shadow-blue-200 hover:shadow-xl hover:-translate-y-0.5 transition-all flex justify-center items-center gap-2 disabled:bg-blue-400 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            {isLoading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Authenticating...
                                </>
                            ) : (
                                <>
                                    Sign In
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </form>

                    {/* Mobile-only FCU Footer */}
                    <div className="pt-8 mt-8 border-t border-gray-200 flex flex-col items-center justify-center gap-2 lg:hidden">
                        <img src="/fcu.jpg" alt="FCU" className="w-10 h-10 rounded-full shadow-sm" />
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Filamer Christian University, Inc.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;