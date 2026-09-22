import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
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
    LogOut
} from 'lucide-react';

// Keep your original import path for the SuperAdmin redirect
import SuperAdminDashboard from '../../components/SuperAdminDashboard';

const AdminDashboard = () => {
    const navigate = useNavigate();
    const userName = localStorage.getItem('user_name') || 'Admin';
    const userRole = localStorage.getItem('user_role') || 'Supervisor';
    const assignedOffice = localStorage.getItem('assigned_office') || 'Department Supervisor';
    const isWspo = userRole === 'WSPO Staff';
    
    // THE SUPER ADMIN HIJACK
    // If they are a Super Admin, completely swap the view to the Command Center
    if (userRole === 'Super Admin') {
        return <SuperAdminDashboard />;
    }

    // --- EVERYTHING BELOW THIS LINE IS FOR SUPERVISORS & WSPO STAFF ---
    
    const [stats, setStats] = useState({
        activeStudents: 0,
        pendingApprovals: 0,
        totalHoursThisWeek: 0,
        recentStudentActivity: [] as {
            id: number | string;
            student_name: string;
            action: string;
            description: string;
            office?: string | null;
            created_at: string;
        }[]
    });

    const [isLoading, setIsLoading] = useState(true);

    const [pendingApplications, setPendingApplications] = useState(0);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await axios.get('/api/admin/stats');
                setStats({
                    activeStudents: response.data.activeStudents ?? 0,
                    pendingApprovals: response.data.pendingApprovals ?? 0,
                    totalHoursThisWeek: response.data.totalHoursThisWeek ?? 0,
                    recentStudentActivity: Array.isArray(response.data.recentStudentActivity)
                        ? response.data.recentStudentActivity
                        : [],
                });
            } catch (err) {
                console.error("Failed to load dashboard stats", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
        const interval = setInterval(fetchStats, 30000);
        if (isWspo) {
            axios.get('/api/applications')
                .then((response) => {
                    const rows = Array.isArray(response.data) ? response.data : (response.data?.data || []);
                    setPendingApplications(rows.filter((app: { status?: string }) => app.status !== 'Approved' && app.status !== 'Rejected').length);
                })
                .catch(() => setPendingApplications(0));
        }
        return () => clearInterval(interval);
    }, [isWspo]);

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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold animate-pulse">Loading workspace data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 font-sans max-w-7xl mx-auto p-4 sm:p-8">
            
            {/* DARK THEME HEADER - MANAGEMENT COMMAND CENTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Subtle blue/purple glow for admin context */}
                <div className="absolute top-0 left-0 -mt-16 -ml-16 w-64 h-64 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-0 right-10 -mb-16 -mr-16 w-64 h-64 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <LayoutDashboard className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Management Hub</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Workspace Overview
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        {isWspo
                            ? 'Welcome back. Review new Work-Study sign-ups, then place approved students in their departments.'
                            : "Welcome back, " + userName.split(' ')[0] + ". Monitor your department's student workers, review pending timesheets, and manage daily operations."}
                    </p>
                </div>

                {/* Dynamic Status Box */}
                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Access Level: {userRole}</span>
                        <span className="text-sm font-extrabold text-blue-400 truncate max-w-[150px]">
                            {assignedOffice}
                        </span>
                    </div>
                </div>
            </motion.div>

            {isWspo && (
                <motion.button
                    type="button"
                    onClick={() => navigate('/pipeline')}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full text-left bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-blue-200 hover:border-blue-400 transition-colors flex items-center justify-between gap-4"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl">
                            <UserPlus className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">WSPO Coordinator</p>
                            <h3 className="text-2xl font-black text-slate-900">Review applicant sign-ups</h3>
                            <p className="text-sm text-slate-500 font-medium mt-1">{pendingApplications} application{pendingApplications === 1 ? '' : 's'} waiting in the pipeline.</p>
                        </div>
                    </div>
                    <span className="text-sm font-bold text-blue-600 flex items-center">
                        Open Applications <ChevronRight className="w-4 h-4 ml-0.5" />
                    </span>
                </motion.button>
            )}
            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
                {/* Active Students Card */}
                <motion.div variants={itemVariants} className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-blue-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active Personnel</p>
                            <h3 className="text-4xl font-black text-slate-900">{stats.activeStudents}</h3>
                        </div>
                        <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Users className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-sm text-slate-500 mt-4 font-medium">
                        {isWspo ? 'Student workers currently assigned campus-wide.' : 'Working students assigned to your supervised department.'}
                    </p>
                </motion.div>

                {/* Pending Approvals Card */}
                <motion.div variants={itemVariants} className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-amber-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Pending Approvals</p>
                            <h3 className="text-4xl font-black text-slate-900">{stats.pendingApprovals}</h3>
                        </div>
                        <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <ClipboardCheck className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-sm text-amber-600 mt-4 font-bold flex items-center gap-1">
                        Requires supervisor review.
                    </p>
                </motion.div>

                {/* Hours Logged Card */}
                <motion.div variants={itemVariants} className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-emerald-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Hours Logged (Week)</p>
                            <h3 className="text-4xl font-black text-slate-900">
                                {stats.totalHoursThisWeek} <span className="text-lg font-bold text-slate-400">hrs</span>
                            </h3>
                        </div>
                        <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Clock className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-sm text-slate-500 mt-4 font-medium">Total productive hours recorded.</p>
                </motion.div>
            </motion.div>

            {/* --- RECENT ACTIVITY PREVIEW --- */}
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
            >
                <div className="p-6 sm:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-2 tracking-tight">
                        <Activity className="w-5 h-5 text-blue-600" />
                        Recent Student Activity
                    </h3>
                    {isWspo && (
                        <button
                            type="button"
                            onClick={() => navigate('/logs')}
                            className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center"
                        >
                            View All <ChevronRight className="w-4 h-4 ml-0.5" />
                        </button>
                    )}
                </div>
                
                {stats.recentStudentActivity.length === 0 ? (
                    <div className="p-16 text-center flex flex-col items-center">
                        <Activity className="w-16 h-16 text-slate-300 mb-4 opacity-50" />
                        <p className="text-lg font-bold text-slate-600">No recent activity detected.</p>
                        <p className="text-sm text-slate-400 font-medium mt-1">Student log-ins, log-outs, completions, and schedule changes will appear here.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {stats.recentStudentActivity.map((item) => {
                            const action = (item.action || '').toLowerCase();
                            const isLogout = action.includes('logout') || action.includes('clocked out');
                            const isLogin = action.includes('login') || action.includes('clocked in');
                            return (
                                <div key={item.id} className="p-5 sm:px-8 flex items-center gap-4 hover:bg-slate-50/80 transition-colors">
                                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                                        isLogout
                                            ? 'bg-rose-50 text-rose-600 border-rose-100'
                                            : isLogin
                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                : 'bg-blue-50 text-blue-600 border-blue-100'
                                    }`}>
                                        {isLogout ? <LogOut className="w-5 h-5" /> : isLogin ? <LogIn className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-slate-900 truncate">{item.student_name}</p>
                                        <p className="text-xs font-medium text-slate-500 mt-0.5 truncate">
                                            {item.description || item.action}
                                            {item.office ? ` · ${item.office}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
                                            isLogout
                                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                : isLogin
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                        }`}>
                                            {item.action}
                                        </span>
                                        <span className="text-xs font-bold text-slate-400">
                                            {new Date(item.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default AdminDashboard;