import { useState, useEffect } from 'react';
import axios from 'axios';

interface AttendanceRecord {
    id: number;
    time_in: string;
    time_out: string | null;
    rendered_hours: string | null;
    status: string;
}

const StudentDashboard = () => {
    const [history, setHistory] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // 1. Pull the data from local storage
    const fullName = localStorage.getItem('user_name') || 'Student';
    const assignedOffice = localStorage.getItem('assigned_office') || 'Unassigned';
    
    // 2. Split the full name by spaces and grab the very first item (index 0)
    const firstName = fullName.split(' ')[0];

    // Check if the most recent record has no time_out, meaning they are currently clocked in
    const isClockedIn = history.length > 0 && history[0].time_out === null;

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const response = await axios.get('/api/attendance/my-history');
            setHistory(response.data);
        } catch (err) {
            console.error("Failed to fetch history", err);
        }
    };

    const handleClockAction = async (action: 'in' | 'out') => {
        setIsLoading(true);
        setMessage(null);
        try {
            const endpoint = action === 'in' ? '/api/attendance/clock-in' : '/api/attendance/clock-out';
            const response = await axios.post(endpoint);
            
            setMessage({ text: response.data.message, type: 'success' });
            fetchHistory(); // Refresh the table to show the new timestamp
        } catch (err: any) {
            setMessage({ 
                text: err.response?.data?.message || `Failed to clock ${action}.`, 
                type: 'error' 
            });
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (dateString: string | null) => {
        if (!dateString) return '--:--';
        return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    return (
        <div className="p-8 font-sans max-w-4xl mx-auto">
            
            {/* --- NEW PERSONALIZED HEADER --- */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8 flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                        Hello, {firstName}! 👋
                    </h2>
                    <p className="mt-2 text-sm text-gray-500 font-medium flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                        Assigned Office: <span className="text-gray-900 font-bold">{assignedOffice}</span>
                    </p>
                </div>

                <div className="hidden sm:block text-right">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Today's Date</p>
                    <p className="text-lg font-bold text-blue-600">
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                </div>
            </div>
            {/* ------------------------------- */}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Time Clock</h2>
                <p className="text-gray-500 mb-8">Log your rendered hours for your assigned office.</p>

                {message && (
                    <div className={`mb-6 p-4 rounded-lg font-semibold inline-block ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {message.text}
                    </div>
                )}

                <div className="flex justify-center gap-6">
                    <button 
                        onClick={() => handleClockAction('in')}
                        disabled={isClockedIn || isLoading}
                        className={`px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${
                            isClockedIn 
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 hover:-translate-y-1'
                        }`}
                    >
                        Time In
                    </button>
                    
                    <button 
                        onClick={() => handleClockAction('out')}
                        disabled={!isClockedIn || isLoading}
                        className={`px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${
                            !isClockedIn 
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                : 'bg-orange-500 text-white hover:bg-orange-600 hover:shadow-orange-200 hover:-translate-y-1'
                        }`}
                    >
                        Time Out
                    </button>
                </div>
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-4">My Attendance History</h3>
            <div className="overflow-hidden bg-white shadow-sm ring-1 ring-black ring-opacity-5 rounded-xl border border-gray-100">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Time In</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Time Out</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Hours Rendered</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {history.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No attendance records found.</td></tr>
                        ) : (
                            history.map((record) => (
                                <tr key={record.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {new Date(record.time_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold">{formatTime(record.time_in)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-500 font-semibold">{formatTime(record.time_out)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-bold">
                                        {record.rendered_hours ? `${record.rendered_hours} hrs` : 'In Progress...'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StudentDashboard;