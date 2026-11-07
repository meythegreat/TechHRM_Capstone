import { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import WspApplicationWizard from './wsp/WspApplicationWizard';
import { bindPopup } from '../utils/popupDismiss';

interface PublicApplicationProps {
    onBackToLogin: () => void;
}

const PublicApplication = ({ onBackToLogin }: PublicApplicationProps) => {
    const [dirty, setDirty] = useState(false);
    const [phase, setPhase] = useState<'form' | 'done'>('form');
    const [leavePrompt, setLeavePrompt] = useState(false);

    const requestLeave = () => {
        if (dirty && phase === 'form') {
            setLeavePrompt(true);
            return;
        }
        onBackToLogin();
    };

    return (
        <div className="install-clearance relative flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-sans selection:bg-indigo-200 selection:text-indigo-900">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.10),transparent_28%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:18px_18px] opacity-40" />
            <div className="relative z-40 shrink-0 border-b border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-md sticky top-0">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo.jpg" alt="TechHRM Logo" className="h-11 w-11 rounded-2xl border border-slate-100 shadow-sm" />
                        <div>
                            <span className="block bg-gradient-to-br from-slate-900 to-slate-700 bg-clip-text text-lg font-semibold tracking-tight text-transparent">TechHRM</span>
                            <span className="hidden text-xs font-bold uppercase tracking-[0.18em] text-indigo-600 sm:block">Work-Study sign up</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <ThemeToggle />
                        <button
                            type="button"
                            onClick={requestLeave}
                            className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200"
                        >
                            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Sign In</span>
                        </button>
                    </div>
                </div>
            </div>

            <main className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-8">
                <div className="mx-auto max-w-4xl space-y-6">
                    {phase === 'form' && (
                        <section className="overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur">
                            <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-8">
                                <img src="/logo.jpg" alt="" className="h-20 w-20 rounded-3xl border border-slate-100 shadow-lg" />
                                <div>
                                    <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">
                                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                        FCU-EOMS-WP-012
                                    </div>
                                    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Work-Study Application</h1>
                                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
                                        Complete the personal information sheet one step at a time, then the parents consent. Both forms are printed on long coupon and sent to the WSPO coordinator.
                                    </p>
                                </div>
                            </div>
                        </section>
                    )}
                    <WspApplicationWizard
                        onDraftChange={setDirty}
                        onPhaseChange={setPhase}
                        onFinished={onBackToLogin}
                        onSubmit={async (payload) => {
                            const response = await axios.post('/api/apply', payload);
                            return response.data;
                        }}
                    />
                </div>
            </main>

            <AnimatePresence>
                {leavePrompt && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
                        {...bindPopup(() => setLeavePrompt(false))}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 16 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                            role="dialog"
                            aria-modal="true"
                        >
                            <div className="p-6 sm:p-8 space-y-6">
                                <h3 className="text-xl font-semibold text-slate-900">Leave this application?</h3>
                                <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                    The answers entered so far will be discarded.
                                </p>
                                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                                    <button type="button" onClick={() => setLeavePrompt(false)} className="px-5 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl">
                                        Continue application
                                    </button>
                                    <button type="button" onClick={onBackToLogin} className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl">
                                        Discard application
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PublicApplication;
