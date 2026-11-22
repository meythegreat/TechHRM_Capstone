import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
    CheckCircle2,
    Circle,
    MapPin,
    XCircle,
    CalendarClock,
    Info,
    FileText,
    Sparkles,
    Building2,
    Hash,
    ExternalLink,
    MessageSquareQuote,
    Briefcase,
} from 'lucide-react';
import SecureFileViewerModal from './SecureFileViewerModal';

export const TRACKER_STAGES = [
    {
        key: 'Pending',
        label: 'Application Received',
        description: 'Your signup and documents are on file. The Work-Study office is currently reviewing them.',
    },
    {
        key: 'Interview',
        label: 'Interview',
        description: 'Your application is in the interview stage. Please wait for your schedule from the WSPO.',
    },
    {
        key: 'Training',
        label: 'Training',
        description: 'You have advanced to training. Follow the schedule and requirements provided by the office.',
    },
    {
        key: 'For Result',
        label: 'For Result',
        description: 'The required stages are complete. The final decision is currently pending evaluation.',
    },
    {
        key: 'Approved',
        label: 'Approved',
        description: 'Your application was approved. The office will finalize your placement and sign-in credentials.',
    },
    {
        key: 'Assigned',
        label: 'Assigned',
        description: 'Your office assignment is final. You may now sign in using your issued credentials.',
    },
];

const formatWhen = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
};

export const normalizeTracker = (application) => {
    if (!application) return null;
    const events = application.events || application.status_events || [];
    const assigned = Boolean(application.assigned_department);
    const status = application.status;
    const profile = application.applicant?.profile;
    const duty =
        application.assigned_duty ||
        (profile?.duty_type === 'Request' ? profile?.duty_request : profile?.duty_type) ||
        null;

    return {
        ...application,
        current_stage:
            application.current_stage ||
            (status === 'Rejected' ? 'Rejected' : assigned ? 'Assigned' : status),
        assigned_duty: duty,
        submitted_at: application.submitted_at || application.created_at,
        applicant_name:
            application.applicant_name ||
            [application.first_name, application.middle_name, application.last_name]
                .filter(Boolean)
                .join(' '),
        events,
    };
};

const eventFor = (application, status) =>
    (application.events || []).find((event) => event.status === status) || null;

