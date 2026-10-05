import StudentOverview from './StudentOverview';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, type Variants } from 'framer-motion';
import { 
    Wallet, 
    TrendingUp, 
    CalendarRange, 
    Clock, 
    FileText, 
    UploadCloud, 
    CheckCircle2, 
    XCircle, 
    AlertCircle, 
    UserCircle, 
    Camera, 
    Check,
    Briefcase,
    ShieldCheck
} from 'lucide-react';

import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import SecureImage from './SecureImage';
import { normalizeFilePath, openSecureFile } from '../utils/secureFile';
import { firstPathSegment, resolveStudentPath } from '../config/routes';
import { REALTIME_EVENT } from '../utils/realtime';
import StudentDisciplinaryBoard from './StudentDisciplinaryBoard';
import StudentAttendanceTerminal from './StudentAttendanceTerminal';
import { StudentCompensationView } from './StudentCompensationView';

interface AttendanceRecord {
    id: number;
    date: string;
    time_in: string;
    time_out: string | null;
    rendered_hours: number | string | null;
    work_type: string | null;
    task_description: string | null;
}

interface ScheduleRecord {
    id: number;
    day: string;
    time: string;
    duty_type: string;
    department: string;
    supervisor: string;
    edit_request_status?: 'none' | 'pending' | 'approved' | 'rejected';
    edit_request_note?: string | null;
}

interface RequirementRecord {
    id: number;
    document_type: string;
    file_path: string;
    status: string;
    remarks: string | null;
    created_at: string;
}

function parseRenderedHours(value: number | string | null | undefined): number {
    if (value == null || value === '') return 0;
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n : 0;
}

interface StudentDashboardProps {
    onLogout: () => void | Promise<void>;
}

const StudentDashboard = ({ onLogout }: StudentDashboardProps) => {
    const location = useLocation();
    const navigate = useNavigate();
    
    const [fullName, setFullName] = useState(localStorage.getItem('user_name') || 'Student');
    const [assignedOffice, setAssignedOffice] = useState(localStorage.getItem('assigned_office') || 'Unassigned');
    const firstName = fullName.split(' ')[0];

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const pathSegment = firstPathSegment(location.pathname);
    const currentPath = resolveStudentPath(pathSegment);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const [avatarPath, setAvatarPath] = useState<string | null>(() => normalizeFilePath(localStorage.getItem('profile_picture')));

    const [studentProfile, setStudentProfile] = useState({
        student_id_number: 'Loading...',
        course: 'Loading...',
        year_level: '...',
        phone_number: 'Loading...',
        assigned_office: 'Loading...',
        supervisors: [] as string[]
    });

    const [history, setHistory] = useState<AttendanceRecord[]>([]);
    const [startDate] = useState('');
    const [endDate] = useState('');
    const [schedule, setSchedule] = useState<ScheduleRecord[]>([]);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedShiftId, setSelectedShiftId] = useState<number | ''>('');
    const [editNote, setEditNote] = useState('');

    const [requirements, setRequirements] = useState<RequirementRecord[]>([]);
    const [docType, setDocType] = useState('Medical Clearance');
    const [uploadFile, setUploadFile] = useState<File | null>(null);

    useEffect(() => {
        if (!localStorage.getItem('auth_token')) return;
        const segment = firstPathSegment(location.pathname);
        if (!segment) {
            navigate('/dashboard', { replace: true });
            return;
        }
        const resolved = resolveStudentPath(segment);
        if (resolved !== segment) {
            navigate(`/${resolved}`, { replace: true });
        }
    }, [location.pathname, navigate]);

    const fetchMyProfile = async () => {
        try {
            const response = await axios.get('/api/user');
            const user = response.data;
            if (user.name) {
                setFullName(user.name);
                localStorage.setItem('user_name', user.name);
            }
            const office = user.profile?.assigned_office || 'Unassigned';
            setAssignedOffice(office);
            if (user.profile?.assigned_office) {
                localStorage.setItem('assigned_office', user.profile.assigned_office);
            }
            setStudentProfile({
                student_id_number: user.profile?.student_id_number || 'Not Assigned',
                course: user.profile?.course || 'Not Assigned',
                year_level: user.profile?.year_level || 'N/A',
                phone_number: user.phone_number || 'No Contact Provided',
                assigned_office: user.profile?.assigned_office || 'Not Assigned',
                supervisors: Array.isArray(user.department_supervisors) ? user.department_supervisors : []
            });
            if (user.profile_picture) {
                const path = normalizeFilePath(user.profile_picture);
                setAvatarPath(path);
                if (path) localStorage.setItem('profile_picture', path);
            }
        } catch (error) {
            console.error("Failed to fetch profile", error);
        }
    };

    const fetchHistory = async () => {
        try {
            const response = await axios.get('/api/attendance/my-history', { params: { start: startDate, end: endDate } });
            const payload = response.data;
            setHistory(Array.isArray(payload) ? payload : (payload.history ?? []));
        } catch (err) { console.error(err); }
    };

    const fetchSchedule = async () => {
        try {
            const response = await axios.get('/api/my-schedule');
            const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
            const sortedSchedules = response.data.sort((a: ScheduleRecord, b: ScheduleRecord) => {
                return daysOfWeek.indexOf(a.day) - daysOfWeek.indexOf(b.day);
            });
            setSchedule(sortedSchedules);
        } catch (err) { console.error(err); }
    };

    const fetchRequirements = async () => {
        try {
            const response = await axios.get('/api/my-requirements');
            setRequirements(response.data);
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        const refresh = () => {
            fetchMyProfile();
            fetchHistory();
            fetchSchedule();
            fetchRequirements();
        };
        refresh();
        const interval = setInterval(refresh, 5000);
        window.addEventListener(REALTIME_EVENT, refresh);
        const onVisible = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, refresh);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [startDate, endDate]);

    const handleRequestEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const response = await axios.post(`/api/my-schedule/${selectedShiftId}/request-edit`, { note: editNote });
            setMessage({ text: response.data.message, type: 'success' });
            setIsEditModalOpen(false);
            setEditNote('');
            setSelectedShiftId('');
            fetchSchedule(); 
        } catch (error: any) {
            setMessage({ text: error.response?.data?.message || 'Failed to send request.', type: 'error' });
        } finally {
            setIsLoading(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleUploadRequirement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile) {
            setMessage({ text: 'Please select a file to upload.', type: 'error' });
            setTimeout(() => setMessage(null), 3000);
            return;
        }

        const formData = new FormData();
        formData.append('document_type', docType);
        formData.append('file', uploadFile);

        setIsLoading(true);
        try {
            const res = await axios.post('/api/requirements/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setMessage({ text: res.data.message, type: 'success' });
            setUploadFile(null);
            (document.getElementById('fileUpload') as HTMLInputElement).value = "";
            fetchRequirements();
        } catch (error: any) {
            setMessage({ text: error.response?.data?.message || 'Failed to upload document.', type: 'error' });
        } finally {
            setIsLoading(false);
            setTimeout(() => setMessage(null), 4000);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('avatar', file);
        setIsLoading(true);
        try {
            const response = await axios.post('/api/user/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            const path = normalizeFilePath(response.data.profile_picture);
            setAvatarPath(path);
            if (path) localStorage.setItem('profile_picture', path);
            setMessage({ text: 'Profile picture updated successfully!', type: 'success' });
        } catch (err: any) {
            setMessage({ text: 'Failed to upload image. Ensure it is under 2MB.', type: 'error' });
        } finally {
            setIsLoading(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const totalRenderedHours = history.reduce((sum, record) => sum + parseRenderedHours(record.rendered_hours), 0);
    const hourlyRate = 28; 
    const estimatedAmount = totalRenderedHours * hourlyRate;
    const requirementsAllVerified = requirements.length > 0 && requirements.every(req => req.status === 'verified');

    const studentNavItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
        { id: 'attendance', label: 'Attendance / DTR', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
        { id: 'assessment', label: 'Assessment', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3v-6m-3 6v-9m6 13H6a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2z" /> },
        { id: 'schedule', label: 'My Schedule', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
        { id: 'requirements', label: 'Requirements', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
        { id: 'disciplinary', label: 'Disciplinary Records', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /> },
        { id: 'settings', label: 'Settings', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></> }
    ];

    // ANIMATION VARIANTS
    const staggerContainer: Variants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };
    const cardVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden font-sans print:h-auto print:overflow-visible print:bg-white">
            <Sidebar 
                isSidebarOpen={isSidebarOpen} 
                setIsSidebarOpen={setIsSidebarOpen} 
                activeTab={currentPath}
                setActiveTab={(path) => navigate(`/${path}`)}
                handleLogout={onLogout}
                navItems={studentNavItems} 
                userRole="Student"
            />

            <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:h-auto">
                <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-6 shrink-0 relative z-50 shadow-sm print:hidden">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                        <h2 className="text-xl font-black text-slate-800 capitalize tracking-tight hidden sm:block">
                            {currentPath.replace('-', ' ')}
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <NotificationBell onNavigate={(path) => navigate(`/${path}`)} />
                        <div className="text-right hidden sm:block">
                            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">{assignedOffice}</p>
                            <p className="text-sm font-extrabold text-slate-900">{fullName}</p>
                        </div>
                        <div className="w-10 h-10 bg-slate-100 border-2 border-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold shadow-sm overflow-hidden group">
                            {avatarPath ? <SecureImage filePath={avatarPath} altText="Nav Avatar" className="w-full h-full object-cover group-hover:scale-110 transition-transform" /> : firstName.charAt(0)}
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 sm:p-0 relative custom-scrollbar print:overflow-visible print:h-auto print:p-0">
                    <div className="max-w-6xl mx-auto space-y-6 sm:p-8">
                        
                        {message && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-xl border font-bold text-sm flex items-center gap-3 shadow-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                                <span>{message.text}</span>
                            </motion.div>
                        )}

                        {/* 1. DASHBOARD */}
                        {currentPath === 'dashboard' && <StudentOverview />}

                        {/* 2. ATTENDANCE LOG */}
                        {currentPath === 'attendance' && <StudentAttendanceTerminal />}

                        {/* 3. ASSESSMENT TAB */}
                        {currentPath === 'assessment' && (
                            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
                                
                                <motion.div 
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
                                >
                                    <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
                                    <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Wallet className="w-5 h-5 text-blue-400" />
                                            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Work-Hour Assessment</span>
                                        </div>
                                        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                                            Assessment
                                        </h1>
                                        <p className="mt-2 text-slate-400 font-medium max-w-md">
                                            Review your estimated earnings and acquired amount based on your approved attendance logs.
                                        </p>
                                    </div>

                                    <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex flex-col items-center sm:items-end text-right">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Rendered Hours</span>
                                        <div className="text-3xl font-black text-white font-mono tracking-tight flex items-center gap-2">
                                            <Clock className="w-6 h-6 text-blue-400" />
                                            {totalRenderedHours.toFixed(2)} <span className="text-sm font-bold text-slate-500">hrs</span>
                                        </div>
                                    </div>
                                </motion.div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <motion.div variants={cardVariants} className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-3xl shadow-lg shadow-blue-900/20 text-white relative overflow-hidden group">
                                        <div className="absolute right-0 top-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
                                        <Clock className="w-8 h-8 text-blue-200 mb-4" />
                                        <p className="text-sm font-bold text-blue-200 uppercase tracking-wider mb-1">Total Hours Rendered</p>
                                        <p className="text-4xl font-black">{totalRenderedHours.toFixed(2)}</p>
                                    </motion.div>
                                    
                                    <motion.div variants={cardVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group">
                                        <div className="absolute right-0 top-0 w-32 h-32 bg-purple-500 opacity-5 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
                                        <TrendingUp className="w-8 h-8 text-purple-500 mb-4" />
                                        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Hourly Rate</p>
                                        <p className="text-4xl font-black text-slate-900">₱{hourlyRate.toFixed(2)}</p>
                                    </motion.div>

                                    <motion.div variants={cardVariants} className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-3xl shadow-lg shadow-emerald-900/20 text-white relative overflow-hidden group">
                                        <div className="absolute right-0 top-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
                                        <Wallet className="w-8 h-8 text-emerald-200 mb-4" />
                                        <p className="text-sm font-bold text-emerald-100 uppercase tracking-wider mb-1">Estimated Earnings</p>
                                        <p className="text-4xl font-black">₱{estimatedAmount.toFixed(2)}</p>
                                    </motion.div>
                                </div>

                                <StudentCompensationView />
                            </motion.div>
                        )}

                        {/* 4. SCHEDULE TAB */}
                        {currentPath === 'schedule' && (
                            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
                                
                                <motion.div 
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
                                >
                                    <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <CalendarRange className="w-5 h-5 text-blue-400" />
                                            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Duty Roster</span>
                                        </div>
                                        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                                            My Schedule
                                        </h1>
                                        <p className="mt-2 text-slate-400 font-medium max-w-md">
                                            Your official assigned duty shifts. Formal edits require WSPO review and approval.
                                        </p>
                                    </div>

                                    <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
                                        <div className="flex flex-col text-center sm:text-right">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Need a change?</span>
                                            <span className="text-sm font-medium text-slate-300">Submit a formal request.</span>
                                        </div>
                                        <button onClick={() => setIsEditModalOpen(true)} disabled={schedule.length === 0} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-blue-900/50 disabled:opacity-50">
                                            Request Edit
                                        </button>
                                    </div>
                                </motion.div>

                                <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200">
                                    {schedule.length === 0 ? (
                                        <div className="py-16 flex flex-col items-center justify-center text-center text-slate-400">
                                            <CalendarRange className="w-16 h-16 mb-4 opacity-20" />
                                            <p className="text-lg font-bold text-slate-600">No shifts assigned yet</p>
                                            <p className="text-sm mt-1">Wait for your department supervisor to finalize your schedule.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {schedule.map((shift) => (
                                                <motion.div variants={cardVariants} key={shift.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl border transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${shift.edit_request_status === 'pending' ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200 hover:border-blue-300'}`}>
                                                    <div className="flex items-center gap-5 mb-4 sm:mb-0">
                                                        <div className="w-16 h-16 rounded-xl bg-blue-50 flex flex-col items-center justify-center text-blue-700 border border-blue-100 shadow-inner">
                                                            <span className="text-sm font-black uppercase tracking-wider">{shift.day.substring(0, 3)}</span>
                                                        </div>
                                                        <div>
                                                            <div className="font-black text-slate-900 text-xl tracking-tight">{shift.time}</div>
                                                            <div className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-0.5">{shift.duty_type}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-start sm:items-end gap-1.5 pl-20 sm:pl-0">
                                                        {shift.edit_request_status === 'pending' && (
                                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider animate-pulse">
                                                                <Clock className="w-3.5 h-3.5" /> Pending Edit
                                                            </span>
                                                        )}
                                                        <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                                                            <Briefcase className="w-4 h-4 text-slate-400" /> {shift.department}
                                                        </div>
                                                        <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                                                            <UserCircle className="w-4 h-4 text-slate-400" /> Supervisor: {shift.supervisor}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* 5. REQUIREMENTS TAB */}
                        {currentPath === 'requirements' && (
                            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
                                
                                <motion.div 
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
                                >
                                    <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <ShieldCheck className="w-5 h-5 text-blue-400" />
                                            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Document Center</span>
                                        </div>
                                        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                                            Requirements
                                        </h1>
                                        <p className="mt-2 text-slate-400 font-medium max-w-md">
                                            Upload your student records securely and track their approval status in real-time.
                                        </p>
                                    </div>

                                    <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${requirementsAllVerified ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'bg-amber-500/20 text-amber-400'}`}>
                                            {requirementsAllVerified ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compliance Status</span>
                                            <span className={`text-sm font-extrabold ${requirementsAllVerified ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {requirementsAllVerified ? 'Fully Compliant' : 'Requirements Pending'}
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>

                                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                                    <motion.div variants={cardVariants} className="xl:col-span-1 bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 h-fit">
                                        <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight">Submit Document</h3>
                                        <form onSubmit={handleUploadRequirement} className="space-y-5">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Document Type</label>
                                                <select 
                                                    value={docType} 
                                                    onChange={(e) => setDocType(e.target.value)}
                                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                                                >
                                                    <option>Medical Clearance</option>
                                                    <option>Parents Consent</option>
                                                    <option>Copy of Grades</option>
                                                    <option>Certificate of Enrollment</option>
                                                    <option>Good Moral Character</option>
                                                </select>
                                            </div>
                                            
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select File</label>
                                                <div className="relative group">
                                                    <div className="absolute inset-0 bg-blue-50 border-2 border-dashed border-blue-200 rounded-xl group-hover:border-blue-400 group-hover:bg-blue-100 transition-colors pointer-events-none flex flex-col items-center justify-center">
                                                        <UploadCloud className="w-6 h-6 text-blue-500 mb-1" />
                                                        <span className="text-xs font-bold text-blue-600">Choose PDF or Image</span>
                                                    </div>
                                                    <input 
                                                        type="file" 
                                                        id="fileUpload"
                                                        accept=".pdf,.jpg,.jpeg,.png"
                                                        onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                                                        className="w-full h-24 opacity-0 cursor-pointer"
                                                    />
                                                </div>
                                                {uploadFile && <p className="text-xs font-bold text-emerald-600 mt-2 flex items-center gap-1"><Check className="w-4 h-4"/> {uploadFile.name}</p>}
                                            </div>
                                            
                                            <button 
                                                type="submit" 
                                                disabled={isLoading || !uploadFile}
                                                className="w-full py-3.5 mt-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isLoading ? 'Uploading...' : 'Upload Document'}
                                            </button>
                                        </form>
                                    </motion.div>

                                    <motion.div variants={cardVariants} className="xl:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                                        <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50">
                                            <h3 className="text-xl font-black text-slate-900 tracking-tight">My Uploaded Requirements</h3>
                                        </div>
                                        <div className="p-0">
                                            {requirements.length === 0 ? (
                                                <div className="p-16 text-center text-slate-400 flex flex-col items-center">
                                                    <FileText className="w-16 h-16 mb-4 opacity-20" />
                                                    <p className="text-lg font-bold text-slate-600">No requirements uploaded yet.</p>
                                                </div>
                                            ) : (
                                                <div className="divide-y divide-slate-100">
                                                    {requirements.map(req => (
                                                        <div key={req.id} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50 transition-colors">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`p-3 rounded-2xl border shadow-sm ${req.status === 'verified' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : req.status === 'rejected' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-amber-50 border-amber-200 text-amber-600'}`}>
                                                                    {req.status === 'verified' ? <CheckCircle2 className="w-6 h-6" /> : req.status === 'rejected' ? <XCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                                                                </div>
                                                                <div>
                                                                    <h4 className="font-bold text-slate-900 text-base">{req.document_type}</h4>
                                                                    <p className="text-xs font-medium text-slate-500 mt-0.5">Uploaded: {new Date(req.created_at).toLocaleDateString()}</p>
                                                                    <button type="button" onClick={() => openSecureFile(req.file_path)} className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-1.5 flex items-center gap-1">
                                                                        <FileText className="w-3.5 h-3.5" /> View Document
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-start sm:items-end w-full sm:w-auto mt-2 sm:mt-0">
                                                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                                                                    req.status === 'verified' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 
                                                                    req.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' : 
                                                                    'bg-amber-100 text-amber-800 border-amber-200'
                                                                }`}>
                                                                    {req.status}
                                                                </span>
                                                                {req.status === 'rejected' && req.remarks && (
                                                                    <p className="text-xs text-red-700 mt-2 font-medium bg-red-50 p-2.5 rounded-xl border border-red-100 max-w-xs leading-relaxed">
                                                                        <span className="font-bold block mb-0.5">Rejection Reason:</span> {req.remarks}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                </div>
                            </motion.div>
                        )}

                        {currentPath === 'disciplinary' && <StudentDisciplinaryBoard />}

                        {/* 7. SETTINGS TAB */}
                        {currentPath === 'settings' && (
                            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
                                
                                <motion.div 
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
                                >
                                    <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-slate-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <UserCircle className="w-5 h-5 text-blue-400" />
                                            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Account Management</span>
                                        </div>
                                        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                                            Profile Settings
                                        </h1>
                                        <p className="mt-2 text-slate-400 font-medium max-w-md">
                                            Manage your personal details, assigned office, and system preferences.
                                        </p>
                                    </div>

                                    <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-400 rounded-full blur-xl mix-blend-multiply opacity-30 animate-pulse group-hover:scale-110 transition-transform"></div>
                                            <ShieldCheck className="w-5 h-5 relative z-10" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Account Security</span>
                                            <span className="text-sm font-extrabold text-blue-400">Protected Account</span>
                                        </div>
                                    </div>
                                </motion.div>

                                <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200">
                                    <div className="flex flex-col md:flex-row gap-10 items-start">
                                        <motion.div variants={cardVariants} className="flex flex-col items-center md:w-1/3 w-full">
                                            <div className="relative group cursor-pointer">
                                                <div className="w-40 h-40 bg-slate-100 rounded-full border-4 border-white shadow-xl flex items-center justify-center overflow-hidden">
                                                    {avatarPath ? <SecureImage filePath={avatarPath} altText="Profile" className="w-full h-full object-cover" /> : <span className="text-slate-400 font-black text-5xl">{firstName.charAt(0)}</span>}
                                                </div>
                                                <label htmlFor="avatarUpload" className="absolute inset-0 bg-slate-900/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer backdrop-blur-sm">
                                                    <Camera className="w-8 h-8 text-white mb-1" />
                                                    <span className="text-white text-xs font-bold uppercase tracking-wider">Update Photo</span>
                                                </label>
                                                <input type="file" id="avatarUpload" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                            </div>
                                            <p className="text-xs text-slate-500 font-medium mt-4 text-center">Allowed formats: JPG, PNG. Max size: 2MB.</p>
                                        </motion.div>
                                        
                                        <motion.div variants={cardVariants} className="flex-1 w-full space-y-6">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                                                    <input type="text" disabled value={fullName} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold opacity-80 cursor-not-allowed" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Student ID Number</label>
                                                    <input type="text" disabled value={studentProfile.student_id_number} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold font-mono opacity-80 cursor-not-allowed" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Course & Year</label>
                                                    <input type="text" disabled value={`${studentProfile.course} - Year ${studentProfile.year_level}`} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold opacity-80 cursor-not-allowed" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Assigned Office</label>
                                                    <input type="text" disabled value={studentProfile.assigned_office} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold opacity-80 cursor-not-allowed" />
                                                    <p className="mt-2 text-xs font-semibold text-indigo-700">
                                                        Supervisor: {studentProfile.supervisors.length > 0 ? studentProfile.supervisors.join(', ') : 'No supervisor assigned'}
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </main>
            </div>

            {/* REQUEST EDIT MODAL */}
            {isEditModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8">
                        <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight">Request Schedule Edit</h3>
                        <form onSubmit={handleRequestEdit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Shift</label>
                                <select required value={selectedShiftId} onChange={(e) => setSelectedShiftId(Number(e.target.value))} className="w-full p-3.5 border border-slate-200 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all appearance-none cursor-pointer">
                                    <option value="" disabled>-- Select a shift --</option>
                                    {schedule.map(shift => <option key={shift.id} value={shift.id}>{shift.day} ({shift.time})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Reason for Edit</label>
                                <textarea required value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Please explain why you need this schedule changed..." className="w-full p-3.5 border border-slate-200 bg-slate-50 rounded-xl font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all h-32 resize-none" />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                                <button type="submit" disabled={isLoading} className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/25 transition-all disabled:opacity-50 flex items-center gap-2">
                                    {isLoading ? 'Sending...' : 'Submit Request'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default StudentDashboard;
