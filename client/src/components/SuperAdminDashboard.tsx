import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
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
    Wifi
} from 'lucide-react';

interface DashboardStats {
    total_students: number;
    active_now: number;
    total_hours: number;
    estimated_equivalent_value: number;
    department_stats: { department: string; student_count: number }[];
    recent_activity: any[];
}

const SuperAdminDashboard = () => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchStats();
        // Auto-refresh every 30 seconds for a true "Live" dashboard feel
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
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
                <ShieldCheck className="w-16 h-16 text-red-400 mb-4 opacity-50" />
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
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Glowing Orbs */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <Terminal className="w-5 h-5 text-purple-400" />
                        <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Global Operations</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        System Command Center
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        University-wide overview of work-study operations. Telemetry data synchronizes automatically.
                    </p>
                </div>

                {/* Dynamic Status Box */}
                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                        <Wifi className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Connection Status</span>
                        <span className="text-sm font-extrabold text-emerald-400">
                            Live Sync Active
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* ERROR TOAST (Non-blocking) */}
            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 shadow-sm">
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                        <span className="text-sm font-bold text-red-800">Telemetry Disconnected: {error}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- TELEMETRY STAT CARDS --- */}
            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
            >
                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-blue-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Enrolled</p>
                            <h3 className="text-4xl font-black text-slate-900">{stats?.total_students || 0}</h3>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Users className="w-6 h-6" />
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-emerald-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active Now</p>
                            <h3 className="text-4xl font-black text-slate-900 flex items-center gap-3">
                                {stats?.active_now || 0}
                                {stats?.active_now ? <span className="w-3 h-3 bg-emerald-500 rounded-full animate-ping"></span> : null}
                            </h3>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Activity className="w-6 h-6" />
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-purple-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">System Hours</p>
                            <h3 className="text-4xl font-black text-slate-900">
                                {stats?.total_hours || 0} <span className="text-lg font-bold text-slate-400">hrs</span>
                            </h3>
                        </div>
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Clock className="w-6 h-6" />
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-amber-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Projected Equivalent Value</p>
                            <h3 className="text-3xl font-black text-slate-900 truncate max-w-[150px]">
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
                <motion.div variants={itemVariants} className="lg:col-span-1 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full max-h-[600px]">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 tracking-tight">
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
                                        <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-black rounded-lg border border-slate-200 shrink-0">
                                            {dept.student_count} Workers
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </motion.div>

                {/* RIGHT: Live Activity Feed */}
                <motion.div variants={itemVariants} className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full max-h-[600px]">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 tracking-tight">
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
                                            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center font-black border border-slate-200 shadow-inner group-hover:scale-105 transition-transform">
                                                {record.user?.name?.charAt(0) || '?'}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-black text-slate-900 leading-tight group-hover:text-blue-700 transition-colors">
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
        </div>
    );
};

export default SuperAdminDashboard;