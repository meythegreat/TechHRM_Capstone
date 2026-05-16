import { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from './Sidebar'; 

interface AttendanceRecord {
    id: number;
    date: string;
    time_in: string;
    time_out: string | null;
    /** Laravel DECIMAL often serializes as a string in JSON */
    rendered_hours: number | string | null;
    work_type: string | null;
    task_description: string | null;
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

interface ScheduleRecord {
    id: number;
    day: string;
    time: string;
    duty_type: string;
    department: string;
    supervisor: string;
}

const StudentDashboard = () => {
    // --- USER DATA ---
    const fullName = localStorage.getItem('user_name') || 'Student';
    const assignedOffice = localStorage.getItem('assigned_office') || 'Unassigned';
    const firstName = fullName.split(' ')[0];

    // --- UI STATE ---
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('student_active_tab') || 'dashboard');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // --- FEATURE STATE ---
    const [avatarUrl, setAvatarUrl] = useState<string | null>(localStorage.getItem('profile_picture'));
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    
    // NEW: Real-time Profile Data State
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

    useEffect(() => {
        localStorage.setItem('student_active_tab', activeTab);
    }, [activeTab]);

    // NEW: Fetch Profile Data on initial load
    useEffect(() => {
        const fetchMyProfile = async () => {
            try {
                const response = await axios.get('/api/user');
                const user = response.data;
                setStudentProfile({
                    student_id_number: user.profile?.student_id_number || 'Not Assigned',
                    course: user.profile?.course || 'Not Assigned',
                    year_level: user.profile?.year_level || 'N/A',
                    phone_number: user.phone_number || 'No Contact Provided',
                    assigned_office: user.profile?.assigned_office || 'Not Assigned' // <-- ADD THIS LINE
                });
            } catch (error) {
                console.error("Failed to fetch profile", error);
            }
        };
        fetchMyProfile();
    }, []);

    useEffect(() => {
        fetchHistory();
        fetchSchedule(); 
    }, [startDate, endDate]);

    const fetchHistory = async () => {
        try {
            const response = await axios.get('/api/attendance/my-history', {
                params: { start: startDate, end: endDate }
            });
            setHistory(response.data);
        } catch (err) {
            console.error("Failed to fetch history", err);
        }
    };

    const fetchSchedule = async () => {
        try {
            const response = await axios.get('/api/schedule/my-schedule');
            setSchedule(response.data);
        } catch (err) {
            console.error("Failed to fetch schedule", err);
        }
    };

    const handleClockAction = async (action: 'in' | 'out') => {
        if (action === 'out' && !taskDescription.trim()) {
            setMessage({ text: 'Please provide a task description before clocking out.', type: 'error' });
            return;
        }

        setIsLoading(true);
        setMessage(null);
        try {
            const endpoint = action === 'in' ? '/api/attendance/clock-in' : '/api/attendance/clock-out';
            const payload = action === 'in' ? { work_type: workType } : { task_description: taskDescription };
            const response = await axios.post(endpoint, payload);
            
            // FIX: Add a fallback string if the backend doesn't send a 'message' key
            const successMsg = response.data.message || `Successfully clocked ${action}!`;
            setMessage({ text: successMsg, type: 'success' });
            
            if (action === 'out') setTaskDescription(''); 
            fetchHistory(); 
        } catch (err: any) {
            setMessage({ text: err.response?.data?.message || `Failed to clock ${action}.`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('avatar', file);

        setIsLoading(true);
        try {
            const response = await axios.post('/api/user/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            setAvatarUrl(response.data.profile_picture);
            localStorage.setItem('profile_picture', response.data.profile_picture);
            setMessage({ text: 'Profile picture updated successfully!', type: 'success' });
        } catch (err: any) {
            setMessage({ text: 'Failed to upload image. Ensure it is under 2MB.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await axios.post('/api/logout');
        } catch (err) {
            console.error("Logout failed on server", err);
        } finally {
            localStorage.clear();
            window.location.reload(); 
        }
    };

    const formatTime = (dateString: string | null) => {
        if (!dateString) return '--:--';
        return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const totalRenderedHours = history.reduce(
        (sum, record) => sum + parseRenderedHours(record.rendered_hours),
        0
    );
    const hourlyRate = 28; 
    const estimatedAmount = totalRenderedHours * hourlyRate;
    const targetHours = 60; 

    // --- STUDENT NAVIGATION ITEMS ---
    const studentNavItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
        { id: 'attendance', label: 'Attendance Log', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
        { id: 'assessment', label: 'Assessment', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3v-6m-3 6v-9m6 13H6a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2z" /> },
        { id: 'schedule', label: 'My Schedule', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
        { id: 'settings', label: 'Settings', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></> }
    ];

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
            
            <Sidebar 
                isSidebarOpen={isSidebarOpen} 
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                handleLogout={handleLogout} 
                navItems={studentNavItems}
            />

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-20 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <h2 className="text-xl font-bold text-gray-800 capitalize tracking-tight hidden sm:block">
                            {activeTab.replace('-', ' ')}
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{assignedOffice}</p>
                            <p className="text-sm font-bold text-gray-900">{fullName}</p>
                        </div>
                        <div className="w-10 h-10 bg-blue-100 border-2 border-blue-500 rounded-full flex items-center justify-center text-blue-700 font-bold shadow-sm overflow-hidden">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Nav Avatar" className="w-full h-full object-cover" />
                            ) : (
                                firstName.charAt(0)
                            )}
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 sm:p-8">
                    <div className="max-w-6xl mx-auto space-y-6">
                        
                        {/* 1. DASHBOARD TAB */}
                        {activeTab === 'dashboard' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                                    <h3 className="text-lg font-bold text-gray-900 mb-4">Hours Progress</h3>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="font-semibold text-gray-600">Rendered: <span className="text-blue-600">{totalRenderedHours.toFixed(2)} hrs</span></span>
                                        <span className="font-semibold text-gray-600">Target: {targetHours} hrs</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                                        <div 
                                            className="bg-blue-600 h-4 rounded-full transition-all duration-1000" 
                                            style={{ width: `${Math.min((totalRenderedHours / targetHours) * 100, 100)}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-3 text-center">Keep up the great work! You are {(totalRenderedHours / targetHours * 100).toFixed(1)}% to your goal.</p>
                                </div>
                            </div>
                        )}

                        {/* 2. ATTENDANCE LOG TAB */}
                        {activeTab === 'attendance' && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                                    <h3 className="text-xl font-bold text-gray-900 mb-4">Action Center</h3>
                                    {/* FIX: Add the question mark so it doesn't crash if text is undefined! */}
                                    {message && message.text?.includes('Profile picture') && (
                                        <div className={`mb-6 p-4 rounded-lg font-semibold text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                            {message.text}
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                        <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Duty Type</label>
                                                <select 
                                                    value={workType} 
                                                    onChange={(e) => setWorkType(e.target.value)}
                                                    disabled={isClockedIn}
                                                    className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400 font-medium"
                                                >
                                                    <option value="Clerical Work">Clerical Work</option>
                                                    <option value="Job Order">Job Order</option>
                                                    <option value="Janitorial">Janitorial</option>
                                                    <option value="Routine Maintenance">Routine Maintenance</option>
                                                    <option value="Ad Hoc Tasks">Ad Hoc Tasks</option>
                                                </select>
                                            </div>
                                            <button 
                                                onClick={() => handleClockAction('in')}
                                                disabled={isClockedIn || isLoading}
                                                className="w-full py-3 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 transition-colors shadow-md shadow-blue-200"
                                            >
                                                Clock In
                                            </button>
                                        </div>

                                        <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Task Description</label>
                                                <textarea 
                                                    value={taskDescription}
                                                    onChange={(e) => setTaskDescription(e.target.value)}
                                                    disabled={!isClockedIn}
                                                    placeholder="What did you accomplish today?"
                                                    className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 outline-none disabled:bg-gray-100 resize-none h-12 font-medium"
                                                />
                                            </div>
                                            <button 
                                                onClick={() => handleClockAction('out')}
                                                disabled={!isClockedIn || isLoading}
                                                className="w-full py-3 rounded-lg font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 transition-colors shadow-md shadow-orange-200"
                                            >
                                                Clock Out
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                    <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50">
                                        <h3 className="text-lg font-bold text-gray-900">Attendance Log</h3>
                                        <div className="flex gap-2">
                                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm p-2 border border-gray-300 rounded-md outline-none focus:border-blue-500 font-medium" />
                                            <span className="text-gray-400 self-center">to</span>
                                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm p-2 border border-gray-300 rounded-md outline-none focus:border-blue-500 font-medium" />
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-white">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Time</th>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Work Details</th>
                                                    <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Hours</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-100">
                                                {history.length === 0 ? (
                                                    <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">No records found for this period.</td></tr>
                                                ) : (
                                                    history.map((record) => (
                                                        <tr key={record.id} className="hover:bg-gray-50">
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                {new Date(record.date || record.time_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                <div className="text-blue-600 font-bold">{formatTime(record.time_in)}</div>
                                                                <div className="text-orange-500 font-bold text-xs">{formatTime(record.time_out)}</div>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm max-w-xs">
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 mb-1 border border-blue-100">{record.work_type || 'Unspecified'}</span>
                                                                <p className="text-gray-500 text-xs truncate font-medium" title={record.task_description || ''}>{record.task_description || 'No description provided.'}</p>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-extrabold text-gray-900">
                                                                {formatRenderedHoursCell(record.rendered_hours)}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3. ASSESSMENT TAB */}
                        {activeTab === 'assessment' && (
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                                <h3 className="text-xl font-bold text-gray-900 mb-6">Financial Assessment</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 text-center shadow-sm">
                                        <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-2">Total Hours Rendered</p>
                                        <p className="text-4xl font-extrabold text-gray-900">{totalRenderedHours.toFixed(2)}</p>
                                    </div>
                                    <div className="bg-purple-50 p-6 rounded-xl border border-purple-100 text-center shadow-sm">
                                        <p className="text-sm font-bold text-purple-600 uppercase tracking-wider mb-2">Hourly Rate</p>
                                        <p className="text-4xl font-extrabold text-gray-900">₱{hourlyRate.toFixed(2)}</p>
                                    </div>
                                    <div className="bg-green-50 p-6 rounded-xl border border-green-100 text-center shadow-sm">
                                        <p className="text-sm font-bold text-green-600 uppercase tracking-wider mb-2">Acquired Amount</p>
                                        <p className="text-4xl font-extrabold text-green-700">₱{estimatedAmount.toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 4. SCHEDULE TAB */}
                        {activeTab === 'schedule' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                                    <h3 className="text-xl font-bold text-gray-900">My Weekly Schedule</h3>
                                    <button className="px-4 py-2 bg-blue-100 text-blue-700 font-bold text-sm rounded-lg hover:bg-blue-200 transition-colors">
                                        Request Edit
                                    </button>
                                </div>
                                {schedule.length === 0 ? (
                                    <div className="p-8 text-center">
                                        <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <p className="text-gray-500 font-medium">Your schedule is currently empty.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-white">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Day</th>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Time</th>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Duty & Dept</th>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Supervisor</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-100">
                                                {schedule.map((shift) => (
                                                    <tr key={shift.id} className="hover:bg-gray-50">
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{shift.day}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-bold">{shift.time}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                            <div className="font-bold text-gray-900">{shift.duty_type}</div>
                                                            <div className="text-gray-500 text-xs font-medium">{shift.department}</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">{shift.supervisor}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 5. SETTINGS TAB */}
                        {activeTab === 'settings' && (
                            <div className="space-y-6">
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                                    <h3 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-100 pb-4">Profile Settings</h3>
                                    
                                    {message && message.text.includes('Profile picture') && (
                                        <div className={`mb-6 p-4 rounded-lg font-semibold text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                            {message.text}
                                        </div>
                                    )}

                                    <div className="flex flex-col md:flex-row gap-8 items-start">
                                        
                                        {/* Profile Picture Upload Area */}
                                        <div className="flex flex-col items-center space-y-4 md:w-1/4">
                                            <div className="w-32 h-32 bg-gray-100 rounded-full border-4 border-white shadow-lg flex items-center justify-center relative overflow-hidden group">
                                                {avatarUrl ? (
                                                    <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-gray-400 font-bold text-4xl">{firstName.charAt(0)}</span>
                                                )}
                                                <input type="file" id="avatarUpload" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                                <label htmlFor="avatarUpload" className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                                    <span className="text-white text-xs font-bold">Upload New</span>
                                                </label>
                                            </div>
                                            <label htmlFor="avatarUpload" className="text-sm font-bold text-blue-600 hover:text-blue-700 cursor-pointer">
                                                Change Picture
                                            </label>
                                            <p className="text-[10px] text-gray-400 text-center mx-auto">Images are securely stored and encrypted upon upload.</p>
                                        </div>

                                        <div className="flex-1 w-full space-y-6">
                                            
                                            {/* LOCKED: Official Student Profile Data */}
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">University Record <span className="text-xs font-medium text-gray-400 font-normal ml-2">(Contact Admin to edit)</span></h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
                                                        <input type="text" disabled value={fullName} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-bold cursor-not-allowed" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Student ID Number</label>
                                                        <input type="text" disabled value={studentProfile.student_id_number} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-bold font-mono cursor-not-allowed" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Contact Number</label>
                                                        <input type="text" disabled value={studentProfile.phone_number} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-bold cursor-not-allowed" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Course & Year Level</label>
                                                        <input type="text" disabled value={`${studentProfile.course} - Year ${studentProfile.year_level}`} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-bold cursor-not-allowed" />
                                                    </div>
                                                    <div className="sm:col-span-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Assigned Department / Office</label>
                                                        <input type="text" disabled value={studentProfile.assigned_office} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-bold cursor-not-allowed" />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* EDITABLE: Security Details */}
                                            <div className="pt-2 mt-4">
                                                <h4 className="text-sm font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">Security</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">New Password</label>
                                                        <div className="relative">
                                                            <input type={showNewPassword ? "text" : "password"} placeholder="••••••••" className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none pr-14" />
                                                            <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute inset-y-0 right-3 flex items-center text-xs font-bold text-gray-400 hover:text-gray-600">
                                                                {showNewPassword ? "HIDE" : "SHOW"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Confirm Password</label>
                                                        <div className="relative">
                                                            <input type={showConfirmPassword ? "text" : "password"} placeholder="••••••••" className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none pr-14" />
                                                            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-3 flex items-center text-xs font-bold text-gray-400 hover:text-gray-600">
                                                                {showConfirmPassword ? "HIDE" : "SHOW"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex justify-end pt-4">
                                                <button className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                                                    Update Password
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </main>
            </div>
        </div>
    );
};

export default StudentDashboard;