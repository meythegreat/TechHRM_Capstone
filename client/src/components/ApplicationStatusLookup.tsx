import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
    ArrowRight,
    FileText,
    Loader2,
    Mail,
    Search,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';
import { GuestBackdrop, GuestFooter, GuestHeader, WorkStudyGraphic } from './GuestChrome';
import Toast from './Toast';
import ApplicationStatusTracker from './ApplicationStatusTracker';

interface ApplicationStatusLookupProps {
    onBackToLogin: () => void;
    onNavigateToApply: () => void;
}

const FloatingInput = ({
    id,
    type = 'text',
    label,
    icon: Icon,
    required = true,
    className = '',
    inputClassName = '',
    ...props
}: any) => (
    <div className={`group relative ${className}`}>
        {Icon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-4">
                <Icon className="h-5 w-5 text-slate-400 transition-colors group-focus-within:text-indigo-600" />
            </div>
        )}
        <input
            id={id}
            type={type}
            required={required}
            className={`peer block w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/70 pb-3 pt-6 text-base font-bold text-slate-900 transition-all focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-600/10 ${
                Icon ? 'pl-12 pr-4' : 'px-4'
            } ${inputClassName}`}
            placeholder=" "
            {...props}
        />
        <label
            htmlFor={id}
            className={`absolute top-4 z-10 origin-left -translate-y-3 scale-75 transform cursor-text text-base font-medium text-slate-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-indigo-600 ${
                Icon ? 'left-12' : 'left-4'
            }`}
        >
            {label}
        </label>
    </div>
);

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const sectionVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    show: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
    },
};

const ApplicationStatusLookup = ({
    onBackToLogin,
    onNavigateToApply,
}: ApplicationStatusLookupProps) => {
    const [email, setEmail] = useState('');
    const [trackingCode, setTrackingCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tracker, setTracker] = useState<Record<string, unknown> | null>(null);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        setTracker(null);
        try {
            const response = await axios.post('/api/apply/status', {
                email: email.trim(),
                tracking_code: trackingCode.trim(),
            });
            setTracker(response.data);
        } catch (err: any) {
            setError(
                err.response?.data?.message ||
                    'We could not find that application. Check the email and tracking code.'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="install-clearance relative flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-sans selection:bg-indigo-200 selection:text-indigo-900">
            <GuestBackdrop />
            <GuestHeader onBack={onBackToLogin} />

            <main className="relative z-10 flex-1 px-4 py-6 sm:px-8">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="mx-auto max-w-6xl space-y-6"
                >
                    {/* OBSIDIAN TRACKING HERO */}
                    <motion.section
                        variants={sectionVariants}
                        className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
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
                            className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-indigo-600/25 blur-3xl"
                            aria-hidden="true"
                        />
                        <div
                            className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl"
                            aria-hidden="true"
                        />

                        <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,340px)]">
                            <div>
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-300">
                                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                                        Application Tracking
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300">
                                        <Sparkles className="h-3 w-3 text-indigo-300" />
                                        Live Status
                                    </span>
                                </div>

                                <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                                    Track your application
                                </h1>
                                <p className="mt-2.5 max-w-xl text-sm font-medium leading-relaxed text-slate-300">
                                    Use the email and tracking code from your confirmation to see where your application is in the WSPO placement process.
                                </p>
                            </div>

                            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
                                <WorkStudyGraphic caption="The same record moves from review to interview, training, and assignment." />
                            </div>
                        </div>
                    </motion.section>

                    {/* SEARCH BENTO CARD */}
                    <motion.form
                        variants={sectionVariants}
                        onSubmit={handleSubmit}
                        className="space-y-6 rounded-[2rem] border border-slate-200/90 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"
                    >
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                                <Search className="h-4 w-4" />
                            </span>
                            <div>
                                <h2 className="text-base font-black tracking-tight text-slate-900">
                                    Lookup Credentials
                                </h2>
                                <p className="text-xs font-medium text-slate-500">
                                    Enter the exact email address and tracking code issued when you applied.
                                </p>
                            </div>
                        </div>

                        <Toast message={error || null} type="error" onClose={() => setError('')} />

                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            <FloatingInput
                                id="email"
                                type="email"
                                label="Registered Email"
                                icon={Mail}
                                value={email}
                                onChange={(event: any) => setEmail(event.target.value)}
                            />
                            <FloatingInput
                                id="tracking_code"
                                label="Tracking Code"
                                icon={FileText}
                                inputClassName="uppercase font-mono tracking-wider"
                                value={trackingCode}
                                onChange={(event: any) =>
                                    setTrackingCode(event.target.value.toUpperCase())
                                }
                            />
                        </div>

                        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-5 sm:flex-row">
                            <button
                                type="submit"
                                disabled={loading || !email || !trackingCode}
                                className="group flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-700 to-blue-600 px-6 py-3.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-lg shadow-indigo-600/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-60"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Verifying Records…
                                    </>
                                ) : (
                                    <>
                                        Check Status
                                        <Search className="h-4 w-4 transition-transform group-hover:scale-110" />
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={onNavigateToApply}
                                className="group inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-700 transition-colors hover:text-indigo-900"
                            >
                                Need to submit an application instead?
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </button>
                        </div>
                    </motion.form>

                    {/* RESULTS TRACKER */}
                    <AnimatePresence>
                        {tracker && (
                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <ApplicationStatusTracker application={tracker} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </main>

            <GuestFooter />
        </div>
    );
};

export default ApplicationStatusLookup;