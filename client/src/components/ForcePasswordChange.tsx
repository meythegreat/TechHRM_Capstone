import { useState } from 'react';
import axios from 'axios';
import { motion, useReducedMotion } from 'framer-motion';
import {
    AlertCircle,
    CheckCircle2,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    Lock,
    ShieldCheck,
} from 'lucide-react';

interface ForcePasswordChangeProps {
    onChanged: () => void;
}

export default function ForcePasswordChange({ onChanged }: ForcePasswordChangeProps) {
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const reduceMotion = useReducedMotion();

    const meetsLength = password.length >= 6;
    const passwordsMatch = confirmation.length > 0 && password === confirmation;

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError('Use at least 6 characters.');
            return;
        }

        if (password !== confirmation) {
            setError('The passwords do not match.');
            return;
        }

        setIsSaving(true);
        try {
            await axios.post('/api/user/change-password', {
                password,
                password_confirmation: confirmation,
            });
            onChanged();
        } catch (err: any) {
            const message = !err.response
                ? 'Cannot reach the server. Ensure Laravel is running.'
                : err.response?.data?.message ||
                  err.response?.data?.errors?.password?.[0] ||
                  'Could not update the password.';
            setError(message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm sm:p-6">
            <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="change-password-title"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white font-sans shadow-2xl"
            >
                {/* OBSIDIAN HEADER */}
                <div className="relative overflow-hidden bg-slate-950 px-6 py-6 text-white sm:px-7">
                    <div
                        className="pointer-events-none absolute inset-0 opacity-20"
                        style={{
                            backgroundImage:
                                'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                            backgroundSize: '18px 18px',
                        }}
                        aria-hidden="true"
                    />
                    <div
                        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-blue-600/25 blur-3xl"
                        aria-hidden="true"
                    />

                    <div className="relative z-10 flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                            <KeyRound className="h-5 w-5" />
                        </div>
                        <div>
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-blue-300">
                                <ShieldCheck className="h-3 w-3" />
                                Security Requirement
                            </span>
                            <h2
                                id="change-password-title"
                                className="mt-1 text-xl font-black tracking-tight text-white"
                            >
                                Choose a new password
                            </h2>
                            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-300">
                                Your temporary password only lasts until you replace it.
                            </p>
                        </div>
                    </div>
                </div>

                {/* FORM BODY */}
                <form className="space-y-4 p-6 sm:p-7" onSubmit={handleSubmit}>
                    <PasswordField
                        id="new-password"
                        label="New password"
                        value={password}
                        shown={showPassword}
                        onToggle={() => setShowPassword((current) => !current)}
                        onChange={setPassword}
                        autoFocus
                    />
                    <PasswordField
                        id="confirm-password"
                        label="Confirm password"
                        value={confirmation}
                        shown={showPassword}
                        onChange={setConfirmation}
                    />

                    {/* Live Requirement Pills */}
                    <div className="flex flex-wrap gap-2 pt-0.5">
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                meetsLength
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                        >
                            <CheckCircle2
                                className={`h-3.5 w-3.5 ${
                                    meetsLength ? 'text-emerald-600' : 'text-slate-300'
                                }`}
                            />
                            6+ characters
                        </span>
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                passwordsMatch
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                        >
                            <CheckCircle2
                                className={`h-3.5 w-3.5 ${
                                    passwordsMatch ? 'text-emerald-600' : 'text-slate-300'
                                }`}
                            />
                            Passwords match
                        </span>
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700"
                        >
                            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 via-blue-700 to-indigo-600 py-3.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-lg shadow-blue-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving password…
                            </>
                        ) : (
                            'Save new password'
                        )}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}

function PasswordField({
    id,
    label,
    value,
    shown,
    onChange,
    onToggle,
    autoFocus = false,
}: {
    id: string;
    label: string;
    value: string;
    shown: boolean;
    onChange: (value: string) => void;
    onToggle?: () => void;
    autoFocus?: boolean;
}) {
    return (
        <div className="group relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <Lock className="h-4 w-4 text-slate-400 transition-colors group-focus-within:text-blue-600" />
            </div>
            <input
                id={id}
                type={shown ? 'text' : 'password'}
                required
                autoFocus={autoFocus}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="peer block w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/70 pb-3 pl-11 pr-14 pt-6 text-base font-bold text-slate-900 transition-all focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                placeholder=" "
            />
            <label
                htmlFor={id}
                className="absolute left-11 top-4 z-10 origin-left -translate-y-3 scale-75 transform cursor-text text-base font-medium text-slate-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-blue-600"
            >
                {label}
            </label>
            {onToggle && (
                <button
                    type="button"
                    onClick={onToggle}
                    className="absolute inset-y-0 right-1 flex w-12 items-center justify-center rounded-xl text-slate-400 transition hover:bg-blue-50/60 hover:text-blue-600"
                    aria-label={shown ? 'Hide password' : 'Show password'}
                >
                    {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            )}
        </div>
    );
}