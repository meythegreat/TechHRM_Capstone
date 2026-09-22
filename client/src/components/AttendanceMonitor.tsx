import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
    ShieldCheck,
    Printer,
    CalendarRange,
    Eye,
    X
} from 'lucide-react';
import TimesheetPrintView from './TimesheetPrintView';

const padMonth = (n: number) => String(n).padStart(2, '0');
const currentYearMonth = () => {
    const today = new Date();
    return `${today.getFullYear()}-${padMonth(today.getMonth() + 1)}`;
};
const monthBounds = (yearMonth: string) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const start = `${yearMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${yearMonth}-${padMonth(lastDay)}`;
    return { start, end };
};

interface AttendanceRecord {
    id: number;
    time_in: string;
    time_out: string | null;
    rendered_hours: number | string | null;
    work_type: string | null;
    task_description: string | null;
    status: string; // pending or approved
    user: {
        id?: number;
        name: string;
        profile?: {
            assigned_office?: string;
            student_id_number?: string;
        } | null;
    }
}

interface StudentOption {
    id: number;
    name: string;
    profile?: {
        assigned_office?: string | null;
        student_id_number?: string | null;
        course?: string | null;
        year_level?: string | number | null;
    } | null;
}

interface StudentDtrLog {
    id: number;
    time_in: string;
    time_out: string | null;
    rendered_hours?: number | string | null;
    computed_hours?: number | string | null;
    work_type?: string | null;
    attendance_type?: string | null;
    task_description?: string | null;
    status?: string | null;
}

interface AttendanceMonitorProps {
    userRole?: string | null;
}

