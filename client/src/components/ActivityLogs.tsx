import { useState, useEffect } from 'react';
import axios from 'axios';

interface Log {
    id: number;
    activity: string;
    created_at: string;
    fullname: string;
    username: string;
}

const ActivityLogs = () => {
    const [logs, setLogs] = useState<Log[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>('');

    useEffect(() => {
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

        fetchLogs();
    }, []);

    // Format the timestamp into a readable date and time
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });
    };

    return (
        <div className="p-8 font-sans">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Audit Trail</h2>
                <p className="mt-1 text-sm text-gray-500">
                    A secure, read-only record of administrative actions and user sessions.
                </p>
            </div>

            {error && <div className="mb-4 p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">{error}</div>}

            <div className="overflow-hidden bg-white shadow-sm ring-1 ring-black ring-opacity-5 rounded-xl border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Activity</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {isLoading ? (
                                <tr><td colSpan={3} className="px-6 py-12 text-center text-sm text-gray-500">Loading audit logs...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={3} className="px-6 py-12 text-center text-sm text-gray-500">No activities recorded yet.</td></tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                                            {formatDate(log.created_at)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{log.fullname}</div>
                                            <div className="text-sm text-gray-500">@{log.username}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                            {log.activity}
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

export default ActivityLogs;