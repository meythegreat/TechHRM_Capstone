import { useRef, useState } from 'react';
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
    User,
    Lock,
    Sparkles,
    AlertCircle,
    ShieldCheck,
    KeyRound,
} from 'lucide-react';
import Toast from './Toast';
import { GuestBackdrop, GuestFooter, GuestHeader, WorkStudyGraphic } from './GuestChrome';
import { normalizeFilePath } from '../utils/secureFile';
import { storeActivityAttendanceCapability } from '../utils/wspoActivityAccess';

interface LoginProps {
    onLoginSuccess: (
        token: string,
        role: string,
        name: string,
        profilePic: string | null,
        mustChangePassword: boolean,
        profileNotice?: string | null
    ) => void;
    onNavigateToApply: () => void;
    onNavigateToTrack?: () => void;
    onBackToPortal?: () => void;
}

const Login = ({
    onLoginSuccess,
    onNavigateToApply,
    onNavigateToTrack,
    onBackToPortal,
}: LoginProps) => {
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
    const [signInMethod, setSignInMethod] = useState<'password' | 'otp'>('password');
    const [otpStep, setOtpStep] = useState<'request' | 'code'>('request');
    const [otpCode, setOtpCode] = useState('');
    const [otpMaskedEmail, setOtpMaskedEmail] = useState<string | null>(null);
    const otpVerifyLock = useRef(false);
    const otpInputRef = useRef<HTMLInputElement>(null);

    const reduceMotion = useReducedMotion();
    const ease = [0.22, 1, 0.36, 1] as const;

    const formVariants = {
        hidden: {},
        show: {
            transition: {
                staggerChildren: reduceMotion ? 0 : 0.07,
                delayChildren: reduceMotion ? 0 : 0.08,
            },
        },
    };
    const itemVariants = {
        hidden: reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.4, ease } },
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
            const response = await axios.post('/api/forgot-password', {
                username: forgotUsername.trim(),
            });
            setForgotMaskedEmail(response.data?.masked_email || null);
            setForgotAccount(response.data?.account || forgotUsername.trim());
            setForgotSuccess(
                response.data?.message ||
                    "A temporary password has been sent to this account's email."
            );
        } catch (err: any) {
            const message = !err.response
                ? 'Cannot reach the server. Ensure Laravel is running.'
                : err.response?.data?.message || 'Could not send the password reset.';
            setForgotError(message);
        } finally {
            setForgotLoading(false);
        }
    };

    const finishAuthenticated = (data: any) => {
        const { token, role, name, office, profile_picture, must_change_password } = data;
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user_role', role);
        localStorage.setItem('user_name', name || username);
        localStorage.setItem('profile_picture', normalizeFilePath(profile_picture) || '');
        storeActivityAttendanceCapability(data);
        if (!localStorage.getItem('assigned_office')) {
            localStorage.setItem('assigned_office', office || 'System Administrator');
        }
        if (role === 'Department Secretary') {
            localStorage.setItem('secretary_acting', '1');
        } else {
            localStorage.removeItem('secretary_acting');
        }
        localStorage.setItem('can_file_evaluations', data.can_file_evaluations ? '1' : '0');
        localStorage.setItem('can_review_evaluations', data.can_review_evaluations ? '1' : '0');
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setSuccessMsg(`Welcome back, ${name || username}!`);
        setTimeout(() => {
            onLoginSuccess(
                token,
                role,
                name || username,
                profile_picture || null,
                Boolean(must_change_password),
                data?.profile_notice || null
            );
        }, 1100);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccessMsg(null);

        try {
            const response = await axios.post('/api/login', { username, password });
            finishAuthenticated(response.data);
        } catch (err: any) {
            const message = !err.response
                ? 'Cannot reach the server. Ensure Laravel is running.'
                : err.response?.data?.message || 'Invalid credentials. Please try again.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    const switchSignInMethod = (method: 'password' | 'otp') => {
        setSignInMethod(method);
        setError(null);
        setOtpStep('request');
        setOtpCode('');
        setOtpMaskedEmail(null);
    };

    const handleRequestOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const response = await axios.post('/api/login/otp', { username: username.trim() });
            setOtpMaskedEmail(response.data?.masked_email || null);
            setOtpStep('code');
            setOtpCode('');
        } catch (err: any) {
            const data = err.response?.data;
            if (data?.use_password) {
                switchSignInMethod('password');
                setError(data.message);
                return;
            }
            const message = !err.response
                ? 'Cannot reach the server. Ensure Laravel is running.'
                : data?.message || 'Could not send the sign-in code.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    const verifyOtpCode = async (code: string) => {
        const digits = code.replace(/\D/g, '').slice(0, 8);
        if (digits.length !== 8 || otpVerifyLock.current) return;

        otpVerifyLock.current = true;
        setIsLoading(true);
        setError(null);

        try {
            const response = await axios.post('/api/login/otp/verify', {
                username: username.trim(),
                code: digits,
            });
            finishAuthenticated(response.data);
        } catch (err: any) {
            const message = !err.response
                ? 'Cannot reach the server. Ensure Laravel is running.'
                : err.response?.data?.message || 'That sign-in code could not be verified.';
            setError(message);
            setOtpCode('');
            otpInputRef.current?.focus();
        } finally {
            otpVerifyLock.current = false;
            setIsLoading(false);
        }
    };

    const handleVerifyOtp = (e: React.FormEvent) => {
        e.preventDefault();
        void verifyOtpCode(otpCode);
    };

    const handleOtpCodeChange = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, 8);
        setOtpCode(digits);
        if (digits.length === 8) {
            void verifyOtpCode(digits);
        }
    };

    const isOtpLocked = signInMethod === 'otp' && otpStep === 'code';

    return (
        <div className="install-clearance relative flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-sans selection:bg-indigo-200 selection:text-indigo-900">
            <GuestBackdrop />
            <GuestHeader onBack={onBackToPortal} />

            <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
                {/* OBSIDIAN BRAND SHOWCASE PANEL */}
                <motion.aside
                    initial={reduceMotion ? false : { opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.45, ease }}
                    className="relative order-last mx-auto w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8 lg:order-none lg:mx-0 lg:max-w-none"
                >
                    <div
                        className="pointer-events-none absolute inset-0 opacity-20"
                        style={{
                            backgroundImage:
                                'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                            backgroundSize: '20px 20px',
                        }}
                        aria-hidden="true"
                    />
                    <div
                        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo-600/25 blur-3xl"
                        aria-hidden="true"
                    />
                    <div
                        className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl"
                        aria-hidden="true"
                    />

                    <div className="relative z-10 space-y-6">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/25 bg-indigo-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-indigo-300">
                            <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
                            WoSPIS Portal
                        </span>

                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                                Work Study Program Office
                            </h1>
                            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                                Sign in with the account issued for your role to access duty records, schedules, and hours rendered.
                            </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
                            <WorkStudyGraphic caption="Sign in with the account issued for your role." />
                        </div>
                    </div>
                </motion.aside>

                {/* SIGN-IN BENTO CARD */}
                <motion.div
                    variants={formVariants}
                    initial="hidden"
                    animate="show"
                    className="w-full max-w-md justify-self-center space-y-6 rounded-[2rem] border border-slate-200/90 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8 lg:justify-self-end"
                >
                    <motion.div variants={itemVariants}>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-indigo-700">
                            <Sparkles className="h-3 w-3" />
                            Account Sign In
                        </span>
                        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
                            Welcome back
                        </h2>
                        <p className="mt-1.5 text-sm font-medium text-slate-500">
                            Enter your credentials to open your work-study records.
                        </p>
                    </motion.div>

                    <Toast message={error} type="error" onClose={() => setError(null)} />

                    {/* SIGN-IN METHOD SWITCHER */}
                    <motion.div
                        variants={itemVariants}
                        className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1"
                    >
                        <button
                            type="button"
                            onClick={() => switchSignInMethod('password')}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-extrabold uppercase tracking-wider transition ${
                                signInMethod === 'password'
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            <Lock className="h-3.5 w-3.5" />
                            Password
                        </button>
                        <button
                            type="button"
                            onClick={() => switchSignInMethod('otp')}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-extrabold uppercase tracking-wider transition ${
                                signInMethod === 'otp'
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            <Mail className="h-3.5 w-3.5" />
                            Email code
                        </button>
                    </motion.div>

                    <motion.form
                        variants={itemVariants}
                        className="space-y-4"
                        onSubmit={
                            signInMethod === 'password'
                                ? handleLogin
                                : otpStep === 'request'
                                  ? handleRequestOtp
                                  : handleVerifyOtp
                        }
                    >
                        {/* USERNAME / EMAIL INPUT */}
                        <div className="group relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                <User className="h-5 w-5 text-slate-400 transition-colors group-focus-within:text-indigo-600" />
                            </div>
                            <input
                                id="username"
                                type="text"
                                autoComplete="username"
                                required
                                readOnly={isOtpLocked}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className={`peer block w-full appearance-none rounded-2xl border pb-3 pl-12 pt-6 text-base font-bold transition-all focus:outline-none ${
                                    isOtpLocked
                                        ? 'border-slate-200 bg-slate-100/80 pr-20 text-slate-600'
                                        : 'border-slate-200 bg-slate-50/70 pr-4 text-slate-900 focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-600/10'
                                }`}
                                placeholder=" "
                            />
                            <label
                                htmlFor="username"
                                className="absolute left-12 top-4 z-10 origin-left -translate-y-3 scale-75 transform cursor-text text-base font-medium text-slate-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-indigo-600"
                            >
                                Username or Email
                            </label>
                            {isOtpLocked && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOtpStep('request');
                                        setOtpCode('');
                                        setError(null);
                                    }}
                                    className="absolute inset-y-0 right-2 my-auto h-8 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-extrabold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                                >
                                    Change
                                </button>
                            )}
                        </div>

                        {signInMethod === 'password' ? (
                            <div className="space-y-2">
                                <div className="group relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                        <Lock className="h-5 w-5 text-slate-400 transition-colors group-focus-within:text-indigo-600" />
                                    </div>
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="current-password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="peer block w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/70 pb-3 pl-12 pr-14 pt-6 text-base font-bold text-slate-900 transition-all focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-600/10"
                                        placeholder=" "
                                    />
                                    <label
                                        htmlFor="password"
                                        className="absolute left-12 top-4 z-10 origin-left -translate-y-3 scale-75 transform cursor-text text-base font-medium text-slate-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-indigo-600"
                                    >
                                        Password
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-1 flex w-12 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-indigo-50/60 hover:text-indigo-600"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-5 w-5" />
                                        ) : (
                                            <Eye className="h-5 w-5" />
                                        )}
                                    </button>
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={openForgotPassword}
                                        className="px-1 py-1 text-xs font-bold text-indigo-600 transition-colors hover:text-indigo-800"
                                    >
                                        Forgot password?
                                    </button>
                                </div>
                            </div>
                        ) : otpStep === 'request' ? (
                            <div className="flex items-start gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3.5 text-xs font-medium leading-relaxed text-indigo-950">
                                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                                <span>
                                    We will email an 8-digit sign-in code if this account has an email address on file.
                                </span>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 text-xs font-medium leading-relaxed text-emerald-950">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                    <span>
                                        Enter the 8-digit code sent to{' '}
                                        <strong className="font-mono font-bold">
                                            {otpMaskedEmail || 'your email'}
                                        </strong>
                                        . Expires in 10 minutes.
                                    </span>
                                </div>

                                <div className="group relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                        <KeyRound className="h-5 w-5 text-slate-400 transition-colors group-focus-within:text-indigo-600" />
                                    </div>
                                    <input
                                        id="otp-code"
                                        ref={otpInputRef}
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        autoFocus
                                        required
                                        disabled={isLoading}
                                        maxLength={8}
                                        pattern="[0-9]{8}"
                                        value={otpCode}
                                        onChange={(e) => handleOtpCodeChange(e.target.value)}
                                        className="peer block w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/70 pb-3 pl-12 pr-4 pt-6 text-center font-mono text-xl font-black tracking-[0.35em] text-slate-900 transition-all focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-600/10"
                                        placeholder=" "
                                    />
                                    <label
                                        htmlFor="otp-code"
                                        className="absolute left-12 top-4 z-10 origin-left -translate-y-3 scale-75 transform cursor-text text-base font-medium text-slate-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-indigo-600"
                                    >
                                        8-digit code
                                    </label>
                                </div>

                                <div className="flex items-center justify-between px-1">
                                    <span className="font-mono text-[11px] font-bold text-slate-400">
                                        {isLoading ? 'Checking code…' : `${otpCode.length}/8 digits`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => switchSignInMethod('password')}
                                        className="text-xs font-bold text-indigo-600 transition-colors hover:text-indigo-800"
                                    >
                                        Use password instead
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="group mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-700 to-blue-600 py-4 text-sm font-extrabold uppercase tracking-wider text-white shadow-lg shadow-indigo-600/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    {signInMethod === 'otp' && otpStep === 'request'
                                        ? 'Sending code…'
                                        : 'Authenticating…'}
                                </>
                            ) : signInMethod === 'otp' && otpStep === 'request' ? (
                                <>
                                    Send email code
                                    <Mail className="h-4 w-4" />
                                </>
                            ) : signInMethod === 'otp' ? (
                                <>
                                    Verify code
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </>
                            ) : (
                                <>
                                    Sign in
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </>
                            )}
                        </button>
                    </motion.form>

                    <motion.div variants={itemVariants} className="border-t border-slate-100 pt-6">
                        <p className="mb-3.5 text-center text-xs font-semibold text-slate-500">
                            Interested in joining the Work-Study Program?
                        </p>
                        <div className="space-y-2.5">
                            <button
                                type="button"
                                onClick={onNavigateToApply}
                                className="group flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-indigo-700 transition hover:bg-indigo-100"
                            >
                                Submit an Application
                                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                            </button>
                            {onNavigateToTrack && (
                                <button
                                    type="button"
                                    onClick={onNavigateToTrack}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                                >
                                    Track an Application
                                </button>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            </main>

            <GuestFooter />

            {/* OBSIDIAN FORGOT PASSWORD MODAL & WELCOME OVERLAY */}
            <AnimatePresence>
                {forgotOpen && (
                    <motion.div
                        key="forgot-password"
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2 }}
                        className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        onClick={closeForgotPassword}
                    >
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="forgot-password-title"
                            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.97 }}
                            transition={
                                reduceMotion
                                    ? { duration: 0 }
                                    : { type: 'spring', stiffness: 320, damping: 26 }
                            }
                            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-4 bg-slate-950 px-6 py-5 text-white">
                                <div className="flex items-center gap-3.5">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30">
                                        <Mail className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3
                                            id="forgot-password-title"
                                            className="text-base font-black tracking-tight"
                                        >
                                            Account Recovery
                                        </h3>
                                        <p className="mt-0.5 text-xs font-medium text-slate-400">
                                            We&apos;ll email you a temporary password.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeForgotPassword}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="p-6 sm:p-7">
                                {forgotSuccess ? (
                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5">
                                        <p className="text-sm font-extrabold text-emerald-900">
                                            A temporary password has been dispatched.
                                        </p>
                                        {forgotAccount && forgotAccount !== forgotMaskedEmail && (
                                            <div className="mt-4">
                                                <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
                                                    Requested Account
                                                </p>
                                                <p className="mt-0.5 text-sm font-bold text-emerald-950">
                                                    {forgotAccount}
                                                </p>
                                            </div>
                                        )}
                                        {forgotMaskedEmail && (
                                            <div className="mt-4">
                                                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
                                                    Delivered To
                                                </p>
                                                <p className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-center font-mono text-sm font-bold tracking-wider text-slate-900 shadow-2xs">
                                                    {forgotMaskedEmail}
                                                </p>
                                            </div>
                                        )}
                                        <p className="mt-4 text-xs font-medium leading-relaxed text-emerald-800">
                                            Sign in with it, then you will be prompted to choose a new secure password.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={closeForgotPassword}
                                            className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-xs font-extrabold uppercase tracking-wider text-white transition hover:bg-indigo-600"
                                        >
                                            Return to Sign In
                                        </button>
                                    </div>
                                ) : (
                                    <form className="space-y-5" onSubmit={handleForgotPassword}>
                                        <div className="group relative">
                                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                                <User className="h-5 w-5 text-slate-400 transition-colors group-focus-within:text-indigo-600" />
                                            </div>
                                            <input
                                                id="forgot-email"
                                                type="text"
                                                autoComplete="username"
                                                required
                                                autoFocus
                                                value={forgotUsername}
                                                onChange={(event) =>
                                                    setForgotUsername(event.target.value)
                                                }
                                                className="peer block w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 pb-3 pl-12 pr-4 pt-6 text-base font-bold text-slate-900 transition-all focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-600/10"
                                                placeholder=" "
                                            />
                                            <label
                                                htmlFor="forgot-email"
                                                className="absolute left-12 top-4 z-10 origin-left -translate-y-3 scale-75 transform cursor-text text-base font-medium text-slate-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-indigo-600"
                                            >
                                                Username or Email
                                            </label>
                                        </div>

                                        {forgotError && (
                                            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                                                <AlertCircle className="h-4 w-4 shrink-0" />
                                                <p>{forgotError}</p>
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={forgotLoading}
                                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-70"
                                        >
                                            {forgotLoading ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Sending Recovery Email…
                                                </>
                                            ) : (
                                                'Send Temporary Password'
                                            )}
                                        </button>
                                    </form>
                                )}
                            </div>
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
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
                    >
                        <motion.div
                            initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={
                                reduceMotion
                                    ? { duration: 0 }
                                    : { type: 'spring', stiffness: 320, damping: 24 }
                            }
                            className="flex w-full max-w-sm flex-col items-center rounded-[2rem] border border-slate-200 bg-white px-8 py-10 text-center shadow-2xl"
                        >
                            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                                <CheckCircle2 className="h-8 w-8" />
                            </div>
                            <p className="text-2xl font-black tracking-tight text-slate-900">
                                {successMsg}
                            </p>
                            <p className="mt-2.5 text-xs font-extrabold uppercase tracking-widest text-indigo-600 animate-pulse">
                                Logging you in…
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Login;