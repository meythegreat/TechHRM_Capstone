import { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, AlertTriangle, X, FileText } from 'lucide-react';
import WspApplicationWizard from './wsp/WspApplicationWizard';
import { bindPopup } from '../utils/popupDismiss';
import { GuestBackdrop, GuestFooter, GuestHeader, WorkStudyGraphic } from './GuestChrome';
import { HelpDisclosure } from './HelpDisclosure';

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
            <GuestBackdrop />
            <GuestHeader onBack={requestLeave} />

            <main className="relative z-10 flex-1 px-4 py-6 sm:px-8">
                <div className="mx-auto max-w-6xl space-y-6">
                    {/* OBSIDIAN APPLICATION HERO */}
                    {phase === 'form' && (
                        <motion.section
                            initial={{ opacity: 0, y: -12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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
                                            FCU-EOMS-WP-012
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300">
                                            <FileText className="h-3.5 w-3.5 text-indigo-300" />
                                            Official Intake
                                        </span>
                                    </div>

                                    <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                                        Work-Study Application
                                    </h1>
                                    <p className="mt-2.5 max-w-2xl text-sm font-medium leading-relaxed text-slate-300">
                                        Complete your work-study personal information sheet and parent consent form step by step.
                                    </p>
                                </div>

                                <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
                                    <WorkStudyGraphic caption="Your application stays with the Work Study Program Office from review through assignment." />
                                </div>
                            </div>
                        </motion.section>
                    )}

                    {phase === 'form' && (
                        <HelpDisclosure
                            title="Submission & printing guidelines"
                            items={[
                                'Complete each step of the personal information sheet and parent consent form before submitting.',
                                'Both completed forms are formatted for long coupon paper (8.5 × 13 inches) and forwarded to the WSPO coordinator.',
                            ]}
                        />
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

            <GuestFooter />

            {/* OBSIDIAN LEAVE CONFIRMATION MODAL */}
            <AnimatePresence>
                {leavePrompt && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(() => setLeavePrompt(false))}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                            role="dialog"
                            aria-modal="true"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <h3 className="flex items-center gap-2.5 text-base font-black tracking-tight">
                                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                                    Leave this application?
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setLeavePrompt(false)}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="space-y-6 p-6 sm:p-7">
                                <p className="text-sm font-medium leading-relaxed text-slate-600">
                                    The answers entered so far will be discarded if you leave now.
                                </p>
                                <div className="flex flex-col-reverse gap-2.5 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setLeavePrompt(false)}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                                    >
                                        Continue application
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onBackToLogin}
                                        className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-rose-600/20 transition hover:bg-rose-700"
                                    >
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