import { useState, useEffect, useMemo, useCallback } from 'react';
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
    X,
    PenLine,
    Search,
    UserCircle,
} from 'lucide-react';
import TimesheetPrintView from './TimesheetPrintView';
import { formatYearLevel, homeDepartment } from '../utils/studentAssignment';

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
    status: string; 
    check_in_method?: 'passcode' | 'qr' | null;
    user: {
        id?: number;
        name: string;
        profile?: {
            assigned_office?: string;
            student_id_number?: string;
            course?: string | null;
            year_level?: string | number | null;
        } | null;
        deleted_at?: string | null;
    } | null;
    account_deleted?: boolean;
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
    work_type: string | null;
    attendance_type?: string | null;
    check_in_method?: 'passcode' | 'qr' | null;
    task_description: string | null;
    status?: string | null;
}

interface AttendanceMonitorProps {
    userRole?: string | null;
}

const isWspoOffice = (office?: string | null) => {
    const key = (office || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return key === 'wspo' || key === 'workingstudentsprogramoffice' || key === 'wspooffice';
};

const AttendanceMonitor = ({ userRole }: AttendanceMonitorProps) => {
    const canApprove = userRole === 'Supervisor';
    const canApproveWspoStudents = userRole === 'WSPO Staff';
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
    const [dtrPenaltyHours, setDtrPenaltyHours] = useState(0);
    const [dtrStudentName, setDtrStudentName] = useState('');
    const [dtrAccountDeleted, setDtrAccountDeleted] = useState(false);
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
    
    // Manual Edit State
    const [manualDate, setManualDate] = useState(filterDate);
    const [manualTimeIn, setManualTimeIn] = useState('');
    const [manualTimeOut, setManualTimeOut] = useState('');
    const [manualNote, setManualNote] = useState('');
    const [manualEditingId, setManualEditingId] = useState<number | null>(null);
    const [manualSaving, setManualSaving] = useState(false);
    
    const { start: dtrStart, end: dtrEnd } = monthBounds(dtrMonth);

    const fetchAttendance = useCallback((date: string) => {
        return axios.get(`/api/attendance?date=${date}`)
            .then((response) => {
                setRecords(response.data);
            })
            .catch((error) => {
                console.error("Failed to fetch attendance records", error);
                setToastMsg({ text: "Failed to load attendance records.", type: 'error' });
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    useEffect(() => {
        fetchAttendance(filterDate);
    }, [filterDate, fetchAttendance]);

    useEffect(() => {
        if (!canViewStudentDtr) return;
        axios.get('/api/personnel')
            .then((response) => {
                const list = Array.isArray(response.data) ? response.data : [];
                setStudents(list);
            })
            .catch((error) => {
                console.error('Failed to load students for DTR', error);
            });
    }, [canViewStudentDtr]);

    useEffect(() => {
        if (!canViewStudentDtr || !selectedStudentId) return;
        const loadStudentDtr = async () => {
            setDtrLoading(true);
            try {
                const response = await axios.get(`/api/attendance/student/${selectedStudentId}`, {
                    params: { start: dtrStart, end: dtrEnd },
                });
                const payload = response.data;
                const student = payload.student;
                setDtrHistory(Array.isArray(payload.history) ? payload.history : []);
                setDtrPenaltyHours(Number(payload.duty_deduction_hours || 0));
                setDtrStudentName(student?.name || 'Student');
                setDtrAccountDeleted(Boolean(student?.account_deleted));
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

    const handleDecision = async (id: number, status: 'accepted' | 'rejected') => {
        try {
            await axios.patch(`/api/attendance/${id}/approve`, { status });
            setToastMsg({ text: status === 'accepted' ? 'Hours approved by supervisor.' : 'Hours rejected by supervisor.', type: 'success' });
            setIsLoading(true);
            fetchAttendance(filterDate);
            setDtrReloadKey((key) => key + 1);
        } catch (error) {
            console.error(error);
            const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
            setToastMsg({ text: message || 'Failed to update the timesheet.', type: 'error' });
        }
        setTimeout(() => setToastMsg(null), 3000);
    };

    const formatTime = (timeString: string | null) => {
        if (!timeString) return '--:--';
        return new Date(timeString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatHours = (hours: number | string | null | undefined) => {
        if (!hours) return '0.00';
        return Number(hours).toFixed(2);
    };

    const clockValue = (value: string) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return `${padMonth(date.getHours())}:${padMonth(date.getMinutes())}`;
    };

    const dateValue = (value: string) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return `${date.getFullYear()}-${padMonth(date.getMonth() + 1)}-${padMonth(date.getDate())}`;
    };

    const resetManualForm = () => {
        setManualEditingId(null);
        setManualTimeIn('');
        setManualTimeOut('');
        setManualNote('');
        setManualDate(filterDate);
    };

    const beginManualEdit = (log: StudentDtrLog) => {
        setManualEditingId(log.id);
        setManualDate(log.time_in ? dateValue(log.time_in) : filterDate);
        setManualTimeIn(log.time_in ? clockValue(log.time_in) : '');
        setManualTimeOut(log.time_out ? clockValue(log.time_out) : '');
        setManualNote(log.task_description || '');
        document.getElementById('manual-dtr-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const saveManualTimes = async () => {
        if (!canApprove || !selectedStudentId) return;
        if (!manualDate || !manualTimeIn || !manualTimeOut) {
            setToastMsg({ text: 'Enter the date, time in, and time out.', type: 'error' });
            setTimeout(() => setToastMsg(null), 3000);
            return;
        }

        setManualSaving(true);
        try {
            const payload = {
                user_id: Number(selectedStudentId),
                date: manualDate,
                time_in: manualTimeIn,
                time_out: manualTimeOut,
                task_description: manualNote,
            };
            const response = manualEditingId
                ? await axios.patch(`/api/attendance/${manualEditingId}/times`, payload)
                : await axios.post('/api/attendance/manual', payload);
            setToastMsg({ text: response.data?.message || 'Times saved on the DTR.', type: 'success' });
            resetManualForm();
            setIsLoading(true);
            fetchAttendance(filterDate);
            setDtrReloadKey((key) => key + 1);
        } catch (error) {
            const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
            setToastMsg({ text: message || 'Failed to save the times.', type: 'error' });
        } finally {
            setManualSaving(false);
            setTimeout(() => setToastMsg(null), 3000);
        }
    };

    const hoursFor = (log: StudentDtrLog) => Number(log.computed_hours || log.rendered_hours || 0);
    const shownHistory = selectedStudentId ? dtrHistory : [];
    const shownPenaltyHours = selectedStudentId ? dtrPenaltyHours : 0;
    const shownAccountDeleted = Boolean(selectedStudentId) && dtrAccountDeleted;
    const dtrTotalHours = shownHistory.reduce((sum, log) => sum + hoursFor(log), 0);
    const selectedHomeDepartment = homeDepartment(dtrProfile.course, dtrProfile.assigned_office);
    const selectedYearLabel = formatYearLevel(dtrProfile.year_level);

    const filteredStudents = useMemo(() => {
        const term = studentSearch.trim().toLowerCase();
        if (!term) return students;
        return students.filter((student) => {
            const home = homeDepartment(student.profile?.course, student.profile?.assigned_office);
            const haystack = [
                student.name,
                student.profile?.student_id_number,
                student.profile?.assigned_office,
                student.profile?.course,
                student.profile?.year_level,
                home?.shortName,
                home?.fullName,
            ].join(' ').toLowerCase();
            return haystack.includes(term);
        });
    }, [students, studentSearch]);

    if (
        canViewStudentDtr
        && filteredStudents.length > 0
        && !filteredStudents.some((student) => String(student.id) === selectedStudentId)
    ) {
        setSelectedStudentId(String(filteredStudents[0].id));
    }

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
        show: { opacity: 1, transition: { staggerChildren: 0.05 } }
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
                    history={shownHistory}
                    totalHours={dtrTotalHours}
                    penaltyHours={shownPenaltyHours}
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
                            ? 'See the working students in your department, enter time in and time out on their DTR, and accept or reject hours.'
                            : canApproveWspoStudents
                                ? 'Review campus timesheets. For working students assigned to WSPO, accept or reject hours after they time out.'
                                : 'Review daily timesheets and open the official monthly DTR for any working student to view or print.'}
                    </p>
                </div>

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
                            onChange={(e) => {
                                setIsLoading(true);
                                setFilterDate(e.target.value);
                            }}
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
                            toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'
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

            {/* MAIN ATTENDANCE TABLE */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative">
                
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
                                records.map((record) => {
                                    const studentName = record.user?.name || 'Unknown student';
                                    const studentId = record.user?.id;
                                    const accountDeleted = Boolean(record.account_deleted || record.user?.deleted_at);
                                    const homeCollege = homeDepartment(record.user?.profile?.course, record.user?.profile?.assigned_office);
                                    const yearLabel = formatYearLevel(record.user?.profile?.year_level);
                                    
                                    return (
                                    <motion.tr 
                                        variants={rowVariants} 
                                        key={record.id} 
                                        className="hover:bg-slate-50 transition-colors duration-200 group"
                                    >
                                        {/* Student Worker Column */}
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black shrink-0 border border-blue-100 shadow-inner">
                                                    {studentName.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                                        {studentName}
                                                    </p>
                                                    {accountDeleted && (
                                                        <span className="mt-1 inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                                            Account deleted
                                                        </span>
                                                    )}
                                                    {(yearLabel || homeCollege) && (
                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                            {yearLabel && (
                                                                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                                                                    {yearLabel}
                                                                </span>
                                                            )}
                                                            {homeCollege && (
                                                                <span
                                                                    title={`Originally from ${homeCollege.fullName}, assigned to this office.`}
                                                                    className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200"
                                                                >
                                                                    From {homeCollege.shortName}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <p className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                                                        <User className="w-3 h-3 text-slate-400" /> {record.user?.profile?.student_id_number || 'No ID'}
                                                    </p>
                                                    {canViewStudentDtr && studentId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openStudentDtr(studentId, record.time_in)}
                                                            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
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
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-widest border border-slate-200">
                                                    {record.work_type || 'Assigned Duty'}
                                                </span>
                                                {record.check_in_method && (
                                                    <span className="ml-1.5 inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 uppercase tracking-widest border border-indigo-200">
                                                        {record.check_in_method === 'qr' ? 'QR Code' : 'Passcode'}
                                                    </span>
                                                )}
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
                                                <div className="text-sm font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 font-mono shadow-sm">
                                                    {formatHours(record.rendered_hours)} <span className="text-xs text-slate-500 font-bold font-sans">hrs</span>
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
                                                ) : (canApprove || (canApproveWspoStudents && isWspoOffice(record.user?.profile?.assigned_office))) ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => handleDecision(record.id, 'accepted')}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all hover:scale-105 active:scale-95"
                                                        >
                                                            <Check className="w-4 h-4" /> Accept
                                                        </button>
                                                        <button
                                                            onClick={() => handleDecision(record.id, 'rejected')}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold shadow-sm transition-all hover:scale-105 active:scale-95"
                                                        >
                                                            <X className="w-4 h-4" /> Reject
                                                        </button>
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
                                    );
                                })
                            )}
                        </motion.tbody>
                    </table>
                </div>
            </div>

            {/* STUDENT DTR PANEL */}
            {canViewStudentDtr && (
                <div id="student-dtr-panel" className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden mt-10">
                    
                    {/* Panel Header & Controls */}
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                                <CalendarRange className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">Student Daily Time Record</h3>
                                <p className="text-xs font-medium text-slate-500 mt-0.5">
                                    {canApprove
                                        ? 'Select a student to view their DTR, enter manual overrides, or generate official printouts.'
                                        : 'Select any working student and month to view or print their official WSPO DTR.'}
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                            {/* Search Student Input */}
                            <div className="relative flex-1 min-w-50">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="search"
                                    value={studentSearch}
                                    onChange={(e) => setStudentSearch(e.target.value)}
                                    placeholder="Search student or ID..."
                                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 transition-shadow"
                                />
                            </div>
                            
                            {/* Select Student Dropdown */}
                            <select
                                value={selectedStudentId}
                                onChange={(e) => setSelectedStudentId(e.target.value)}
                                className="flex-1 min-w-50 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 appearance-none cursor-pointer"
                            >
                                {filteredStudents.length === 0 ? (
                                    <option value="">No students found</option>
                                ) : (
                                    filteredStudents.map((student) => (
                                        <option key={student.id} value={student.id}>
                                            {student.name} {student.profile?.student_id_number ? `(${student.profile.student_id_number})` : ''}
                                        </option>
                                    ))
                                )}
                            </select>
                            
                            {/* Month Picker */}
                            <input
                                type="month"
                                value={dtrMonth}
                                onChange={(e) => setDtrMonth(e.target.value)}
                                className="w-auto px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
                            />
                            
                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDtrPreviewOpen(true)}
                                    disabled={!selectedStudentId}
                                    className="px-4 py-2.5 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 border border-slate-200 text-sm font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2"
                                >
                                    <Eye className="w-4 h-4" /> View DTR
                                </button>
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    disabled={!selectedStudentId}
                                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2"
                                >
                                    <Printer className="w-4 h-4" /> Print DTR
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Selected Student Mini-Profile */}
                    <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-white relative">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center text-slate-500 shadow-sm shrink-0">
                                <UserCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                                    {dtrStudentName || 'Select a student'}
                                    {shownAccountDeleted && (
                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                                            Account Deleted
                                        </span>
                                    )}
                                </h4>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className="text-xs font-bold text-slate-500 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                        {dtrProfile.student_id_number || 'N/A'}
                                    </span>
                                    <span className="text-xs font-bold text-slate-600">
                                        {dtrProfile.assigned_office || 'Unassigned Office'}
                                    </span>
                                    {selectedYearLabel && (
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                            {selectedYearLabel}
                                        </span>
                                    )}
                                    {selectedHomeDepartment && (
                                        <span
                                            title={`Originally from ${selectedHomeDepartment.fullName}, assigned to this office.`}
                                            className="text-[10px] font-bold uppercase tracking-widest text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"
                                        >
                                            From {selectedHomeDepartment.shortName}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        {dtrLoading && (
                            <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                                <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                <span className="text-xs font-bold uppercase tracking-widest">Loading DTR</span>
                            </div>
                        )}
                    </div>

                    {/* Manual DTR Override Form */}
                    {canApprove && (
                        <div className="px-6 py-5 border-b border-indigo-100 bg-indigo-50/30">
                            <h4 className="text-xs font-black text-indigo-700 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                <PenLine className="w-4 h-4" /> Manual Timesheet Override
                            </h4>
                            <form
                                id="manual-dtr-form"
                                onSubmit={(event) => { event.preventDefault(); saveManualTimes(); }}
                                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end"
                            >
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Date</label>
                                    <input
                                        type="date"
                                        value={manualDate}
                                        onChange={(event) => setManualDate(event.target.value)}
                                        required
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Time In</label>
                                    <input
                                        type="time"
                                        value={manualTimeIn}
                                        onChange={(event) => setManualTimeIn(event.target.value)}
                                        required
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Time Out</label>
                                    <input
                                        type="time"
                                        value={manualTimeOut}
                                        onChange={(event) => setManualTimeOut(event.target.value)}
                                        required
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm transition-all"
                                    />
                                </div>
                                <div className="md:col-span-2 flex gap-3">
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Duty Note (Optional)</label>
                                        <input
                                            type="text"
                                            value={manualNote}
                                            onChange={(event) => setManualNote(event.target.value)}
                                            placeholder="e.g. System glitch, forgot to logout"
                                            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm transition-all"
                                        />
                                    </div>
                                    <div className="flex flex-col justify-end">
                                        <button
                                            type="submit"
                                            disabled={manualSaving || !selectedStudentId}
                                            className="h-10.5 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                                        >
                                            {manualSaving ? 'Saving...' : manualEditingId ? 'Update' : 'Save'}
                                        </button>
                                    </div>
                                    {manualEditingId && (
                                        <div className="flex flex-col justify-end">
                                            <button
                                                type="button"
                                                onClick={resetManualForm}
                                                className="h-10.5 px-4 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-sm font-bold rounded-xl transition-all"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </form>
                            <p className="mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> 
                                {manualEditingId ? 'Updating replaces previous times and resets status to pending.' : 'Manual overrides are logged for audit purposes.'}
                            </p>
                        </div>
                    )}

                    {/* DTR Table View */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-6 py-3.5 font-bold uppercase tracking-wider text-[11px] text-slate-500">Date</th>
                                    <th className="px-6 py-3.5 text-center font-bold uppercase tracking-wider text-[11px] text-slate-500">Time In</th>
                                    <th className="px-6 py-3.5 text-center font-bold uppercase tracking-wider text-[11px] text-slate-500">Time Out</th>
                                    <th className="px-6 py-3.5 font-bold uppercase tracking-wider text-[11px] text-slate-500">Duty Details</th>
                                    <th className="px-6 py-3.5 text-center font-bold uppercase tracking-wider text-[11px] text-slate-500">Status</th>
                                    <th className="px-6 py-3.5 text-right font-bold uppercase tracking-wider text-[11px] text-slate-500">Hours</th>
                                    {canApprove && <th className="px-6 py-3.5 text-right font-bold uppercase tracking-wider text-[11px] text-slate-500">Action</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {shownHistory.length === 0 ? (
                                    <tr>
                                        <td colSpan={canApprove ? 7 : 6} className="px-6 py-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center">
                                                <Calendar className="w-10 h-10 mb-3 opacity-20" />
                                                <span className="font-bold text-slate-600">{selectedStudentId ? 'No DTR records found for this period.' : 'Choose a student to view their DTR.'}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    shownHistory.map((log) => (
                                        <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-6 py-4 font-bold text-slate-900 whitespace-nowrap">
                                                {log.time_in ? new Date(log.time_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono font-medium text-slate-700">
                                                {log.time_in ? new Date(log.time_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '--:--'}
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono font-medium text-slate-700">
                                                {log.time_out ? new Date(log.time_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '--:--'}
                                            </td>
                                            <td className="px-6 py-4 text-slate-700">
                                                <div className="font-bold text-xs">{log.work_type || log.attendance_type || 'Regular Duty'}</div>
                                                {log.check_in_method && (
                                                    <div className="mt-1 inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border border-slate-200 bg-slate-100 text-slate-500">
                                                        {log.check_in_method === 'qr' ? 'QR Code' : 'Passcode'}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
                                                    ['approved', 'accepted'].includes(String(log.status).toLowerCase()) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                                    String(log.status).toLowerCase() === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : 
                                                    'bg-amber-50 text-amber-700 border-amber-200'
                                                }`}>
                                                    {['approved', 'accepted'].includes(String(log.status).toLowerCase()) ? 'Accepted' : String(log.status).toLowerCase() === 'rejected' ? 'Rejected' : (log.time_out ? 'Pending' : 'Timed in')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-black font-mono text-slate-900 text-base">
                                                {hoursFor(log).toFixed(2)}
                                            </td>
                                            {canApprove && (
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => beginManualEdit(log)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-colors"
                                                    >
                                                        <PenLine className="w-3.5 h-3.5" />
                                                        Edit
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-100 border-t border-slate-200">
                                    <td colSpan={5} className="px-6 py-4 text-right font-black uppercase tracking-widest text-xs text-slate-600">Total Validated Hours</td>
                                    <td className="px-6 py-4 text-right font-black font-mono text-indigo-700 text-lg bg-indigo-50/50">
                                        {dtrTotalHours.toFixed(2)}
                                    </td>
                                    {canApprove && <td className="bg-indigo-50/50" />}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>

        {/* PRINT / VIEW DTR MODAL */}
        {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
            {canViewStudentDtr && dtrPreviewOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden"
                    onClick={() => setDtrPreviewOpen(false)}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-4 shrink-0 sticky top-0 z-10">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2 tracking-tight">
                                    <FileBox className="w-5 h-5 text-indigo-600" /> Official DTR Preview
                                </h3>
                                <p className="text-xs font-bold text-slate-500 mt-1">
                                    {dtrStudentName} • {dtrProfile.student_id_number}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
                                >
                                    <Printer className="w-4 h-4" /> Print Document
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDtrPreviewOpen(false)}
                                    className="p-2.5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="overflow-y-auto bg-slate-200/50 p-6 custom-scrollbar flex-1">
                            {dtrLoading ? (
                                <div className="flex flex-col items-center justify-center h-64 text-indigo-600">
                                    <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                                    <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Generating Document...</p>
                                </div>
                            ) : (
                                <div className="bg-white shadow-lg mx-auto w-fit max-w-full rounded-lg overflow-hidden border border-slate-200">
                                    <TimesheetPrintView
                                        fullName={dtrStudentName}
                                        studentProfile={dtrProfile}
                                        history={shownHistory}
                                        totalHours={dtrTotalHours}
                                        penaltyHours={shownPenaltyHours}
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