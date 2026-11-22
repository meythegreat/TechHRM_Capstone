import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
    ArrowRight,
    CalendarDays,
    ClipboardList,
    Clock3,
    FileCheck2,
    HelpCircle,
    Sparkles,
    X,
} from 'lucide-react';
import { CAMPUS_LETTERHEAD } from '../constants/campusDocuments';
import { bindPopup } from '../utils/popupDismiss';
import { GuestBackdrop, GuestFooter, GuestHeader, WorkStudyGraphic } from './GuestChrome';

interface LandingPageProps {
    onSignIn: () => void;
    onApply: () => void;
    onTrack: () => void;
}

const services = [
    {
        label: 'Duty',
        title: 'Attendance and daily time records',
        text: 'Clock in and out with a passcode, QR code, or photo proof, then review the time that was recorded.',
        icon: Clock3,
        accent: 'bg-blue-50 text-blue-600 ring-blue-100',
    },
    {
        label: 'Calendar',
        title: 'Work and class schedules',
        text: 'See assigned shifts and class blocks, and send a change request to the WSPO office.',
        icon: CalendarDays,
        accent: 'bg-violet-50 text-violet-600 ring-violet-100',
    },
    {
        label: 'Hours',
        title: 'Rendered hours and limits',
        text: 'Follow duty hours against the weekly and monthly limits, with an estimate for the period you choose.',
        icon: ClipboardList,
        accent: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    },
    {
        label: 'Records',
        title: 'Applications and requirements',
        text: 'Apply for the program, upload the documents the office asks for, and follow the application through assignment.',
        icon: FileCheck2,
        accent: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    },
];

const LandingPage = ({ onSignIn, onApply, onTrack }: LandingPageProps) => {
    const [helpOpen, setHelpOpen] = useState(false);
    const reduceMotion = useReducedMotion();

    return (
        <div className="install-clearance relative flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-sans text-slate-900 selection:bg-indigo-200 selection:text-indigo-900">
            <GuestBackdrop />

            <GuestHeader
                extra={
                    <button
                        type="button"
                        onClick={() => setHelpOpen(true)}
                        className="hidden items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-white hover:text-slate-900 sm:inline-flex"
                    >
                        <HelpCircle className="h-4 w-4 text-slate-400" />
                        Help
                    </button>
                }
                primary={
                    <button
                        type="button"
                        onClick={onSignIn}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-indigo-600"
                    >
                        Sign in
                        <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                }
            />

            <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 pb-12 pt-4 sm:px-8 sm:pt-6">
                {/* OBSIDIAN PORTAL HERO */}
                <motion.section
                    initial={reduceMotion ? false : { opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-10"
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
                        className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-indigo-600/25 blur-3xl"
                        aria-hidden="true"
                    />
                    <div
                        className="pointer-events-none absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl"
                        aria-hidden="true"
                    />

                    <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
                        <div>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/25 bg-indigo-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-indigo-300">
                                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                                Work Study Program Office
                            </span>

                            <h1 className="mt-4 max-w-xl text-3xl font-black tracking-tight text-white sm:text-5xl sm:leading-[1.06]">
                                Work-study records, kept in one place.
                            </h1>

                            <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-slate-300 sm:text-base">
                                Manage work-study attendance, schedules, rendered hours, and applications in one portal.
                            </p>

                            <div className="mt-7 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={onSignIn}
                                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-blue-500"
                                >
                                    Sign in
                                    <ArrowRight className="h-4 w-4" />
                                </button>

                                <button
                                    type="button"
                                    onClick={onApply}
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/20"
                                >
                                    Submit an application
                                </button>

                                <button
                                    type="button"
                                    onClick={onTrack}
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
                                >
                                    Track application
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setHelpOpen(true)}
                                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-3 text-xs font-bold text-slate-400 transition hover:text-white sm:hidden"
                                >
                                    <HelpCircle className="h-4 w-4" />
                                    Help
                                </button>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
                            <WorkStudyGraphic caption="The same records follow a student from the first application through daily duty." />
                        </div>
                    </div>
                </motion.section>

                {/* 2x2 BENTO SERVICES GRID */}
                <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {services.map((service, index) => {
                        const Icon = service.icon;
                        return (
                            <motion.article
                                key={service.title}
                                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                    delay: reduceMotion ? 0 : index * 0.06,
                                    duration: reduceMotion ? 0 : 0.35,
                                    ease: [0.22, 1, 0.36, 1],
                                }}
                                className="group flex gap-4 rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                            >
                                <div
                                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 transition-transform group-hover:scale-105 ${service.accent}`}
                                >
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        {service.label}
                                    </p>
                                    <h2 className="mt-1 text-base font-black tracking-tight text-slate-900">
                                        {service.title}
                                    </h2>
                                    <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-500">
                                        {service.text}
                                    </p>
                                </div>
                            </motion.article>
                        );
                    })}
                </section>
            </main>

            <GuestFooter />

            {/* OBSIDIAN HELP MODAL */}
            <AnimatePresence>
                {helpOpen && (
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-4 backdrop-blur-sm sm:items-center"
                        {...bindPopup(() => setHelpOpen(false))}
                    >
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="portal-help-title"
                            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.97 }}
                            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                            onMouseDown={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-4 bg-slate-950 px-6 py-5 text-white">
                                <div>
                                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-300">
                                        Portal Guide
                                    </p>
                                    <h3 id="portal-help-title" className="mt-0.5 text-lg font-black tracking-tight">
                                        Need a hand?
                                    </h3>
                                    <p className="mt-0.5 text-xs font-medium text-slate-400">
                                        Signing in, applying, or reaching the office.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setHelpOpen(false)}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close help"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="p-6">
                                <ul className="space-y-3 text-sm font-medium leading-relaxed text-slate-600">
                                    <li className="flex gap-2.5">
                                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                                        <span>
                                            Students, supervisors, and WSPO staff sign in with the username and password issued for their account.
                                        </span>
                                    </li>
                                    <li className="flex gap-2.5">
                                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                                        <span>
                                            Applicants without an account can submit a work-study application, then track it with the email and tracking code from the confirmation.
                                        </span>
                                    </li>
                                    <li className="flex gap-2.5">
                                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                                        <span>
                                            The Work Study Program Office can be reached at{' '}
                                            <strong className="font-extrabold text-slate-900">
                                                {CAMPUS_LETTERHEAD.phoneWeb}
                                            </strong>
                                            .
                                        </span>
                                    </li>
                                </ul>

                                <div className="mt-6 grid gap-2">
                                    <button
                                        type="button"
                                        onClick={onSignIn}
                                        className="rounded-xl bg-slate-900 py-3 text-xs font-extrabold uppercase tracking-wider text-white transition hover:bg-indigo-600"
                                    >
                                        Sign in
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onApply}
                                        className="rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                                    >
                                        Submit an application
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onTrack}
                                        className="rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                                    >
                                        Track an application
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

export default LandingPage;