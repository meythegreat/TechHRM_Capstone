import { useState, useEffect } from 'react';
import axios from 'axios';

interface User {
    fullname: string;
    role: string;
}

interface Log {
    id: number;
    user: User | null;
    action: string;
    description: string;
    ip_address: string;
    created_at: string;
    admin_name: string;
}

const ActivityLogs = () => {
    const [logs, setLogs] = useState<Log[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>('');

    // Pagination State
    const [currentPage, setCurrentPage] = useState<number>(1);
    const recordsPerPage = 15;

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        try {
            const response = await axios.get('/api/logs');
            setLogs(response.data);
        } catch (err) {
            setError('Failed to load activity logs.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    // --- PAGINATION LOGIC ---
    const totalPages = Math.ceil(logs.length / recordsPerPage);
    const indexOfLastRecord = currentPage * recordsPerPage;
    const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
    const currentRecords = logs.slice(indexOfFirstRecord, indexOfLastRecord);

    return (
        <div className="p-8 font-sans">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Audit Trail</h2>
                <p className="mt-1 text-sm text-gray-500">
                    A secure log of all administrative actions and system events.
                </p>
            </div>

            {error && <div className="mb-4 p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">{error}</div>}

            <div className="overflow-hidden bg-white shadow-sm ring-1 ring-black ring-opacity-5 rounded-xl border border-gray-100 flex flex-col">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {isLoading ? (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">Loading system logs...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">No logs found.</td></tr>
                            ) : (
                                currentRecords.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {new Date(log.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {log.user ? (
                                                <>
                                                    <div className="text-sm font-medium text-gray-900">{log.user.fullname}</div>
                                                    <div className="text-xs text-gray-500">{log.user.role}</div>
                                                </>
                                            ) : (
                                                /* Fallback to admin_name if the user account was deleted from the database */
                                                <>
                                                    <div className="text-sm font-medium text-gray-500">{log.admin_name || 'System'}</div>
                                                    <div className="text-xs text-gray-400 italic">Deleted Account</div>
                                                </>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-gray-100 text-gray-800">
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 max-w-md truncate">
                                            {log.description}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* --- PAGINATION CONTROLS --- */}
                {logs.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t border-gray-200">
                        <div className="text-sm text-gray-500">
                            Showing <span className="font-medium">{indexOfFirstRecord + 1}</span> to <span className="font-medium">{Math.min(indexOfLastRecord, logs.length)}</span> of <span className="font-medium">{logs.length}</span> logs
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

export default ActivityLogs;