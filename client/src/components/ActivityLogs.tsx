import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { 
    Activity, 
    ShieldAlert, 
    Terminal, 
    Globe, 
    Clock, 
    User, 
    ChevronLeft, 
    ChevronRight,
    Search
} from 'lucide-react';

interface LogRecord {
    id: number;
    admin_id: number;
    admin_name: string;
    action: string;
    description: string;
    ip_address: string;
    created_at: string;
}

const ActivityLogs = () => {
    const [logs, setLogs] = useState<LogRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        fetchLogs(currentPage);
    }, [currentPage]);

    const fetchLogs = async (page: number) => {
        setIsLoading(true);
        try {
            const response = await axios.get(`/api/logs?page=${page}`);
            setLogs(response.data.data); 
            setCurrentPage(response.data.current_page);
            setTotalPages(response.data.last_page);
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to dynamically color-code actions
    const getActionBadge = (action: string) => {
        const act = action.toLowerCase();
        const baseStyle = "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border";
        
        if (act.includes('login') || act.includes('logout')) 
            return `${baseStyle} bg-purple-50 text-purple-700 border-purple-200`;
        if (act.includes('create') || act.includes('add') || act.includes('assign') || act.includes('issue')) 
            return `${baseStyle} bg-emerald-50 text-emerald-700 border-emerald-200`;
        if (act.includes('update') || act.includes('edit') || act.includes('approve') || act.includes('resolve')) 
            return `${baseStyle} bg-blue-50 text-blue-700 border-blue-200`;
        if (act.includes('delete') || act.includes('remove') || act.includes('reject')) 
            return `${baseStyle} bg-red-50 text-red-700 border-red-200`;
            
        return `${baseStyle} bg-slate-50 text-slate-600 border-slate-200`;
    };

    // STRICT TYPESCRIPT VARIANTS
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.05 } }
    };

    const rowVariants: Variants = {
        hidden: { opacity: 0, x: -10 },
        show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
            
            {/* DARK THEME HEADER - AUDIT COMMAND CENTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Glowing Orbs */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <Terminal className="w-5 h-5 text-indigo-400" />
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">System Security</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        System Audit Trail
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Real-time immutable monitoring of all administrative and system-level activities.
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                        <ShieldAlert className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tracking Status</span>
                        <span className="text-sm font-extrabold text-emerald-400">
                            Active Monitoring
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* MAIN TABLE */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative">
                
                {/* Loading Overlay */}
                {isLoading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                            <span className="text-sm font-bold text-indigo-700 animate-pulse">Scanning records...</span>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200">
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-400 uppercase tracking-wider w-24">Log ID</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Administrator</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Action</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-1/3">Description</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider text-right">Technical Details</th>
                            </tr>
                        </thead>
                        <motion.tbody 
                            variants={containerVariants}
                            initial="hidden"
                            animate={!isLoading ? "show" : "hidden"}
                            className="divide-y divide-slate-100"
                        >
                            {!isLoading && logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                                        <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="text-base font-semibold text-slate-600">No activity logs found</p>
                                        <p className="text-sm font-medium">System activity will appear here.</p>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <motion.tr variants={rowVariants} key={log.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-5 align-top">
                                            <span className="text-xs font-bold text-slate-400 font-mono">#{String(log.id).padStart(5, '0')}</span>
                                        </td>
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-100">
                                                    {log.admin_name.charAt(0)}
                                                </div>
                                                <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                                                    {log.admin_name}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 align-top">
                                            <span className={getActionBadge(log.action)}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 align-top">
                                            <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                                {log.description}
                                            </p>
                                        </td>
                                        <td className="px-6 py-5 align-top text-right">
                                            <div className="flex flex-col items-end gap-1.5">
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
                                                    <Globe className="w-3 h-3 text-slate-400" /> {log.ip_address}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                                                    <Clock className="w-3 h-3" /> {new Date(log.created_at).toLocaleString()}
                                                </div>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </motion.tbody>
                    </table>
                </div>

                {/* PREMIUM PAGINATION FOOTER */}
                {!isLoading && logs.length > 0 && (
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <span className="text-sm text-slate-500 font-medium">
                            Showing page <span className="font-bold text-slate-900">{currentPage}</span> of <span className="font-bold text-slate-900">{totalPages}</span>
                        </span>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-1"
                            >
                                <ChevronLeft className="w-4 h-4" /> Prev
                            </button>
                            <button 
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-1"
                            >
                                Next <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivityLogs;