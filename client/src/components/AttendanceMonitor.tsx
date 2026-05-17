import { useState, useEffect } from 'react';
import axios from 'axios';

interface AttendanceRecord {
    id: number;
    time_in: string;
    time_out: string | null;
    rendered_hours: number | string | null;
    work_type: string | null;
    task_description: string | null;
    status: string; // NEW: pending or approved
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

    // --- NEW: APPROVE FUNCTION ---
    const handleApprove = async (id: number) => {
        try {
            await axios.patch(`/api/attendance/${id}/approve`);
            setToastMsg({ text: 'Timesheet approved successfully!', type: 'success' });
            fetchAttendance(); // Refresh the data
            setTimeout(() => setToastMsg(null), 3000);
        } catch (error) {
            setToastMsg({ text: 'Failed to approve timesheet.', type: 'error' });
            setTimeout(() => setToastMsg(null), 3000);
        }
    };

    // --- NEW: CSV EXPORT FUNCTION ---
    const handleExportCSV = () => {
        if (records.length === 0) {
            setToastMsg({ text: 'No records to export for this date.', type: 'error' });
            setTimeout(() => setToastMsg(null), 3000);
            return;
        }

        const headers = ["Student Name", "ID Number", "Department", "Time In", "Time Out", "Rendered Hours", "Duty", "Task", "Status"];
        const csvRows = [headers.join(",")];

        records.forEach(record => {
            const row = [
                `"${record.user?.name || ''}"`,
                `"${record.user?.profile?.student_id_number || ''}"`,
                `"${record.user?.profile?.assigned_office || ''}"`,
                `"${new Date(record.time_in).toLocaleString()}"`,
                `"${record.time_out ? new Date(record.time_out).toLocaleString() : 'Active Shift'}"`,
                `"${formatHours(record.rendered_hours)}"`,
                `"${record.work_type || ''}"`,
                `"${(record.task_description || '').replace(/"/g, '""')}"`, // escape quotes
                `"${(record.status || 'pending').toUpperCase()}"`
            ];
            csvRows.push(row.join(","));
        });

        const csvString = csvRows.join("\n");
        const blob = new Blob([csvString], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `TechHRM_Timesheet_Export_${filterDate || 'All'}.csv`;
        a.click();
    };

    const formatTime = (dateString: string | null) => {
        if (!dateString) return '--:--';
        return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const formatHours = (value: number | string | null): string => {
        if (value == null || value === '') return '0.00';
        const n = typeof value === 'number' ? value : parseFloat(String(value));
        return Number.isFinite(n) ? n.toFixed(2) : '0.00';
    };

    const activeNow = records.filter(r => r.time_out === null).length;
    const pendingApproval = records.filter(r => r.time_out !== null && r.status !== 'approved').length;

    return (
        <div className="space-y-6 fade-in font-sans relative pb-10">
            
            {/* GLOBAL TOAST */}
            {toastMsg && (
                <div className={`p-4 rounded-xl border font-bold text-sm flex items-center gap-2 shadow-sm ${toastMsg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <span>{toastMsg.text}</span>
                </div>
            )}

            {/* Header & Controls */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Timesheet Approvals</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Review completed shifts and export data for payroll.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg border border-gray-100 w-full sm:w-auto">
                        <label className="text-sm font-bold text-gray-500 px-2">Date:</label>
                        <input 
                            type="date" 
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="p-2 border border-gray-300 rounded-md outline-none focus:border-blue-500 font-medium text-sm" 
                        />
                        {filterDate !== '' && (
                            <button onClick={() => setFilterDate('')} className="text-xs text-blue-600 hover:text-blue-800 font-bold px-2">Clear</button>
                        )}
                    </div>
                    
                    {/* EXPORT BUTTON */}
                    <button 
                        onClick={handleExportCSV}
                        className="w-full sm:w-auto px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-orange-200 border-l-4 border-l-orange-500 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-orange-600 uppercase tracking-wider mb-1">Pending Approval</p>
                        <p className="text-3xl font-extrabold text-gray-900">{pendingApproval}</p>
                    </div>
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-200 border-l-4 border-l-green-500 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-green-600 uppercase tracking-wider mb-1">Active Now</p>
                        <p className="text-3xl font-extrabold text-gray-900">{activeNow}</p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Student</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Time In / Out</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Work Details</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase">Status & Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500 font-medium">Loading attendance records...</td></tr>
                            ) : records.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-500 font-medium text-sm">No attendance records found for this date.</td></tr>
                            ) : (
                                records.map((record) => (
                                    <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-bold text-gray-900">{record.user?.name || 'Unknown User'}</div>
                                            <div className="text-xs text-gray-500 font-mono mt-0.5">{record.user?.profile?.student_id_number || 'N/A'} • {record.user?.profile?.assigned_office || 'Unassigned'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-bold text-blue-600">{formatTime(record.time_in)}</div>
                                            <div className="text-xs font-bold text-gray-400 mt-0.5">
                                                {record.time_out ? `Out: ${formatTime(record.time_out)}` : 'Still active'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 max-w-xs">
                                            <div className="text-xs font-bold text-gray-700 mb-0.5 uppercase tracking-wider">{record.work_type || 'Unspecified'}</div>
                                            <p className="text-xs text-gray-500 truncate font-medium" title={record.task_description || ''}>
                                                {record.task_description || '--'}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right flex flex-col items-end gap-1">
                                            {record.time_out === null ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200 animate-pulse">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Active
                                                </span>
                                            ) : record.status === 'approved' ? (
                                                <div className="flex flex-col items-end">
                                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                                                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                        Approved
                                                    </span>
                                                    <div className="text-xs font-extrabold text-gray-900 mt-1">{formatHours(record.rendered_hours)} hrs</div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-end">
                                                    <button 
                                                        onClick={() => handleApprove(record.id)}
                                                        className="px-3 py-1.5 bg-orange-100 text-orange-700 hover:bg-orange-200 font-bold text-xs rounded border border-orange-200 transition-colors shadow-sm"
                                                    >
                                                        Approve Hours
                                                    </button>
                                                    <div className="text-xs font-extrabold text-gray-900 mt-1">{formatHours(record.rendered_hours)} hrs</div>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AttendanceMonitor;