import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import {
    LayoutDashboard,
    Users,
    ClipboardCheck,
    Clock,
    Activity,
    ShieldCheck,
    ChevronRight,
    UserPlus,
    LogIn,
    LogOut,
    X,
    Sparkles,
    Radio,
} from 'lucide-react';

// Keep your original import path for the SuperAdmin redirect
import SuperAdminDashboard from '../../components/SuperAdminDashboard';
import { bindPopup } from '../../utils/popupDismiss';
import { REALTIME_EVENT } from '../../utils/realtime';
import UserAvatar from '../../components/UserAvatar';
import OrganizationScheduleCalendar from '../../components/OrganizationScheduleCalendar';
import { formatYearLevel, homeDepartment } from '../../utils/studentAssignment';
import { JanitorialFinalReview } from '../../components/hours/JanitorialFinalReview';
import { isCoverageHold } from '../../utils/coverageHold';

const AdminDashboard = () => {
    const navigate = useNavigate();
    const userRole = localStorage.getItem('user_role') || 'Supervisor';
    const assignedOffice = localStorage.getItem('assigned_office') || 'Department Supervisor';
    const isWspo = userRole === 'WSPO Staff';
    const isImmediateSupervisor = userRole === 'Immediate Supervisor';

    // THE SUPER ADMIN HIJACK
    // If they are a Super Admin, completely swap the view to the Command Center
    if (userRole === 'Super Admin') {
        return <SuperAdminDashboard />;
    }

    // --- EVERYTHING BELOW THIS LINE IS FOR SUPERVISORS & WSPO STAFF ---

    type AssignedStudent = {
        id: number;
        name: string;
        profile_picture?: string | null;
        phone_number?: string | null;
        student_id_number?: string | null;
        course?: string | null;
        year_level?: number | string | null;
        gender?: string | null;
        assigned_office?: string | null;
        assignment_label?: string | null;
        special_hours_request?: boolean;
        duty_type?: string | null;
        duty_request?: string | null;
    };

    const [stats, setStats] = useState({
        activeStudents: 0,
        pendingApprovals: 0,
        totalHoursThisWeek: 0,
        recentStudentActivity: [] as {
            id: number | string;
            student_name: string;
            profile_picture?: string | null;
            action: string;
            description: string;
            office?: string | null;
            created_at: string;
        }[],
        assignedStudents: [] as AssignedStudent[],
    });
    const [assignmentNotices, setAssignmentNotices] = useState<
        { id: number; message: string; created_at: string }[]
    >([]);
    const [selectedStudent, setSelectedStudent] = useState<AssignedStudent | null>(null);
    const [secretaryActing, setSecretaryActing] = useState(
        localStorage.getItem('secretary_acting') === '1'
    );

    const [isLoading, setIsLoading] = useState(true);

    const [pendingApplications, setPendingApplications] = useState(0);
    const [activeOpen, setActiveOpen] = useState(false);
    const [activeStudents, setActiveStudents] = useState<
        {
            id: number;
            time_in: string;
            device?: string | null;
            user?: {
                name?: string;
                profile_picture?: string | null;
                profile?: { assigned_office?: string | null; assignment_label?: string | null } | null;
            } | null;
        }[]
    >([]);
    const [onlineStaff, setOnlineStaff] = useState<
        {
            id: number;
            name: string;
            role: string;
            profile_picture?: string | null;
            office?: string | null;
            device?: string | null;
        }[]
    >([]);
    const [signedIn, setSignedIn] = useState<
        {
            id: number;
            name: string;
            profile_picture?: string | null;
            office?: string | null;
            device?: string | null;
        }[]
    >([]);

    useEffect(() => {
        const fetchStats = async () => {
            if ((userRole === 'Department Secretary' && !secretaryActing) || userRole === 'Immediate Supervisor') {
                setIsLoading(false);
                return;
            }
            try {
                const response = await axios.get('/api/admin/stats');
                setStats({
                    activeStudents: response.data.activeStudents ?? 0,
                    pendingApprovals: response.data.pendingApprovals ?? 0,
                    totalHoursThisWeek: response.data.totalHoursThisWeek ?? 0,
                    recentStudentActivity: Array.isArray(response.data.recentStudentActivity)
                        ? response.data.recentStudentActivity
                        : [],
                    assignedStudents: Array.isArray(response.data.assignedStudents)
                        ? response.data.assignedStudents
                        : [],
                });
            } catch (err) {
                if (!isCoverageHold(err)) console.error('Failed to load dashboard stats', err);
            } finally {
                setIsLoading(false);
            }
        };
        const fetchAssignmentNotices = async () => {
            if (userRole === 'Super Admin') return;
            try {
                const response = await axios.get('/api/notifications');
                const rows = Array.isArray(response.data) ? response.data : [];
                setAssignmentNotices(
                    rows
                        .filter(
                            (notice: { title?: string; is_read?: boolean | number }) =>
                                notice.title === 'Working Student Assigned' && !notice.is_read
                        )
                        .map((notice: { id: number; message: string; created_at: string }) => ({
                            id: notice.id,
                            message: notice.message,
                            created_at: notice.created_at,
                        }))
                );
            } catch (err) {
                console.error('Failed to load assignment notices', err);
            }
        };
        const fetchPendingApplications = () => {
            if (!isWspo) return;
            axios
                .get('/api/applications')
                .then((response) => {
                    const rows = Array.isArray(response.data)
                        ? response.data
                        : response.data?.data || [];
                    setPendingApplications(
                        rows.filter(
                            (app: { status?: string }) =>
                                app.status !== 'Approved' && app.status !== 'Rejected'
                        ).length
                    );
                })
                .catch(() => setPendingApplications(0));
        };
        const fetchActiveNow = async () => {
            if ((userRole === 'Department Secretary' && !secretaryActing) || userRole === 'Immediate Supervisor') {
                setActiveStudents([]);
                setOnlineStaff([]);
                setSignedIn([]);
                return;
            }
            try {
                const response = await axios.get('/api/admin/active-now');
                const payload = response.data ?? {};
                setActiveStudents(Array.isArray(payload.students) ? payload.students : []);
                setOnlineStaff(Array.isArray(payload.staff) ? payload.staff : []);
                setSignedIn(Array.isArray(payload.signed_in) ? payload.signed_in : []);
            } catch (err) {
                if (!isCoverageHold(err)) console.error('Failed to load active now list', err);
            }
        };
        const fetchCoverage = () => {
            axios
                .get('/api/user')
                .then((response) => {
                    setSecretaryActing(Boolean(response.data.acting));
                    if (response.data.role === 'Department Secretary') {
                        localStorage.setItem('secretary_acting', response.data.acting ? '1' : '0');
                    }
                })
                .catch(() => {});
        };
        const refresh = () => {
            fetchStats();
            fetchAssignmentNotices();
            fetchPendingApplications();
            fetchActiveNow();
            fetchCoverage();
        };
        refresh();
        const interval = setInterval(refresh, 5000);
        window.addEventListener(REALTIME_EVENT, refresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, refresh);
        };
    }, [isWspo, userRole, secretaryActing]);

    const dismissAssignmentNotice = async (id: number) => {
        setAssignmentNotices((current) => current.filter((notice) => notice.id !== id));
        try {
            await axios.patch(`/api/notifications/${id}/read`);
        } catch (err) {
            console.error('Failed to mark assignment notice as read', err);
        }
    };

    const dutyLabel = (student: AssignedStudent) => {
        if (student.duty_type === 'Request' && student.duty_request) return student.duty_request;
        return student.duty_type || 'Not set';
    };

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.08 },
        },
    };

    const itemVariants: Variants = {
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
                className="mx-auto max-w-7xl space-y-6 p-4 animate-pulse sm:p-8"
                aria-busy="true"
                aria-label="Loading workspace data"
            >
                <div className="h-44 rounded-[2rem] bg-slate-900/90" />
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }, (_, idx) => (
                        <div key={idx} className="h-36 rounded-[1.75rem] bg-slate-200/80" />
                    ))}
                </div>
                <div className="h-64 rounded-[1.75rem] bg-slate-200/80" />
            </div>
        );
    }

    const totalActiveNow = activeStudents.length + signedIn.length + onlineStaff.length;

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
            {/* OBSIDIAN MANAGEMENT COMMAND HERO */}
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
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                                <LayoutDashboard className="h-3.5 w-3.5 text-blue-400" />
                                Management Hub
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                                Live Sync
                            </span>
                        </div>

                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Workspace Overview
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            {isImmediateSupervisor
                                ? 'Review janitorial attendance for your department. You give the final say after the janitorial supervisor’s recommendation.'
                                : isWspo
                                ? 'Review incoming work-study applications and manage student department placements.'
                                : `Monitor your department's student workers, timesheets, and daily operations.`}
                        </p>
                    </div>

                    {/* Frosted Access & Office Card */}
                    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                            <ShieldCheck className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                {userRole}
                            </p>
                            <p className="mt-0.5 max-w-[200px] truncate text-sm font-black text-white">
                                {assignedOffice}
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            {userRole === 'Department Secretary' && !secretaryActing && (
                <div className="flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-xs">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                        <Clock className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-sm font-extrabold text-slate-900">
                            Waiting for the supervisor to be marked absent
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-slate-500">
                            You have the same access as the supervisor, and it turns on for today once they are marked absent.
                        </p>
                    </div>
                </div>
            )}

            {(userRole === 'Supervisor' || isImmediateSupervisor) && (
                <JanitorialFinalReview />
            )}

            {userRole === 'Department Secretary' && secretaryActing && (
                <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/80 px-5 py-4 shadow-xs">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                        <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-sm font-extrabold text-violet-950">
                            You are acting for the supervisor
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-violet-800">
                            Their departments are covered with your account until they are marked present again.
                        </p>
                    </div>
                </div>
            )}

            {/* WSPO APPLICANT PIPELINE BANNER */}
            {isWspo && (
                <motion.button
                    type="button"
                    onClick={() => navigate('/pipeline')}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -2 }}
                    className="group flex w-full items-center justify-between gap-4 rounded-[1.75rem] border border-blue-200/90 bg-gradient-to-r from-blue-50/80 via-white to-indigo-50/60 p-6 text-left shadow-sm transition-all hover:border-blue-400 hover:shadow-md"
                >
                    <div className="flex items-center gap-4">
                        <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20">
                            <UserPlus className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">
                                    WSPO Coordinator
                                </span>
                                {pendingApplications > 0 && (
                                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
                                        {pendingApplications} pending
                                    </span>
                                )}
                            </div>
                            <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900 sm:text-xl">
                                Review Applicant Sign-ups
                            </h3>
                            <p className="mt-0.5 text-xs font-medium text-slate-500 sm:text-sm">
                                {pendingApplications} application{pendingApplications === 1 ? '' : 's'} waiting in the pipeline.
                            </p>
                        </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors group-hover:bg-blue-600">
                        <span className="hidden sm:inline">Open Applications</span>
                        <ChevronRight className="h-4 w-4" />
                    </span>
                </motion.button>
            )}

            {!(userRole === 'Department Secretary' && !secretaryActing) && !isImmediateSupervisor && (
            <>
            {/* 4-COLUMN TELEMETRY BENTO */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4"
            >
                {/* Active Now */}
                <motion.button
                    type="button"
                    onClick={() => setActiveOpen(true)}
                    variants={itemVariants}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                Active Now
                            </p>
                            <h3 className="mt-2 flex items-center gap-2.5 font-mono text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                {totalActiveNow}
                                {totalActiveNow > 0 && (
                                    <span className="relative flex h-3 w-3">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                                    </span>
                                )}
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 transition-transform group-hover:scale-105">
                            <Activity className="h-6 w-6" />
                        </div>
                    </div>
                    <p className="mt-4 text-xs font-semibold leading-relaxed text-emerald-700">
                        {isWspo
                            ? 'Clocked in, logged in without a clock-in, and staff online.'
                            : 'Your students clocked in or logged in, plus staff online.'}
                    </p>
                </motion.button>

                {/* Active Personnel */}
                <motion.div
                    variants={itemVariants}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                Active Personnel
                            </p>
                            <h3 className="mt-2 font-mono text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                {stats.activeStudents}
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 transition-transform group-hover:scale-105">
                            <Users className="h-6 w-6" />
                        </div>
                    </div>
                    <p className="mt-4 text-xs font-medium leading-relaxed text-slate-500">
                        {isWspo
                            ? 'Student workers currently assigned campus-wide.'
                            : 'Working students assigned to your supervised department.'}
                    </p>
                </motion.div>

                {/* Pending Approvals */}
                <motion.div
                    variants={itemVariants}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:border-amber-200 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                Pending Approvals
                            </p>
                            <h3 className="mt-2 font-mono text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                {stats.pendingApprovals}
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 transition-transform group-hover:scale-105">
                            <ClipboardCheck className="h-6 w-6" />
                        </div>
                    </div>
                    <p className="mt-4 text-xs font-bold text-amber-700">
                        Requires supervisor review.
                    </p>
                </motion.div>

                {/* Hours Logged (Week) */}
                <motion.div
                    variants={itemVariants}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                Hours Logged (Week)
                            </p>
                            <h3 className="mt-2 flex items-baseline gap-1.5 font-mono text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                {stats.totalHoursThisWeek}
                                <span className="font-sans text-sm font-bold text-slate-400">hrs</span>
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 transition-transform group-hover:scale-105">
                            <Clock className="h-6 w-6" />
                        </div>
                    </div>
                    <p className="mt-4 text-xs font-medium leading-relaxed text-slate-500">
                        Total productive hours recorded this week.
                    </p>
                </motion.div>
            </motion.div>
            </>
            )}

            {/* ORGANIZATION SCHEDULE CALENDAR */}
            {!isImmediateSupervisor && <OrganizationScheduleCalendar />}

            {!(userRole === 'Department Secretary' && !secretaryActing) && !isImmediateSupervisor && (
            <>
            {/* ASSIGNED WORKING STUDENTS */}
            <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm"
            >
                <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-5 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                            <Users className="h-5 w-5" />
                        </span>
                        <div>
                            <h3 className="text-base font-black tracking-tight text-slate-900">
                                {isWspo ? 'WSPO Working Students' : 'Assigned Working Students'}
                            </h3>
                            <p className="text-xs font-medium text-slate-500">
                                {isWspo
                                    ? 'Working students assigned to the WSPO office.'
                                    : 'Working students assigned to your department.'}
                            </p>
                        </div>
                    </div>
                    <span className="inline-flex shrink-0 self-start rounded-full border border-slate-200 bg-white px-3.5 py-1 text-xs font-extrabold tabular-nums text-slate-700 sm:self-auto">
                        {stats.assignedStudents.length} assigned
                    </span>
                </div>

                {assignmentNotices.length > 0 && (
                    <div className="divide-y divide-blue-100 border-b border-blue-100 bg-blue-50/70">
                        {assignmentNotices.map((notice) => (
                            <div
                                key={notice.id}
                                className="flex items-start justify-between gap-4 px-6 py-4"
                            >
                                <div>
                                    <p className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-blue-600">
                                        <Sparkles className="h-3 w-3" />
                                        New Assignment
                                    </p>
                                    <p className="mt-1 text-sm font-bold text-slate-900">
                                        {notice.message}
                                    </p>
                                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                                        {new Date(notice.created_at).toLocaleString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true,
                                        })}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => dismissAssignmentNotice(notice.id)}
                                    className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-50"
                                >
                                    Dismiss
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {stats.assignedStudents.length === 0 ? (
                    <div className="px-6 py-14 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                            <Users className="h-6 w-6" />
                        </div>
                        <p className="text-sm font-extrabold text-slate-700">
                            {isWspo
                                ? 'No working students are assigned to WSPO yet.'
                                : 'No working students are assigned to your department yet.'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {stats.assignedStudents.map((student) => {
                            const homeCollege = homeDepartment(
                                student.course,
                                student.assigned_office
                            );
                            const yearLabel = formatYearLevel(student.year_level);
                            return (
                                <div
                                    key={student.id}
                                    className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-slate-50/80"
                                >
                                    <div className="flex min-w-0 items-center gap-3.5">
                                        <UserAvatar
                                            name={student.name}
                                            picture={student.profile_picture}
                                            className="h-11 w-11 rounded-full border border-slate-200 bg-slate-100 text-sm text-slate-600"
                                        />
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="truncate text-sm font-extrabold text-slate-900">
                                                    {student.name}
                                                </p>
                                                {student.special_hours_request && (
                                                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-violet-700 ring-1 ring-violet-200/70">
                                                        Special · 100 hrs
                                                    </span>
                                                )}
                                            </div>

                                            {(yearLabel || homeCollege) && (
                                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                    {yearLabel && (
                                                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                                                            {yearLabel}
                                                        </span>
                                                    )}
                                                    {homeCollege && (
                                                        <span
                                                            title={`Originally from ${homeCollege.fullName}, assigned to this office.`}
                                                            className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800"
                                                        >
                                                            From {homeCollege.shortName}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <p className="mt-1 truncate text-xs font-medium text-slate-500">
                                                {student.assignment_label ||
                                                    student.assigned_office ||
                                                    'Department'}{' '}
                                                · {dutyLabel(student)}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedStudent(student)}
                                        className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                                    >
                                        View info
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </motion.section>

            {/* RECENT STUDENT ACTIVITY */}
            <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm"
            >
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-5">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                            <Activity className="h-5 w-5" />
                        </span>
                        <div>
                            <h3 className="text-base font-black tracking-tight text-slate-900">
                                Recent Student Activity
                            </h3>
                            <p className="text-xs font-medium text-slate-500">
                                Live log-ins, clock-outs, and schedule events
                            </p>
                        </div>
                    </div>
                    {isWspo && (
                        <button
                            type="button"
                            onClick={() => navigate('/logs')}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                        >
                            View All
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {stats.recentStudentActivity.length === 0 ? (
                    <div className="flex flex-col items-center px-6 py-16 text-center">
                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                            <Activity className="h-7 w-7" />
                        </div>
                        <p className="text-sm font-extrabold text-slate-700">
                            No recent activity detected
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            Student log-ins, log-outs, completions, and schedule changes will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {stats.recentStudentActivity.map((item) => {
                            const action = (item.action || '').toLowerCase();
                            const isLogout =
                                action.includes('logout') || action.includes('clocked out');
                            const isLogin =
                                action.includes('login') || action.includes('clocked in');
                            return (
                                <div
                                    key={item.id}
                                    className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-50/80"
                                >
                                    <UserAvatar
                                        name={item.student_name}
                                        picture={item.profile_picture}
                                        className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-slate-100 text-sm text-slate-600"
                                    />
                                    <div
                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                                            isLogout
                                                ? 'border-rose-200 bg-rose-50 text-rose-600'
                                                : isLogin
                                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                                  : 'border-blue-200 bg-blue-50 text-blue-600'
                                        }`}
                                    >
                                        {isLogout ? (
                                            <LogOut className="h-4 w-4" />
                                        ) : isLogin ? (
                                            <LogIn className="h-4 w-4" />
                                        ) : (
                                            <Activity className="h-4 w-4" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-extrabold text-slate-900">
                                            {item.student_name}
                                        </p>
                                        <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                                            {item.description || item.action}
                                            {item.office ? ` · ${item.office}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                        <span
                                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                isLogout
                                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                                    : isLogin
                                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                      : 'border-slate-200 bg-slate-100 text-slate-600'
                                            }`}
                                        >
                                            {item.action}
                                        </span>
                                        <span className="text-[11px] font-semibold text-slate-400">
                                            {new Date(item.created_at).toLocaleString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                                hour: 'numeric',
                                                minute: '2-digit',
                                                hour12: true,
                                            })}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </motion.section>
            </>
            )}

            {/* ACTIVE NOW MODAL */}
            <AnimatePresence>
                {activeOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(() => setActiveOpen(false))}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 12 }}
                            className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <div className="flex items-center gap-2.5">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                                        <Radio className="h-4 w-4 animate-pulse" />
                                    </span>
                                    <div>
                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Live Presence
                                        </p>
                                        <h3 className="text-base font-black tracking-tight">
                                            Active Now ({totalActiveNow})
                                        </h3>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveOpen(false)}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="custom-scrollbar space-y-5 overflow-y-auto p-6">
                                {totalActiveNow === 0 ? (
                                    <p className="py-8 text-center text-sm font-semibold text-slate-400">
                                        Nobody is active right now.
                                    </p>
                                ) : (
                                    <>
                                        <div>
                                            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-emerald-700">
                                                Students clocked in · {activeStudents.length}
                                            </p>
                                            {activeStudents.length === 0 ? (
                                                <p className="text-xs font-medium text-slate-500">
                                                    No students are clocked in right now.
                                                </p>
                                            ) : (
                                                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
                                                    {activeStudents.map((record) => (
                                                        <li
                                                            key={record.id}
                                                            className="flex items-center justify-between gap-3 px-4 py-3"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <UserAvatar
                                                                    name={record.user?.name}
                                                                    picture={record.user?.profile_picture}
                                                                    className="h-9 w-9 rounded-full border border-slate-200 bg-slate-100 text-xs text-slate-600"
                                                                />
                                                                <div>
                                                                    <p className="text-sm font-bold text-slate-900">
                                                                        {record.user?.name || 'Unknown'}
                                                                    </p>
                                                                    <p className="text-xs text-slate-500">
                                                                        {record.user?.profile?.assignment_label ||
                                                                            record.user?.profile?.assigned_office ||
                                                                            'Unassigned'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <span className="flex shrink-0 items-center gap-1.5">
                                                                {record.device && (
                                                                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">
                                                                        {record.device}
                                                                    </span>
                                                                )}
                                                                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                                                                    In{' '}
                                                                    {new Date(record.time_in).toLocaleTimeString(
                                                                        'en-US',
                                                                        {
                                                                            hour: 'numeric',
                                                                            minute: '2-digit',
                                                                            hour12: true,
                                                                        }
                                                                    )}
                                                                </span>
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        <div>
                                            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-amber-700">
                                                Logged in, not clocked in · {signedIn.length}
                                            </p>
                                            {signedIn.length === 0 ? (
                                                <p className="text-xs font-medium text-slate-500">
                                                    No one is logged in without a clock-in.
                                                </p>
                                            ) : (
                                                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
                                                    {signedIn.map((person) => (
                                                        <li
                                                            key={person.id}
                                                            className="flex items-center justify-between gap-3 px-4 py-3"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <UserAvatar
                                                                    name={person.name}
                                                                    picture={person.profile_picture}
                                                                    className="h-9 w-9 rounded-full border border-slate-200 bg-slate-100 text-xs text-slate-600"
                                                                />
                                                                <div>
                                                                    <p className="text-sm font-bold text-slate-900">
                                                                        {person.name}
                                                                    </p>
                                                                    <p className="text-xs text-slate-500">
                                                                        {person.office || 'Unassigned'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <span className="flex shrink-0 items-center gap-1.5">
                                                                {person.device && (
                                                                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">
                                                                        {person.device}
                                                                    </span>
                                                                )}
                                                                <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                                                                    Logged in
                                                                </span>
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        <div>
                                            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-blue-700">
                                                Supervisors and coordinators online · {onlineStaff.length}
                                            </p>
                                            {onlineStaff.length === 0 ? (
                                                <p className="text-xs font-medium text-slate-500">
                                                    No supervisors or coordinators are online right now.
                                                </p>
                                            ) : (
                                                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
                                                    {onlineStaff.map((person) => (
                                                        <li
                                                            key={person.id}
                                                            className="flex items-center justify-between gap-3 px-4 py-3"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <UserAvatar
                                                                    name={person.name}
                                                                    picture={person.profile_picture}
                                                                    className="h-9 w-9 rounded-full border border-slate-200 bg-slate-100 text-xs text-slate-600"
                                                                />
                                                                <div>
                                                                    <p className="text-sm font-bold text-slate-900">
                                                                        {person.name}
                                                                    </p>
                                                                    <p className="text-xs text-slate-500">
                                                                        {person.office || 'Unassigned'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <span className="flex shrink-0 items-center gap-1.5">
                                                                {person.device && (
                                                                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">
                                                                        {person.device}
                                                                    </span>
                                                                )}
                                                                <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                                                                    {person.role} · Online
                                                                </span>
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* STUDENT DETAILS MODAL */}
            <AnimatePresence>
                {selectedStudent && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(() => setSelectedStudent(null))}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 12 }}
                            className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-4 bg-slate-950 px-6 py-5 text-white">
                                <div className="flex items-center gap-3.5">
                                    <UserAvatar
                                        name={selectedStudent.name}
                                        picture={selectedStudent.profile_picture}
                                        className="h-12 w-12 rounded-full border-2 border-white/20 bg-slate-800 text-sm text-white"
                                    />
                                    <div>
                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-300">
                                            Working Student
                                        </p>
                                        <h3 className="mt-0.5 text-lg font-black tracking-tight text-white">
                                            {selectedStudent.name}
                                        </h3>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                            {formatYearLevel(selectedStudent.year_level) && (
                                                <span className="inline-flex rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-200">
                                                    {formatYearLevel(selectedStudent.year_level)}
                                                </span>
                                            )}
                                            {homeDepartment(
                                                selectedStudent.course,
                                                selectedStudent.assigned_office
                                            ) && (
                                                <span
                                                    title={`Originally from ${homeDepartment(selectedStudent.course, selectedStudent.assigned_office)?.fullName}, assigned to this office.`}
                                                    className="inline-flex rounded-md border border-amber-400/30 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200"
                                                >
                                                    From{' '}
                                                    {
                                                        homeDepartment(
                                                            selectedStudent.course,
                                                            selectedStudent.assigned_office
                                                        )?.shortName
                                                    }
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedStudent(null)}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <dl className="grid grid-cols-1 gap-4 p-6 text-sm sm:grid-cols-2">
                                {[
                                    [
                                        'Department',
                                        selectedStudent.assignment_label ||
                                            selectedStudent.assigned_office,
                                    ],
                                    ['Duty', dutyLabel(selectedStudent)],
                                    ['Student ID', selectedStudent.student_id_number],
                                    ['Course', selectedStudent.course],
                                    ['Year level', selectedStudent.year_level],
                                    ['Gender', selectedStudent.gender],
                                    ['Contact', selectedStudent.phone_number],
                                ].map(([label, value]) => (
                                    <div
                                        key={String(label)}
                                        className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3"
                                    >
                                        <dt className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            {label}
                                        </dt>
                                        <dd className="mt-1 font-bold text-slate-900">
                                            {value || 'Not recorded'}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AdminDashboard;