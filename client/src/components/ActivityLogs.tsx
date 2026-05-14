import { useState, useEffect } from 'react';
import axios from 'axios';

interface LogRecord {
    id: number;
    admin_id: number;
    admin_name: string;
    action: string;
    description: string;
    ip_address: string;
    created_at: string;
}

const ActivityLogs = () => {
    const [logs, setLogs] = useState<LogRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        fetchLogs(currentPage);
    }, [currentPage]);

    const fetchLogs = async (page: number) => {
        setIsLoading(true);
        try {
            // Fetching paginated data from Laravel
            const response = await axios.get(`/api/logs?page=${page}`);
            
            // Laravel's paginate() wraps the array in 'data'
            setLogs(response.data.data); 
            setCurrentPage(response.data.current_page);
            setTotalPages(response.data.last_page);
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to color-code different actions beautifully
    const getActionBadge = (action: string) => {
        const baseStyle = "px-2.5 py-1 rounded-md text-xs font-bold border";
        if (action.includes('Login') || action.includes('Logout')) {
            return `${baseStyle} bg-blue-50 text-blue-700 border-blue-200`;
        }
        if (action.includes('Create') || action.includes('Add')) {
            return `${baseStyle} bg-green-50 text-green-700 border-green-200`;
        }
        if (action.includes('Delete') || action.includes('Remove')) {
            return `${baseStyle} bg-red-50 text-red-700 border-red-200`;
        }
        if (action.includes('Update') || action.includes('Edit')) {
            return `${baseStyle} bg-orange-50 text-orange-700 border-orange-200`;
        }
        return `${baseStyle} bg-gray-100 text-gray-700 border-gray-200`;
    };

    return (
        <div className="space-y-6 fade-in font-sans">
            
            {/* Header Section */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">System Audit Trail</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Track system events, logins, and administrative actions.</p>
                </div>
                <button 
                    onClick={() => fetchLogs(currentPage)}
                    className="p-2 bg-gray-50 text-gray-500 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                    title="Refresh Logs"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>

            {/* Table Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date & Time</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">User / Admin</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">IP Address</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
                                        <p className="mt-4 text-sm font-medium text-gray-500">Loading audit trail...</p>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <p className="text-gray-500 font-medium">No activity logs found.</p>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {new Date(log.created_at).toLocaleString('en-US', { 
                                                month: 'short', day: 'numeric', year: 'numeric', 
                                                hour: 'numeric', minute: '2-digit', hour12: true 
                                            })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs mr-3">
                                                    {log.admin_name.charAt(0)}
                                                </div>
                                                <span className="text-sm font-bold text-gray-900">{log.admin_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={getActionBadge(log.action)}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 font-medium">
                                            {log.description}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                                            {log.ip_address}
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
                            Showing page <span className="font-bold text-gray-900">{currentPage}</span> of <span className="font-bold text-gray-900">{totalPages}</span>
                        </span>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Previous
                            </button>
                            <button 
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

export default ActivityLogs;