/** @param {{ application?: object | null, variant?: string, showDocuments?: boolean }} props */
const ApplicationStatusTracker = ({
    application: provided = null,
    variant = 'page',
    showDocuments = true,
}) => {
    const [application, setApplication] = useState(() => normalizeTracker(provided));
    const [isLoading, setIsLoading] = useState(!provided);
    const [loadError, setLoadError] = useState('');
    const [documentViewer, setDocumentViewer] = useState(null);

    useEffect(() => {
        if (provided) {
            setApplication(normalizeTracker(provided));
            setIsLoading(false);
            setLoadError('');
            return;
        }

        let active = true;
        axios
            .get('/api/applications/my-status')
            .then((res) => {
                if (active) setApplication(normalizeTracker(res.data));
            })
            .catch(() => {
                if (active) {
                    setApplication(null);
                    setLoadError('No application found.');
                }
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [provided]);

    if (isLoading) {
        return (
            <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Loading application status">
                {variant !== 'embedded' && <div className="h-44 rounded-[2rem] bg-slate-900/90" />}
                <div className="h-80 rounded-[1.75rem] bg-slate-200/80" />
            </div>
        );
    }

    if (!application) {
        return (
            <div className="flex items-center justify-center gap-3 rounded-[1.75rem] border border-rose-200 bg-rose-50 p-8 text-center">
                <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
                <p className="text-sm font-bold text-rose-700">{loadError || 'No application found.'}</p>
            </div>
        );
    }

    const rejected = application.current_stage === 'Rejected' || application.status === 'Rejected';
    const rejectionReason =
        application.rejection_reason ||
        (application.events || []).find((event) => event.status === 'Rejected')?.note;
    const progressKey = rejected
        ? [...(application.events || [])]
              .map((event) => event.status)
              .filter((status) => TRACKER_STAGES.some((stage) => stage.key === status))
              .pop()
        : application.current_stage;
    const currentIndex = Math.max(
        0,
        TRACKER_STAGES.findIndex((stage) => stage.key === progressKey)
    );
    const interviewWhen = formatWhen(application.interview_date);
    const stageLabel = rejected
        ? 'Not Approved'
        : TRACKER_STAGES.find((stage) => stage.key === application.current_stage)?.label ||
          application.status;

    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.07 } },
    };

    const itemVariants = {
        hidden: { opacity: 0, x: -10 },
        show: {
            opacity: 1,
            x: 0,
            transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
        },
    };

    const timelineContent = (
        <>
            {rejected && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-rose-50/50 p-5 shadow-xs sm:p-6"
                >
                    <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 ring-1 ring-rose-200">
                            <XCircle className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-base font-black tracking-tight text-rose-800">
                                Application Not Approved
                            </p>
                            <p className="mt-1 text-xs font-medium leading-relaxed text-rose-800/80 sm:text-sm">
                                After careful review, this application could not be advanced further.
                            </p>
                            {rejectionReason && (
                                <div className="mt-4 rounded-xl border border-rose-200/80 bg-white p-4">
                                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-rose-500">
                                        Remarks
                                    </p>
                                    <p className="mt-1 text-sm font-bold leading-relaxed text-rose-800">
                                        {rejectionReason}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            <motion.ol
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="relative z-10 space-y-0"
            >
                {TRACKER_STAGES.map((stage, index) => {
                    const reached = currentIndex >= index;
                    const isCurrent = !rejected && application.current_stage === stage.key;
                    const isComplete = rejected ? currentIndex >= index : currentIndex > index;
                    const event = eventFor(application, stage.key);
                    const when =
                        formatWhen(event?.occurred_at) ||
                        (stage.key === 'Pending' ? formatWhen(application.submitted_at) : null);
                    const isLast = index === TRACKER_STAGES.length - 1;

                    return (
                        <motion.li
                            variants={itemVariants}
                            key={stage.key}
                            className="flex gap-4 sm:gap-5"
                        >
                            {/* Stepper Node + Rail */}
                            <div className="flex flex-col items-center">
                                <div
                                    className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 transition-all duration-300 ${
                                        isComplete
                                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                                            : isCurrent
                                              ? 'border-blue-600 bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 ring-4 ring-blue-50'
                                              : 'border-slate-200 bg-slate-50 text-slate-300'
                                    }`}
                                >
                                    {isComplete ? (
                                        <CheckCircle2 className="h-5 w-5" />
                                    ) : isCurrent ? (
                                        <span className="font-mono text-sm font-black">{index + 1}</span>
                                    ) : (
                                        <Circle className="h-4 w-4" />
                                    )}
                                </div>
                                {!isLast && (
                                    <div
                                        className={`my-1.5 min-h-[2.5rem] w-0.5 flex-1 rounded-full transition-colors duration-300 ${
                                            isComplete ? 'bg-emerald-400' : 'bg-slate-200/80'
                                        }`}
                                    />
                                )}
                            </div>

                            {/* Stage Body */}
                            <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-7'}`}>
                                <div
                                    className={`rounded-2xl transition-all ${
                                        isCurrent
                                            ? 'border border-blue-200 bg-blue-50/40 p-4 shadow-xs'
                                            : 'pt-1'
                                    }`}
                                >
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <p
                                            className={`text-base font-extrabold tracking-tight ${
                                                reached ? 'text-slate-900' : 'text-slate-400'
                                            }`}
                                        >
                                            {stage.label}
                                        </p>
                                        {isCurrent && (
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-white">
                                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                                                Current Phase
                                            </span>
                                        )}
                                        {isComplete && (
                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                                                Completed
                                            </span>
                                        )}
                                    </div>

                                    <p
                                        className={`mt-1.5 text-sm font-medium leading-relaxed ${
                                            reached ? 'text-slate-600' : 'text-slate-400'
                                        }`}
                                    >
                                        {stage.description}
                                    </p>

                                    {when && reached && (
                                        <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-slate-400">
                                            <CalendarClock className="h-3.5 w-3.5" />
                                            Logged on {when}
                                        </p>
                                    )}

                                    {stage.key === 'Interview' && interviewWhen && reached && (
                                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5">
                                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700">
                                                Scheduled Interview
                                            </p>
                                            <p className="mt-1 text-sm font-extrabold text-amber-950">
                                                {interviewWhen}
                                            </p>
                                        </div>
                                    )}

                                    {stage.key === 'Interview' &&
                                        application.interview_remarks &&
                                        reached && (
                                            <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-slate-200/80 bg-white p-3.5">
                                                <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                                <div>
                                                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                        Evaluator Remarks
                                                    </p>
                                                    <p className="mt-1 text-sm font-medium italic text-slate-700">
                                                        &ldquo;{application.interview_remarks}&rdquo;
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                    {stage.key === 'Assigned' && application.assigned_department && (
                                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
                                                Final Placement Details
                                            </p>
                                            <p className="mt-1.5 flex items-center gap-2 text-sm font-extrabold text-emerald-950">
                                                <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
                                                <span>{application.assigned_department}</span>
                                            </p>
                                            {application.assigned_duty && (
                                                <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-emerald-800">
                                                    <Briefcase className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                                    <span>
                                                        Assigned Duty:{' '}
                                                        <strong className="font-extrabold">
                                                            {application.assigned_duty}
                                                        </strong>
                                                    </span>
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {event?.note &&
                                        stage.key !== 'Interview' &&
                                        stage.key !== 'Assigned' &&
                                        stage.key !== 'Pending' &&
                                        reached && (
                                            <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200/80 bg-white p-3 text-xs text-slate-600">
                                                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                                <p className="font-medium italic">&ldquo;{event.note}&rdquo;</p>
                                            </div>
                                        )}
                                </div>
                            </div>
                        </motion.li>
                    );
                })}
            </motion.ol>

            {showDocuments && (application.documents || []).length > 0 && (
                <div className="border-t border-slate-100 pt-6">
                    <div className="mb-3.5 flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                            <FileText className="h-4 w-4 text-blue-600" />
                            Submitted Documents
                        </p>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                            {application.documents.length}{' '}
                            {application.documents.length === 1 ? 'file' : 'files'}
                        </span>
                    </div>

                    <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {application.documents.map((doc) => (
                            <li key={doc.id}>
                                {doc.file_path ? (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setDocumentViewer({
                                                path: doc.file_path,
                                                title: doc.original_name || 'Submitted document',
                                            })
                                        }
                                        className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-3 text-left transition-all hover:border-blue-300 hover:bg-blue-50/60"
                                    >
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-xs ring-1 ring-slate-200/70">
                                            <FileText className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xs font-extrabold text-slate-800">
                                                {doc.original_name}
                                            </span>
                                            <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 group-hover:underline">
                                                Open file
                                                <ExternalLink className="h-3 w-3" />
                                            </span>
                                        </span>
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-3">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-400 ring-1 ring-slate-200/70">
                                            <FileText className="h-4 w-4" />
                                        </span>
                                        <span className="truncate text-xs font-bold text-slate-700">
                                            {doc.original_name}
                                        </span>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <SecureFileViewerModal
                filePath={documentViewer?.path || null}
                title={documentViewer?.title || 'Submitted document'}
                onClose={() => setDocumentViewer(null)}
            />
        </>
    );

    if (variant === 'embedded') {
        return <div className="space-y-6 font-sans">{timelineContent}</div>;
    }

    return (
        <div className="space-y-6 font-sans">
            {/* OBSIDIAN LIVE TRACKER HERO */}
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
                        rejected ? 'bg-rose-500/25' : 'bg-blue-600/25'
                    }`}
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                            <span className="text-[11px] font-bold uppercase tracking-widest text-blue-300">
                                Live Status Tracker
                            </span>
                        </div>
                        <h2 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Application Progress
                        </h2>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            {application.applicant_name
                                ? `${application.applicant_name}, monitor your path from initial sign-up through final placement.`
                                : 'Follow each stage of the pipeline from sign-up through final approval and assignment.'}
                        </p>
                    </div>

                    {/* Frosted Metadata Summary */}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:min-w-[400px]">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
                            <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                <Sparkles className="h-3 w-3 text-blue-400" />
                                Stage
                            </p>
                            <p
                                className={`mt-1 truncate text-sm font-black ${
                                    rejected ? 'text-rose-300' : 'text-white'
                                }`}
                            >
                                {stageLabel}
                            </p>
                        </div>

                        {application.preferred_department && (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
                                <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    <Building2 className="h-3 w-3 text-indigo-300" />
                                    Preferred
                                </p>
                                <p className="mt-1 truncate text-sm font-bold text-slate-100">
                                    {application.preferred_department}
                                </p>
                            </div>
                        )}

                        {application.tracking_code && (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
                                <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    <Hash className="h-3 w-3 text-emerald-300" />
                                    Tracking
                                </p>
                                <p className="mt-1 truncate font-mono text-sm font-black uppercase tracking-wider text-emerald-300">
                                    {application.tracking_code}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </motion.header>

            {/* MAIN PIPELINE CARD */}
            <section className="space-y-6 rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
                {timelineContent}
            </section>
        </div>
    );
};

export default ApplicationStatusTracker;