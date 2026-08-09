import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { 
    Calendar, 
    Clock, 
    CheckCircle2, 
    AlertCircle, 
    User,
    Check,
    FileBox,
    ShieldCheck
} from 'lucide-react';

interface AttendanceRecord {
    id: number;
    time_in: string;
    time_out: string | null;
    rendered_hours: number | string | null;
    work_type: string | null;
    task_description: string | null;
    status: string; // pending or approved
    user: {
        name: string;
        profile: {
            assigned_office: string;
            student_id_number: string;
        }
    }
}

const AttendanceMonitor = () => {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [toastMsg, setToastMsg] = useState<{text: string, type: 'success'|'error'} | null>(null);

    useEffect(() => {
        fetchAttendance();
    }, [filterDate]);

    const fetchAttendance = async () => {
        setIsLoading(true);
        try {
            const response = await axios.get(`/api/attendance?date=${filterDate}`);
            setRecords(response.data);
        } catch (error) {
            console.error("Failed to fetch attendance records", error);
            setToastMsg({ text: "Failed to load attendance records.", type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleApprove = async (id: number) => {
        try {
            await axios.patch(`/api/attendance/${id}/approve`);
            setToastMsg({ text: "Hours approved successfully!", type: 'success' });
            fetchAttendance(); // Refresh to show new status
        } catch (error) {
            console.error(error);
            setToastMsg({ text: "Failed to approve hours.", type: 'error' });
        }
        setTimeout(() => setToastMsg(null), 3000);
    };

    // Helper formatting functions
    const formatTime = (timeString: string | null) => {
        if (!timeString) return '--:--';
        return new Date(timeString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatHours = (hours: number | string | null) => {
        if (!hours) return '0.00';
        return Number(hours).toFixed(2);
    };

    // STRICT TYPESCRIPT VARIANTS
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const rowVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8 font-sans">
            
            {/* DARK THEME HEADER - ATTENDANCE MONITOR */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Subtle glowing background effects */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Timesheet Management</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Attendance Monitor
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Review and approve daily timesheets for your assigned student workers to verify their actual rendered hours.
                    </p>
                </div>

                {/* Dark Theme Date Filter Box */}
                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex flex-col items-start sm:items-end w-full md:w-auto">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                        Active Date Filter
                    </label>
                    <div className="relative group w-full">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <Calendar className="h-4 w-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
                        </div>
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="block w-full sm:w-48 pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm font-bold text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all cursor-pointer hover:bg-slate-800"
                        />
                    </div>
                </div>
            </motion.div>

            {/* Animated Toasts */}
            <AnimatePresence>
                {toastMsg && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`p-4 rounded-xl border flex items-center gap-3 shadow-sm ${
                            toastMsg.type === 'success' 
                            ? 'bg-emerald-50 border-emerald-100' 
                            : 'bg-red-50 border-red-100'
                        }`}
                    >
                        {toastMsg.type === 'success' 
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            : <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                        }
                        <span className={`text-sm font-bold ${toastMsg.type === 'success' ? 'text-emerald-800' : 'text-red-800'}`}>
                            {toastMsg.text}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Table Container */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative">
                
                {/* Loading Overlay */}
                {isLoading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                            <span className="text-sm font-bold text-blue-700 animate-pulse">Loading records...</span>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200">
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Student Worker</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Shift Details</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Task Description</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider text-right">Approval Status</th>
                            </tr>
                        </thead>
                        
                        <motion.tbody 
                            variants={containerVariants}
                            initial="hidden"
                            animate={!isLoading ? "show" : "hidden"}
                            className="divide-y divide-slate-100"
                        >
                            {!isLoading && records.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-400">
                                            <FileBox className="w-12 h-12 mb-3 opacity-20" />
                                            <p className="text-base font-semibold text-slate-600">No records found</p>
                                            <p className="text-sm font-medium">There are no attendance logs for {new Date(filterDate).toLocaleDateString()}.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                records.map((record) => (
                                    <motion.tr 
                                        variants={rowVariants} 
                                        key={record.id} 
                                        className="hover:bg-slate-50 transition-colors duration-200 group"
                                    >
                                        {/* Student Worker Column */}
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black shrink-0 border border-blue-100 shadow-inner">
                                                    {record.user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                                        {record.user.name}
                                                    </p>
                                                    <p className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                                                        <User className="w-3 h-3 text-slate-400" /> {record.user.profile.student_id_number}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Shift Details Column */}
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-2 text-sm text-slate-900 font-bold">
                                                <Clock className="w-4 h-4 text-blue-500" />
                                                {formatTime(record.time_in)} — {formatTime(record.time_out)}
                                            </div>
                                            <div className="mt-1.5">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-widest">
                                                    {record.work_type || 'Assigned Duty'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Task Description Column */}
                                        <td className="px-6 py-5 align-top max-w-xs">
                                            <p className="text-sm text-slate-600 font-medium truncate group-hover:whitespace-normal group-hover:text-clip transition-all duration-300">
                                                {record.task_description || <span className="italic text-slate-400">No task description provided</span>}
                                            </p>
                                        </td>

                                        {/* Approval Status Column */}
                                        <td className="px-6 py-5 align-top text-right">
                                            <div className="flex flex-col items-end gap-2">
                                                {/* Total Hours Badge */}
                                                <div className="text-sm font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                                                    {formatHours(record.rendered_hours)} <span className="text-xs text-slate-500 font-bold">hrs</span>
                                                </div>

                                                {/* Action Button / Status */}
                                                {record.status === 'approved' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold shadow-sm">
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        APPROVED
                                                    </span>
                                                ) : (
                                                    <motion.button 
                                                        whileHover={{ scale: 1.02 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => handleApprove(record.id)}
                                                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-sm shadow-amber-500/20 transition-colors"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                        Approve
                                                    </motion.button>
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </motion.tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AttendanceMonitor;