import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
    getAllApplications,
    updateApplicationStatus,
    updateApplicationSchedule,
    getMatchingSuggestions,
    assignPlacement,
    deleteApplication,
} from '../services/applicationService';
import {
    Users,
    UserPlus,
    Clock,
    CalendarCheck,
    BookOpen,
    FileSignature,
    CheckCircle2,
    ChevronRight,
    X,
    Calendar,
    Briefcase,
    Target,
    FileText,
    Search,
    Eye,
    EyeOff,
    Mail,
    Phone,
    Copy,
    XCircle,
    Trash2,
    Undo2,
    Printer,
    Sparkles,
    AlertCircle,
    Archive,
} from 'lucide-react';
import SecureFileViewerModal from './SecureFileViewerModal';
import OfficialWspForms, { printOfficialForms } from './wsp/OfficialWspForms';
import { bindPopup } from '../utils/popupDismiss';
import ApplicationStatusTracker from './ApplicationStatusTracker';
import { REALTIME_EVENT } from '../utils/realtime';
import FeatureSection from './FeatureSection';
import AuditPager, { pageSlice } from './AuditPager';

const PIPELINE_STAGES = ['Pending', 'Interview', 'Training', 'For Result', 'Approved'];
const STAGE_ORDER = PIPELINE_STAGES;

const COLUMN_CONFIG = {
    Pending: {
        icon: Clock,
        color: 'text-slate-600',
        bg: 'bg-slate-50/80',
        border: 'border-slate-200/90',
        badge: 'bg-slate-200/80 text-slate-700',
    },
    Interview: {
        icon: CalendarCheck,
        color: 'text-amber-700',
        bg: 'bg-amber-50/40',
        border: 'border-amber-200/80',
        badge: 'bg-amber-100 text-amber-800',
    },
    Training: {
        icon: BookOpen,
        color: 'text-purple-700',
        bg: 'bg-purple-50/40',
        border: 'border-purple-200/80',
        badge: 'bg-purple-100 text-purple-800',
    },
    'For Result': {
        icon: FileSignature,
        color: 'text-blue-700',
        bg: 'bg-blue-50/40',
        border: 'border-blue-200/80',
        badge: 'bg-blue-100 text-blue-800',
    },
    Approved: {
        icon: CheckCircle2,
        color: 'text-emerald-700',
        bg: 'bg-emerald-50/40',
        border: 'border-emerald-200/80',
        badge: 'bg-emerald-100 text-emerald-800',
    },
};

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const GENDERS = ['Male', 'Female', 'Prefer not to say'];
const DUTY_TYPES = ['Clerical', 'Janitorial', 'Request'];

const middleInitialFrom = (value) => {
    const middle = String(value || '')
        .trim()
        .replace(/\.+$/, '');
    return middle ? `${middle.charAt(0).toUpperCase()}.` : '';
};

const profileFromApplication = (app) => ({
    assigned_department: app?.preferred_department || app?.assigned_department || '',
    duty_type: app?.duty_type || '',
    duty_request: app?.duty_request || '',
    first_name: app?.first_name || '',
    middle_name: app?.middle_name || '',
    last_name: app?.last_name || '',
    email: app?.email || '',
    age: app?.age ? String(app.age) : '',
    gender: app?.gender || '',
    address: app?.address || '',
    contact_number: app?.contact_number || '',
    year_level: app?.year_level || '',
    course: app?.course || '',
    student_id_number: app?.student_id_number || '',
});

const accountDisplayName = (profile) => {
    const initial = middleInitialFrom(profile.middle_name);
    return [profile.first_name, initial, profile.last_name]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ');
};

const placementIsComplete = (profile) =>
    Boolean(
        profile.assigned_department &&
            profile.duty_type &&
            (profile.duty_type !== 'Request' || String(profile.duty_request || '').trim()) &&
            String(profile.first_name || '').trim() &&
            String(profile.last_name || '').trim() &&
            String(profile.email || '').trim() &&
            String(profile.age || '').trim() &&
            profile.gender &&
            String(profile.address || '').trim() &&
            String(profile.contact_number || '').trim() &&
            profile.year_level &&
            String(profile.course || '').trim() &&
            String(profile.student_id_number || '').trim()
    );

const canRemove = (status) => status !== 'Approved';

const approvedAt = (app) => {
    const events = app.status_events || app.events || [];
    const approved = [...events].reverse().find((event) => event.status === 'Approved');
    const raw = approved?.occurred_at || app.updated_at || app.created_at;
    const time = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(time) ? time : null;
};

const getNextStage = (status) => {
    const index = PIPELINE_STAGES.indexOf(status);
    if (index === -1 || index >= PIPELINE_STAGES.length - 1) return null;
    return PIPELINE_STAGES[index + 1];
};

const UNDO_HIDE_MS = 5000;

const DOCUMENT_LABELS = {
    application_letter: 'Application letter',
    good_moral: 'Certificate of Good Moral Character',
    report_card: 'Report card or grades',
    birth_certificate: 'Birth certificate',
    medical_certificate: 'Medical certificate',
    id_picture: '2 x 2 I.D. picture',
    indigency: 'Certificate of Indigency',
};

const ApplicationManager = () => {
    const isAudit = localStorage.getItem('user_role') === 'Super Admin';
    const [applications, setApplications] = useState([]);
    const [archivedApplications, setArchivedApplications] = useState([]);
    const [modalView, setModalView] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [placementData, setPlacementData] = useState(profileFromApplication(null));
    const [departmentSupervisors, setDepartmentSupervisors] = useState({});
    const [interviewData, setInterviewData] = useState({
        interview_date: '',
        interview_remarks: '',
    });
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [hideOlderApproved, setHideOlderApproved] = useState(false);
    const [approvedWindow, setApprovedWindow] = useState(7);
    const [issuedCredentials, setIssuedCredentials] = useState(null);
    const [copiedField, setCopiedField] = useState(null);
    const [declineReason, setDeclineReason] = useState('');
    const [pendingStage, setPendingStage] = useState('');
    const [undoAction, setUndoAction] = useState(null);
    const [officialForms, setOfficialForms] = useState(null);
    const [formsNote, setFormsNote] = useState('');
    const [documentViewer, setDocumentViewer] = useState(null);
    const [applicantPage, setApplicantPage] = useState(1);
    const [archivePage, setArchivePage] = useState(1);
    const stageOverlays = useRef(new Map());
    const stageQueues = useRef(new Map());
    const commitToken = useRef(0);

    const closePopup = () => {
        setModalView('');
        setIssuedCredentials(null);
        setPendingStage('');
    };

    const applyStageOverlays = (rows) =>
        rows.map((row) => {
            const overlay = stageOverlays.current.get(row.id);
            return overlay ? { ...row, ...overlay } : row;
        });

    const syncOverlay = (appId) => {
        const queue = (stageQueues.current.get(appId) || []).filter(
            (job) => !job.cancelled && !job.done
        );
        if (queue.length === 0) {
            stageOverlays.current.delete(appId);
            return null;
        }
        const latest = queue[queue.length - 1];
        stageOverlays.current.set(appId, latest.overlay);
        return latest;
    };

    useEffect(
        () => () => {
            stageQueues.current.forEach((queue) => {
                queue.forEach((job) => {
                    job.cancelled = true;
                    if (job.timer) clearTimeout(job.timer);
                });
            });
            stageQueues.current.clear();
        },
        []
    );

    const flushStageJob = async (job) => {
        if (job.cancelled || job.done) return;
        const queue = stageQueues.current.get(job.appId) || [];
        const earlier = queue.find(
            (item) => item !== job && !item.cancelled && !item.done && item.readyAt <= job.readyAt
        );
        if (earlier) {
            job.timer = setTimeout(() => {
                void flushStageJob(job);
            }, 250);
            return;
        }

        job.started = true;
        setUndoAction((current) => (current?.token === job.token ? null : current));
        try {
            await job.run();
            job.done = true;
            syncOverlay(job.appId);
            fetchApplications(true);
        } catch (err) {
            job.done = true;
            job.cancelled = true;
            syncOverlay(job.appId);
            setError(err.response?.data?.message || 'Failed to confirm this stage.');
            fetchApplications(true);
        } finally {
            const remaining = (stageQueues.current.get(job.appId) || []).filter(
                (item) => item !== job
            );
            if (remaining.length) stageQueues.current.set(job.appId, remaining);
            else stageQueues.current.delete(job.appId);
        }
    };

    const scheduleStageCommit = (app, overlay, confirmedStage, run) => {
        const token = commitToken.current + 1;
        commitToken.current = token;
        const job = {
            token,
            appId: app.id,
            confirmedStage,
            overlay,
            previous: {
                status: app.status,
                interview_date: app.interview_date,
                interview_remarks: app.interview_remarks,
            },
            readyAt: Date.now() + UNDO_HIDE_MS,
            cancelled: false,
            done: false,
            started: false,
            timer: null,
            run,
        };
        const queue = stageQueues.current.get(app.id) || [];
        queue.push(job);
        stageQueues.current.set(app.id, queue);
        stageOverlays.current.set(app.id, overlay);
        setApplications((prev) =>
            prev.map((item) => (item.id === app.id ? { ...item, ...overlay } : item))
        );
        setSelectedApp((current) => (current?.id === app.id ? { ...current, ...overlay } : current));
        setUndoAction({
            token,
            appId: app.id,
            name: `${app.first_name} ${app.last_name}`.trim(),
            confirmedStage,
        });
        job.timer = setTimeout(() => {
            void flushStageJob(job);
        }, UNDO_HIDE_MS);
    };

    const closeUndo = () => {
        setUndoAction(null);
    };

    const undoStage = () => {
        if (!undoAction) return;
        const queue = stageQueues.current.get(undoAction.appId) || [];
        const job = queue.find((item) => item.token === undoAction.token);
        if (!job || job.started || job.cancelled) return;
        job.cancelled = true;
        if (job.timer) clearTimeout(job.timer);
        const remaining = queue.filter((item) => item !== job);
        if (remaining.length) stageQueues.current.set(job.appId, remaining);
        else stageQueues.current.delete(job.appId);
        const latest = syncOverlay(job.appId);
        const restored = latest ? latest.overlay : job.previous;
        setApplications((prev) =>
            prev.map((item) => (item.id === job.appId ? { ...item, ...restored } : item))
        );
        setSelectedApp((current) =>
            current?.id === job.appId ? { ...current, ...restored } : current
        );
        setUndoAction(
            latest && !latest.started
                ? {
                      token: latest.token,
                      appId: latest.appId,
                      name: undoAction.name,
                      confirmedStage: latest.confirmedStage,
                  }
                : null
        );
    };

    useEffect(() => {
        fetchApplications();
        const interval = setInterval(() => fetchApplications(true), 5000);
        const onRealtime = () => fetchApplications(true);
        window.addEventListener(REALTIME_EVENT, onRealtime);
        axios
            .get('/api/offices')
            .then((response) => setDepartments(Array.isArray(response.data) ? response.data : []))
            .catch(() => setDepartments([]));
        axios
            .get('/api/department-supervisors')
            .then((response) => setDepartmentSupervisors(response.data || {}))
            .catch(() => setDepartmentSupervisors({}));
        return () => {
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, onRealtime);
        };
    }, []);

    const supervisorLabelForOffice = (office) => {
        if (!office) return 'No supervisor assigned';
        const names = departmentSupervisors[office] || [];
        return names.length > 0 ? names.join(', ') : 'No supervisor assigned';
    };

    const fetchApplications = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            setError(null);
            const res = await getAllApplications();
            const payload = res.data;
            const rows = Array.isArray(payload) ? payload : payload?.data || [];
            const archived = Array.isArray(payload?.archive) ? payload.archive : [];
            const visible = (list) => (isAudit ? list.filter((app) => app.source === 'website') : list);
            setApplications(applyStageOverlays(visible(rows)));
            setArchivedApplications(visible(archived));
        } catch (err) {
            setError('Failed to fetch applications');
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatusUpdate = async (app) => {
        const next = getNextStage(app.status);
        if (!next) return;

        if (next === 'Interview') {
            setSelectedApp(app);
            setModalView('interview');
            return;
        }

        if (next === 'Approved') {
            setSelectedApp(app);
            setPlacementData(profileFromApplication(app));
            await loadSuggestions(app.id);
            setModalView('placement');
            return;
        }

        setSelectedApp(app);
        setPendingStage(next);
        setModalView('confirm');
    };

    const submitStageConfirmation = () => {
        if (!selectedApp || !pendingStage) return;
        const app = selectedApp;
        const next = pendingStage;
        setModalView('');
        setPendingStage('');
        setError(null);
        scheduleStageCommit(app, { status: next }, next, () =>
            updateApplicationStatus(app.id, { status: next })
        );
    };

    const handleDecline = (app) => {
        if (!canRemove(app.status)) return;
        setSelectedApp(app);
        setDeclineReason('');
        setModalView('decline');
    };

    const handleDelete = (app) => {
        if (!canRemove(app.status)) return;
        setSelectedApp(app);
        setModalView('delete');
    };

    const submitRemove = async () => {
        if (!selectedApp) return;
        try {
            if (modalView === 'decline') {
                const reason = declineReason.trim();
                if (!reason) {
                    setError('Enter the reason for declining this applicant.');
                    return;
                }
                await updateApplicationStatus(selectedApp.id, {
                    status: 'Rejected',
                    rejection_reason: reason,
                });
            } else {
                await deleteApplication(selectedApp.id);
            }
            setApplications((prev) => prev.filter((a) => a.id !== selectedApp.id));
            setModalView('');
            setError(null);
            fetchApplications(true);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                    Object.values(err.response?.data?.errors || {}).flat()[0] ||
                    'Failed to remove this applicant.'
            );
        }
    };

    const submitInterview = async () => {
        if (!interviewData.interview_date) {
            setError('Please choose an interview date and time.');
            return;
        }

        const app = selectedApp;
        const schedule = {
            interview_date: interviewData.interview_date,
            interview_remarks: interviewData.interview_remarks || null,
        };
        setInterviewData({ interview_date: '', interview_remarks: '' });
        setModalView('');
        setError(null);
        scheduleStageCommit(
            app,
            {
                status: 'Interview',
                interview_date: schedule.interview_date,
                interview_remarks: schedule.interview_remarks,
            },
            'Interview',
            () => updateApplicationSchedule(app.id, schedule)
        );
    };

    const loadSuggestions = async (appId) => {
        try {
            const res = await getMatchingSuggestions(appId);
            setSuggestions(res.data.suggestions || []);
        } catch (err) {
            console.error('Failed to load suggestions');
            setSuggestions([]);
        }
    };

    const handleSelectSuggestion = (dept) => {
        setPlacementData((current) => ({ ...current, assigned_department: dept }));
    };

    const updatePlacementField = (field, value) => {
        setPlacementData((current) => ({ ...current, [field]: value }));
    };

    const submitPlacement = async () => {
        if (!placementIsComplete(placementData)) {
            setError(
                'Complete the personal profile, university details, and type of duty before issuing a login.'
            );
            return;
        }

        const storedMiddleInitial = middleInitialFrom(placementData.middle_name) || null;

        try {
            const res = await assignPlacement(selectedApp.id, {
                assigned_department: placementData.assigned_department,
                duty_type: placementData.duty_type,
                duty_request:
                    placementData.duty_type === 'Request'
                        ? placementData.duty_request.trim()
                        : null,
                first_name: placementData.first_name.trim(),
                middle_name: storedMiddleInitial,
                last_name: placementData.last_name.trim(),
                email: placementData.email.trim(),
                age: Number(placementData.age),
                gender: placementData.gender,
                address: placementData.address.trim(),
                contact_number: placementData.contact_number.trim(),
                year_level: placementData.year_level,
                course: placementData.course.trim(),
                student_id_number: placementData.student_id_number.trim(),
            });
            setApplications((prev) =>
                prev.map((a) =>
                    a.id === selectedApp.id
                        ? { ...a, status: 'Approved', middle_name: storedMiddleInitial }
                        : a
                )
            );
            setIssuedCredentials(res.data.credentials || null);
            setPlacementData(profileFromApplication(null));
            setModalView('');
            setError(null);
            fetchApplications(true);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                    Object.values(err.response?.data?.errors || {}).flat()[0] ||
                    'Failed to approve this applicant.'
            );
        }
    };

    const copyCredential = (text, field) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const officeOptions = Array.from(
        new Set(
            [
                ...departments.map((department) => department.name),
                ...suggestions.map((item) => item.department),
                placementData.assigned_department,
                selectedApp?.preferred_department,
            ].filter(Boolean)
        )
    );

    const activeCount = applications.filter(
        (a) => a.status !== 'Approved' && a.status !== 'Rejected'
    ).length;

    const matchesSearch = (app) => {
        const haystack = [
            app.first_name,
            app.last_name,
            app.email,
            app.course,
            app.contact_number,
            app.status,
            app.deleted_at ? 'Deleted' : '',
        ]
            .join(' ')
            .toLowerCase();
        return haystack.includes(searchQuery.trim().toLowerCase());
    };

    const recentlyApproved = (app) => {
        if (app.status !== 'Approved') return true;
        const at = approvedAt(app);
        if (at == null) return true;
        return at >= Date.now() - approvedWindow * 24 * 60 * 60 * 1000;
    };

    const searching = searchQuery.trim() !== '';
    const filteredApplications = applications.filter(
        (app) => matchesSearch(app) && (searching || !hideOlderApproved || recentlyApproved(app))
    );
    const filteredArchive = archivedApplications.filter(matchesSearch);
    const pagedApplicants = pageSlice(filteredApplications, applicantPage);
    const pagedArchive = pageSlice(filteredArchive, archivePage);

    useEffect(() => {
        setApplicantPage(1);
        setArchivePage(1);
    }, [searchQuery, hideOlderApproved, approvedWindow]);
    const approvedTotal = applications.filter((app) => app.status === 'Approved').length;
    const isArchivedRecord = (app) => Boolean(app?.deleted_at) || app?.status === 'Rejected';

    const openApplicant = (app) => {
        setSelectedApp(app);
        setModalView('details');
    };

    const nextStageButton = (app, variant = 'table') => {
        const next = getNextStage(app.status);
        if (!next) return null;

        const styles =
            variant === 'primary'
                ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700'
                : variant === 'card'
                  ? 'flex w-full items-center justify-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-600'
                  : 'inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-600';

        return (
            <button type="button" onClick={() => handleStatusUpdate(app)} className={styles}>
                Confirm {next}
                <ChevronRight className="h-3.5 w-3.5" />
            </button>
        );
    };

    const declineButton = (app, variant = 'table') => {
        if (!canRemove(app.status)) return null;

        const styles =
            variant === 'primary'
                ? 'inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50'
                : variant === 'card'
                  ? 'flex w-full items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100'
                  : 'inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100';

        return (
            <button type="button" onClick={() => handleDecline(app)} className={styles}>
                <XCircle className="h-3.5 w-3.5" /> Decline
            </button>
        );
    };

    const deleteButton = (app, variant = 'table') => {
        if (!canRemove(app.status)) return null;

        const styles =
            variant === 'primary'
                ? 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100'
                : variant === 'card'
                  ? 'flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50'
                  : 'inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200';

        return (
            <button type="button" onClick={() => handleDelete(app)} className={styles}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
        );
    };

    if (isLoading) {
        return (
            <div
                className="mx-auto max-w-[1400px] space-y-6 p-4 animate-pulse sm:p-8"
                aria-busy="true"
                aria-label="Loading application pipeline"
            >
                <div className="h-44 rounded-[2rem] bg-slate-900/90" />
                <div className="h-72 rounded-[1.75rem] bg-slate-200/80" />
                <div className="flex gap-5 overflow-hidden">
                    {Array.from({ length: 4 }, (_, idx) => (
                        <div key={idx} className="h-64 w-[300px] shrink-0 rounded-3xl bg-slate-200/80" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1400px] space-y-6 p-4 font-sans sm:p-8">
            {/* OBSIDIAN RECRUITMENT & PLACEMENT HERO */}
            <motion.header
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
                    className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl"
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                                <Users className="h-3.5 w-3.5 text-blue-400" />
                                Recruitment &amp; Placement
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-300">
                                <Sparkles className="h-3 w-3" />
                                {activeCount} in review
                            </span>
                        </div>
                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Applicant Sign-ups
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            {isAudit
                                ? 'Review website applications, submitted documents, and placement stages in read-only mode.'
                                : 'Review every student who applied to the Work-Study Program, open their documents, and move them through placement.'}
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-4 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                            <UserPlus className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Total Sign-ups
                            </p>
                            <p className="mt-0.5 font-mono text-2xl font-black tabular-nums text-white">
                                {applications.length}
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            {error && (
                <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-sm font-bold text-rose-800 shadow-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                </div>
            )}

            {/* KANBAN PIPELINE BOARD */}
            <FeatureSection
                defaultOpen
                title="Pipeline Statuses"
                icon={
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                        <Target className="h-4 w-4" />
                    </span>
                }
            >
            <div className="custom-scrollbar flex items-start gap-5 overflow-x-auto pb-6">
                {STAGE_ORDER.map((stage) => {
                    const columnApps = applications.filter(
                        (app) =>
                            app.status === stage &&
                            (stage !== 'Approved' || !hideOlderApproved || recentlyApproved(app))
                    );
                    const config = COLUMN_CONFIG[stage] || COLUMN_CONFIG.Pending;
                    const Icon = config.icon;

                    return (
                        <div
                            key={stage}
                            className={`flex w-[300px] min-w-[300px] shrink-0 flex-col rounded-[1.75rem] border shadow-sm ${config.border} ${config.bg}`}
                        >
                            {/* Column Header */}
                            <div className="shrink-0 space-y-2.5 rounded-t-[1.75rem] border-b border-slate-200/60 bg-white/85 p-4 backdrop-blur-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <h3
                                        className={`flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest ${config.color}`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {stage}
                                    </h3>
                                    <span
                                        className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-black ${config.badge}`}
                                    >
                                        {stage === 'Approved' && hideOlderApproved
                                            ? `${columnApps.length}/${approvedTotal}`
                                            : columnApps.length}
                                    </span>
                                </div>
                                {stage === 'Approved' && (
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setHideOlderApproved((current) => !current)
                                            }
                                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                                hideOlderApproved
                                                    ? 'border-emerald-600 bg-emerald-600 text-white'
                                                    : 'border-slate-200 bg-white text-slate-600'
                                            }`}
                                        >
                                            {hideOlderApproved ? (
                                                <Eye className="h-3 w-3" />
                                            ) : (
                                                <EyeOff className="h-3 w-3" />
                                            )}
                                            {hideOlderApproved ? 'Show all' : 'Hide older'}
                                        </button>
                                        {[7, 14].map((days) => (
                                            <button
                                                key={days}
                                                type="button"
                                                onClick={() => {
                                                    setApprovedWindow(days);
                                                    setHideOlderApproved(true);
                                                }}
                                                className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${
                                                    hideOlderApproved && approvedWindow === days
                                                        ? 'border-emerald-300 bg-white text-emerald-800'
                                                        : 'border-slate-200 bg-white/70 text-slate-500'
                                                }`}
                                            >
                                                {days}d
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Column Body */}
                            <div className="flex min-h-[180px] flex-col gap-3 p-3">
                                <AnimatePresence>
                                    {columnApps.length === 0 ? (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="m-auto flex flex-col items-center justify-center p-6 text-center text-slate-400"
                                        >
                                            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300">
                                                <UserPlus className="h-5 w-5 text-slate-300" />
                                            </div>
                                            <p className="text-xs font-bold">
                                                {stage === 'Approved' &&
                                                hideOlderApproved &&
                                                approvedTotal > 0
                                                    ? `None in the last ${approvedWindow} days`
                                                    : 'Empty'}
                                            </p>
                                        </motion.div>
                                    ) : (
                                        columnApps.map((app) => (
                                            <motion.div
                                                layout
                                                initial={{ opacity: 0, scale: 0.96 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.92 }}
                                                transition={{
                                                    type: 'spring',
                                                    stiffness: 400,
                                                    damping: 26,
                                                }}
                                                key={app.id}
                                                className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition-all hover:border-blue-300 hover:shadow-md"
                                            >
                                                <h4 className="mb-1 truncate text-sm font-extrabold text-slate-900">
                                                    {app.first_name} {app.last_name}
                                                </h4>
                                                <p className="mb-2 truncate text-xs font-medium text-slate-500">
                                                    {app.year_level
                                                        ? `Yr ${app.year_level}`
                                                        : 'Year not set'}
                                                </p>
                                                <p className="mb-3 inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                                                    <FileText className="h-3 w-3" />
                                                    {(app.documents || []).length} doc
                                                    {(app.documents || []).length === 1 ? '' : 's'}
                                                </p>

                                                {stage === 'Interview' && app.interview_date && (
                                                    <div className="mb-3 flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                                                        <Calendar className="h-3 w-3" />
                                                        {new Date(
                                                            app.interview_date
                                                        ).toLocaleDateString()}
                                                    </div>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => openApplicant(app)}
                                                    className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                                                >
                                                    <Eye className="h-3.5 w-3.5 shrink-0" />
                                                    View application
                                                </button>
                                                {!isAudit &&
                                                    (canRemove(app.status) ||
                                                        getNextStage(app.status)) && (
                                                        <div className="flex flex-col gap-2">
                                                            {nextStageButton(app, 'card')}
                                                            {declineButton(app, 'card')}
                                                            {deleteButton(app, 'card')}
                                                        </div>
                                                    )}
                                            </motion.div>
                                        ))
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    );
                })}
            </div>
            </FeatureSection>

            {/* ALL APPLICANTS TABLE */}
            <FeatureSection
                defaultOpen
                title="All Applicants"
                icon={
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                        <Users className="h-4 w-4" />
                    </span>
                }
            >
                <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-6 py-5 lg:flex-row lg:items-center">
                    <div>
                        <h2 className="text-base font-black tracking-tight text-slate-900">
                            All Applicants
                        </h2>
                        <p className="text-xs font-medium text-slate-500">
                            {activeCount} still in review
                            {hideOlderApproved
                                ? ` · approved list shows the last ${approvedWindow} days`
                                : ''}
                        </p>
                    </div>

                    <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center lg:w-auto">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setHideOlderApproved((current) => !current)}
                                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                                    hideOlderApproved
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {hideOlderApproved ? (
                                    <Eye className="h-3.5 w-3.5" />
                                ) : (
                                    <EyeOff className="h-3.5 w-3.5" />
                                )}
                                {hideOlderApproved ? 'Show all approved' : 'Hide older approved'}
                            </button>
                            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                                {[7, 14].map((days) => (
                                    <button
                                        key={days}
                                        type="button"
                                        onClick={() => {
                                            setApprovedWindow(days);
                                            setHideOlderApproved(true);
                                        }}
                                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                                            hideOlderApproved && approvedWindow === days
                                                ? 'bg-slate-900 text-white'
                                                : 'text-slate-500 hover:text-slate-900'
                                        }`}
                                    >
                                        {days}d
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="relative w-full sm:w-72">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search name or email…"
                                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="app-data-table w-full text-left">
                        <thead>
                            <tr className="bg-slate-950 text-white">
                                <th className="px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest">
                                    Applicant
                                </th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest">
                                    Documents
                                </th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest">
                                    Status
                                </th>
                                <th className="px-6 py-3.5 text-right text-[11px] font-extrabold uppercase tracking-widest">
                                    Action
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {pagedApplicants.rows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={4}
                                        className="px-5 py-12 text-center text-sm font-bold text-slate-400"
                                    >
                                        No applicants found.
                                    </td>
                                </tr>
                            ) : (
                                pagedApplicants.rows.map((app) => {
                                    const cfg = COLUMN_CONFIG[app.status] || COLUMN_CONFIG.Pending;
                                    return (
                                        <tr
                                            key={app.id}
                                            className="transition-colors hover:bg-slate-50/80"
                                        >
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-extrabold text-slate-900">
                                                    {app.first_name} {app.last_name}
                                                </p>
                                                <p className="mt-0.5 text-xs font-medium text-slate-500">
                                                    {app.email || 'No email'}
                                                </p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 font-mono text-xs font-bold text-indigo-700">
                                                    <FileText className="h-3.5 w-3.5" />
                                                    {(app.documents || []).length}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${cfg.badge}`}
                                                >
                                                    {app.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => openApplicant(app)}
                                                        className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" /> View
                                                    </button>
                                                    {!isAudit && declineButton(app)}
                                                    {!isAudit && deleteButton(app)}
                                                    {!isAudit && nextStageButton(app)}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <AuditPager
                    page={pagedApplicants.page}
                    totalPages={pagedApplicants.totalPages}
                    total={pagedApplicants.total}
                    onPage={setApplicantPage}
                />
            </FeatureSection>

            {/* REJECTED AND DELETED ARCHIVE */}
            <FeatureSection
                defaultOpen
                title="Rejected & Deleted"
                icon={
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
                        <Archive className="h-4 w-4" />
                    </span>
                }
            >
                <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
                        <Archive className="h-4 w-4" />
                    </span>
                    <div>
                        <h2 className="text-base font-black tracking-tight text-slate-900">
                            Rejected &amp; Deleted
                        </h2>
                        <p className="text-xs font-medium text-slate-500">
                            Kept for audit. These applicants are no longer in the active pipeline.
                        </p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="app-data-table w-full text-left">
                        <thead>
                            <tr className="bg-slate-950 text-white">
                                <th className="px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest">
                                    Applicant
                                </th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest">
                                    Outcome
                                </th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest">
                                    When
                                </th>
                                <th className="px-6 py-3.5 text-right text-[11px] font-extrabold uppercase tracking-widest">
                                    Action
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {pagedArchive.rows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={4}
                                        className="px-5 py-12 text-center text-sm font-bold text-slate-400"
                                    >
                                        No rejected or deleted applicants.
                                    </td>
                                </tr>
                            ) : (
                                pagedArchive.rows.map((app) => {
                                    const deleted = Boolean(app.deleted_at);
                                    const when = app.deleted_at || app.updated_at || app.created_at;
                                    return (
                                        <tr
                                            key={`archive-${app.id}`}
                                            className="transition-colors hover:bg-slate-50/80"
                                        >
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-extrabold text-slate-900">
                                                    {app.first_name} {app.last_name}
                                                </p>
                                                <p className="mt-0.5 text-xs font-medium text-slate-500">
                                                    {app.email || 'No email'}
                                                </p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                        deleted
                                                            ? 'bg-slate-100 text-slate-600'
                                                            : 'bg-rose-50 text-rose-700'
                                                    }`}
                                                >
                                                    {deleted ? 'Deleted' : 'Rejected'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-600">
                                                {when
                                                    ? new Date(when).toLocaleString('en-US', {
                                                          month: 'short',
                                                          day: 'numeric',
                                                          year: 'numeric',
                                                          hour: 'numeric',
                                                          minute: '2-digit',
                                                          hour12: true,
                                                      })
                                                    : '—'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => openApplicant(app)}
                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                                                >
                                                    <Eye className="h-3.5 w-3.5" /> View
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <AuditPager
                    page={pagedArchive.page}
                    totalPages={pagedArchive.totalPages}
                    total={pagedArchive.total}
                    onPage={setArchivePage}
                />
            </FeatureSection>

            {/* CONFIRM STAGE MODAL */}
            <AnimatePresence>
                {modalView === 'confirm' && selectedApp && pendingStage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(closePopup)}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <h3 className="flex items-center gap-2 text-base font-black tracking-tight">
                                    <CheckCircle2 className="h-5 w-5 text-blue-400" />
                                    Confirm {pendingStage}
                                </h3>
                                <button
                                    onClick={closePopup}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="space-y-5 p-6 sm:p-7">
                                <p className="text-sm font-medium leading-relaxed text-slate-600">
                                    Confirm{' '}
                                    <span className="font-extrabold text-slate-900">
                                        {selectedApp.first_name} {selectedApp.last_name}
                                    </span>{' '}
                                    for the {pendingStage} stage? The stage email sends after 5 seconds. Undo from the lower left before then if accidental.
                                </p>
                                <div className="flex justify-end gap-2.5 pt-2">
                                    <button
                                        type="button"
                                        onClick={closePopup}
                                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={submitStageConfirmation}
                                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-blue-600/20 hover:bg-blue-700"
                                    >
                                        <CheckCircle2 className="h-4 w-4" />
                                        Confirm {pendingStage}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* INTERVIEW MODAL */}
            <AnimatePresence>
                {modalView === 'interview' && selectedApp && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(closePopup)}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <h3 className="flex items-center gap-2 text-base font-black tracking-tight">
                                    <Calendar className="h-5 w-5 text-amber-400" />
                                    Schedule Interview
                                </h3>
                                <button
                                    onClick={() => setModalView('')}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="space-y-4 p-6 sm:p-7">
                                <p className="text-sm font-medium text-slate-600">
                                    Set the interview schedule for{' '}
                                    <span className="font-extrabold text-slate-900">
                                        {selectedApp.first_name} {selectedApp.last_name}
                                    </span>
                                    .
                                </p>

                                <div>
                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Interview Date &amp; Time
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={interviewData.interview_date}
                                        onChange={(e) =>
                                            setInterviewData({
                                                ...interviewData,
                                                interview_date: e.target.value,
                                            })
                                        }
                                        className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Remarks / Room Link
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={interviewData.interview_remarks}
                                        onChange={(e) =>
                                            setInterviewData({
                                                ...interviewData,
                                                interview_remarks: e.target.value,
                                            })
                                        }
                                        placeholder="e.g. Please proceed to the WSPO Office…"
                                        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                    />
                                </div>

                                <p className="text-xs font-medium text-slate-400">
                                    The interview email sends 5 seconds after you confirm. Undo stays at the lower left until then.
                                </p>
                                <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4">
                                    <button
                                        onClick={() => setModalView('')}
                                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={submitInterview}
                                        disabled={!interviewData.interview_date}
                                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        <CheckCircle2 className="h-4 w-4" />
                                        Confirm Schedule
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* DECLINE / DELETE MODAL */}
            <AnimatePresence>
                {(modalView === 'decline' || modalView === 'delete') && selectedApp && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(closePopup)}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <h3 className="flex items-center gap-2 text-base font-black tracking-tight">
                                    {modalView === 'delete' ? (
                                        <Trash2 className="h-5 w-5 text-rose-400" />
                                    ) : (
                                        <XCircle className="h-5 w-5 text-rose-400" />
                                    )}
                                    {modalView === 'delete' ? 'Delete Applicant' : 'Decline Applicant'}
                                </h3>
                                <button
                                    onClick={() => setModalView('')}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="space-y-4 p-6 sm:p-7">
                                <p className="text-sm font-medium leading-relaxed text-slate-600">
                                    {modalView === 'delete' ? (
                                        <>
                                            Delete{' '}
                                            <span className="font-extrabold text-slate-900">
                                                {selectedApp.first_name} {selectedApp.last_name}
                                            </span>
                                            ? They leave the active list and stay on the rejected and deleted list for audit.
                                        </>
                                    ) : (
                                        <>
                                            Decline{' '}
                                            <span className="font-extrabold text-slate-900">
                                                {selectedApp.first_name} {selectedApp.last_name}
                                            </span>
                                            ? They will receive a rejection email, and their tracking page will show this reason.
                                        </>
                                    )}
                                </p>
                                {modalView === 'decline' && (
                                    <label className="block">
                                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Reason for declining
                                        </span>
                                        <textarea
                                            value={declineReason}
                                            onChange={(event) =>
                                                setDeclineReason(event.target.value)
                                            }
                                            rows={4}
                                            required
                                            placeholder="Explain why this application is not approved…"
                                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20"
                                        />
                                    </label>
                                )}
                                <div className="flex justify-end gap-2.5 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setModalView('')}
                                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={submitRemove}
                                        disabled={
                                            modalView === 'decline' && !declineReason.trim()
                                        }
                                        className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 disabled:opacity-50"
                                    >
                                        {modalView === 'delete' ? (
                                            <Trash2 className="h-4 w-4" />
                                        ) : (
                                            <XCircle className="h-4 w-4" />
                                        )}
                                        {modalView === 'delete'
                                            ? 'Confirm Delete'
                                            : 'Confirm Decline'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* PLACEMENT MODAL */}
            <AnimatePresence>
                {modalView === 'placement' && selectedApp && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(closePopup)}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="flex shrink-0 items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <h3 className="flex items-center gap-2.5 text-base font-black tracking-tight">
                                    <Target className="h-5 w-5 text-emerald-400" />
                                    Finalize Placement
                                </h3>
                                <button
                                    onClick={() => setModalView('')}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-6 sm:p-7">
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3.5">
                                    <p className="text-xs font-medium leading-relaxed text-slate-600">
                                        Finish{' '}
                                        <span className="font-extrabold text-slate-900">
                                            {accountDisplayName(placementData) || 'this applicant'}
                                        </span>
                                        &apos;s personal profile and university details first. The login is issued only after those fields are complete.
                                    </p>
                                    <p className="mt-1.5 text-xs font-extrabold text-indigo-700">
                                        Account name: {accountDisplayName(placementData) || '—'}
                                    </p>
                                </div>

                                {suggestions.length > 0 && (
                                    <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                                        <label className="mb-3 block text-[10px] font-extrabold uppercase tracking-widest text-blue-600">
                                            AI Matching Suggestions
                                        </label>
                                        <div className="space-y-2">
                                            {suggestions.map((s, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() =>
                                                        handleSelectSuggestion(s.department)
                                                    }
                                                    className="w-full rounded-xl border border-blue-200 bg-white p-3 text-left transition hover:border-blue-400 hover:shadow-xs"
                                                >
                                                    <div className="mb-1 flex items-center justify-between">
                                                        <span className="text-sm font-extrabold text-slate-900">
                                                            {s.department}
                                                        </span>
                                                        <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                                                            {s.match_score}% Match
                                                        </span>
                                                    </div>
                                                    <span className="text-xs font-medium text-slate-500">
                                                        {s.reason}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-900">
                                        Personal Profile
                                    </h4>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            First Name
                                            <input
                                                value={placementData.first_name}
                                                onChange={(e) =>
                                                    updatePlacementField(
                                                        'first_name',
                                                        e.target.value
                                                    )
                                                }
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            />
                                        </label>
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Middle Name
                                            <input
                                                value={placementData.middle_name}
                                                onChange={(e) =>
                                                    updatePlacementField(
                                                        'middle_name',
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="Becomes initial"
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            />
                                        </label>
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Last Name
                                            <input
                                                value={placementData.last_name}
                                                onChange={(e) =>
                                                    updatePlacementField(
                                                        'last_name',
                                                        e.target.value
                                                    )
                                                }
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            />
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Email
                                            <input
                                                type="email"
                                                value={placementData.email}
                                                onChange={(e) =>
                                                    updatePlacementField('email', e.target.value)
                                                }
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            />
                                        </label>
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Contact Number
                                            <input
                                                value={placementData.contact_number}
                                                onChange={(e) =>
                                                    updatePlacementField(
                                                        'contact_number',
                                                        e.target.value
                                                    )
                                                }
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            />
                                        </label>
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Age
                                            <input
                                                type="number"
                                                min="16"
                                                value={placementData.age}
                                                onChange={(e) =>
                                                    updatePlacementField('age', e.target.value)
                                                }
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            />
                                        </label>
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Gender
                                            <select
                                                value={placementData.gender}
                                                onChange={(e) =>
                                                    updatePlacementField('gender', e.target.value)
                                                }
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            >
                                                <option value="">Select gender</option>
                                                {GENDERS.map((gender) => (
                                                    <option key={gender} value={gender}>
                                                        {gender}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Complete Address
                                        <input
                                            value={placementData.address}
                                            onChange={(e) =>
                                                updatePlacementField('address', e.target.value)
                                            }
                                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                        />
                                    </label>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-900">
                                        University Details
                                    </h4>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Student ID Number
                                            <input
                                                value={placementData.student_id_number}
                                                onChange={(e) =>
                                                    updatePlacementField(
                                                        'student_id_number',
                                                        e.target.value
                                                    )
                                                }
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            />
                                        </label>
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Year Level
                                            <select
                                                value={placementData.year_level}
                                                onChange={(e) =>
                                                    updatePlacementField(
                                                        'year_level',
                                                        e.target.value
                                                    )
                                                }
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            >
                                                <option value="">Select year</option>
                                                {YEAR_LEVELS.map((year) => (
                                                    <option key={year} value={year}>
                                                        {year}
                                                    </option>
                                                ))}
                                                {placementData.year_level &&
                                                    !YEAR_LEVELS.includes(
                                                        placementData.year_level
                                                    ) && (
                                                        <option value={placementData.year_level}>
                                                            {placementData.year_level}
                                                        </option>
                                                    )}
                                            </select>
                                        </label>
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 sm:col-span-2">
                                            Degree / Course
                                            <input
                                                value={placementData.course}
                                                onChange={(e) =>
                                                    updatePlacementField('course', e.target.value)
                                                }
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-900">
                                        Assignment
                                    </h4>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Final Department
                                            <select
                                                value={placementData.assigned_department}
                                                onChange={(e) =>
                                                    updatePlacementField(
                                                        'assigned_department',
                                                        e.target.value
                                                    )
                                                }
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            >
                                                <option value="">
                                                    -- Select the assigned department --
                                                </option>
                                                {officeOptions.map((name) => (
                                                    <option key={name} value={name}>
                                                        {name}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Type of Duty
                                            <select
                                                value={placementData.duty_type}
                                                onChange={(e) =>
                                                    updatePlacementField(
                                                        'duty_type',
                                                        e.target.value
                                                    )
                                                }
                                                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                            >
                                                <option value="">-- Select type of duty --</option>
                                                {DUTY_TYPES.map((duty) => (
                                                    <option key={duty} value={duty}>
                                                        {duty}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        {placementData.duty_type === 'Request' && (
                                            <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 sm:col-span-2">
                                                Requested Duty Details
                                                <input
                                                    value={placementData.duty_request}
                                                    onChange={(e) =>
                                                        updatePlacementField(
                                                            'duty_request',
                                                            e.target.value
                                                        )
                                                    }
                                                    placeholder="Describe the specific duty for this student"
                                                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                                                />
                                            </label>
                                        )}
                                    </div>
                                    {placementData.assigned_department && (
                                        <p className="text-xs font-bold text-indigo-700">
                                            Supervisor:{' '}
                                            {supervisorLabelForOffice(
                                                placementData.assigned_department
                                            )}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex shrink-0 justify-end gap-2.5 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                                <button
                                    onClick={() => setModalView('')}
                                    className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-200/70"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitPlacement}
                                    disabled={!placementIsComplete(placementData)}
                                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    <Briefcase className="h-4 w-4" />
                                    Confirm &amp; Issue Account
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* APPLICANT PROFILE MODAL */}
            <AnimatePresence>
                {modalView === 'details' && selectedApp && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(closePopup)}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="flex shrink-0 items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <div className="flex items-center gap-2.5">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-blue-300">
                                        <Users className="h-4 w-4" />
                                    </span>
                                    <div>
                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Applicant Profile
                                        </p>
                                        <h3 className="text-base font-black tracking-tight">
                                            {selectedApp.first_name} {selectedApp.middle_name}{' '}
                                            {selectedApp.last_name}
                                        </h3>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setModalView('')}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="custom-scrollbar space-y-6 overflow-y-auto p-6 sm:p-7">
                                <ApplicationStatusTracker
                                    application={selectedApp}
                                    variant="embedded"
                                    showDocuments={false}
                                />

                                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                                    <div className="flex items-start gap-2.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
                                        <Mail className="mt-0.5 h-4 w-4 text-slate-400" />
                                        <div>
                                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                Email
                                            </p>
                                            <p className="mt-0.5 text-sm font-bold text-slate-800">
                                                {selectedApp.email || '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
                                        <Phone className="mt-0.5 h-4 w-4 text-slate-400" />
                                        <div>
                                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                Contact
                                            </p>
                                            <p className="mt-0.5 text-sm font-bold text-slate-800">
                                                {selectedApp.contact_number || '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Year &amp; Age
                                        </p>
                                        <p className="mt-0.5 text-sm font-bold text-slate-800">
                                            {selectedApp.year_level || '—'} ·{' '}
                                            {selectedApp.age || '—'} yrs
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Gender
                                        </p>
                                        <p className="mt-0.5 text-sm font-bold text-slate-800">
                                            {selectedApp.gender || '—'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 sm:col-span-2">
                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Address
                                        </p>
                                        <p className="mt-0.5 text-sm font-bold text-slate-800">
                                            {selectedApp.address || '—'}
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            setFormsNote('');
                                            try {
                                                const response = await axios.get(
                                                    `/api/applications/${selectedApp.id}/forms`
                                                );
                                                if (!response.data?.form_details) {
                                                    setOfficialForms(null);
                                                    setFormsNote(
                                                        'This application has no official information sheet on file.'
                                                    );
                                                    return;
                                                }
                                                setOfficialForms(response.data);
                                            } catch {
                                                setFormsNote(
                                                    'The official forms could not be opened.'
                                                );
                                            }
                                        }}
                                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-600"
                                    >
                                        <Printer className="h-4 w-4" />
                                        Open Official Forms
                                    </button>
                                    {formsNote && (
                                        <p className="mt-2 text-xs font-bold text-amber-700">
                                            {formsNote}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Submitted Documents
                                    </p>
                                    {(selectedApp.documents || []).length === 0 ? (
                                        <p className="text-xs font-bold text-slate-400">
                                            No documents were attached.
                                        </p>
                                    ) : (
                                        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {selectedApp.documents.map((doc) => (
                                                <li key={doc.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setDocumentViewer({
                                                                path: doc.file_path,
                                                                title:
                                                                    DOCUMENT_LABELS[
                                                                        doc.document_key
                                                                    ] ||
                                                                    doc.original_name ||
                                                                    'Submitted document',
                                                            })
                                                        }
                                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                                                    >
                                                        <p className="truncate text-xs font-extrabold text-slate-800">
                                                            {DOCUMENT_LABELS[doc.document_key] ||
                                                                doc.original_name}
                                                        </p>
                                                        <p className="mt-1 text-[11px] font-bold text-blue-600">
                                                            Open file →
                                                        </p>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                            {!isArchivedRecord(selectedApp) &&
                            (getNextStage(selectedApp.status) || canRemove(selectedApp.status)) ? (
                                <div className="flex shrink-0 flex-wrap justify-end gap-2.5 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                                    {!isAudit && deleteButton(selectedApp, 'primary')}
                                    {!isAudit && declineButton(selectedApp, 'primary')}
                                    {!isAudit && nextStageButton(selectedApp, 'primary')}
                                </div>
                            ) : null}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ISSUED CREDENTIALS MODAL */}
            <AnimatePresence>
                {issuedCredentials && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(closePopup)}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="bg-slate-950 px-6 py-6 text-center text-white">
                                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
                                    <CheckCircle2 className="h-7 w-7" />
                                </div>
                                <h3 className="text-lg font-black tracking-tight">
                                    Applicant Approved
                                </h3>
                                <p className="mt-1.5 text-xs font-medium text-slate-300">
                                    {issuedCredentials.name} can sign in with the username or email below.
                                </p>
                            </div>
                            <div className="space-y-3.5 p-6">
                                {[
                                    ['Username', issuedCredentials.username, 'username'],
                                    ['Email', issuedCredentials.email, 'email'],
                                    ['Temporary Password', issuedCredentials.password, 'password'],
                                ].map(([label, val, key]) => (
                                    <div
                                        key={key}
                                        className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5"
                                    >
                                        <label className="mb-1 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            {label}
                                        </label>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="truncate select-all font-mono text-sm font-black text-slate-900">
                                                {val}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => copyCredential(val, key)}
                                                className="rounded-lg border border-slate-200 bg-white p-2 transition hover:border-blue-300"
                                            >
                                                {copiedField === key ? (
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                ) : (
                                                    <Copy className="h-4 w-4 text-slate-500" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                                    Share these credentials with the student. The password is shown only once.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setIssuedCredentials(null)}
                                    className="w-full rounded-xl bg-slate-900 py-3 text-xs font-extrabold uppercase tracking-wider text-white transition hover:bg-blue-600"
                                >
                                    Done
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* UNDO STAGE TOAST */}
            <AnimatePresence>
                {undoAction && (
                    <motion.div
                        key={undoAction.token}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 16 }}
                        className="fixed bottom-5 left-4 z-[70] max-w-[calc(100%-2rem)] lg:left-24"
                    >
                        <div className="relative flex items-center gap-2 overflow-hidden rounded-2xl">
                            <button
                                type="button"
                                onClick={undoStage}
                                className="flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-2xl shadow-slate-950/30 transition hover:bg-slate-800"
                            >
                                <Undo2 className="h-4 w-4 text-blue-400" />
                                <span className="text-xs font-extrabold">
                                    Undo {undoAction.confirmedStage}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={closeUndo}
                                aria-label="Close undo"
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-lg transition hover:border-slate-300 hover:text-slate-900"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <motion.div
                                className="absolute bottom-0 left-0 h-1 bg-blue-500"
                                initial={{ width: '100%' }}
                                animate={{ width: '0%' }}
                                transition={{ duration: UNDO_HIDE_MS / 1000, ease: 'linear' }}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* OFFICIAL FORMS OVERLAY */}
            <AnimatePresence>
                {officialForms && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm"
                    >
                        <div className="mx-auto max-w-4xl">
                            <div className="no-print mb-4 flex flex-wrap justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={printOfficialForms}
                                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md hover:bg-blue-500"
                                >
                                    <Printer className="h-4 w-4" />
                                    Print Long Coupon
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOfficialForms(null)}
                                    className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100"
                                >
                                    Close
                                </button>
                            </div>
                            <OfficialWspForms
                                identity={{
                                    first_name: officialForms.first_name || '',
                                    middle_name: officialForms.middle_name || '',
                                    last_name: officialForms.last_name || '',
                                    age: officialForms.age ? String(officialForms.age) : '',
                                    email: officialForms.email || '',
                                    tracking_code: officialForms.tracking_code || '',
                                    submitted_at: officialForms.submitted_at || '',
                                }}
                                details={officialForms.form_details}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <SecureFileViewerModal
                filePath={documentViewer?.path || null}
                title={documentViewer?.title || 'Submitted document'}
                onClose={() => setDocumentViewer(null)}
            />
        </div>
    );
};

export default ApplicationManager;