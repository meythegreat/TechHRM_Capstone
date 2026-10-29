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
        <div className="install-clearance min-h-screen bg-slate-50 font-sans selection:bg-indigo-200 selection:text-indigo-900 relative overflow-x-hidden flex flex-col">
            <div className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-sm relative z-40 shrink-0 sticky top-0">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo.jpg" alt="TechHRM Logo" className="w-10 h-10 rounded-xl border border-slate-100 shadow-sm" />
                        <span className="font-semibold bg-gradient-to-br from-slate-900 to-slate-700 bg-clip-text text-transparent text-xl tracking-tight hidden sm:block">TechHRM</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <ThemeToggle />
                        <button
                            type="button"
                            onClick={requestLeave}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Sign In</span>
                        </button>
                    </div>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto p-4 sm:p-8 relative z-10">
                <div className="max-w-4xl mx-auto space-y-6">
                    {phase === 'form' && (
                        <div>
                            <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                FCU-EOMS-WP-012
                            </div>
                            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Work-Study Application</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
                                Complete the personal information sheet one step at a time, then the parents consent. Both forms are printed on long coupon and sent to the WSPO coordinator.
                            </p>
                        </div>
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
