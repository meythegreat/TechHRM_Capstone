import { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { normalizeFilePath } from '../utils/secureFile';

interface LoginProps {
    onLoggedIn: (role: string) => void;
    onGoToApply?: () => void;
}

const Login = ({ onLoggedIn, onGoToApply }: LoginProps) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccessMsg(null);

        try {
            const response = await axios.post('/api/login', { username, password });
            const { token, role, name, office, profile_picture } = response.data;

            localStorage.setItem('auth_token', token);
            localStorage.setItem('user_role', role);
            localStorage.setItem('user_name', name || username);
            localStorage.setItem('profile_picture', normalizeFilePath(profile_picture) || '');
            localStorage.setItem('assigned_office', office || 'System Administrator');

            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

            setSuccessMsg(`Welcome back, ${name || username}!`);
            setTimeout(() => {
                onLoggedIn(role);
            }, 1500);

        } catch (err: any) {
            if (!err.response) {
                setError('Cannot reach the server. Ensure Laravel is running.');
                return;
            }
            setError(err.response?.data?.message || 'Invalid credentials. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-slate-50 font-sans overflow-hidden selection:bg-blue-200 selection:text-blue-900">
            
            {/* --- LEFT SIDE: Animated Branding Panel --- */}
            <motion.div 
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="hidden lg:flex lg:w-1/2 relative bg-blue-950 items-center justify-center overflow-hidden"
            >
                <div className="absolute inset-0">
                    <motion.img 
                        initial={{ scale: 1.1 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 10, repeat: Infinity, repeatType: "reverse" }}
                        src="/fcu.jpg" 
                        alt="FCU Campus" 
                        className="w-full h-full object-cover opacity-30 mix-blend-luminosity" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-950/95 via-blue-900/90 to-blue-800/80 backdrop-blur-[2px]"></div>
                </div>
                
                <div className="relative z-10 flex flex-col items-center text-center px-12">
                    <motion.div 
                        whileHover={{ scale: 1.05, rotate: 5 }}
                        className="bg-white p-3 rounded-full shadow-2xl mb-8 cursor-pointer"
                    >
                        <img src="/logo.jpg" alt="TechHRM Logo" className="w-28 h-28 rounded-full border-4 border-slate-50" />
                    </motion.div>
                    
                    <motion.h1 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-5xl font-black text-white tracking-tight mb-4 drop-shadow-lg"
                    >
                        TechHRM
                    </motion.h1>
                    
                    <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="text-lg font-medium text-blue-100/90 max-w-md leading-relaxed"
                    >
                        A Work-Study Program Organization Information System for Filamer Christian University, Inc.
                    </motion.p>
                </div>
            </motion.div>

            {/* --- RIGHT SIDE: Login Form --- */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 md:p-16 bg-white relative shadow-[-20px_0_40px_-15px_rgba(0,0,0,0.05)] z-20">
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="w-full max-w-md space-y-8"
                >
                    <div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                            Sign in
                        </h2>
                        <p className="mt-2 text-sm text-slate-500 font-medium">
                            Access your work-study portal securely.
                        </p>
                    </div>

                    {/* Animated Toasts */}
                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0, y: -10 }}
                                animate={{ opacity: 1, height: 'auto', y: 0 }}
                                exit={{ opacity: 0, height: 0 }}
                                className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 shadow-sm overflow-hidden"
                            >
                                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                <span className="text-sm font-semibold text-red-800">{error}</span>
                            </motion.div>
                        )}
                        {successMsg && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0, y: -10 }}
                                animate={{ opacity: 1, height: 'auto', y: 0 }}
                                exit={{ opacity: 0, height: 0 }}
                                className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3 shadow-sm overflow-hidden"
                            >
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                                <span className="text-sm font-semibold text-emerald-800">{successMsg}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <form className="space-y-6 pt-2" onSubmit={handleLogin}>
                        
                        {/* Username Floating Label Input */}
                        <div className="relative">
                            <input 
                                id="username"
                                type="text" 
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="block px-4 pb-3 pt-6 w-full text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent peer transition-all shadow-sm" 
                                placeholder=" "
                            />
                            <label 
                                htmlFor="username" 
                                className="absolute text-sm text-slate-500 duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-blue-600 font-medium"
                            >
                                Username or FCU Gmail
                            </label>
                        </div>

                        {/* Password Floating Label Input */}
                        <div className="space-y-2">
                            <div className="relative">
                                <input 
                                    id="password"
                                    type={showPassword ? "text" : "password"} 
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block px-4 pb-3 pt-6 w-full text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent peer transition-all shadow-sm pr-12" 
                                    placeholder=" "
                                />
                                <label 
                                    htmlFor="password" 
                                    className="absolute text-sm text-slate-500 duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-blue-600 font-medium"
                                >
                                    Password
                                </label>
                                
                                <button 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-3 flex items-center justify-center p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all focus:outline-none"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            
                            <div className="flex justify-end">
                                <button type="button" className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
                                    Forgot password?
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <motion.button 
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit" 
                            disabled={isLoading}
                            className="w-full py-3.5 mt-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-xl transition-all duration-200 flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Authenticating...
                                </>
                            ) : (
                                <>
                                    Sign In to Portal
                                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                                </>
                            )}
                        </motion.button>
                    </form>

                    {onGoToApply && (
                        <div className="pt-8 mt-8 border-t border-slate-100 text-center">
                            <p className="text-sm text-slate-500 font-medium">Interested in the Work-Study Program?</p>
                            <button
                                type="button"
                                onClick={onGoToApply}
                                className="mt-1.5 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors inline-flex items-center gap-1 group"
                            >
                                Submit an Application
                                <ArrowRight className="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                            </button>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
};

export default Login;