import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMyViolations, submitAppeal } from '../services/disciplinaryService';
import {
    ShieldAlert,
    ShieldCheck,
    Scale,
    MessageSquare,
    CheckCircle2,
    X,
    Clock,
    AlertTriangle,
    FileWarning,
    User,
    Info,
} from 'lucide-react';
import { bindPopup } from '../utils/popupDismiss';

const StudentDisciplinaryBoard = () => {
    const [records, setRecords] = useState([]);
    const [appealModal, setAppealModal] = useState(null);
    const [appealNotes, setAppealNotes] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchRecords();
    }, []);

    const fetchRecords = async () => {
        try {
            const res = await getMyViolations();
            setRecords(res.data);
        } catch (err) {
            console.error('Failed to load disciplinary records', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAppealSubmit = async () => {
        if (!appealNotes.trim() || !appealModal) return;

        // Optimistic UI update
        const recordId = appealModal.id || appealModal;
        setRecords((prev) =>
            prev.map((r) => (r.id === recordId ? { ...r, status: 'Pending Appeal' } : r))
        );

        setAppealModal(null);
        setAppealNotes('');

        await submitAppeal(recordId, appealNotes);
        fetchRecords();
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.08 } },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 16 },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
        },
    };

    if (isLoading) {
        return (
            <div
                className="mx-auto max-w-6xl space-y-6 animate-pulse"
                aria-busy="true"
                aria-label="Loading compliance records"
            >
                <div className="h-44 rounded-[2rem] bg-slate-900/90" />
                <div className="h-36 rounded-[1.75rem] bg-slate-200/80" />
                <div className="h-36 rounded-[1.75rem] bg-slate-200/80" />
            </div>
        );
    }

    const hasCleanRecord = records.length === 0;
    const isAppealable = (record) =>
        record.penalty !== 'Pending' &&
        ['Active', 'Resolved'].includes(record.status) &&
        !record.appeal_notes;

    const penaltyLabel = (record) => {
        if (record.status === 'Dismissed' || record.penalty === 'Dismissed') return 'Dismissed';
        if (record.penalty === 'Pending') return 'Awaiting coordinator';
        if (record.penalty === 'Suspension') {
            return `Suspension${record.suspension_length ? ` · ${record.suspension_length}` : ''}`;
        }
        if (record.penalty === 'DTR Deduction') {
            return `DTR deduction · ${Number(record.penalty_hours || 0)} hrs`;
        }
        return record.penalty || 'Warning';
    };

    const formatMoney = (value) =>
        Number(value || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    const recordAccent = (record) => {
        if (record.status === 'Dismissed') return 'bg-slate-300';
        if (record.status === 'Resolved') return 'bg-emerald-500';
        if (record.status === 'Pending Appeal') return 'bg-blue-500';
        if (record.penalty === 'Pending') return 'bg-amber-500';
        return 'bg-rose-500';
    };

    return (
        <div className="mx-auto max-w-6xl space-y-6 font-sans">
            {/* OBSIDIAN CONDUCT HERO */}
            <motion.header
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
            >
                <div
                    className="pointer-events-none absolute inset-0 opacity-20"
                    style={{
                        backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                    }}
                    aria-hidden="true"
                />
                <div
                    className={`pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl ${
                        hasCleanRecord ? 'bg-emerald-500/20' : 'bg-rose-500/25'
                    }`}
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
                                    hasCleanRecord
                                        ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-300'
                                        : 'border-rose-400/25 bg-rose-500/15 text-rose-300'
                                }`}
                            >
                                <ShieldAlert className="h-3.5 w-3.5" />
                                Conduct Overview
                            </span>
                        </div>

                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Disciplinary Board
                        </h1>
                        <p className="mt-2.5 text-sm font-medium leading-relaxed text-slate-300">
                            View your official conduct records and submit appeals when needed.
                        </p>
                    </div>

                    {/* Frosted Dynamic Standing Card */}
                    <div className="flex shrink-0 items-center gap-4 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                hasCleanRecord
                                    ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/30'
                                    : 'bg-rose-500/20 text-rose-300 ring-rose-400/30'
                            }`}
                        >
                            {hasCleanRecord ? (
                                <CheckCircle2 className="h-6 w-6" />
                            ) : (
                                <AlertTriangle className="h-6 w-6" />
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Current Standing
                            </p>
                            <p
                                className={`mt-0.5 text-base font-black ${
                                    hasCleanRecord ? 'text-emerald-300' : 'text-rose-300'
                                }`}
                            >
                                {hasCleanRecord ? 'Clear Record' : 'Infractions Found'}
                            </p>
                            <p className="text-xs font-medium text-slate-400">
                                {records.length} {records.length === 1 ? 'record' : 'records'} on file
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            {hasCleanRecord ? (
                /* EXEMPLARY RECORD EMPTY STATE */
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.08 }}
                    className="flex flex-col items-center rounded-[1.75rem] border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-emerald-50/40 px-8 py-16 text-center shadow-sm"
                >
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-500/30">
                        <ShieldCheck className="h-8 w-8" />
                    </div>
                    <h3 className="text-2xl font-black tracking-tight text-slate-900">
                        Exemplary Record
                    </h3>
                    <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-500">
                        You have no violations or penalties on your account. Thank you for your continued dedication to the Work-Study Program!
                    </p>
                </motion.div>
            ) : (
                /* RECORDS LIST */
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-4"
                >
                    {records.map((record) => (
                        <motion.article
                            variants={itemVariants}
                            key={record.id}
                            className="group relative flex flex-col items-start gap-6 overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:border-slate-300 hover:shadow-md md:flex-row md:items-center"
                        >
                            {/* Left Semantic Accent Bar */}
                            <span
                                aria-hidden="true"
                                className={`absolute inset-y-4 left-0 w-1.5 rounded-r-full ${recordAccent(record)}`}
                            />

                            {/* Left Side: Icon & Details */}
                            <div className="flex w-full flex-1 gap-4 pl-2 sm:gap-5">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-500 transition-transform group-hover:scale-105">
                                    <Scale className="h-5 w-5" />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                        <h4 className="text-lg font-black tracking-tight text-slate-900">
                                            {record.violation_type || 'Standard Policy Violation'}
                                        </h4>
                                        {record.offense_level && (
                                            <span
                                                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                    record.offense_level === 'major'
                                                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                                                        : 'border-amber-200 bg-amber-50 text-amber-700'
                                                }`}
                                            >
                                                {record.offense_level}
                                            </span>
                                        )}
                                        <span
                                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                record.penalty === 'Dismissed' || record.status === 'Dismissed'
                                                    ? 'border-slate-200 bg-slate-100 text-slate-600'
                                                    : record.penalty === 'Pending'
                                                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                      : 'border-rose-200 bg-rose-50 text-rose-700'
                                            }`}
                                        >
                                            <AlertTriangle className="h-3 w-3" />
                                            {penaltyLabel(record)}
                                        </span>
                                    </div>

                                    <p className="mb-3 text-sm font-medium leading-relaxed text-slate-600">
                                        {record.description || 'No additional details provided by the supervisor.'}
                                    </p>

                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-slate-400">
                                        <span className="inline-flex items-center gap-1.5">
                                            <Clock className="h-3.5 w-3.5" />
                                            Incident:{' '}
                                            {record.incident_date
                                                ? new Date(record.incident_date).toLocaleDateString()
                                                : new Date(record.created_at).toLocaleDateString()}
                                        </span>
                                        {record.penalty === 'DTR Deduction' && Number(record.penalty_hours || 0) > 0 && (
                                            <span className="text-rose-600">
                                                -{record.penalty_hours} duty hrs on DTR
                                            </span>
                                        )}
                                        {record.penalty === 'Suspension' && record.status === 'Active' && (
                                            <span className="text-rose-600">
                                                Suspended
                                                {record.suspension_ends_at
                                                    ? ` until ${new Date(record.suspension_ends_at).toLocaleDateString()}`
                                                    : ' from duty'}
                                            </span>
                                        )}
                                        {Number(record.deduction_amount || 0) > 0 && (
                                            <span className="font-mono text-rose-600">
                                                -₱{formatMoney(record.deduction_amount)} deduction
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1">
                                            <User className="h-3.5 w-3.5" />
                                            {record.reporter?.name || record.issuer?.name || 'Supervisor'}
                                        </span>
                                    </div>

                                    {record.penalty === 'Suspension' && record.suspension_reason && (
                                        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/70 p-3 text-xs font-medium text-rose-900">
                                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                                            <span>
                                                <strong className="font-extrabold">Why suspended:</strong>{' '}
                                                {record.suspension_reason}
                                            </span>
                                        </div>
                                    )}

                                    {record.resolution_remarks && (
                                        <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-200/80 bg-blue-50/70 p-3 text-xs font-medium text-blue-900">
                                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                                            <span>
                                                <strong className="font-extrabold">Admin Note:</strong>{' '}
                                                {record.resolution_remarks}
                                            </span>
                                        </div>
                                    )}

                                    {record.appeal_notes && (
                                        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold italic text-slate-600">
                                            <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                                            Appeal submitted. Awaiting WSPO coordinator review.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Side: Status & Action */}
                            <div className="flex w-full shrink-0 flex-col items-stretch justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center md:w-52 md:flex-col md:items-end md:justify-center md:border-l md:border-t-0 md:pl-6 md:pt-0">
                                <div className="flex flex-col items-start md:items-end">
                                    <span className="mb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Current Status
                                    </span>
                                    {record.status === 'Resolved' && (
                                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-700">
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                                        </span>
                                    )}
                                    {record.status === 'Dismissed' && (
                                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-700">
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Dismissed
                                        </span>
                                    )}
                                    {record.status === 'Pending Appeal' && (
                                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-extrabold text-blue-700">
                                            <MessageSquare className="h-3.5 w-3.5" /> Appeal Under Review
                                        </span>
                                    )}
                                    {record.penalty === 'Pending' && record.status === 'Active' && (
                                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-700">
                                            <Clock className="h-3.5 w-3.5" /> Awaiting Decision
                                        </span>
                                    )}
                                    {record.penalty !== 'Pending' && record.status === 'Active' && (
                                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-700">
                                            <FileWarning className="h-3.5 w-3.5" /> Action Required
                                        </span>
                                    )}
                                </div>

                                {isAppealable(record) && (
                                    <button
                                        onClick={() => setAppealModal(record)}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-600 sm:w-auto md:w-full"
                                    >
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        File Appeal
                                    </button>
                                )}
                            </div>
                        </motion.article>
                    ))}
                </motion.div>
            )}

            {/* FORMAL APPEAL MODAL */}
            <AnimatePresence>
                {appealModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(() => setAppealModal(null))}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="flex items-center justify-between gap-3 bg-slate-950 px-6 py-5 text-white">
                                <div className="flex items-center gap-2.5">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-blue-300">
                                        <Scale className="h-5 w-5" />
                                    </span>
                                    <div>
                                        <h3 className="text-base font-black tracking-tight">
                                            Submit Formal Appeal
                                        </h3>
                                        <p className="text-xs font-medium text-slate-400">
                                            Reviewed directly by the WSPO coordinator
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setAppealModal(null)}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                                    aria-label="Close modal"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="space-y-5 p-6 sm:p-7">
                                <div>
                                    <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Incident Reference
                                    </p>
                                    <p className="rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm font-extrabold text-slate-900">
                                        {appealModal.violation_type || 'Standard Policy Violation'}
                                    </p>
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Your Statement
                                    </label>
                                    <p className="mb-3 text-xs font-medium leading-relaxed text-slate-500">
                                        Provide a clear, respectful explanation for WSPO coordinator review.
                                    </p>
                                    <textarea
                                        autoFocus
                                        className="h-40 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-relaxed text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                        placeholder="I am writing to formally appeal this record because..."
                                        value={appealNotes}
                                        onChange={(e) => setAppealNotes(e.target.value)}
                                    />
                                </div>

                                <div className="flex justify-end gap-2.5 pt-1">
                                    <button
                                        onClick={() => setAppealModal(null)}
                                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleAppealSubmit}
                                        disabled={!appealNotes.trim()}
                                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <ShieldCheck className="h-4 w-4" />
                                        Submit to Coordinator
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

export default StudentDisciplinaryBoard;