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
    FileBox
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

    // Framer Motion Variants
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const rowVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
    };

    return (
        <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8 font-sans">
            
            {/* Header & Filters */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        Attendance Monitor
                    </h1>
                    <p className="mt-1 text-slate-500 font-medium">
                        Review and approve daily timesheets for student workers.
                    </p>
                </div>

                {/* Date Picker Filter */}
                <div className="flex flex-col">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                        Filter by Date
                    </label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <Calendar className="h-5 w-5 text-blue-600 group-hover:text-blue-700 transition-colors" />
                        </div>
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="block w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all shadow-sm hover:shadow-md cursor-pointer"
                        />
                    </div>
                </div>
            </div>

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
                        <span className={`text-sm font-semibold ${toastMsg.type === 'success' ? 'text-emerald-800' : 'text-red-800'}`}>
                            {toastMsg.text}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Table Container */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
                
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
                                            <p className="text-sm">There are no attendance logs for {new Date(filterDate).toLocaleDateString()}.</p>
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
                                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">
                                                    {record.user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                                        {record.user.name}
                                                    </p>
                                                    <p className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                                                        <User className="w-3 h-3" /> {record.user.profile.student_id_number}
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
                                            <div className="mt-1">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-wide">
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
                                                <div className="text-sm font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-lg">
                                                    {formatHours(record.rendered_hours)} <span className="text-xs text-slate-500 font-bold">hrs</span>
                                                </div>

                                                {/* Action Button / Status */}
                                                {record.status === 'approved' ? (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold shadow-sm">
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