const AttendanceMonitor = ({ userRole }: AttendanceMonitorProps) => {
    const canApprove = userRole === 'Supervisor';
    const canViewStudentDtr = userRole === 'Supervisor' || userRole === 'WSPO Staff' || userRole === 'Super Admin';
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [toastMsg, setToastMsg] = useState<{text: string, type: 'success'|'error'} | null>(null);
    const [students, setStudents] = useState<StudentOption[]>([]);
    const [studentSearch, setStudentSearch] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [dtrMonth, setDtrMonth] = useState(currentYearMonth());
    const [dtrHistory, setDtrHistory] = useState<StudentDtrLog[]>([]);
    const [dtrStudentName, setDtrStudentName] = useState('');
    const [dtrProfile, setDtrProfile] = useState({
        student_id_number: '',
        course: '',
        year_level: '',
        assigned_office: '',
        duty_type: '',
        supervisors: [] as string[],
    });
    const [dtrLoading, setDtrLoading] = useState(false);
    const [dtrPreviewOpen, setDtrPreviewOpen] = useState(false);
    const [dtrReloadKey, setDtrReloadKey] = useState(0);
    const { start: dtrStart, end: dtrEnd } = monthBounds(dtrMonth);

    useEffect(() => {
        fetchAttendance();
    }, [filterDate]);

    useEffect(() => {
        if (!canViewStudentDtr) return;
        axios.get('/api/personnel')
            .then((response) => {
                const list = Array.isArray(response.data) ? response.data : [];
                setStudents(list);
                if (list.length > 0 && !selectedStudentId) {
                    setSelectedStudentId(String(list[0].id));
                }
            })
            .catch((error) => {
                console.error('Failed to load students for DTR', error);
            });
    }, [canViewStudentDtr]);

    useEffect(() => {
        if (!canViewStudentDtr || !selectedStudentId) {
            setDtrHistory([]);
            return;
        }
        const loadStudentDtr = async () => {
            setDtrLoading(true);
            try {
                const response = await axios.get(`/api/attendance/student/${selectedStudentId}`, {
                    params: { start: dtrStart, end: dtrEnd },
                });
                const payload = response.data;
                const student = payload.student;
                setDtrHistory(Array.isArray(payload.history) ? payload.history : []);
                setDtrStudentName(student?.name || 'Student');
                setDtrProfile({
                    student_id_number: student?.profile?.student_id_number || 'Not Assigned',
                    course: student?.profile?.course || 'Not Assigned',
                    year_level: student?.profile?.year_level != null ? String(student.profile.year_level) : 'N/A',
                    assigned_office: student?.profile?.assigned_office || 'Unassigned',
                    duty_type: student?.profile?.duty_type || '',
                    supervisors: Array.isArray(student?.department_supervisors) ? student.department_supervisors : [],
                });
            } catch (error) {
                console.error('Failed to load student DTR', error);
                setToastMsg({ text: 'Failed to load student DTR.', type: 'error' });
                setTimeout(() => setToastMsg(null), 3000);
            } finally {
                setDtrLoading(false);
            }
        };
        loadStudentDtr();
    }, [canViewStudentDtr, selectedStudentId, dtrStart, dtrEnd, dtrReloadKey]);

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

    const handleDecision = async (id: number, status: 'accepted' | 'rejected') => {
        try {
            await axios.patch(`/api/attendance/${id}/approve`, { status });
            setToastMsg({ text: status === 'accepted' ? 'Hours approved by supervisor.' : 'Hours rejected by supervisor.', type: 'success' });
            fetchAttendance();
            setDtrReloadKey((key) => key + 1);
        } catch (error) {
            console.error(error);
            const message = axios.isAxiosError(error)
                ? error.response?.data?.message
                : null;
            setToastMsg({ text: message || 'Failed to update the timesheet.', type: 'error' });
        }
        setTimeout(() => setToastMsg(null), 3000);
    };

    // Helper formatting functions
    const formatTime = (timeString: string | null) => {
        if (!timeString) return '--:--';
        return new Date(timeString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatHours = (hours: number | string | null | undefined) => {
        if (!hours) return '0.00';
        return Number(hours).toFixed(2);
    };

    const hoursFor = (log: StudentDtrLog) => Number(log.computed_hours || log.rendered_hours || 0);
    const dtrTotalHours = dtrHistory.reduce((sum, log) => sum + hoursFor(log), 0);

    const filteredStudents = useMemo(() => {
        const term = studentSearch.trim().toLowerCase();
        if (!term) return students;
        return students.filter((student) => {
            const haystack = [
                student.name,
                student.profile?.student_id_number,
                student.profile?.assigned_office,
            ].join(' ').toLowerCase();
            return haystack.includes(term);
        });
    }, [students, studentSearch]);

    useEffect(() => {
        if (!canViewStudentDtr || filteredStudents.length === 0) return;
        const stillVisible = filteredStudents.some((student) => String(student.id) === selectedStudentId);
        if (!stillVisible) {
            setSelectedStudentId(String(filteredStudents[0].id));
        }
    }, [canViewStudentDtr, filteredStudents, selectedStudentId]);

    const openStudentDtr = (userId?: number, timeIn?: string, preview = true) => {
        if (!canViewStudentDtr || !userId) return;
        setSelectedStudentId(String(userId));
        if (timeIn) {
            const date = new Date(timeIn);
            if (!Number.isNaN(date.getTime())) {
                setDtrMonth(`${date.getFullYear()}-${padMonth(date.getMonth() + 1)}`);
            }
        }
        if (preview) {
            setDtrPreviewOpen(true);
        } else {
            document.getElementById('student-dtr-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
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
        <>
        {canViewStudentDtr && selectedStudentId && (
            <div className="dtr-print-page hidden print:flex" aria-hidden="true">
                <TimesheetPrintView
                    fullName={dtrStudentName}
                    studentProfile={dtrProfile}
                    history={dtrHistory}
                    totalHours={dtrTotalHours}
                    startDate={dtrStart}
                    endDate={dtrEnd}
                />
            </div>
        )}
        <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8 font-sans print:hidden">
            
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
                        {canApprove
                            ? 'See the working students in your department, open each DTR, and accept or reject hours after they time out.'
                            : 'Review daily timesheets and open the official monthly DTR for any working student to view or print.'}
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
                                                    {(record.user.name || '?').charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                                        {record.user.name}
                                                    </p>
                                                    <p className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                                                        <User className="w-3 h-3 text-slate-400" /> {record.user.profile?.student_id_number || 'No ID'}
                                                    </p>
                                                    {canViewStudentDtr && record.user.id && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openStudentDtr(record.user.id, record.time_in)}
                                                            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold uppercase tracking-wider"
                                                        >
                                                            <Eye className="w-3 h-3" />
                                                            View DTR
                                                        </button>
                                                    )}
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
                                                {['approved', 'accepted'].includes(String(record.status).toLowerCase()) ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold shadow-sm">
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        Accepted
                                                    </span>
                                                ) : String(record.status).toLowerCase() === 'rejected' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold shadow-sm">
                                                        <X className="w-4 h-4" />
                                                        Rejected
                                                    </span>
                                                ) : !record.time_out ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-bold shadow-sm">
                                                        <Clock className="w-4 h-4" />
                                                        Awaiting time out
                                                    </span>
                                                ) : canApprove ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <motion.button
                                                            whileHover={{ scale: 1.02 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={() => handleDecision(record.id, 'accepted')}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
                                                        >
                                                            <Check className="w-4 h-4" />
                                                            Accept
                                                        </motion.button>
                                                        <motion.button
                                                            whileHover={{ scale: 1.02 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={() => handleDecision(record.id, 'rejected')}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold shadow-sm transition-colors"
                                                        >
                                                            <X className="w-4 h-4" />
                                                            Reject
                                                        </motion.button>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold shadow-sm">
                                                        <AlertCircle className="w-4 h-4" />
                                                        Awaiting supervisor
                                                    </span>
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

            {canViewStudentDtr && (
                <div id="student-dtr-panel" className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <CalendarRange className="w-5 h-5 text-slate-400" />
                            <div>
                                <h3 className="text-lg font-extrabold text-slate-900">Student Daily Time Record</h3>
                                <p className="text-xs font-medium text-slate-500">
                                    {canApprove
                                        ? 'Working students assigned to your department. Choose one to view or print their official WSPO DTR.'
                                        : 'Select any working student and month to view or print their official WSPO DTR.'}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 w-full xl:w-auto">
                            <input
                                type="search"
                                value={studentSearch}
                                onChange={(e) => setStudentSearch(e.target.value)}
                                placeholder="Search student or ID"
                                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
                            />
                            <select
                                value={selectedStudentId}
                                onChange={(e) => setSelectedStudentId(e.target.value)}
                                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
                            >
                                {filteredStudents.length === 0 ? (
                                    <option value="">No students found</option>
                                ) : (
                                    filteredStudents.map((student) => (
                                        <option key={student.id} value={student.id}>
                                            {student.name}{student.profile?.student_id_number ? ` · ${student.profile.student_id_number}` : ''}
                                        </option>
                                    ))
                                )}
                            </select>
                            <input
                                type="month"
                                value={dtrMonth}
                                onChange={(e) => setDtrMonth(e.target.value)}
                                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
                            />
                            <button
                                type="button"
                                onClick={() => setDtrPreviewOpen(true)}
                                disabled={!selectedStudentId}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-900 border border-slate-200 text-sm font-bold rounded-xl shadow-sm transition-colors"
                            >
                                <Eye className="w-4 h-4" />
                                View DTR
                            </button>
                            <button
                                type="button"
                                onClick={() => window.print()}
                                disabled={!selectedStudentId}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-sm transition-colors"
                            >
                                <Printer className="w-4 h-4" />
                                Print DTR
                            </button>
                        </div>
                    </div>

                    <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-black text-slate-900">{dtrStudentName || 'Select a student'}</p>
                            <p className="text-xs font-medium text-slate-500">
                                {dtrProfile.student_id_number} · {dtrProfile.assigned_office}
                            </p>
                        </div>
                        {dtrLoading && (
                            <span className="text-xs font-bold text-blue-700 animate-pulse">Loading DTR...</span>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-900 text-white">
                                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs">Date</th>
                                    <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">Time In</th>
                                    <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">Time Out</th>
                                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs">Duty</th>
                                    <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">Status</th>
                                    <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-xs">Hours</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dtrHistory.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500 font-medium">
                                            {selectedStudentId ? 'No DTR records found for this period.' : 'Choose a student to view their DTR.'}
                                        </td>
                                    </tr>
                                ) : (
                                    dtrHistory.map((log) => (
                                        <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50">
                                            <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                                                {log.time_in ? new Date(log.time_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-center font-mono text-slate-700">
                                                {log.time_in ? new Date(log.time_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '--:--'}
                                            </td>
                                            <td className="px-4 py-3 text-center font-mono text-slate-700">
                                                {log.time_out ? new Date(log.time_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '--:--'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-700">
                                                {log.work_type || log.attendance_type || 'Regular Duty'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${['approved', 'accepted'].includes(String(log.status).toLowerCase()) ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : String(log.status).toLowerCase() === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                    {['approved', 'accepted'].includes(String(log.status).toLowerCase()) ? 'Accepted' : String(log.status).toLowerCase() === 'rejected' ? 'Rejected' : (log.time_out ? 'Pending' : 'Timed in')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-black font-mono text-slate-900">
                                                {hoursFor(log).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-50 border-t border-slate-200">
                                    <td colSpan={5} className="px-4 py-3 text-right font-black uppercase tracking-wider text-xs text-slate-600">Total Hours</td>
                                    <td className="px-4 py-3 text-right font-black font-mono text-slate-900">{dtrTotalHours.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>

        {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
            {canViewStudentDtr && dtrPreviewOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-80 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 print:hidden"
                    onClick={() => setDtrPreviewOpen(false)}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.98 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
                            <div>
                                <p className="text-sm font-black text-slate-900">Official WSPO DTR</p>
                                <p className="text-xs font-medium text-slate-500">
                                    {dtrStudentName} · {dtrProfile.student_id_number}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl"
                                >
                                    <Printer className="w-4 h-4" />
                                    Print DTR
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDtrPreviewOpen(false)}
                                    className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
                                    aria-label="Close DTR preview"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="overflow-y-auto bg-slate-100 p-4">
                            {dtrLoading ? (
                                <p className="text-center text-sm font-bold text-blue-700 py-16 animate-pulse">Loading DTR...</p>
                            ) : (
                                <div className="bg-white shadow-sm mx-auto w-fit max-w-full">
                                    <TimesheetPrintView
                                        fullName={dtrStudentName}
                                        studentProfile={dtrProfile}
                                        history={dtrHistory}
                                        totalHours={dtrTotalHours}
                                        startDate={dtrStart}
                                        endDate={dtrEnd}
                                    />
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
        )}
        </>
    );
};

export default AttendanceMonitor;