import { useState, useEffect } from 'react';
import axios from 'axios';

interface AttendanceRecord {
    id: number;
    time_in: string;
    time_out: string | null;
    work_type: string;
    task_description: string;
    rendered_hours: number | string | null;
    user: {
        name: string;
        profile?: {
            assigned_office: string;
        }
    };
}

function formatRenderedHoursCell(value: number | string | null | undefined): string {
    if (value == null || value === '') return '--';
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n.toFixed(2) : '--';
}

const AttendanceMonitor = () => {
    const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        fetchAttendances(currentPage);
    }, [currentPage]);

    const fetchAttendances = async (page: number) => {
        setIsLoading(true);
        try {
            const response = await axios.get(`/api/attendance/all?page=${page}`);
            setAttendances(response.data.data);
            setCurrentPage(response.data.current_page);
            setTotalPages(response.data.last_page);
        } catch (error) {
            console.error('Error fetching attendances:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (dateString: string | null) => {
        if (!dateString) return '--:--';
        return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    return (
        <div className="space-y-6 fade-in font-sans">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Timesheets & Attendance</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Review student worker hours and daily task descriptions.</p>
                </div>
                <button className="px-4 py-2 bg-green-50 text-green-700 font-bold border border-green-200 rounded-lg hover:bg-green-100 transition-colors shadow-sm flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export CSV
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date & Time</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Student & Dept</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Work Details</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Rendered</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">Loading timesheets...</td></tr>
                            ) : attendances.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No timesheets recorded yet.</td></tr>
                            ) : (
                                attendances.map((record) => (
                                    <tr key={record.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <div className="font-bold text-gray-900 mb-1">
                                                {new Date(record.time_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="text-blue-600 font-bold">{formatTime(record.time_in)}</span>
                                                <span className="text-gray-400">→</span>
                                                <span className={record.time_out ? "text-orange-500 font-bold" : "text-gray-400 font-medium"}>
                                                    {formatTime(record.time_out) || "Active"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-extrabold text-gray-900">{record.user.name}</div>
                                            <div className="text-xs font-medium text-gray-500">{record.user.profile?.assigned_office || 'Unassigned'}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm max-w-xs">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 mb-1">
                                                {record.work_type || 'Unspecified'}
                                            </span>
                                            <p className="text-gray-500 text-xs truncate font-medium" title={record.task_description}>
                                                {record.task_description || 'No description provided.'}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <span className="text-lg font-extrabold text-gray-900">
                                                {formatRenderedHoursCell(record.rendered_hours)}
                                            </span>
                                            <span className="text-xs text-gray-500 font-medium ml-1">hrs</span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {!isLoading && totalPages > 1 && (
                    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                        <span className="text-sm text-gray-500 font-medium">
                            Page <span className="font-bold text-gray-900">{currentPage}</span> of <span className="font-bold text-gray-900">{totalPages}</span>
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">Prev</button>
                            <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">Next</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AttendanceMonitor;