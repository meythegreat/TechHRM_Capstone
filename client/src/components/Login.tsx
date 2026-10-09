import { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { 
    Eye, 
    EyeOff, 
    Loader2, 
    CheckCircle2, 
    ArrowRight, 
    X, 
    Mail, 
    ShieldCheck, 
    User, 
    Lock,
    Sparkles,
    AlertCircle
} from 'lucide-react';
import Toast from './Toast';
import ThemeToggle from './ThemeToggle';
import { normalizeFilePath } from '../utils/secureFile';

interface LoginProps {
    onLoginSuccess: (token: string, role: string, name: string, profilePic: string | null, mustChangePassword: boolean) => void;
    onNavigateToApply: () => void;
}

const Login = ({ onLoginSuccess, onNavigateToApply }: LoginProps) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [forgotOpen, setForgotOpen] = useState(false);
    const [forgotUsername, setForgotUsername] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotError, setForgotError] = useState<string | null>(null);
    const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
    const [forgotMaskedEmail, setForgotMaskedEmail] = useState<string | null>(null);
    const [forgotAccount, setForgotAccount] = useState<string | null>(null);
    
    const reduceMotion = useReducedMotion();
    const ease = [0.22, 1, 0.36, 1] as const;
    
    const formVariants = {
        hidden: {},
        show: { transition: { staggerChildren: reduceMotion ? 0 : 0.08, delayChildren: reduceMotion ? 0 : 0.12 } },
    };
    const itemVariants = {
        hidden: reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.45, ease } },
    };

    const openForgotPassword = () => {
        setForgotUsername(username);
        setForgotError(null);
        setForgotSuccess(null);
        setForgotMaskedEmail(null);
        setForgotAccount(null);
        setForgotOpen(true);
    };

    const closeForgotPassword = () => {
        if (forgotLoading) return;
        setForgotOpen(false);
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setForgotLoading(true);
        setForgotError(null);
        setForgotSuccess(null);
        setForgotMaskedEmail(null);
        setForgotAccount(null);

        try {
            const response = await axios.post('/api/forgot-password', { username: forgotUsername.trim() });
            setForgotMaskedEmail(response.data?.masked_email || null);
            setForgotAccount(response.data?.account || forgotUsername.trim());
            setForgotSuccess(response.data?.message || 'A temporary password has been sent to this account\'s email.');
        } catch (err: any) {
            const message = !err.response
                ? 'Cannot reach the server. Ensure Laravel is running.'
                : (err.response?.data?.message || 'Could not send the password reset.');
            setForgotError(message);
        } finally {
            setForgotLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccessMsg(null);

        try {
            const response = await axios.post('/api/login', { username, password });
            const { token, role, name, office, profile_picture, must_change_password } = response.data;

            localStorage.setItem('auth_token', token);
            localStorage.setItem('user_role', role);
            localStorage.setItem('user_name', name || username);
            localStorage.setItem('profile_picture', normalizeFilePath(profile_picture) || '');
            localStorage.setItem('assigned_office', office || 'System Administrator');

            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

            setSuccessMsg(`Welcome back, ${name || username}!`);
            setTimeout(() => {
                onLoginSuccess(token, role, name || username, profile_picture || null, Boolean(must_change_password));
            }, 1100);

        } catch (err: any) {
            const message = !err.response
                ? 'Cannot reach the server. Ensure Laravel is running.'
                : (err.response?.data?.message || 'Invalid credentials. Please try again.');
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-white font-sans selection:bg-indigo-200 selection:text-indigo-900">
            
            {/* --- LEFT SIDE: Immersive Branding Panel (Desktop Only) --- */}
            <motion.div 
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="hidden lg:flex lg:w-1/2 relative bg-slate-950 items-center justify-center overflow-hidden"
            >
                {/* Ambient Glowing Orbs */}
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-[128px] opacity-40 animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-[128px] opacity-30"></div>

                <div className="absolute inset-0 z-0">
                    <motion.img 
                        initial={{ scale: 1.1 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 10, repeat: Infinity, repeatType: "reverse" }}
                        src="/fcu.jpg" 
                        alt="FCU Campus" 
                        className="w-full h-full object-cover opacity-25 mix-blend-luminosity" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent"></div>
                </div>
                
                <div className="relative z-10 flex flex-col items-center text-center px-12 mt-12">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 backdrop-blur-md mb-8 shadow-2xl"
                    >
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span className="text-[11px] font-black text-slate-200 uppercase tracking-widest">Secure Enterprise Portal</span>
                    </motion.div>

                    <motion.div 
                        whileHover={{ scale: 1.05, rotate: 5 }}
                        className="bg-white p-3 rounded-3xl shadow-[0_0_40px_rgba(79,70,229,0.3)] mb-8 cursor-pointer relative group"
                    >
                        <div className="absolute inset-0 bg-indigo-500 rounded-3xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500"></div>
                        <img src="/logo.jpg" alt="TechHRM Logo" className="w-28 h-28 rounded-2xl relative z-10" />
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
                        className="text-lg font-medium text-slate-300 max-w-md leading-relaxed"
                    >
                        A Work-Study Program Organization Information System for Filamer Christian University, Inc.
                    </motion.p>
                </div>
            </motion.div>

            {/* --- RIGHT SIDE: Login Form --- */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 md:p-16 bg-white relative z-20 overflow-y-auto min-h-screen">
                
                {/* Subtle Right Side Texture */}
                <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-30 pointer-events-none"></div>

                <div className="absolute top-6 right-6 z-50">
                    <ThemeToggle />
                </div>

                <motion.div
                    variants={formVariants}
                    initial="hidden"
                    animate="show"
                    className="w-full max-w-md space-y-8 my-auto py-8 relative z-10"
                >
                    {/* Mobile Branding */}
                    <motion.div variants={itemVariants} className="flex flex-col items-center mb-10 lg:hidden text-center">
                        <img src="/logo.jpg" alt="TechHRM Logo" className="w-20 h-20 rounded-2xl shadow-xl mb-4" />
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">TechHRM</h1>
                        <p className="text-sm font-bold text-indigo-600 uppercase tracking-widest mt-2">FCU Work-Study Portal</p>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            Welcome back <Sparkles className="w-6 h-6 text-indigo-500 hidden sm:block" />
                        </h2>
                        <p className="mt-2 text-base text-slate-500 font-medium">
                            Please enter your credentials to securely access your account.
                        </p>
                    </motion.div>

                    <Toast message={error} type="error" onClose={() => setError(null)} />

                    <motion.form variants={itemVariants} className="space-y-5 pt-2" onSubmit={handleLogin}>
                        
                        {/* Username Input with Icon */}
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                            </div>
                            <input 
                                id="username"
                                type="text"
                                autoComplete="username"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="block pl-12 pr-4 pb-3 pt-6 w-full text-base font-bold text-slate-900 bg-slate-50/50 border border-slate-200 rounded-2xl appearance-none focus:outline-none focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 focus:bg-white peer transition-all shadow-sm" 
                                placeholder=" "
                            />
                            <label 
                                htmlFor="username" 
                                className="absolute text-base text-slate-500 duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-left left-12 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-indigo-600 font-medium cursor-text"
                            >
                                Username or Email
                            </label>
                        </div>

                        {/* Password Input with Icon */}
                        <div className="space-y-3">
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                                </div>
                                <input 
                                    id="password"
                                    type={showPassword ? "text" : "password"} 
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block pl-12 pr-14 pb-3 pt-6 w-full text-base font-bold text-slate-900 bg-slate-50/50 border border-slate-200 rounded-2xl appearance-none focus:outline-none focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 focus:bg-white peer transition-all shadow-sm" 
                                    placeholder=" "
                                />
                                <label 
                                    htmlFor="password" 
                                    className="absolute text-base text-slate-500 duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-left left-12 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-indigo-600 font-medium cursor-text"
                                >
                                    Password
                                </label>
                                
                                <button 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-1 w-12 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-xl transition-all focus:outline-none"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={openForgotPassword}
                                    className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors py-1 px-1"
                                >
                                    Forgot password?
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <motion.button 
                            whileHover={{ scale: 1.01, translateY: -2 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit" 
                            disabled={isLoading}
                            className="w-full py-4 mt-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-base font-bold rounded-2xl shadow-lg shadow-indigo-600/25 transition-all duration-300 flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Authenticating...
                                </>
                            ) : (
                                <>
                                    Sign In to Dashboard
                                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                                </>
                            )}
                        </motion.button>
                    </motion.form>

                    {onNavigateToApply && (
                        <motion.div variants={itemVariants} className="pt-8 mt-8 border-t border-slate-100">
                            <p className="text-sm text-slate-500 font-medium text-center mb-4">Interested in joining the Work-Study Program?</p>
                            <button
                                type="button"
                                onClick={onNavigateToApply}
                                className="w-full py-3.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-sm font-bold text-indigo-700 hover:text-indigo-800 transition-all flex justify-center items-center gap-2 group hover:border-indigo-200"
                            >
                                Submit an Application
                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                            </button>
                        </motion.div>
                    )}
                </motion.div>

                {/* FORGOT PASSWORD MODAL */}
                <AnimatePresence>
                    {forgotOpen && (
                        <motion.div
                            key="forgot-password"
                            initial={reduceMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.2 }}
                            className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm"
                            onClick={closeForgotPassword}
                        >
                            <motion.div
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="forgot-password-title"
                                initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 26 }}
                                className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl"
                                onClick={(event) => event.stopPropagation()}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-100">
                                            <Mail className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h3 id="forgot-password-title" className="text-xl font-black text-slate-900 tracking-tight">Account Recovery</h3>
                                            <p className="text-sm font-medium text-slate-500 mt-0.5">We'll email you a temporary password.</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={closeForgotPassword}
                                        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                {forgotSuccess ? (
                                    <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                                        <p className="text-sm font-bold text-emerald-800">
                                            A temporary password has been successfully dispatched.
                                        </p>
                                        {forgotAccount && forgotAccount !== forgotMaskedEmail && (
                                            <>
                                                <p className="mt-4 text-xs font-black uppercase tracking-widest text-emerald-600">Requested Account</p>
                                                <p className="mt-1 text-base font-bold text-emerald-900">{forgotAccount}</p>
                                            </>
                                        )}
                                        {forgotMaskedEmail && (
                                            <div className="mt-4">
                                                <p className="text-xs font-black uppercase tracking-widest text-emerald-600 mb-1">Delivered To</p>
                                                <p className="rounded-xl px-4 py-3 text-center font-mono text-sm font-bold tracking-wider bg-white text-slate-900 shadow-sm border border-emerald-100">
                                                    {forgotMaskedEmail}
                                                </p>
                                            </div>
                                        )}
                                        <p className="mt-4 text-sm font-medium text-emerald-800">Sign in with it, then you will be prompted to choose a new secure password.</p>
                                        <button
                                            type="button"
                                            onClick={closeForgotPassword}
                                            className="mt-5 w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white hover:bg-indigo-700 shadow-md transition-colors"
                                        >
                                            Return to Sign In
                                        </button>
                                    </div>
                                ) : (
                                    <form className="mt-8 space-y-5" onSubmit={handleForgotPassword}>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <User className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                                            </div>
                                            <input
                                                id="forgot-email"
                                                type="text"
                                                autoComplete="username"
                                                required
                                                autoFocus
                                                value={forgotUsername}
                                                onChange={(event) => setForgotUsername(event.target.value)}
                                                className="block w-full pl-12 pr-4 pb-3 pt-6 text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-2xl appearance-none focus:outline-none focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 focus:bg-white peer transition-all shadow-sm"
                                                placeholder=" "
                                            />
                                            <label
                                                htmlFor="forgot-email"
                                                className="absolute left-12 top-4 z-10 origin-left -translate-y-3 scale-75 transform text-base font-medium text-slate-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-indigo-600 cursor-text"
                                            >
                                                Username or Email
                                            </label>
                                        </div>

                                        {forgotError && (
                                            <div className="flex items-center gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-700">
                                                <AlertCircle className="w-5 h-5 shrink-0" />
                                                <p>{forgotError}</p>
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={forgotLoading}
                                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 py-4 text-base font-bold text-white shadow-lg shadow-indigo-600/25 disabled:cursor-not-allowed disabled:opacity-70 hover:from-indigo-700 hover:to-blue-700 transition-all"
                                        >
                                            {forgotLoading ? (
                                                <>
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                    Sending Recovery Email...
                                                </>
                                            ) : (
                                                'Send Temporary Password'
                                            )}
                                        </button>
                                    </form>
                                )}
                            </motion.div>
                        </motion.div>
                    )}
                    
                    {/* SUCCESS LOGIN OVERLAY */}
                    {successMsg && (
                        <motion.div
                            key="welcome"
                            initial={reduceMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.3, ease }}
                            className="absolute inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-md"
                        >
                            <motion.div
                                initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 12 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 24 }}
                                className="flex flex-col items-center px-8 text-center"
                            >
                                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6 shadow-sm border border-emerald-100">
                                    <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                                </div>
                                <p className="text-3xl font-black text-slate-900 tracking-tight">{successMsg}</p>
                                <p className="mt-3 text-base font-bold text-indigo-600 uppercase tracking-widest animate-pulse">Establishing Secure Connection...</p>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Login;
