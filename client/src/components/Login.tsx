import { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, Loader2, CheckCircle2, ArrowRight, X, Mail } from 'lucide-react';
import Toast from './Toast';
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
        <div className="flex min-h-screen bg-slate-50 font-sans selection:bg-blue-200 selection:text-blue-900">
            
            {/* --- LEFT SIDE: Animated Branding Panel (Desktop Only) --- */}
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

            {/* --- RIGHT SIDE: Login Form (Scrollable for mobile keyboards) --- */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 md:p-16 bg-white relative shadow-[-20px_0_40px_-15px_rgba(0,0,0,0.05)] z-20 overflow-y-auto min-h-screen">
                <motion.div
                    variants={formVariants}
                    initial="hidden"
                    animate="show"
                    className="w-full max-w-md space-y-8 my-auto py-8"
                >
                    {/* Mobile Branding (Visible only on small screens) */}
                    <motion.div variants={itemVariants} className="flex flex-col items-center mb-8 lg:hidden text-center">
                        <img src="/logo.jpg" alt="TechHRM Logo" className="w-20 h-20 rounded-full border-4 border-slate-50 shadow-md mb-4" />
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">TechHRM</h1>
                        <p className="text-sm font-medium text-slate-500 mt-1">FCU Work-Study Portal</p>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                            Welcome!
                        </h2>
                        <p className="mt-2 text-base text-slate-500 font-medium">
                            Login using your provided credentials.
                        </p>
                    </motion.div>

                    <Toast message={error} type="error" onClose={() => setError(null)} />

                    <motion.form variants={itemVariants} className="space-y-6 pt-2" onSubmit={handleLogin}>
                        
                        {/* Username Floating Label Input (text-base prevents iOS zoom) */}
                        <div className="relative">
                            <input 
                                id="username"
                                type="text"
                                autoComplete="username"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="block px-4 pb-3 pt-6 w-full text-base text-slate-900 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent peer transition-all shadow-sm" 
                                placeholder=" "
                            />
                            <label 
                                htmlFor="username" 
                                className="absolute text-base text-slate-500 duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-left left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-blue-600 font-medium"
                            >
                                Username or email
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
                                    className="block px-4 pb-3 pt-6 w-full text-base text-slate-900 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent peer transition-all shadow-sm pr-14" 
                                    placeholder=" "
                                />
                                <label 
                                    htmlFor="password" 
                                    className="absolute text-base text-slate-500 duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-left left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-blue-600 font-medium"
                                >
                                    Password
                                </label>
                                
                                {/* 44px Minimum Touch Target for Eye Icon */}
                                <button 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-1 w-12 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 rounded-xl transition-all focus:outline-none"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            
                            <div className="flex justify-end">
                                {/* Increased touch target for forgot password */}
                                <button
                                    type="button"
                                    onClick={openForgotPassword}
                                    className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors py-2 px-1"
                                >
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
                            className="w-full py-4 mt-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-base font-bold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-xl transition-all duration-200 flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group"
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
                    </motion.form>

                    {onNavigateToApply && (
                        <motion.div variants={itemVariants} className="pt-8 mt-8 border-t border-slate-100">
                            <p className="text-sm text-slate-500 font-medium text-center mb-3">Interested in the Work-Study Program?</p>
                            {/* Thumb-friendly block button with permanently visible arrow */}
                            <button
                                type="button"
                                onClick={onNavigateToApply}
                                className="w-full py-3.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-blue-700 hover:text-blue-800 transition-colors flex justify-center items-center gap-2 group"
                            >
                                Submit an Application
                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                            </button>
                        </motion.div>
                    )}
                </motion.div>

                <AnimatePresence>
                    {forgotOpen && (
                        <motion.div
                            key="forgot-password"
                            initial={reduceMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.2 }}
                            className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/45 p-6 backdrop-blur-sm"
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
                                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
                                onClick={(event) => event.stopPropagation()}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                                            <Mail className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 id="forgot-password-title" className="text-lg font-black text-slate-900">Forgot password</h3>
                                            <p className="text-sm font-medium text-slate-500">We will email a temporary password through Gmail.</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={closeForgotPassword}
                                        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                        aria-label="Close"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                {forgotSuccess ? (
                                    <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                                        <p className="text-sm font-semibold text-emerald-800">
                                            A temporary password has been sent to this account&apos;s email.
                                        </p>
                                        {forgotAccount && forgotAccount !== forgotMaskedEmail && (
                                            <>
                                                <p className="mt-3 text-xs font-bold uppercase tracking-widest text-emerald-700">Account</p>
                                                <p className="mt-1 text-sm font-black text-emerald-800">{forgotAccount}</p>
                                            </>
                                        )}
                                        {forgotMaskedEmail && (
                                            <p
                                                className="mt-3 rounded-lg px-3 py-2 text-center font-mono text-sm font-bold tracking-wide"
                                                style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
                                            >
                                                {forgotMaskedEmail}
                                            </p>
                                        )}
                                        <p className="mt-3 text-sm font-medium text-emerald-800">Sign in with it, then choose a new password.</p>
                                        <button
                                            type="button"
                                            onClick={closeForgotPassword}
                                            className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700"
                                        >
                                            Back to sign in
                                        </button>
                                    </div>
                                ) : (
                                    <form className="mt-6 space-y-4" onSubmit={handleForgotPassword}>
                                        <div className="relative">
                                            <input
                                                id="forgot-email"
                                                type="text"
                                                autoComplete="username"
                                                required
                                                autoFocus
                                                value={forgotUsername}
                                                onChange={(event) => setForgotUsername(event.target.value)}
                                                className="block w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 pb-3 pt-6 text-base text-slate-900 shadow-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600 peer"
                                                placeholder=" "
                                            />
                                            <label
                                                htmlFor="forgot-email"
                                                className="absolute left-4 top-4 z-10 origin-left -translate-y-3 scale-75 transform text-base font-medium text-slate-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-blue-600"
                                            >
                                                Username or email
                                            </label>
                                        </div>

                                        {forgotError && (
                                            <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                                                {forgotError}
                                            </p>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={forgotLoading}
                                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 disabled:cursor-not-allowed disabled:opacity-70"
                                        >
                                            {forgotLoading ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Sending reset email...
                                                </>
                                            ) : (
                                                'Send temporary password'
                                            )}
                                        </button>
                                    </form>
                                )}
                            </motion.div>
                        </motion.div>
                    )}
                    {successMsg && (
                        <motion.div
                            key="welcome"
                            initial={reduceMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.3, ease }}
                            className="absolute inset-0 z-30 flex items-center justify-center bg-white/80 backdrop-blur-md"
                        >
                            <motion.div
                                initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 12 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 24 }}
                                className="flex flex-col items-center px-8 text-center"
                            >
                                <CheckCircle2 className="h-14 w-14 text-emerald-500" />
                                <p className="mt-4 text-2xl font-black text-slate-900">{successMsg}</p>
                                <p className="mt-2 text-sm font-medium text-slate-500">Opening your portal…</p>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Login;