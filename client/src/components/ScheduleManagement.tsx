import { useState, useEffect } from 'react';
import axios from 'axios';

interface ScheduleRecord {
    id: number;
    user_id: number;
    user: { name: string };
    day: string;
    time: string;
    duty_type: string;
    department: string;
    supervisor: string;
}

const ScheduleManagement = () => {
    // --- STATE ---
    const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
    const [students, setStudents] = useState<{id: number, name: string}[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const [formData, setFormData] = useState({
        user_id: '', 
        day: 'Monday', 
        time: '', 
        duty_type: '', 
        department: '', 
        supervisor: ''
    });

    // --- FETCH DATA ---
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        
        // 1. Fetch Students Independently
        try {
            const userRes = await axios.get('/api/users?page=1'); 
            const studentList = userRes.data.data.filter((u: any) => u.role === 'Student');
            setStudents(studentList);
        } catch (error) {
            console.error('Error fetching students:', error);
            setToastMsg({ text: 'Failed to load students list.', type: 'error' });
        }

        // 2. Fetch Schedules Independently
        try {
            const schedRes = await axios.get('/api/schedules');
            setSchedules(schedRes.data);
        } catch (error) {
            console.error('Error fetching schedules:', error);
            setToastMsg({ text: 'Failed to load schedule data. Check backend controller.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    // --- ACTIONS ---
    const handleAssignSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            await axios.post('/api/schedules', formData);
            setToastMsg({ text: 'Shift assigned successfully!', type: 'success' });
            
            // Reset and close modal
            setIsModalOpen(false);
            setFormData({ user_id: '', day: 'Monday', time: '', duty_type: '', department: '', supervisor: '' });
            fetchData();
            
            setTimeout(() => setToastMsg(null), 3000);
        } catch (error) {
            setToastMsg({ text: 'Failed to assign shift. Please check the details.', type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("Are you sure you want to remove this shift? The student will no longer see it on their dashboard.")) return;
        
        try {
            await axios.delete(`/api/schedules/${id}`);
            setToastMsg({ text: 'Shift removed successfully.', type: 'success' });
            fetchData();
            setTimeout(() => setToastMsg(null), 3000);
        } catch (error) {
            setToastMsg({ text: 'Failed to remove shift.', type: 'error' });
        }
    };

    // --- UI RENDER ---
    return (
        <div className="space-y-6 fade-in font-sans relative">
            
            {/* Header */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Schedule Management</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Assign and manage weekly shifts for student workers.</p>
                </div>
                <button 
                    onClick={() => setIsModalOpen(true)} 
                    className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    Assign Shift
                </button>
            </div>

            {/* Notification Toast */}
            {toastMsg && (
                <div className={`p-4 rounded-xl border font-bold text-sm flex items-center gap-2 ${toastMsg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {toastMsg.type === 'success' 
                        ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    }
                    {toastMsg.text}
                </div>
            )}

            {/* Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Student Name</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Day & Time</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Duty Details</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500 font-medium">Loading schedules...</td></tr>
                            ) : schedules.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center">
                                        <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <p className="text-gray-500 font-medium">No shifts assigned yet.</p>
                                    </td>
                                </tr>
                            ) : (
                                schedules.map((sched) => (
                                    <tr key={sched.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-extrabold text-gray-900">{sched.user?.name}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 mb-1 border border-blue-100">{sched.day}</span>
                                            <div className="text-sm font-bold text-gray-500">{sched.time}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <div className="font-bold text-gray-900">{sched.duty_type}</div>
                                            <div className="text-gray-500 font-medium text-xs mt-0.5">{sched.department} • {sched.supervisor}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold">
                                            <button 
                                                onClick={() => handleDelete(sched.id)} 
                                                className="text-red-600 hover:text-red-900 transition-colors bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-100"
                                            >
                                                Remove
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
                        
                        <form onSubmit={handleAssignSchedule} className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Student</label>
                                <select 
                                    required 
                                    value={formData.user_id} 
                                    onChange={e => setFormData({...formData, user_id: e.target.value})} 
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-gray-700"
                                >
                                    <option value="" disabled>-- Choose a student --</option>
                                    {students.map(student => (
                                        <option key={student.id} value={student.id}>{student.name}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Day of Week</label>
                                    <select 
                                        required 
                                        value={formData.day} 
                                        onChange={e => setFormData({...formData, day: e.target.value})} 
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-gray-700"
                                    >
                                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                            <option key={day} value={day}>{day}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Time Block</label>
                                    <input 
                                        required 
                                        type="text" 
                                        value={formData.time} 
                                        onChange={e => setFormData({...formData, time: e.target.value})} 
                                        placeholder="e.g. 08:00 AM - 12:00 PM" 
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" 
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Duty Type / Role</label>
                                <input 
                                    required 
                                    type="text" 
                                    value={formData.duty_type} 
                                    onChange={e => setFormData({...formData, duty_type: e.target.value})} 
                                    placeholder="e.g. Library Assistant" 
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" 
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Department</label>
                                    <input 
                                        required 
                                        type="text" 
                                        value={formData.department} 
                                        onChange={e => setFormData({...formData, department: e.target.value})} 
                                        placeholder="e.g. Main Library" 
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" 
                                    />
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

                            <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-gray-100">
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)} 
                                    className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:bg-blue-400 flex items-center gap-2 transition-colors"
                                >
                                    {isSubmitting ? 'Assigning...' : 'Assign Shift'}
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