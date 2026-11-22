import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
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
import { REALTIME_EVENT } from '../utils/realtime';
import {
    PieChart,
    Download,
    FileText,
    Users,
    Clock,
    ShieldAlert,
    AlertTriangle,
    Database,
    Activity,
    RefreshCw,
} from 'lucide-react';

const AdminAnalyticsDashboard = () => {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const fetchStats = async (silent = false) => {
            if (!silent) setIsLoading(true);
            try {
                const res = await getDashboardStats();
                setStats(res.data);
                setError(null);
            } catch (err) {
                console.error('Failed to load analytics', err);
                setError('Unable to load analytics data.');
            } finally {
                if (!silent) setIsLoading(false);
            }
        };
        fetchStats();
        const refresh = () => fetchStats(true);
        const interval = setInterval(refresh, 5000);
        window.addEventListener(REALTIME_EVENT, refresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, refresh);
        };
    }, []);

    const exportToPDF = () => {
        if (!stats) return;
        setIsExporting(true);

        try {
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text('WoSPIS: System Analytics & Workload Report', 14, 20);

            doc.setFontSize(10);
            doc.text(
                `Generated on: ${new Date().toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                })}`,
                14,
                28
            );

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
                headStyles: { fillColor: [37, 99, 235] },
            });

            // Department Table
            if (stats.department_workload && stats.department_workload.length > 0) {
                const finalY = doc.lastAutoTable.finalY || 35;
                doc.text('Department Workload Distribution', 14, finalY + 15);

                const deptBody = stats.department_workload.map((d) => [
                    d.department,
                    `${d.total_hours} hrs`,
                ]);

                autoTable(doc, {
                    startY: finalY + 20,
                    head: [['Department / Office', 'Total Rendered Hours']],
                    body: deptBody,
                    theme: 'striped',
                    headStyles: { fillColor: [79, 70, 229] },
                });
            }

            doc.save('WoSPIS_Analytics_Report.pdf');
        } catch (err) {
            console.error('PDF Export failed', err);
        } finally {
            setIsExporting(false);
        }
    };

    const handleCSVExport = async () => {
        setIsExporting(true);
        try {
            await downloadCSV();
        } catch (err) {
            console.error('CSV Export failed', err);
        } finally {
            setIsExporting(false);
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.08 } },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 16 },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
        },
    };

    if (isLoading) {
        return (
            <div
                className="mx-auto max-w-7xl space-y-6 p-4 animate-pulse sm:p-8"
                aria-busy="true"
                aria-label="Initializing data engine"
            >
                <div className="h-44 rounded-[2rem] bg-slate-900/90" />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }, (_, idx) => (
                        <div key={idx} className="h-32 rounded-[1.75rem] bg-slate-200/80" />
                    ))}
                </div>
                <div className="h-[460px] rounded-[1.75rem] bg-slate-200/80" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center p-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
                    <ShieldAlert className="h-8 w-8" />
                </div>
                <p className="text-lg font-black text-slate-900">{error}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                    Check your network connection and try again.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry Connection
                </button>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
            {/* OBSIDIAN ANALYTICS COMMAND HERO */}
            <motion.header
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
            >
                <div
                    className="pointer-events-none absolute inset-0 opacity-20"
                    style={{
                        backgroundImage:
                            'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                    }}
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl"
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                            <PieChart className="h-3.5 w-3.5 text-blue-400" />
                            Reporting &amp; Intelligence
                        </span>
                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            System Analytics
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            Comprehensive data visualization, department workload distribution, and exportable reports for Work-Study Program operations.
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
                            <Database className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Data Engine
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-sm font-black text-emerald-300">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                                Live Synchronization
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            {/* 4-COLUMN TELEMETRY BENTO */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
            >
                <motion.div
                    variants={itemVariants}
                    className="group rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                Total Workers
                            </p>
                            <h3 className="mt-2 font-mono text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                {stats.summary.total_students}
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 transition-transform group-hover:scale-105">
                            <Users className="h-6 w-6" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    variants={itemVariants}
                    className="group rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                Total Hours
                            </p>
                            <h3 className="mt-2 flex items-baseline gap-1.5 font-mono text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                {stats.summary.total_hours_rendered}
                                <span className="font-sans text-sm font-bold text-slate-400">
                                    hrs
                                </span>
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 transition-transform group-hover:scale-105">
                            <Clock className="h-6 w-6" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    variants={itemVariants}
                    className="group rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:border-rose-200 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                Active Anomalies
                            </p>
                            <h3 className="mt-2 font-mono text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                {stats.summary.active_anomalies}
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100 transition-transform group-hover:scale-105">
                            <ShieldAlert className="h-6 w-6" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    variants={itemVariants}
                    className="group rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:border-amber-200 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                Active Penalties
                            </p>
                            <h3 className="mt-2 font-mono text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                {stats.summary.active_penalties}
                            </h3>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 transition-transform group-hover:scale-105">
                            <AlertTriangle className="h-6 w-6" />
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {/* CHART & EXPORT DECK */}
            <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm"
            >
                <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-6 py-5 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                            <Activity className="h-5 w-5" />
                        </span>
                        <div>
                            <h3 className="text-base font-black tracking-tight text-slate-900">
                                Department Workload Analysis
                            </h3>
                            <p className="text-xs font-medium text-slate-500">
                                Total hours rendered per assigned campus office
                            </p>
                        </div>
                    </div>

                    <div className="flex w-full gap-2.5 sm:w-auto">
                        <button
                            onClick={handleCSVExport}
                            disabled={isExporting}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50 sm:flex-none"
                        >
                            <FileText className="h-4 w-4 text-slate-500" />
                            Export CSV
                        </button>
                        <button
                            onClick={exportToPDF}
                            disabled={isExporting}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50 sm:flex-none"
                        >
                            <Download className="h-4 w-4" />
                            Save PDF
                        </button>
                    </div>
                </div>

                <div className="h-[420px] w-full p-6 sm:p-7">
                    {stats.department_workload && stats.department_workload.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={stats.department_workload}
                                margin={{ top: 16, right: 24, left: 0, bottom: 60 }}
                            >
                                <defs>
                                    <linearGradient
                                        id="workloadBarGradient"
                                        x1="0"
                                        y1="0"
                                        x2="0"
                                        y2="1"
                                    >
                                        <stop offset="0%" stopColor="#2563eb" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.85} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="#e2e8f0"
                                />
                                <XAxis
                                    dataKey="department"
                                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }}
                                    interval={0}
                                    angle={-25}
                                    textAnchor="end"
                                    height={80}
                                    axisLine={false}
                                    tickLine={false}
                                    dy={10}
                                />
                                <YAxis
                                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }}
                                    axisLine={false}
                                    tickLine={false}
                                    dx={-10}
                                />
                                <Tooltip
                                    cursor={{ fill: '#f1f5f9' }}
                                    contentStyle={{
                                        backgroundColor: '#020617',
                                        borderRadius: '14px',
                                        border: '1px solid #1e293b',
                                        color: '#f8fafc',
                                        boxShadow: '0 10px 25px -5px rgba(2, 6, 23, 0.35)',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                    }}
                                    itemStyle={{ color: '#93c5fd' }}
                                    labelStyle={{ color: '#ffffff', marginBottom: '4px' }}
                                />
                                <Bar
                                    dataKey="total_hours"
                                    fill="url(#workloadBarGradient)"
                                    radius={[8, 8, 0, 0]}
                                    name="Total Hours"
                                    animationDuration={1200}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                <Activity className="h-7 w-7" />
                            </div>
                            <span className="text-sm font-extrabold text-slate-700">
                                Not enough data to render chart
                            </span>
                            <span className="mt-1 text-xs font-medium text-slate-400">
                                Workload statistics will appear here once shifts are logged.
                            </span>
                        </div>
                    )}
                </div>
            </motion.section>
        </div>
    );
};

export default AdminAnalyticsDashboard;