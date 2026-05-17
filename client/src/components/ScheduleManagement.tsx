import { useState, useEffect } from 'react';
import axios from 'axios';

interface User {
    id: number;
    name: string;
    profile?: {
        assigned_office?: string;
    }
}

interface Schedule {
    id: number;
    user_id: number;
    day: string;
    time: string;
    duty_type: string;
    department: string;
    supervisor: string;
    edit_request_status?: string;
    edit_request_note?: string;
    user?: {
        name: string;
    }
}

const ScheduleManagement = () => {
    const [students, setStudents] = useState<User[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Modal & Form State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Global Toast State
    const [toastMsg, setToastMsg] = useState<{text: string, type: 'success' | 'error'} | null>(null);

    const [formData, setFormData] = useState({
        user_id: '',
        day: 'Monday',
        startTime: '', 
        endTime: '',   
        duty_type: 'Clerical Work',
        department: '',
        supervisor: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const userRes = await axios.get('/api/users?page=1'); 
            const studentList = userRes.data.data.filter((u: any) => u.role === 'Student');
            setStudents(studentList);
        } catch (error) {
            console.error('Error fetching students:', error);
        }

        try {
            const schedRes = await axios.get('/api/schedules');
            setSchedules(schedRes.data);
        } catch (error) {
            console.error('Error fetching schedules:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Time Calculation Helpers ---
    const calculateHours = (start: string, end: string) => {
        if (!start || !end) return 0;
        const [startHour, startMin] = start.split(':').map(Number);
        const [endHour, endMin] = end.split(':').map(Number);
        
        let diff = (endHour + endMin / 60) - (startHour + startMin / 60);
        if (diff < 0) diff += 24; 
        
        return diff.toFixed(1);
    };

    const format12Hour = (time24: string) => {
        const [hourStr, min] = time24.split(':');
        const hour = parseInt(hourStr, 10);
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${min} ${period}`;
    };

    // --- API Handlers ---
    const handleAssignShift = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.startTime || !formData.endTime) {
            setToastMsg({ text: 'Please select both start and end times.', type: 'error' });
            setTimeout(() => setToastMsg(null), 3000);
            return;
        }

        setIsSubmitting(true);
        const formattedTimeString = `${format12Hour(formData.startTime)} - ${format12Hour(formData.endTime)}`;

        const payload = {
            ...formData,
            time: formattedTimeString,
        };

        try {
            await axios.post('/api/schedules', payload);
            setToastMsg({ text: 'Shift assigned successfully!', type: 'success' });
            setTimeout(() => setToastMsg(null), 3000);
            
            setFormData({ ...formData, user_id: '', startTime: '', endTime: '' });
            fetchData();
        } catch (error: any) {
            setToastMsg({ text: error.response?.data?.message || 'Failed to assign shift.', type: 'error' });
            setTimeout(() => setToastMsg(null), 4000);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRemoveShift = async (id: number) => {
        if (!window.confirm('Are you sure you want to remove this shift?')) return;
        try {
            await axios.delete(`/api/schedules/${id}`);
            setToastMsg({ text: 'Shift removed successfully!', type: 'success' });
            fetchData();
            setTimeout(() => setToastMsg(null), 3000);
        } catch (error) {
            setToastMsg({ text: 'Failed to remove shift.', type: 'error' });
            setTimeout(() => setToastMsg(null), 3000);
        }
    };

    const handleResolveRequest = async (id: number) => {
        try {
            await axios.patch(`/api/schedules/${id}/resolve-request`);
            setToastMsg({ text: 'Student request acknowledged and cleared!', type: 'success' });
            fetchData(); // This will refresh the table and remove the orange box
            setTimeout(() => setToastMsg(null), 3000);
        } catch (error: any) {
            setToastMsg({ text: error.response?.data?.message || 'Server error: Failed to clear request.', type: 'error' });
            setTimeout(() => setToastMsg(null), 4000);
        }
    };

    return (
        <div className="space-y-6 fade-in font-sans relative pb-10">
            
            {/* GLOBAL TOAST - Now visible on the main table! */}
            {toastMsg && (
                <div className={`p-4 rounded-xl border font-bold text-sm flex items-center gap-2 shadow-sm ${toastMsg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <span>{toastMsg.text}</span>
                </div>
            )}

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Schedule Management</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Assign and manage weekly shifts for student workers.</p>
                </div>
                
                <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    Assign Shift
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Student Name</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Day & Time</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Location & Duty</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">Loading schedules...</td></tr>
                            ) : schedules.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500 font-medium">No shifts assigned yet.</td></tr>
                            ) : (
                                schedules.map((schedule) => (
                                    <tr key={schedule.id} className={`hover:bg-gray-50 transition-colors ${schedule.edit_request_status === 'pending' ? 'bg-orange-50/60 border-l-4 border-l-orange-500' : ''}`}>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-900">{schedule.user?.name || 'Unknown User'}</div>
                                            
                                            {/* STUDENT REQUEST MESSAGE */}
                                            {schedule.edit_request_status === 'pending' && (
                                                <div className="mt-3 p-3 bg-white rounded-lg border border-orange-200 shadow-sm">
                                                    <span className="text-[10px] font-extrabold text-orange-800 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        Student Request
                                                    </span>
                                                    <p className="text-xs text-gray-700 font-medium italic border-l-2 border-orange-300 pl-2">"{schedule.edit_request_note}"</p>
                                                    <button 
                                                        onClick={() => handleResolveRequest(schedule.id)} 
                                                        className="mt-3 px-3 py-1.5 bg-blue-50 text-blue-700 font-bold text-xs rounded hover:bg-blue-100 transition-colors border border-blue-100"
                                                    >
                                                        Acknowledge & Clear
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-bold text-blue-600">{schedule.day}</div>
                                            <div className="text-sm font-medium text-gray-600">{schedule.time}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-bold text-gray-900">{schedule.department}</div>
                                            <div className="text-xs font-medium text-gray-500 uppercase">{schedule.duty_type} • Sup: {schedule.supervisor}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <button onClick={() => handleRemoveShift(schedule.id)} className="text-red-600 hover:text-red-900 font-bold text-sm">
                                                Remove Shift
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ASSIGN SHIFT MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden slide-up">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-xl font-bold text-gray-900">Assign New Shift</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleAssignShift} className="p-6 space-y-5">
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Student</label>
                                <select 
                                    required 
                                    value={formData.user_id} 
                                    onChange={e => setFormData({...formData, user_id: e.target.value})} 
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium bg-white"
                                >
                                    <option value="" disabled>-- Choose a student worker --</option>
                                    {students.map(student => (
                                        <option key={student.id} value={student.id}>
                                            {student.name} {student.profile?.assigned_office ? `(${student.profile.assigned_office})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Day of Week</label>
                                    <select 
                                        value={formData.day} 
                                        onChange={e => setFormData({...formData, day: e.target.value})} 
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold bg-white"
                                    >
                                        <option>Monday</option><option>Tuesday</option><option>Wednesday</option>
                                        <option>Thursday</option><option>Friday</option><option>Saturday</option><option>Sunday</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4 relative">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Start Time</label>
                                        <input required type="time" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold bg-white"/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">End Time</label>
                                        <input required type="time" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold bg-white"/>
                                    </div>
                                </div>
                                
                                {formData.startTime && formData.endTime && (
                                    <div className="flex justify-between items-center bg-blue-50 text-blue-700 p-3 rounded-lg border border-blue-100">
                                        <span className="text-xs font-bold uppercase tracking-wider">Calculated Shift Duration:</span>
                                        <span className="text-sm font-extrabold">{calculateHours(formData.startTime, formData.endTime)} Hours</span>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Duty Type</label>
                                <select 
                                    value={formData.duty_type} 
                                    onChange={e => setFormData({...formData, duty_type: e.target.value})} 
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium bg-white"
                                >
                                    <option>Clerical Work</option>
                                    <option>Job Order</option>
                                    <option>Janitorial</option>
                                    <option>Routine Maintenance</option>
                                    <option>Ad Hoc Tasks</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Department</label>
                                    <select 
                                        required 
                                        value={formData.department} 
                                        onChange={e => setFormData({...formData, department: e.target.value})} 
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-gray-700 bg-white"
                                    >
                                        <option value="" disabled>-- Select Dept --</option>
                                        <option value="Pre-School Department">Pre-School</option>
                                        <option value="Elementary Department">Elementary</option>
                                        <option value="Junior High School Department">Junior High</option>
                                        <option value="Senior High School Department">Senior High</option>
                                        <option value="College of Arts and Sciences">Arts & Sciences</option>
                                        <option value="College of Business and Accountancy">Business & Accountancy</option>
                                        <option value="College of Computer Studies">Computer Studies</option>
                                        <option value="College of Criminal Justice Education">Criminal Justice</option>
                                        <option value="College of Engineering">Engineering</option>
                                        <option value="College of Hotel and Tourism Management">Hotel & Tourism</option>
                                        <option value="College of Nursing">Nursing</option>
                                        <option value="College of Teacher Education">Teacher Ed</option>
                                        <option value="Graduate School">Graduate School</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Supervisor Name</label>
                                    <input 
                                        required 
                                        type="text" 
                                        value={formData.supervisor} 
                                        onChange={e => setFormData({...formData, supervisor: e.target.value})} 
                                        placeholder="e.g. Mr. Smith" 
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" 
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:bg-blue-400">
                                    {isSubmitting ? 'Saving...' : 'Assign Shift'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScheduleManagement;