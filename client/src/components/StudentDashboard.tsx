import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './Sidebar'; 
import NotificationBell from './NotificationBell';
import TimesheetPrintView from './TimesheetPrintView';
import SecureImage from './SecureImage.tsx';
import { normalizeFilePath, openSecureFile } from '../utils/secureFile';
import { firstPathSegment, resolveStudentPath } from '../config/routes';
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

// NEW: Requirement Interface
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

function formatRenderedHoursCell(value: number | string | null | undefined): string {
    if (value == null || value === '') return '--';
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n.toFixed(2) : '--';
}

interface StudentDashboardProps {
    onLogout: () => void | Promise<void>;
}

const StudentDashboard = ({ onLogout }: StudentDashboardProps) => {
    const location = useLocation();
    const navigate = useNavigate();
    // --- USER DATA ---
    const [fullName, setFullName] = useState(localStorage.getItem('user_name') || 'Student');
    const assignedOffice = localStorage.getItem('assigned_office') || 'Unassigned';
    const firstName = fullName.split(' ')[0];

    // --- UI STATE ---
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const pathSegment = firstPathSegment(location.pathname);
    const currentPath = resolveStudentPath(pathSegment);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // --- FEATURE STATE ---
    const [avatarPath, setAvatarPath] = useState<string | null>(() => normalizeFilePath(localStorage.getItem('profile_picture')));

    const [studentProfile, setStudentProfile] = useState({
        student_id_number: 'Loading...',
        course: 'Loading...',
        year_level: '...',
        phone_number: 'Loading...',
        assigned_office: 'Loading...'
    });

    // --- ATTENDANCE & SCHEDULE STATE ---
    const [history, setHistory] = useState<AttendanceRecord[]>([]);
    const [workType, setWorkType] = useState('Clerical Work');
    const [taskDescription, setTaskDescription] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const isClockedIn = history.length > 0 && history[0].time_out === null;
    const [schedule, setSchedule] = useState<ScheduleRecord[]>([]);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedShiftId, setSelectedShiftId] = useState<number | ''>('');
    const [editNote, setEditNote] = useState('');

    // --- NEW: REQUIREMENT STATE ---
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

    useEffect(() => {
        const fetchMyProfile = async () => {
            try {
                const response = await axios.get('/api/user');
                const user = response.data;

                // --- NEW: Force the real legal name from the database! ---
                if (user.name) {
                    setFullName(user.name);
                    localStorage.setItem('user_name', user.name); // Fixes the local storage bug too!
                }

                setStudentProfile({
                    student_id_number: user.profile?.student_id_number || 'Not Assigned',
                    course: user.profile?.course || 'Not Assigned',
                    year_level: user.profile?.year_level || 'N/A',
                    phone_number: user.phone_number || 'No Contact Provided',
                    assigned_office: user.profile?.assigned_office || 'Not Assigned'
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
        fetchMyProfile();
        fetchRequirements(); // Fetch requirements on load
    }, []);

    useEffect(() => {
        fetchHistory();
        fetchSchedule(); 
    }, [startDate, endDate]);

    const fetchHistory = async () => {
        try {
            const response = await axios.get('/api/attendance/my-history', { params: { start: startDate, end: endDate } });
            setHistory(response.data);
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

    // --- NEW: FETCH REQUIREMENTS ---
    const fetchRequirements = async () => {
        try {
            const response = await axios.get('/api/my-requirements');
            setRequirements(response.data);
        } catch (err) { console.error(err); }
    };

    const handleClockAction = async (action: 'in' | 'out') => {
        if (action === 'out' && !taskDescription.trim()) {
            setMessage({ text: 'Please provide a task description before clocking out.', type: 'error' });
            setTimeout(() => setMessage(null), 3000);
            return;
        }

        setIsLoading(true);
        try {
            const endpoint = action === 'in' ? '/api/attendance/clock-in' : '/api/attendance/clock-out';
            const payload = action === 'in' ? { work_type: workType } : { task_description: taskDescription };
            const response = await axios.post(endpoint, payload);
            
            setMessage({ text: response.data.message || `Successfully clocked ${action}!`, type: 'success' });
            if (action === 'out') setTaskDescription(''); 
            fetchHistory(); 
        } catch (err: any) {
            setMessage({ text: err.response?.data?.message || `Failed to clock ${action}.`, type: 'error' });
        } finally {
            setIsLoading(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

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

    // --- NEW: HANDLE DOCUMENT UPLOAD ---
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
            (document.getElementById('fileUpload') as HTMLInputElement).value = ""; // Clear input
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

    const formatTime = (dateString: string | null) => {
        if (!dateString) return '--:--';
        return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const totalRenderedHours = history.reduce((sum, record) => sum + parseRenderedHours(record.rendered_hours), 0);
    const hourlyRate = 28; 
    const estimatedAmount = totalRenderedHours * hourlyRate;
    const targetHours = 60; 

    // NEW: Added Requirements to the Nav bar
    const studentNavItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
        { id: 'attendance', label: 'Attendance Log', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
        { id: 'assessment', label: 'Assessment', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3v-6m-3 6v-9m6 13H6a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2z" /> },
        { id: 'schedule', label: 'My Schedule', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
        { id: 'requirements', label: 'Requirements', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
        { id: 'settings', label: 'Settings', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></> }
    ];

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
            {/* INVISIBLE PRINT LAYER: Only shows up when generating PDF */}
            <div className="hidden print:block fixed inset-0 bg-white z-99999 overflow-visible">
                <TimesheetPrintView 
                    fullName={fullName} 
                    studentProfile={studentProfile} 
                    history={history} 
                    totalHours={totalRenderedHours} 
                    startDate={startDate} 
                    endDate={endDate} 
                />
            </div>

            <Sidebar 
            isSidebarOpen={isSidebarOpen} 
            setIsSidebarOpen={setIsSidebarOpen} // <-- ADD THIS LINE
            activeTab={currentPath}
            setActiveTab={(path) => navigate(`/${path}`)}
            handleLogout={onLogout}
            navItems={studentNavItems} 
            />

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-20 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 relative z-50">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                        <h2 className="text-xl font-bold text-gray-800 capitalize tracking-tight hidden sm:block">
                            {currentPath.replace('-', ' ')}
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <NotificationBell onNavigate={(path) => navigate(`/${path}`)} />
                        <div className="text-right hidden sm:block">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{assignedOffice}</p>
                            <p className="text-sm font-bold text-gray-900">{fullName}</p>
                        </div>
                        <div className="w-10 h-10 bg-blue-100 border-2 border-blue-500 rounded-full flex items-center justify-center text-blue-700 font-bold shadow-sm overflow-hidden">
                            {avatarPath ? <SecureImage filePath={avatarPath} altText="Nav Avatar" className="w-full h-full object-cover" /> : firstName.charAt(0)}
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 sm:p-8 relative">
                    <div className="max-w-6xl mx-auto space-y-6">
                        
                        {message && (
                            <div className={`p-4 rounded-xl border font-bold text-sm flex items-center gap-2 shadow-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                <span>{message.text}</span>
                            </div>
                        )}

                        {/* 1. DASHBOARD TAB */}
                        {currentPath === 'dashboard' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">My Profile</h2>
                                    <div className="space-y-4">
                                        <div><div className="text-xs text-gray-500">Full Name</div><div className="font-bold text-gray-900">{fullName}</div></div>
                                        <div><div className="text-xs text-gray-500">Assigned Department</div><div className="font-bold text-gray-900 text-sm">{studentProfile.assigned_office}</div></div>
                                        <div><div className="text-xs text-gray-500">Course & Year</div><div className="font-bold text-gray-900">{studentProfile.course} - Year {studentProfile.year_level}</div></div>
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                                    <h3 className="text-lg font-bold text-gray-900 mb-4">Hours Progress</h3>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="font-semibold text-gray-600">Rendered: <span className="text-blue-600">{totalRenderedHours.toFixed(2)} hrs</span></span>
                                        <span className="font-semibold text-gray-600">Target: {targetHours} hrs</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                                        <div className="bg-blue-600 h-4 rounded-full transition-all duration-1000" style={{ width: `${Math.min((totalRenderedHours / targetHours) * 100, 100)}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. ATTENDANCE LOG TAB */}
                        {currentPath === 'attendance' && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                                    <h3 className="text-xl font-bold text-gray-900 mb-4">Action Center</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                        <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Duty Type</label>
                                                <select value={workType} onChange={(e) => setWorkType(e.target.value)} disabled={isClockedIn} className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 font-medium">
                                                    <option>Clerical Work</option><option>Job Order</option><option>Janitorial</option><option>Routine Maintenance</option><option>Ad Hoc Tasks</option>
                                                </select>
                                            </div>
                                            <button onClick={() => handleClockAction('in')} disabled={isClockedIn || isLoading} className="w-full py-3 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 transition-colors shadow-md">Clock In</button>
                                        </div>
                                        <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Task Description</label>
                                                <textarea value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} disabled={!isClockedIn} placeholder="What did you accomplish today?" className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 outline-none disabled:bg-gray-100 resize-none h-12 font-medium" />
                                            </div>
                                            <button onClick={() => handleClockAction('out')} disabled={!isClockedIn || isLoading} className="w-full py-3 rounded-lg font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 transition-colors shadow-md">Clock Out</button>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                    <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50">
                                        <div className="flex items-center gap-4">
                                            <h3 className="text-lg font-bold text-gray-900">Attendance Log</h3>
                                            {/* NEW PDF BUTTON */}
                                            <button onClick={() => window.print()} className="px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded hover:bg-gray-800 transition-colors shadow-sm flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                                Export PDF
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm p-2 border border-gray-300 rounded-md outline-none" />
                                            <span className="text-gray-400 self-center">to</span>
                                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm p-2 border border-gray-300 rounded-md outline-none" />
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-white">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date</th>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Time</th>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Work Details</th>
                                                    <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Hours</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-100">
                                                {history.length === 0 ? <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">No records found.</td></tr> : history.map((record) => (
                                                    <tr key={record.id} className="hover:bg-gray-50">
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{new Date(record.date || record.time_in).toLocaleDateString()}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                            <div className="text-blue-600 font-bold">{formatTime(record.time_in)}</div>
                                                            <div className="text-orange-500 font-bold text-xs">{formatTime(record.time_out)}</div>
                                                        </td>
                                                        <td className="px-6 py-4 text-sm max-w-xs">
                                                            <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 mb-1 border border-blue-100">{record.work_type || 'Unspecified'}</span>
                                                            <p className="text-gray-500 text-xs truncate font-medium">{record.task_description || 'No description provided.'}</p>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-extrabold text-gray-900">{formatRenderedHoursCell(record.rendered_hours)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3. ASSESSMENT TAB */}
                        {currentPath === 'assessment' && (
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                                <h3 className="text-xl font-bold text-gray-900 mb-6">Financial Assessment</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 text-center"><p className="text-sm font-bold text-blue-600 uppercase mb-2">Total Hours Rendered</p><p className="text-4xl font-extrabold text-gray-900">{totalRenderedHours.toFixed(2)}</p></div>
                                    <div className="bg-purple-50 p-6 rounded-xl border border-purple-100 text-center"><p className="text-sm font-bold text-purple-600 uppercase mb-2">Hourly Rate</p><p className="text-4xl font-extrabold text-gray-900">₱{hourlyRate.toFixed(2)}</p></div>
                                    <div className="bg-green-50 p-6 rounded-xl border border-green-100 text-center"><p className="text-sm font-bold text-green-600 uppercase mb-2">Acquired Amount</p><p className="text-4xl font-extrabold text-green-700">₱{estimatedAmount.toFixed(2)}</p></div>
                                </div>
                            </div>
                        )}

                        {/* 4. SCHEDULE TAB */}
                        {currentPath === 'schedule' && (
                            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 h-full">
                              <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-extrabold text-gray-900">My Weekly Schedule</h2>
                                <button onClick={() => setIsEditModalOpen(true)} disabled={schedule.length === 0} className="px-4 py-2 bg-blue-100 text-blue-700 font-bold text-sm rounded-lg hover:bg-blue-200 transition-colors shadow-sm disabled:opacity-50">Request Edit</button>
                              </div>
                              {schedule.length === 0 ? <p className="py-12 text-center text-gray-500 font-bold">No shifts assigned yet</p> : (
                                <div className="space-y-4">
                                  {schedule.map((shift) => (
                                    <div key={shift.id} className={`flex items-center justify-between p-4 rounded-xl border ${shift.edit_request_status === 'pending' ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100 hover:border-blue-200'}`}>
                                      <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-lg bg-blue-100 flex flex-col items-center justify-center text-blue-700 border border-blue-200"><span className="text-xs font-bold uppercase">{shift.day.substring(0, 3)}</span></div>
                                        <div><div className="font-bold text-gray-900 text-lg">{shift.time}</div><div className="text-xs font-bold text-gray-500 uppercase">{shift.duty_type}</div></div>
                                      </div>
                                      <div className="flex flex-col items-end gap-2">
                                        {shift.edit_request_status === 'pending' && <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200 uppercase">Pending Edit</span>}
                                        <div className="text-sm font-bold text-gray-900">{shift.department}</div>
                                        <div className="text-xs text-gray-500">Supervisor: {shift.supervisor}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                        )}

                        {/* 5. NEW: REQUIREMENTS TAB */}
                        {currentPath === 'requirements' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Upload Column */}
                                <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-fit">
                                    <h3 className="text-lg font-extrabold text-gray-900 mb-4">Submit Document</h3>
                                    <form onSubmit={handleUploadRequirement} className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Document Type</label>
                                            <select 
                                                value={docType} 
                                                onChange={(e) => setDocType(e.target.value)}
                                                className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm bg-white"
                                            >
                                                <option>Medical Clearance</option>
                                                <option>Parents Consent</option>
                                                <option>Copy of Grades</option>
                                                <option>Certificate of Enrollment</option>
                                                <option>Good Moral Character</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Select File (PDF/Image)</label>
                                            <input 
                                                type="file" 
                                                id="fileUpload"
                                                accept=".pdf,.jpg,.jpeg,.png"
                                                onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-gray-50 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                            />
                                        </div>
                                        <button 
                                            type="submit" 
                                            disabled={isLoading || !uploadFile}
                                            className="w-full py-3 mt-2 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 transition-colors shadow-sm"
                                        >
                                            {isLoading ? 'Uploading...' : 'Upload Document'}
                                        </button>
                                    </form>
                                </div>

                                {/* Status Column */}
                                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                                        <h3 className="text-lg font-extrabold text-gray-900">My Uploaded Requirements</h3>
                                    </div>
                                    <div className="p-0">
                                        {requirements.length === 0 ? (
                                            <div className="p-12 text-center text-gray-500 font-medium">No requirements uploaded yet.</div>
                                        ) : (
                                            <div className="divide-y divide-gray-100">
                                                {requirements.map(req => (
                                                    <div key={req.id} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-gray-50 transition-colors">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`p-3 rounded-xl border ${req.status === 'verified' ? 'bg-green-50 border-green-200 text-green-600' : req.status === 'rejected' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-yellow-50 border-yellow-200 text-yellow-600'}`}>
                                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                            </div>
                                                            <div>
                                                                <h4 className="font-bold text-gray-900 text-md">{req.document_type}</h4>
                                                                <p className="text-xs font-medium text-gray-500 mt-1">Uploaded: {new Date(req.created_at).toLocaleDateString()}</p>
                                                                <button type="button" onClick={() => openSecureFile(req.file_path)} className="text-xs font-bold text-blue-600 hover:underline mt-1 inline-block">View Document</button>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end text-right w-full sm:w-auto">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                                                                req.status === 'verified' ? 'bg-green-100 text-green-800 border-green-200' : 
                                                                req.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' : 
                                                                'bg-yellow-100 text-yellow-800 border-yellow-200'
                                                            }`}>
                                                                {req.status}
                                                            </span>
                                                            {req.status === 'rejected' && req.remarks && (
                                                                <p className="text-xs text-red-600 mt-2 font-medium bg-red-50 p-2 rounded border border-red-100 w-full max-w-xs">
                                                                    <span className="font-bold">Reason:</span> {req.remarks}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 6. SETTINGS TAB */}
                        {currentPath === 'settings' && (
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                                <h3 className="text-xl font-bold text-gray-900 mb-6">Profile Settings</h3>
                                <div className="flex flex-col md:flex-row gap-8 items-start">
                                    <div className="flex flex-col items-center space-y-4 md:w-1/4">
                                        <div className="w-32 h-32 bg-gray-100 rounded-full border-4 border-white shadow-lg flex items-center justify-center relative overflow-hidden group">
                                            {avatarPath ? <SecureImage filePath={avatarPath} altText="Profile" className="w-full h-full object-cover" /> : <span className="text-gray-400 font-bold text-4xl">{firstName.charAt(0)}</span>}
                                            <input type="file" id="avatarUpload" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                            <label htmlFor="avatarUpload" className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"><span className="text-white text-xs font-bold">Upload New</span></label>
                                        </div>
                                    </div>
                                    <div className="flex-1 w-full space-y-6">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label><input type="text" disabled value={fullName} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-bold" /></div>
                                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Student ID Number</label><input type="text" disabled value={studentProfile.student_id_number} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-bold font-mono" /></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* REQUEST EDIT MODAL */}
            {isEditModalOpen && (
                <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Request Schedule Change</h3>
                        <form onSubmit={handleRequestEdit} className="space-y-4">
                            <select required value={selectedShiftId} onChange={(e) => setSelectedShiftId(Number(e.target.value))} className="w-full p-3 border border-gray-300 rounded-lg">
                                <option value="" disabled>-- Select a shift --</option>
                                {schedule.map(shift => <option key={shift.id} value={shift.id}>{shift.day} ({shift.time})</option>)}
                            </select>
                            <textarea required value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Reason..." className="w-full p-3 border border-gray-300 rounded-lg h-28 resize-none" />
                            <div className="flex justify-end gap-3"><button type="button" onClick={() => setIsEditModalOpen(false)} className="px-5 py-2 text-sm font-bold text-gray-600">Cancel</button><button type="submit" className="px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg">Send</button></div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentDashboard;