import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import Toast from './Toast';
import {
    Terminal,
    Users,
    Activity,
    Clock,
    Wallet,
    Building2,
    ShieldCheck,
    AlertCircle,
    CheckCircle2,
    Wifi,
    X,
    UserPlus,
    Radio,
    ChevronRight,
    CheckCheck,
    Trash2,
} from 'lucide-react';
import { REALTIME_EVENT } from '../utils/realtime';
import { bindPopup } from '../utils/popupDismiss';
import UserAvatar from './UserAvatar';
import OrganizationScheduleCalendar from './OrganizationScheduleCalendar';
import { BulletinBoard } from './Bulletins';

interface EnrolledOffice {
    office: string;
    students: {
        id: number;
        name: string;
        profile_picture?: string | null;
        student_id_number?: string | null;
        course?: string | null;
    }[];
}

interface ActiveStudent {
    id: number;
    time_in: string;
    device?: string | null;
    user?: {
        name?: string;
        profile_picture?: string | null;
        profile?: {
            assigned_office?: string | null;
            assignment_label?: string | null;
            student_id_number?: string | null;
        } | null;
    } | null;
}

interface OnlineStaff {
    id: number;
    name: string;
    role: string;
    profile_picture?: string | null;
    office?: string | null;
    device?: string | null;
    online_since?: string | null;
}

interface SignedInStudent {
    id: number;
    name: string;
    profile_picture?: string | null;
    office?: string | null;
    device?: string | null;
}

interface DashboardStats {
    total_students: number;
    active_now: number;
    total_hours: number;
    estimated_equivalent_value: number;
    department_stats: { department: string; student_count: number }[];
    recent_activity: any[];
}

interface LiveNotice {
    id: number;
    title: string;
    message: string;
    is_read: number | boolean;
}

const SuperAdminDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [notices, setNotices] = useState<LiveNotice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [enrolledOpen, setEnrolledOpen] = useState(false);
    const [activeOpen, setActiveOpen] = useState(false);
    const [enrolled, setEnrolled] = useState<EnrolledOffice[]>([]);
    const [activeStudents, setActiveStudents] = useState<ActiveStudent[]>([]);
    const [onlineStaff, setOnlineStaff] = useState<OnlineStaff[]>([]);
    const [signedIn, setSignedIn] = useState<SignedInStudent[]>([]);
    const [popupLoading, setPopupLoading] = useState(false);
    const loggedStatsError = useRef<string | null>(null);

    const openEnrolled = async () => {
        setEnrolledOpen(true);
        setPopupLoading(true);
        try {
            const response = await axios.get('/api/admin/enrolled-roster');
            setEnrolled(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            console.error('Failed to load enrolled roster', err);
            setEnrolled([]);
        } finally {
            setPopupLoading(false);
        }
    };

    const openActive = async () => {
        setActiveOpen(true);
        setPopupLoading(true);
        try {
            const response = await axios.get('/api/admin/active-now');
            const payload = response.data ?? {};
            setActiveStudents(
                Array.isArray(payload)
                    ? payload
                    : Array.isArray(payload.students)
                      ? payload.students
                      : []
            );
            setOnlineStaff(Array.isArray(payload?.staff) ? payload.staff : []);
            setSignedIn(Array.isArray(payload?.signed_in) ? payload.signed_in : []);
        } catch (err) {
            console.error('Failed to load active students', err);
            setActiveStudents([]);
            setOnlineStaff([]);
            setSignedIn([]);
        } finally {
            setPopupLoading(false);
        }
    };

    const fetchNotices = async () => {
        try {
            const response = await axios.get('/api/notifications');
            const rows: LiveNotice[] = Array.isArray(response.data) ? response.data : [];
            setNotices(rows.filter((notice) => !notice.is_read).slice(0, 5));
        } catch (err) {
            console.error('Failed to load notifications', err);
        }
    };

    const openNotice = async (notice: LiveNotice) => {
        setNotices((current) => current.filter((item) => item.id !== notice.id));
        try {
            await axios.patch(`/api/notifications/${notice.id}/read`);
        } catch (err) {
            console.error('Failed to mark notification as read', err);
        }
        if (notice.title.toLowerCase().includes('announcement:')) {
            return;
        } else if (notice.title.includes('Signup') || notice.title.includes('Application')) {
            navigate('/pipeline');
        } else if (notice.title.includes('Account')) {
            navigate('/users');
        }
    };

    const markNoticeRead = async (id: number) => {
        setNotices((current) => current.filter((item) => item.id !== id));
        try {
            await axios.patch(`/api/notifications/${id}/read`);
        } catch (err) {
            console.error('Failed to mark notification as read', err);
            fetchNotices();
        }
    };

    const deleteNotice = async (id: number) => {
        setNotices((current) => current.filter((item) => item.id !== id));
        try {
            await axios.delete(`/api/notifications/${id}`);
        } catch (err) {
            console.error('Failed to delete notification', err);
            fetchNotices();
        }
    };

    const markAllNoticesRead = async () => {
        setNotices([]);
        try {
            await axios.patch('/api/notifications/read-all');
        } catch (err) {
            console.error('Failed to mark all notifications as read', err);
            fetchNotices();
        }
    };

    const clearAllNotices = async () => {
        if (!window.confirm('Clear all notifications? This deletes every notification.')) return;
        setNotices([]);
        try {
            await axios.delete('/api/notifications');
        } catch (err) {
            console.error('Failed to clear notifications', err);
            fetchNotices();
        }
    };

    useEffect(() => {
        const refresh = () => {
            fetchStats();
            fetchNotices();
        };
        refresh();
        const interval = setInterval(refresh, 5000);
        window.addEventListener(REALTIME_EVENT, refresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, refresh);
        };
    }, []);

    const fetchStats = async () => {
        try {
            const response = await axios.get('/api/admin/dashboard-stats');
            setStats(response.data);
            setError(null);
            loggedStatsError.current = null;
        } catch (err: any) {
            const message =
                err.response?.data?.message || 'Server Error: Could not load analytics.';
            if (loggedStatsError.current !== message) {
                console.error('Failed to load command center stats:', err);
                loggedStatsError.current = message;
            }
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (dateString: string) => {
        return new Date(dateString).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
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

    if (isLoading && !stats) {
        return (
            <div
                className="mx-auto max-w-7xl space-y-6 p-4 animate-pulse sm:p-8"
                aria-busy="true"
                aria-label="Connecting to telemetry"
            >
                <div className="h-44 rounded-[2rem] bg-slate-900/90" />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }, (_, idx) => (
                        <div key={idx} className="h-36 rounded-[1.75rem] bg-slate-200/80" />
                    ))}
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="h-80 rounded-[1.75rem] bg-slate-200/80 lg:col-span-1" />
                    <div className="h-80 rounded-[1.75rem] bg-slate-200/80 lg:col-span-2" />
                </div>
            </div>
        );
    }

    if (error && !stats) {
        return (
            <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center p-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
                    <ShieldCheck className="h-8 w-8" />
                </div>
                <p className="text-lg font-black text-slate-900">{error}</p>
                <button
                    onClick={fetchStats}
                    className="mt-5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-blue-600"
                >
                    Retry Connection
                </button>
            </div>
        );
    }

    const maxDeptCount = Math.max(
        1,
        ...(stats?.department_stats?.map((d) => d.student_count) ?? [1])
    );

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
            {/* OBSIDIAN GLOBAL COMMAND CENTER HERO */}
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
                    className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-purple-600/25 blur-3xl"
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/25 bg-purple-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-purple-300">
                                <Terminal className="h-3.5 w-3.5 text-purple-400" />
                                Global Operations
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                                Super Admin
                            </span>
                        </div>

                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            System Command Center
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            Monitor real-time university-wide work-study operations across all offices.
                        </p>
                    </div>

                    {/* Frosted Connection Status Card */}
                    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
                            <Wifi className="h-5 w-5 animate-pulse" />
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Connection Status
                            </p>
                            <p className="mt-0.5 text-sm font-black text-emerald-300">
                                Live Sync Active
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            <BulletinBoard />

            {/* LIVE NOTIFICATIONS CARD */}
            {notices.length > 0 && (
                <section className="overflow-hidden rounded-[1.75rem] border border-purple-200/90 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-100 bg-purple-50/60 px-6 py-4">
                        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600 text-white">
                                <UserPlus className="h-4 w-4" />
                            </span>
                            Live Notifications
                            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-purple-700">
                                {notices.length} new
                            </span>
                        </h2>
                        <div className="flex flex-wrap items-center gap-4">
                            <button
                                type="button"
                                onClick={() => void markAllNoticesRead()}
                                className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-blue-700 hover:underline"
                            >
                                <CheckCheck className="h-3.5 w-3.5" />
                                Mark all read
                            </button>
                            <button
                                type="button"
                                onClick={() => void clearAllNotices()}
                                className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-rose-600 hover:underline"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                Clear all
                            </button>
                        </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {notices.map((notice) => (
                            <div
                                key={notice.id}
                                className="px-6 py-4 transition-colors hover:bg-purple-50/40"
                            >
                                <button
                                    type="button"
                                    onClick={() => void openNotice(notice)}
                                    className="w-full text-left"
                                >
                                    <p className="text-sm font-extrabold text-slate-900">
                                        {notice.title}
                                    </p>
                                    <p className="mt-1 text-xs font-medium text-slate-600">
                                        {notice.message}
                                    </p>
                                </button>
                                <div className="mt-2.5 flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => void markNoticeRead(notice.id)}
                                        className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 hover:underline"
                                    >
                                        Mark read
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void deleteNotice(notice.id)}
                                        className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 hover:underline"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <Toast
                message={error ? `Telemetry Disconnected: ${error}` : null}
                type="error"
                onClose={() => setError(null)}
            />

            {/* 4-COLUMN TELEMETRY BENTO */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
            >
                {/* Total Enrolled */}
                <motion.button
                    type="button"
                    onClick={() => void openEnrolled()}
                    variants={itemVariants}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                Total Enrolled
                            </p>
                            <h3 className="mt-2 font-mono text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                {stats?.total_students || 0}
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 transition-transform group-hover:scale-105">
                            <Users className="h-6 w-6" />
                        </div>
                    </div>
                    <p className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                        View students by office
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </p>
                </motion.button>

                {/* Active Now */}
                <motion.button
                    type="button"
                    onClick={() => void openActive()}
                    variants={itemVariants}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                Active Now
                            </p>
                            <h3 className="mt-2 flex items-center gap-2.5 font-mono text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                {stats?.active_now || 0}
                                {stats?.active_now ? (
                                    <span className="relative flex h-3 w-3">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                                    </span>
                                ) : null}
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 transition-transform group-hover:scale-105">
                            <Activity className="h-6 w-6" />
                        </div>
                    </div>
                    <p className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                        Clocked in, logged in &amp; staff
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </p>
                </motion.button>

                {/* System Hours */}
                <motion.div
                    variants={itemVariants}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:border-purple-200 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                System Hours
                            </p>
                            <h3 className="mt-2 flex items-baseline gap-1.5 font-mono text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                {stats?.total_hours || 0}
                                <span className="font-sans text-sm font-bold text-slate-400">
                                    hrs
                                </span>
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 ring-1 ring-purple-100 transition-transform group-hover:scale-105">
                            <Clock className="h-6 w-6" />
                        </div>
                    </div>
                    <p className="mt-4 text-xs font-medium text-slate-500">
                        Cumulative verified duty hours.
                    </p>
                </motion.div>

                {/* Projected Equivalent Value */}
                <motion.div
                    variants={itemVariants}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:border-amber-200 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                Equivalent Value
                            </p>
                            <h3 className="mt-2 truncate font-mono text-3xl font-black tracking-tight tabular-nums text-slate-900">
                                ₱{stats?.estimated_equivalent_value?.toLocaleString() || 0}
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 transition-transform group-hover:scale-105">
                            <Wallet className="h-6 w-6" />
                        </div>
                    </div>
                    <p className="mt-4 text-xs font-medium text-slate-500">
                        Projected work-study equivalent.
                    </p>
                </motion.div>
            </motion.div>

            {/* ORGANIZATION SCHEDULE CALENDAR */}
            <OrganizationScheduleCalendar />

            {/* DASHBOARD SPLIT VIEW */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3"
            >
                {/* LEFT: Workforce Distribution */}
                <motion.section
                    variants={itemVariants}
                    className="flex h-full max-h-[600px] flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm lg:col-span-1"
                >
                    <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                        <h3 className="flex items-center gap-2.5 text-base font-black tracking-tight text-slate-900">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                                <Building2 className="h-4 w-4" />
                            </span>
                            Workforce Distribution
                        </h3>
                    </div>

                    <div className="custom-scrollbar flex-1 overflow-y-auto">
                        {!stats?.department_stats || stats.department_stats.length === 0 ? (
                            <div className="p-10 text-center text-slate-400">
                                <Building2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
                                <p className="text-sm font-bold text-slate-600">
                                    No department data available.
                                </p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {stats.department_stats.map((dept, index) => {
                                    const pct = Math.max(
                                        6,
                                        Math.round((dept.student_count / maxDeptCount) * 100)
                                    );
                                    return (
                                        <li
                                            key={index}
                                            className="px-6 py-4 transition-colors hover:bg-slate-50/80"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="truncate text-xs font-extrabold text-slate-800">
                                                    {dept.department}
                                                </span>
                                                <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-[11px] font-black text-slate-700">
                                                    {dept.student_count}
                                                </span>
                                            </div>
                                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-500"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </motion.section>

                {/* RIGHT: Live Activity Feed */}
                <motion.section
                    variants={itemVariants}
                    className="flex h-full max-h-[600px] flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm lg:col-span-2"
                >
                    <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                        <h3 className="flex items-center gap-2.5 text-base font-black tracking-tight text-slate-900">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                                <Activity className="h-4 w-4" />
                            </span>
                            Live Activity Feed
                        </h3>
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
                            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-500" />
                            Live Updates
                        </span>
                    </div>

                    <div className="custom-scrollbar flex-1 overflow-y-auto bg-slate-50/30">
                        {!stats?.recent_activity || stats.recent_activity.length === 0 ? (
                            <div className="flex flex-col items-center px-6 py-16 text-center text-slate-400">
                                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                    <Activity className="h-7 w-7" />
                                </div>
                                <p className="text-sm font-extrabold text-slate-700">
                                    Radar is quiet
                                </p>
                                <p className="mt-1 text-xs font-medium text-slate-400">
                                    No attendance activity recorded recently.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                <AnimatePresence>
                                    {stats.recent_activity.map((record) => (
                                        <motion.div
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            key={record.id}
                                            className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-white"
                                        >
                                            <UserAvatar
                                                name={record.user?.name}
                                                picture={record.user?.profile_picture}
                                                className="h-11 w-11 shrink-0 rounded-full border border-slate-200 bg-slate-100 text-sm text-slate-600 transition-transform group-hover:scale-105"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="truncate text-sm font-extrabold text-slate-900 transition-colors group-hover:text-blue-700">
                                                        {record.user?.name || 'Unknown User'}
                                                    </p>
                                                    {(record.account_deleted ||
                                                        record.user?.deleted_at) && (
                                                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                            Account deleted
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                                                    {record.user?.profile?.assignment_label ||
                                                        record.user?.profile?.assigned_office ||
                                                        'Unassigned'}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 flex-col items-end gap-1">
                                                {record.time_out === null ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        Clocked In
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-700">
                                                        <AlertCircle className="h-3 w-3" />
                                                        Clocked Out
                                                    </span>
                                                )}
                                                <span className="font-mono text-[11px] font-bold text-slate-400">
                                                    {formatTime(record.updated_at)}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </motion.section>
            </motion.div>

            {/* OBSIDIAN ROSTER / ACTIVE NOW MODAL */}
            <AnimatePresence>
                {(enrolledOpen || activeOpen) && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(() => {
                            setEnrolledOpen(false);
                            setActiveOpen(false);
                        })}
                    >
                        <motion.div
                            initial={{ scale: 0.96, y: 12 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.96, y: 12 }}
                            onClick={(event) => event.stopPropagation()}
                            className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <div className="flex items-center gap-2.5">
                                    <span
                                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                                            enrolledOpen
                                                ? 'bg-purple-500/20 text-purple-300'
                                                : 'bg-emerald-500/20 text-emerald-300'
                                        }`}
                                    >
                                        {enrolledOpen ? (
                                            <Users className="h-4 w-4" />
                                        ) : (
                                            <Radio className="h-4 w-4 animate-pulse" />
                                        )}
                                    </span>
                                    <div>
                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            {enrolledOpen ? 'Campus Roster' : 'Live Presence'}
                                        </p>
                                        <h3 className="text-base font-black tracking-tight">
                                            {enrolledOpen
                                                ? 'Enrolled Students by Office'
                                                : 'Active Now'}
                                        </h3>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEnrolledOpen(false);
                                        setActiveOpen(false);
                                    }}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="custom-scrollbar space-y-5 overflow-y-auto p-6">
                                {popupLoading ? (
                                    <div className="flex justify-center py-12">
                                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-purple-600" />
                                    </div>
                                ) : enrolledOpen ? (
                                    enrolled.length === 0 ? (
                                        <p className="py-8 text-center text-sm font-semibold text-slate-400">
                                            No enrolled students found.
                                        </p>
                                    ) : (
                                        enrolled.map((group) => (
                                            <div key={group.office}>
                                                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-purple-700">
                                                    {group.office} · {group.students.length}
                                                </p>
                                                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
                                                    {group.students.map((student) => (
                                                        <li
                                                            key={student.id}
                                                            className="flex items-center justify-between gap-3 px-4 py-3"
                                                        >
                                                            <span className="flex items-center gap-3 text-sm font-bold text-slate-900">
                                                                <UserAvatar
                                                                    name={student.name}
                                                                    picture={student.profile_picture}
                                                                    className="h-8 w-8 rounded-full border border-slate-200 bg-slate-100 text-xs text-slate-600"
                                                                />
                                                                {student.name}
                                                            </span>
                                                            <span className="font-mono text-xs font-semibold text-slate-500">
                                                                {student.student_id_number ||
                                                                    student.course ||
                                                                    '—'}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))
                                    )
                                ) : activeStudents.length === 0 &&
                                  signedIn.length === 0 &&
                                  onlineStaff.length === 0 ? (
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
                                                                    picture={
                                                                        record.user?.profile_picture
                                                                    }
                                                                    className="h-8 w-8 rounded-full border border-slate-200 bg-slate-100 text-xs text-slate-600"
                                                                />
                                                                <div>
                                                                    <p className="text-sm font-bold text-slate-900">
                                                                        {record.user?.name ||
                                                                            'Unknown'}
                                                                    </p>
                                                                    <p className="text-xs text-slate-500">
                                                                        {record.user?.profile
                                                                            ?.assignment_label ||
                                                                            record.user?.profile
                                                                                ?.assigned_office ||
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
                                                                    In {formatTime(record.time_in)}
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
                                                                    className="h-8 w-8 rounded-full border border-slate-200 bg-slate-100 text-xs text-slate-600"
                                                                />
                                                                <div>
                                                                    <p className="text-sm font-bold text-slate-900">
                                                                        {person.name}
                                                                    </p>
                                                                    <p className="text-xs text-slate-500">
                                                                        {person.office ||
                                                                            'Unassigned'}
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
                                                Supervisors and coordinators online ·{' '}
                                                {onlineStaff.length}
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
                                                                    className="h-8 w-8 rounded-full border border-slate-200 bg-slate-100 text-xs text-slate-600"
                                                                />
                                                                <div>
                                                                    <p className="text-sm font-bold text-slate-900">
                                                                        {person.name}
                                                                    </p>
                                                                    <p className="text-xs text-slate-500">
                                                                        {person.office ||
                                                                            'Unassigned'}
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
        </div>
    );
};

export default SuperAdminDashboard;