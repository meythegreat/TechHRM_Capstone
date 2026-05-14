import { useState, useEffect } from 'react';
import axios from 'axios';

const AdminDashboard = () => {
    const userName = localStorage.getItem('user_name') || 'Admin';
    const userRole = localStorage.getItem('user_role') || 'Supervisor';
    
    // Default state starts at 0 until the API responds
    const [stats, setStats] = useState({
        activeStudents: 0,
        pendingApprovals: 0,
        totalHoursThisWeek: 0
    });

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await axios.get('/api/admin/stats');
                setStats(response.data);
            } catch (err) {
                console.error("Failed to load dashboard stats", err);
            }
        };
        fetchStats();
    }, []);

    return (
        <div className="space-y-6 fade-in font-sans">
            
            {/* --- HEADER SECTION --- */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                        Welcome back, {userName.split(' ')[0]}!
                    </h2>
                    <p className="mt-2 text-sm font-medium text-gray-500">
                        {userRole === 'Supervisor' 
                            ? "Here is the overview for your department's working students." 
                            : "Here is the university-wide overview for the WSPO program."}
                    </p>
                </div>
                <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
                    <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Current Role: </span>
                    <span className="text-sm font-extrabold text-blue-900">{userRole}</span>
                </div>
            </div>

            {/* --- QUICK STATS CARDS --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Active Students</p>
                            <h3 className="text-3xl font-extrabold text-gray-900">{stats.activeStudents}</h3>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-orange-500 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Pending Approvals</p>
                            <h3 className="text-3xl font-extrabold text-gray-900">{stats.pendingApprovals}</h3>
                        </div>
                        <div className="p-3 bg-orange-50 rounded-xl text-orange-500">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Hours Logged (Week)</p>
                            <h3 className="text-3xl font-extrabold text-gray-900">{stats.totalHoursThisWeek}</h3>
                        </div>
                        <div className="p-3 bg-green-50 rounded-xl text-green-600">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- RECENT ACTIVITY PREVIEW --- */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="text-lg font-bold text-gray-900">Recent Student Activity</h3>
                    <button className="text-sm font-bold text-blue-600 hover:text-blue-700">View All</button>
                </div>
                <div className="p-8 text-center">
                    <p className="text-gray-500 font-medium">Activity feed will populate here once students begin logging hours.</p>
                </div>
            </div>

        </div>
    );
};

export default AdminDashboard;