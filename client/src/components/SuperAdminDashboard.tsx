import { useState, useEffect } from 'react';
import axios from 'axios';

interface DashboardStats {
    total_students: number;
    active_now: number;
    total_hours: number;
    estimated_payroll: number;
    department_stats: { department: string; student_count: number }[];
    recent_activity: any[];
}

const SuperAdminDashboard = () => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchStats();
        // Auto-refresh every 30 seconds for a true "Live" dashboard feel
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchStats = async () => {
        try {
            const response = await axios.get('/api/admin/dashboard-stats');
            setStats(response.data);
        } catch (error) {
            console.error("Failed to load command center stats:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (dateString: string) => {
        return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    if (isLoading || !stats) {
        return <div className="flex justify-center items-center h-full text-gray-500 font-bold">Loading Command Center...</div>;
    }

    return (
        <div className="space-y-6 fade-in font-sans relative pb-10">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900 to-blue-800 p-8 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-white">
                <div>
                    <h2 className="text-3xl font-extrabold tracking-tight">Executive Command Center</h2>
                    <p className="text-blue-200 font-medium mt-1">Filamer Christian University • TechHRM Global Analytics</p>
                </div>
                <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm border border-white/20">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"></span>
                    <span className="text-sm font-bold tracking-wider uppercase text-blue-50">Live Sync</span>
                </div>
            </div>

            {/* TOP ROW: Global Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Active Now</p>
                    <div className="flex items-end gap-3">
                        <p className="text-4xl font-extrabold text-green-600">{stats.active_now}</p>
                        <p className="text-sm font-medium text-gray-400 mb-1">students on duty</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Workforce</p>
                    <div className="flex items-end gap-3">
                        <p className="text-4xl font-extrabold text-gray-900">{stats.total_students}</p>
                        <p className="text-sm font-medium text-gray-400 mb-1">enrolled workers</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Hours Rendered</p>
                    <div className="flex items-end gap-3">
                        <p className="text-4xl font-extrabold text-blue-600">{stats.total_hours}</p>
                        <p className="text-sm font-medium text-gray-400 mb-1">all time</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-purple-500">
                    <p className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-1">Est. Payroll Cost</p>
                    <div className="flex items-end gap-2">
                        <p className="text-4xl font-extrabold text-gray-900">₱{stats.estimated_payroll.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* BOTTOM ROW: Breakdown & Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Col: Department Leaderboard */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-extrabold text-gray-900 mb-6">Workforce Distribution by Department</h3>
                    <div className="space-y-5">
                        {stats.department_stats.length === 0 ? (
                            <p className="text-gray-500 text-sm">No department data available.</p>
                        ) : (
                            stats.department_stats.map((dept, index) => {
                                // Calculate percentage relative to total students for the progress bar
                                const percentage = Math.min((dept.student_count / Math.max(stats.total_students, 1)) * 100, 100);
                                
                                return (
                                    <div key={index}>
                                        <div className="flex justify-between text-sm mb-1.5">
                                            <span className="font-bold text-gray-700">{dept.department}</span>
                                            <span className="font-bold text-gray-900">{dept.student_count} Workers</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                            <div 
                                                className="bg-blue-600 h-2.5 rounded-full" 
                                                style={{ width: `${percentage}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* Right Col: Live Activity Feed */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-extrabold text-gray-900 mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Global Activity Feed
                    </h3>
                    <div className="space-y-4">
                        {stats.recent_activity.length === 0 ? (
                            <p className="text-gray-500 text-sm">No recent activity.</p>
                        ) : (
                            stats.recent_activity.map((record) => (
                                <div key={record.id} className="flex gap-3 border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 flex-shrink-0">
                                        {record.user?.name?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900 leading-tight">{record.user?.name || 'Unknown User'}</p>
                                        <p className="text-xs text-gray-500">{record.user?.profile?.assigned_office}</p>
                                        <div className="mt-1 flex items-center gap-2">
                                            {record.time_out === null ? (
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-0.5 rounded">Clocked In</span>
                                            ) : (
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 px-2 py-0.5 rounded">Clocked Out</span>
                                            )}
                                            <span className="text-xs font-bold text-gray-400">@ {formatTime(record.updated_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SuperAdminDashboard;