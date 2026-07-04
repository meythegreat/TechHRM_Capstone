import React, { useEffect, useState } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getDashboardStats, downloadCSV } from '../services/analyticsService';

const StatCard = ({ title, value, color }) => (
    <div className={`p-5 rounded-xl border ${color.replace('text', 'border').replace('50', '200')} ${color}`}>
        <span className="text-xs font-black uppercase tracking-wider block mb-1">{title}</span>
        <h3 className="text-3xl font-black">{value}</h3>
    </div>
);

const AdminAnalyticsDashboard = () => {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await getDashboardStats();
                setStats(res.data);
            } catch (err) {
                console.error('Failed to load analytics', err);
                setError('Unable to load analytics data.');
            }
        };
        fetchStats();
    }, []);

    const exportToPDF = () => {
        if (!stats) return;

        const doc = new jsPDF();
        doc.text('TechHRM: Department Workload Analysis', 14, 15);

        const tableRows = stats.department_workload.map((dept) => [
            dept.department || 'Unassigned',
            String(dept.total_hours),
        ]);

        autoTable(doc, {
            head: [['Department', 'Total Hours Rendered']],
            body: tableRows.length > 0 ? tableRows : [['No data', '0']],
            startY: 20,
        });

        doc.save(`TechHRM_Workload_Report_${new Date().toLocaleDateString()}.pdf`);
    };

    const handleDownloadCSV = async () => {
        setIsExporting(true);
        try {
            await downloadCSV();
        } catch (err) {
            console.error('CSV export failed', err);
            alert('Failed to export CSV. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    if (error) {
        return <div className="p-6 text-red-600 font-bold">{error}</div>;
    }

    if (!stats) {
        return <div className="p-6 text-gray-500 font-bold">Loading Analytics...</div>;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h2 className="text-2xl font-black text-blue-900 tracking-tight">Workforce Analytics</h2>
                <div className="flex gap-3">
                    <button
                        onClick={handleDownloadCSV}
                        disabled={isExporting}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow disabled:opacity-50"
                    >
                        {isExporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                    <button
                        onClick={exportToPDF}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow"
                    >
                        Export PDF
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Active Workers" value={stats.summary.total_students} color="bg-blue-50 text-blue-700" />
                <StatCard title="Total Hours Rendered" value={`${stats.summary.total_hours_rendered} hrs`} color="bg-green-50 text-green-700" />
                <StatCard title="Pending Applications" value={stats.summary.pending_applications} color="bg-orange-50 text-orange-700" />
                <StatCard
                    title="Active Anomalies/Penalties"
                    value={stats.summary.active_anomalies + stats.summary.active_penalties}
                    color="bg-red-50 text-red-700"
                />
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mt-8">
                <h3 className="font-extrabold text-lg text-gray-800 mb-6">Department Workload Analysis</h3>
                <div className="h-80 w-full">
                    {stats.department_workload.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.department_workload}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="department" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                                <YAxis />
                                <Tooltip cursor={{ fill: '#f3f4f6' }} />
                                <Bar dataKey="total_hours" fill="#2563eb" radius={[4, 4, 0, 0]} name="Total Hours" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 font-bold">
                            Not enough data to render chart.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminAnalyticsDashboard;
