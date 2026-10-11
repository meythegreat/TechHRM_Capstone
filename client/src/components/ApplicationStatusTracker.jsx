import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, MapPin, XCircle, CalendarClock, Info, FileText } from 'lucide-react';

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
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

export const normalizeTracker = (application) => {
    if (!application) return null;
    const events = application.events || application.status_events || [];
    const assigned = Boolean(application.assigned_department);
    const status = application.status;
    const profile = application.applicant?.profile;
    const duty = application.assigned_duty
        || (profile?.duty_type === 'Request' ? profile?.duty_request : profile?.duty_type)
        || null;

    return {
        ...application,
        current_stage: application.current_stage
            || (status === 'Rejected' ? 'Rejected' : (assigned ? 'Assigned' : status)),
        assigned_duty: duty,
        submitted_at: application.submitted_at || application.created_at,
        applicant_name: application.applicant_name
            || [application.first_name, application.middle_name, application.last_name].filter(Boolean).join(' '),
        events,
    };
};

const eventFor = (application, status) => (
    (application.events || []).find((event) => event.status === status) || null
);

const ApplicationStatusTracker = ({ application: provided = null, variant = 'page', showDocuments = true }) => {
    const [application, setApplication] = useState(() => normalizeTracker(provided));
    const [isLoading, setIsLoading] = useState(!provided);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        if (provided) {
            setApplication(normalizeTracker(provided));
            setIsLoading(false);
            setLoadError('');
            return;
        }

        let active = true;
        axios.get('/api/applications/my-status')
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
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <p className="text-sm font-bold text-indigo-700 animate-pulse tracking-widest uppercase">Loading Status...</p>
            </div>
        );
    }

    if (!application) {
        return (
            <div className="p-8 text-center bg-red-50 rounded-3xl border border-red-100">
                <p className="text-base font-black text-red-600">{loadError || 'No application found.'}</p>
            </div>
        );
    }

    const rejected = application.current_stage === 'Rejected' || application.status === 'Rejected';
    const rejectionReason = application.rejection_reason
        || (application.events || []).find((event) => event.status === 'Rejected')?.note;
    const progressKey = rejected
        ? [...(application.events || [])].map((event) => event.status).filter((status) => TRACKER_STAGES.some((stage) => stage.key === status)).pop()
        : application.current_stage;
    const currentIndex = Math.max(0, TRACKER_STAGES.findIndex((stage) => stage.key === progressKey));
    const interviewWhen = formatWhen(application.interview_date);
    
    const shell = variant === 'embedded'
        ? 'space-y-6'
        : 'bg-white p-6 sm:p-10 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-200 space-y-8 relative overflow-hidden';

    // Animation Variants
    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };
    
    const itemVariants = {
        hidden: { opacity: 0, x: -10 },
        show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    return (
        <div className={shell}>
            {variant !== 'embedded' && (
                <div className="relative z-10">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-indigo-50 border border-indigo-100 mb-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Live Status Tracker</p>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Application Progress</h2>
                    <p className="text-sm font-medium text-slate-500 mt-2 max-w-lg leading-relaxed">
                        {application.applicant_name
                            ? `${application.applicant_name}, monitor your path from initial sign-up through final placement.`
                            : 'Follow each stage of the pipeline from sign-up through final approval and assignment.'}
                    </p>
                </div>
            )}

            {rejected && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative overflow-hidden rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-rose-50 p-6 flex gap-4 shadow-sm"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl"></div>
                    <XCircle className="w-6 h-6 text-red-600 shrink-0 relative z-10" />
                    <div className="relative z-10">
                        <p className="text-base font-black text-red-800 tracking-tight">Application Not Approved</p>
                        <p className="text-sm font-medium text-red-700/80 mt-1">
                            After careful review, this application could not be advanced further.
                        </p>
                        {rejectionReason && (
                            <div className="mt-4 bg-white/60 p-4 rounded-xl border border-red-100 shadow-sm">
                                <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-1">Remarks</p>
                                <p className="text-sm font-bold text-red-900 leading-relaxed">{rejectionReason}</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            <motion.ol 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="space-y-0 relative z-10"
            >
                {TRACKER_STAGES.map((stage, index) => {
                    const reached = currentIndex >= index;
                    const isCurrent = !rejected && application.current_stage === stage.key;
                    const isComplete = rejected ? currentIndex >= index : currentIndex > index;
                    const event = eventFor(application, stage.key);
                    const when = formatWhen(event?.occurred_at) || (stage.key === 'Pending' ? formatWhen(application.submitted_at) : null);
                    const isLast = index === TRACKER_STAGES.length - 1;

                    return (
                        <motion.li variants={itemVariants} key={stage.key} className="flex gap-4 sm:gap-5">
                            <div className="flex flex-col items-center">
                                <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-300 ${
                                    isComplete ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/20' :
                                    isCurrent ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-4 ring-indigo-50' :
                                    'bg-slate-50 border-slate-200 text-slate-300'
                                }`}>
                                    {isComplete ? <CheckCircle2 className="w-5 h-5" /> : isCurrent ? <span className="text-sm font-black">{index + 1}</span> : <Circle className="w-4 h-4" />}
                                </div>
                                {!isLast && (
                                    <div className={`w-0.5 flex-1 min-h-[2.5rem] my-1 transition-colors duration-300 ${isComplete ? 'bg-emerald-400' : 'bg-slate-100'}`} />
                                )}
                            </div>
                            
                            <div className={`pb-8 min-w-0 flex-1 ${isLast ? 'pb-0' : ''}`}>
                                <div className="flex flex-wrap items-center gap-3">
                                    <p className={`text-base font-black tracking-tight ${reached ? 'text-slate-900' : 'text-slate-400'}`}>{stage.label}</p>
                                    {isCurrent && (
                                        <span className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest border border-indigo-100">
                                            Current Phase
                                        </span>
                                    )}
                                </div>
                                <p className={`text-sm font-medium mt-1.5 leading-relaxed ${reached ? 'text-slate-600' : 'text-slate-400'}`}>
                                    {stage.description}
                                </p>
                                
                                {when && reached && (
                                    <p className="text-xs font-bold text-slate-400 mt-2 flex items-center gap-1.5">
                                        <CalendarClock className="w-3.5 h-3.5" /> Logged on {when}
                                    </p>
                                )}
                                
                                {stage.key === 'Interview' && interviewWhen && reached && (
                                    <div className="mt-3 bg-amber-50 border border-amber-100 p-3.5 rounded-xl shadow-sm">
                                        <p className="text-xs font-black uppercase tracking-widest text-amber-700 mb-1">Scheduled Interview</p>
                                        <p className="text-sm font-bold text-amber-900">{interviewWhen}</p>
                                    </div>
                                )}
                                
                                {stage.key === 'Interview' && application.interview_remarks && reached && (
                                    <div className="mt-2 bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
                                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Evaluator Remarks</p>
                                        <p className="text-sm font-medium text-slate-700 italic">"{application.interview_remarks}"</p>
                                    </div>
                                )}
                                
                                {stage.key === 'Assigned' && application.assigned_department && (
                                    <div className="mt-3 bg-emerald-50 border border-emerald-100 p-4 rounded-xl shadow-sm">
                                        <p className="text-xs font-black uppercase tracking-widest text-emerald-600 mb-1.5">Final Placement Details</p>
                                        <p className="inline-flex items-center gap-2 text-sm font-black text-emerald-900">
                                            <MapPin className="w-4 h-4 text-emerald-600" />
                                            {application.assigned_department}
                                        </p>
                                        {application.assigned_duty && (
                                            <p className="mt-1 text-sm font-medium text-emerald-800 ml-6">
                                                Assigned Duty: <span className="font-bold">{application.assigned_duty}</span>
                                            </p>
                                        )}
                                    </div>
                                )}
                                
                                {event?.note && stage.key !== 'Interview' && stage.key !== 'Assigned' && stage.key !== 'Pending' && reached && (
                                    <div className="mt-3 flex items-start gap-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                        <p className="font-medium italic">"{event.note}"</p>
                                    </div>
                                )}
                            </div>
                        </motion.li>
                    );
                })}
            </motion.ol>

            {variant !== 'embedded' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 mt-4 border-t border-slate-100 relative z-10">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current Stage</p>
                        <p className={`font-black text-sm mt-1.5 ${rejected ? 'text-red-600' : 'text-indigo-700'}`}>
                            {rejected ? 'Not Approved' : (TRACKER_STAGES.find((stage) => stage.key === application.current_stage)?.label || application.status)}
                        </p>
                    </div>
                    {application.preferred_department && (
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preferred Dept</p>
                            <p className="font-bold text-sm text-slate-900 mt-1.5 truncate">{application.preferred_department}</p>
                        </div>
                    )}
                    {application.tracking_code && (
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tracking Code</p>
                            <p className="font-mono font-black text-slate-900 text-sm mt-1.5 uppercase tracking-wider">{application.tracking_code}</p>
                        </div>
                    )}
                </div>
            )}

            {showDocuments && (application.documents || []).length > 0 && (
                <div className="pt-6 mt-4 border-t border-slate-100 relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Submitted Documents</p>
                    </div>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {application.documents.map((doc) => (
                            <li key={doc.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                                <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <span className="text-xs font-bold text-slate-700 truncate">{doc.original_name}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default ApplicationStatusTracker;