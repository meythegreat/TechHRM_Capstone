import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { 
    PieChart, 
    Download, 
    FileText, 
    Users, 
    Clock, 
    ShieldAlert, 
    AlertTriangle,
    Database,
    Activity
} from 'lucide-react';

const AdminAnalyticsDashboard = () => {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            setIsLoading(true);
            try {
                const res = await getDashboardStats();
                setStats(res.data);
            } catch (err) {
                console.error('Failed to load analytics', err);
                setError('Unable to load analytics data.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, []);

    const exportToPDF = () => {
        if (!stats) return;
        setIsExporting(true);
        
        try {
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text('TechHRM: System Analytics & Workload Report', 14, 20);
            
            doc.setFontSize(10);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);

            // Summary Table
            autoTable(doc, {
                startY: 35,
                head: [['Key Metric', 'Recorded Value']],
                body: [
                    ['Total Assigned Student Workers', stats.summary.total_students],
                    ['Total Rendered Hours (System-wide)', `${stats.summary.total_hours_rendered} hrs`],
                    ['Unresolved Attendance Anomalies', stats.summary.active_anomalies],
                    ['Active Disciplinary Penalties', stats.summary.active_penalties],
                ],
                theme: 'grid',
                headStyles: { fillColor: [37, 99, 235] }
            });

            // Department Table
            if (stats.department_workload && stats.department_workload.length > 0) {
                const finalY = doc.lastAutoTable.finalY || 35;
                doc.text('Department Workload Distribution', 14, finalY + 15);
                
                const deptBody = stats.department_workload.map(d => [d.department, `${d.total_hours} hrs`]);
                
                autoTable(doc, {
                    startY: finalY + 20,
                    head: [['Department / Office', 'Total Rendered Hours']],
                    body: deptBody,
                    theme: 'striped',
                    headStyles: { fillColor: [79, 70, 229] }
                });
            }

            doc.save('TechHRM_Analytics_Report.pdf');
        } catch (err) {
            console.error("PDF Export failed", err);
        } finally {
            setIsExporting(false);
        }
    };

    const handleCSVExport = async () => {
        setIsExporting(true);
        try {
            await downloadCSV();
        } catch (err) {
            console.error("CSV Export failed", err);
        } finally {
            setIsExporting(false);
        }
    };

    // ANIMATION VARIANTS
    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                <p className="text-slate-500 font-bold animate-pulse">Initializing data engine...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
                <ShieldAlert className="w-16 h-16 text-red-400 mb-4 opacity-50" />
                <p className="text-xl font-bold text-slate-700">{error}</p>
                <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors">
                    Retry Connection
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
            
            {/* DARK THEME HEADER - ANALYTICS COMMAND CENTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Glowing Orbs */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <PieChart className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Reporting & Intelligence</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        System Analytics
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Comprehensive data visualization and reporting for Work-Study Program operations.
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                        <Database className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data Engine</span>
                        <span className="text-sm font-extrabold text-emerald-400">
                            Live Synchronization
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* STAT CARDS GRID */}
            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
            >
                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-blue-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Workers</p>
                            <h3 className="text-3xl font-black text-slate-900">{stats.summary.total_students}</h3>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Users className="w-6 h-6" />
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-emerald-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Hours</p>
                            <h3 className="text-3xl font-black text-slate-900">
                                {stats.summary.total_hours_rendered} <span className="text-sm text-slate-400">hrs</span>
                            </h3>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Clock className="w-6 h-6" />
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-red-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active Anomalies</p>
                            <h3 className="text-3xl font-black text-slate-900">{stats.summary.active_anomalies}</h3>
                        </div>
                        <div className="p-3 bg-red-50 text-red-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <ShieldAlert className="w-6 h-6" />
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-amber-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active Penalties</p>
                            <h3 className="text-3xl font-black text-slate-900">{stats.summary.active_penalties}</h3>
                        </div>
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {/* CHART & EXPORT AREA */}
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col"
            >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 border-b border-slate-100 pb-6">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <Activity className="w-5 h-5 text-blue-600" /> Department Workload Analysis
                        </h3>
                        <p className="text-sm text-slate-500 font-medium mt-1">Total hours rendered per assigned office.</p>
                    </div>
                    
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button 
                            onClick={handleCSVExport}
                            disabled={isExporting}
                            className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <FileText className="w-4 h-4" /> Export CSV
                        </button>
                        <button 
                            onClick={exportToPDF}
                            disabled={isExporting}
                            className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" /> Save PDF
                        </button>
                    </div>
                </div>

                <div className="h-[400px] w-full">
                    {stats.department_workload && stats.department_workload.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.department_workload} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis 
                                    dataKey="department" 
                                    tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} 
                                    interval={0} 
                                    angle={-25} 
                                    textAnchor="end" 
                                    height={80} 
                                    axisLine={false}
                                    tickLine={false}
                                    dy={10}
                                />
                                <YAxis 
                                    tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} 
                                    axisLine={false}
                                    tickLine={false}
                                    dx={-10}
                                />
                                <Tooltip 
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar 
                                    dataKey="total_hours" 
                                    fill="#3b82f6" 
                                    radius={[6, 6, 0, 0]} 
                                    name="Total Hours" 
                                    animationDuration={1500}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <Activity className="w-16 h-16 mb-4 opacity-20" />
                            <span className="font-bold text-lg text-slate-600">Not enough data to render chart.</span>
                            <span className="text-sm font-medium">Workload statistics will appear here once shifts are logged.</span>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default AdminAnalyticsDashboard;