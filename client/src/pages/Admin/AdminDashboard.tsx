import { type FC, useEffect, useState } from 'react';
import axios from 'axios';

interface ActionLog {
    id: number;
    admin_name: string;
    description: string;
    created_at: string;
}

interface DashboardData {
    total_students: number;
    active_deployments: number;
    present_today: number;
    recent_actions: ActionLog[];
}

const AdminDashboard: FC = () => {
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        // Inside the useEffect in AdminDashboard.tsx
        const fetchDashboardData = async () => {
            try {
                // Update this to point to your Laravel server's full URL
                const response = await axios.get('http://localhost:8000/api/admin/dashboard-metrics'); 
                setData(response.data);
            } catch (error) {
                console.error("Failed to fetch dashboard data", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    if (isLoading) return <div>Loading metrics...</div>;

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6 text-gray-800">Admin Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                    <h2 className="text-gray-500 text-sm uppercase tracking-wide">Total Working Students</h2>
                    <p className="text-3xl font-bold text-gray-800">{data?.total_students}</p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
                    <h2 className="text-gray-500 text-sm uppercase tracking-wide">Active Deployments</h2>
                    <p className="text-3xl font-bold text-gray-800">{data?.active_deployments}</p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
                    <h2 className="text-gray-500 text-sm uppercase tracking-wide">Present Today</h2>
                    <p className="text-3xl font-bold text-gray-800">{data?.present_today}</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Recent Staff Actions</h2>
                <ul className="divide-y divide-gray-200">
                    {data?.recent_actions.map(action => (
                        <li key={action.id} className="py-3">
                            <p className="text-sm text-gray-800">
                                <span className="font-semibold">{action.admin_name}</span> {action.description}
                            </p>
                            <p className="text-xs text-gray-500">{new Date(action.created_at).toLocaleString()}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default AdminDashboard;