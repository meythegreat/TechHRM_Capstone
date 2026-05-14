import { useState, useEffect } from 'react';
import axios from 'axios';

interface User {
    fullname: string;
    username: string;
}

interface AttendanceRecord {
    id: number;
    user: User;
    date: string;
    time_in: string | null;
    time_out: string | null;
    status: string;
    total_hours: number | null;
}

const AttendanceMonitor = () => {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>('');

    // Pagination State
    const [currentPage, setCurrentPage] = useState<number>(1);
    const recordsPerPage = 15;

    useEffect(() => {
        fetchAttendance();
    }, []);

    const fetchAttendance = async () => {
        try {
            const response = await axios.get('/api/attendance/all');
            setRecords(response.data);
        } catch (err) {
            setError('Failed to load attendance records.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    // --- PAGINATION LOGIC ---
    const totalPages = Math.ceil(records.length / recordsPerPage);
    const indexOfLastRecord = currentPage * recordsPerPage;
    const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
    const currentRecords = records.slice(indexOfFirstRecord, indexOfLastRecord);

    const handleExport = async () => {
        try {
            // Adjust this endpoint if your export route is different
            window.open('/api/attendance/export', '_blank'); 
        } catch (err) {
            alert('Failed to export records.');
        }
    };

    // Add this helper function before your return statement
    const formatTime = (timeString: string | null) => {
        if (!timeString) return '-';
        
        // 1. Try parsing as a full ISO timestamp first (Laravel default)
        const dateObj = new Date(timeString);
        if (!isNaN(dateObj.getTime())) {
            return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        // 2. Fallback: If it's strictly a "HH:MM:SS" time string
        const fallbackDate = new Date(`2000-01-01T${timeString}`);
        if (!isNaN(fallbackDate.getTime())) {
            return fallbackDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        return timeString; // Return raw string if both fail
    };

    return (
        <div className="p-8 font-sans">
            <div className="sm:flex sm:items-center sm:justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Timesheets & Attendance</h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Monitor daily time-in and time-out records for all student workers.
                    </p>
                </div>
                <div className="mt-4 sm:mt-0">
                    <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-sm hover:bg-green-700 transition-colors">
                        Export to Excel
                    </button>
                </div>
            </div>

            {error && <div className="mb-4 p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">{error}</div>}

            <div className="overflow-hidden bg-white shadow-sm ring-1 ring-black ring-opacity-5 rounded-xl border border-gray-100 flex flex-col">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student Worker</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Time In</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Time Out</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Hours Logged</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {isLoading ? (
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">Loading attendance...</td></tr>
                            ) : records.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">No attendance records found.</td></tr>
                            ) : (
                                currentRecords.map((record) => (
                                    <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{record.user?.fullname || 'Unknown User'}</div>
                                            <div className="text-sm text-gray-500">@{record.user?.username || 'N/A'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{record.date}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {formatTime(record.time_in)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {formatTime(record.time_out)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                            {record.total_hours ? `${record.total_hours} hrs` : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                record.status === 'Present' ? 'bg-green-100 text-green-800' : 
                                                record.status === 'Late' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                                {record.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* --- PAGINATION CONTROLS --- */}
                {records.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t border-gray-200">
                        <div className="text-sm text-gray-500">
                            Showing <span className="font-medium">{indexOfFirstRecord + 1}</span> to <span className="font-medium">{Math.min(indexOfLastRecord, records.length)}</span> of <span className="font-medium">{records.length}</span> records
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Previous
                            </button>
                            <span className="px-3 py-1 text-sm font-semibold text-gray-700 flex items-center">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AttendanceMonitor;