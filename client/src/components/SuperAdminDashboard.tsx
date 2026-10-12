import { useState, useEffect } from 'react';
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
    UserPlus
} from 'lucide-react';
import { REALTIME_EVENT } from '../utils/realtime';
import { bindPopup } from '../utils/popupDismiss';
import UserAvatar from './UserAvatar';

interface EnrolledOffice {
    office: string;
    students: { id: number; name: string; profile_picture?: string | null; student_id_number?: string | null; course?: string | null }[];
}

interface ActiveStudent {
    id: number;
    time_in: string;
    device?: string | null;
        user?: {
        name?: string;
        profile_picture?: string | null;
        profile?: { assigned_office?: string | null; student_id_number?: string | null } | null;
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
            setActiveStudents(Array.isArray(payload) ? payload : (Array.isArray(payload.students) ? payload.students : []));
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
        if (notice.title.includes('Signup') || notice.title.includes('Application')) {
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
            setError(null);
            const response = await axios.get('/api/admin/dashboard-stats');
            setStats(response.data);
        } catch (err: any) {
            console.error("Failed to load command center stats:", err);
            setError(err.response?.data?.message || "Server Error: Could not load analytics.");
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (dateString: string) => {
        return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    // STRICT TYPESCRIPT ANIMATION VARIANTS
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    if (isLoading && !stats) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-purple-600 rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold animate-pulse tracking-widest uppercase text-sm">Connecting to Telemetry...</p>
                </div>
            </div>
        );
    }

    if (error && !stats) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <ShieldCheck className="w-16 h-16 text-rose-600 mb-4 opacity-50" />
                <p className="text-xl font-bold text-slate-700">{error}</p>
                <button onClick={fetchStats} className="mt-4 px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl transition-colors">
                    Retry Connection
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8 font-sans max-w-7xl mx-auto p-4 sm:p-8">
            
            {/* DARK THEME HEADER - GLOBAL COMMAND CENTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
            >

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <Terminal className="w-5 h-5 text-purple-400" />
                        <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Global Operations</span>
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                        System Command Center
                    </h1>
                    <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
                        University-wide overview of work-study operations. Telemetry data synchronizes automatically.
                    </p>
                </div>

                {/* Dynamic Status Box */}
                <div className="shrink-0 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <Wifi className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Connection Status</span>
                        <span className="text-sm font-semibold text-emerald-600">
                            Live Sync Active
                        </span>
                    </div>
                </div>
            </motion.div>

            {notices.length > 0 && (
                <div className="bg-white rounded-3xl shadow-sm border border-purple-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                            <UserPlus className="w-4 h-4 text-purple-600" />
                            Live notifications
                        </h2>
                        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
                            <button type="button" onClick={() => void markAllNoticesRead()} className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Mark all read</button>
                            <button type="button" onClick={() => void clearAllNotices()} className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Clear all</button>
                            <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-2 py-1 rounded-full uppercase tracking-wider">{notices.length} new</span>
                        </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {notices.map((notice) => (
                            <div key={notice.id} className="px-6 py-4 hover:bg-purple-50/60 transition-colors">
                                <button type="button" onClick={() => void openNotice(notice)} className="w-full text-left">
                                    <p className="text-sm font-bold text-slate-900">{notice.title}</p>
                                    <p className="text-xs font-medium text-slate-600 mt-1">{notice.message}</p>
                                </button>
                                <div className="mt-2 flex items-center gap-3">
                                    <button type="button" onClick={() => void markNoticeRead(notice.id)} className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Mark read</button>
                                    <button type="button" onClick={() => void deleteNotice(notice.id)} className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <Toast
                message={error ? `Telemetry Disconnected: ${error}` : null}
                type="error"
                onClose={() => setError(null)}
            />

            {/* --- TELEMETRY STAT CARDS --- */}
            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
            >
                <motion.button type="button" onClick={() => void openEnrolled()} variants={itemVariants} className="text-left bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] relative overflow-hidden group hover:border-blue-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Enrolled</p>
                            <p className="text-[11px] font-medium text-blue-600 mb-1">View students by office</p>
                            <h3 className="text-4xl font-semibold text-slate-900">{stats?.total_students || 0}</h3>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Users className="w-6 h-6" />
                        </div>
                    </div>
                </motion.button>

                <motion.button type="button" onClick={() => void openActive()} variants={itemVariants} className="text-left bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] relative overflow-hidden group hover:border-emerald-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active Now</p>
                            <p className="text-[11px] font-medium text-emerald-600 mb-1">Clocked in, logged in, and staff online</p>
                            <h3 className="text-4xl font-semibold text-slate-900 flex items-center gap-3">
                                {stats?.active_now || 0}
                                {stats?.active_now ? <span className="w-3 h-3 bg-emerald-500 rounded-full animate-ping"></span> : null}
                            </h3>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Activity className="w-6 h-6" />
                        </div>
                    </div>
                </motion.button>

                <motion.div variants={itemVariants} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] relative overflow-hidden group hover:border-purple-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">System Hours</p>
                            <h3 className="text-4xl font-semibold text-slate-900">
                                {stats?.total_hours || 0} <span className="text-lg font-bold text-slate-400">hrs</span>
                            </h3>
                        </div>
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Clock className="w-6 h-6" />
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] relative overflow-hidden group hover:border-amber-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Projected Equivalent Value</p>
                            <h3 className="text-3xl font-semibold text-slate-900 truncate max-w-[150px]">
                                ₱{stats?.estimated_equivalent_value?.toLocaleString() || 0}
                            </h3>
                        </div>
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Wallet className="w-6 h-6" />
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {/* --- DASHBOARD SPLIT VIEW --- */}
            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start"
            >
                {/* LEFT: Department Distribution */}
                <motion.div variants={itemVariants} className="lg:col-span-1 bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col h-full max-h-[600px]">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 tracking-tight">
                            <Building2 className="w-5 h-5 text-purple-600" />
                            Workforce Distribution
                        </h3>
                    </div>
                    <div className="p-0 overflow-y-auto custom-scrollbar flex-1">
                        {(!stats?.department_stats || stats.department_stats.length === 0) ? (
                            <div className="p-10 text-center text-slate-400">
                                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="font-bold">No department data available.</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {stats.department_stats.map((dept, index) => (
                                    <li key={index} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <span className="font-bold text-slate-700 text-sm truncate pr-4">{dept.department}</span>
                                        <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shrink-0">
                                            {dept.student_count} Workers
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </motion.div>

                {/* RIGHT: Live Activity Feed */}
                <motion.div variants={itemVariants} className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col h-full max-h-[600px]">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 tracking-tight">
                            <Activity className="w-5 h-5 text-emerald-600" />
                            Live Activity Feed
                        </h3>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live Updates</span>
                        </div>
                    </div>
                    
                    <div className="p-0 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/30">
                        {(!stats?.recent_activity || stats.recent_activity.length === 0) ? (
                            <div className="p-16 text-center text-slate-400 flex flex-col items-center">
                                <Activity className="w-16 h-16 mb-4 opacity-20" />
                                <p className="text-lg font-bold text-slate-600">Radar is quiet.</p>
                                <p className="text-sm font-medium mt-1">No attendance activity recorded recently.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                <AnimatePresence>
                                    {stats.recent_activity.map((record) => (
                                        <motion.div 
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            key={record.id} 
                                            className="p-5 flex items-center gap-4 hover:bg-white transition-colors group"
                                        >
                                            <UserAvatar
                                                name={record.user?.name}
                                                picture={record.user?.profile_picture}
                                                className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-base group-hover:scale-105 transition-transform"
                                            />
                                            <div className="flex-1">
                                                <p className="text-sm font-semibold text-slate-900 leading-tight group-hover:text-blue-700 transition-colors">
                                                    {record.user?.name || 'Unknown User'}
                                                </p>
                                                {(record.account_deleted || record.user?.deleted_at) && (
                                                    <span className="mt-1 inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                                        Account deleted
                                                    </span>
                                                )}
                                                <p className="text-xs font-medium text-slate-500 mt-0.5 truncate max-w-[250px] sm:max-w-full">
                                                    {record.user?.profile?.assigned_office || 'Unassigned'}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                {record.time_out === null ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md shadow-sm">
                                                        <CheckCircle2 className="w-3 h-3" /> Clocked In
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md shadow-sm">
                                                        <AlertCircle className="w-3 h-3" /> Clocked Out
                                                    </span>
                                                )}
                                                <span className="text-xs font-bold text-slate-400 font-mono">
                                                    {formatTime(record.updated_at)}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>

            <AnimatePresence>
                {(enrolledOpen || activeOpen) && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
                        {...bindPopup(() => { setEnrolledOpen(false); setActiveOpen(false); })}
                    >
                        <motion.div
                            initial={{ scale: 0.96, y: 12 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.96, y: 12 }}
                            onClick={(event) => event.stopPropagation()}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="text-xl font-semibold text-slate-900">
                                    {enrolledOpen ? 'Enrolled students by office' : 'Active now'}
                                </h3>
                                <button type="button" onClick={() => { setEnrolledOpen(false); setActiveOpen(false); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="overflow-y-auto p-6 space-y-5">
                                {popupLoading ? (
                                    <div className="py-10 flex justify-center">
                                        <div className="w-8 h-8 border-4 border-slate-200 border-t-purple-600 rounded-full animate-spin" />
                                    </div>
                                ) : enrolledOpen ? (
                                    enrolled.length === 0 ? (
                                        <p className="text-sm font-medium text-slate-500">No enrolled students found.</p>
                                    ) : enrolled.map((group) => (
                                        <div key={group.office}>
                                            <p className="text-xs font-semibold uppercase tracking-widest text-purple-700 mb-2">{group.office} · {group.students.length}</p>
                                            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
                                                {group.students.map((student) => (
                                                    <li key={student.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                                        <span className="font-bold text-slate-900 text-sm flex items-center gap-3">
                                                            <UserAvatar name={student.name} picture={student.profile_picture} className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs" />
                                                            {student.name}
                                                        </span>
                                                        <span className="text-xs font-medium text-slate-500">{student.student_id_number || student.course || '—'}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))
                                ) : activeStudents.length === 0 && signedIn.length === 0 && onlineStaff.length === 0 ? (
                                    <p className="text-sm font-medium text-slate-500">Nobody is active right now.</p>
                                ) : (
                                    <>
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 mb-2">Students clocked in · {activeStudents.length}</p>
                                            {activeStudents.length === 0 ? (
                                                <p className="text-sm font-medium text-slate-500">No students are clocked in right now.</p>
                                            ) : (
                                                <ul className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
                                                    {activeStudents.map((record) => (
                                                        <li key={record.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                                            <div className="flex items-center gap-3">
                                                                <UserAvatar name={record.user?.name} picture={record.user?.profile_picture} className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs" />
                                                                <div>
                                                                <p className="font-bold text-slate-900 text-sm">{record.user?.name || 'Unknown'}</p>
                                                                <p className="text-xs text-slate-500">{record.user?.profile?.assigned_office || 'Unassigned'}</p>
                                                                </div>
                                                            </div>
                                                            <span className="flex items-center gap-1.5 shrink-0">
                                                                {record.device ? <span className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">{record.device}</span> : null}
                                                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md">
                                                                    In {formatTime(record.time_in)}
                                                                </span>
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 mb-2">Logged in, not clocked in · {signedIn.length}</p>
                                            {signedIn.length === 0 ? (
                                                <p className="text-sm font-medium text-slate-500">No one is logged in without a clock-in.</p>
                                            ) : (
                                                <ul className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
                                                    {signedIn.map((person) => (
                                                        <li key={person.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                                            <div className="flex items-center gap-3">
                                                                <UserAvatar name={person.name} picture={person.profile_picture} className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs" />
                                                                <div>
                                                                    <p className="font-bold text-slate-900 text-sm">{person.name}</p>
                                                                    <p className="text-xs text-slate-500">{person.office || 'Unassigned'}</p>
                                                                </div>
                                                            </div>
                                                            <span className="flex items-center gap-1.5 shrink-0">
                                                                {person.device ? <span className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">{person.device}</span> : null}
                                                                <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
                                                                    Logged in
                                                                </span>
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-widest text-blue-700 mb-2">Supervisors and coordinators online · {onlineStaff.length}</p>
                                            {onlineStaff.length === 0 ? (
                                                <p className="text-sm font-medium text-slate-500">No supervisors or coordinators are online right now.</p>
                                            ) : (
                                                <ul className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
                                                    {onlineStaff.map((person) => (
                                                        <li key={person.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                                            <div className="flex items-center gap-3">
                                                                <UserAvatar name={person.name} picture={person.profile_picture} className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs" />
                                                                <div>
                                                                    <p className="font-bold text-slate-900 text-sm">{person.name}</p>
                                                                    <p className="text-xs text-slate-500">{person.office || 'Unassigned'}</p>
                                                                </div>
                                                            </div>
                                                            <span className="flex items-center gap-1.5 shrink-0">
                                                                {person.device ? <span className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">{person.device}</span> : null}
                                                                <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-md">
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