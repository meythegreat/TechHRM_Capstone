import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, type Variants } from 'framer-motion';
import { 
    Clock, 
    Calendar, 
    CheckCircle, 
    AlertCircle, 
    FileText,
    TrendingUp,
    Briefcase,
    Award,
    ChevronRight,
    LayoutDashboard
} from 'lucide-react';

// IMPORT YOUR REAL TASK SERVICE!
import { getMyTasks } from '../services/taskService';

interface DashboardData {
    total_hours_rendered: number;
    logged_hours: number;
    penalty_hours: number;
    required_hours: number;
    upcoming_schedules: any[];
    recent_tasks: any[];
    pending_tasks_count: number;
    performance_score: number;
    has_activity: boolean;
    violations: number;
}

const emptyDashboard = (): DashboardData => ({
    total_hours_rendered: 0,
    logged_hours: 0,
    penalty_hours: 0,
    required_hours: 100,
    upcoming_schedules: [],
    recent_tasks: [],
    pending_tasks_count: 0,
    performance_score: 0,
    has_activity: false,
    violations: 0,
});

const StudentOverview = () => {
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const userName = localStorage.getItem('user_name') || 'Student Worker';
    const [supervisorNames, setSupervisorNames] = useState<string[]>([]);
    const [assignedOffice, setAssignedOffice] = useState(localStorage.getItem('assigned_office') || '');

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const profileRes = await axios.get('/api/user').catch(() => ({ data: {} as any }));
                const profile = profileRes.data || {};
                setAssignedOffice(profile.profile?.assigned_office || localStorage.getItem('assigned_office') || '');
                setSupervisorNames(Array.isArray(profile.department_supervisors) ? profile.department_supervisors : []);

                const dashboardRes = await axios.get('/api/student/dashboard');

                // 2. Fetch REAL Dynamic Tasks
                const tasksRes = await getMyTasks().catch(() => ({ data: [] }));
                const realTasks = tasksRes.data || [];

                // 3. Process the tasks for the dashboard
                const recentRealTasks = [...realTasks].reverse().slice(0, 5); // Get 5 newest
                const pendingCount = realTasks.filter((t: any) => t.status === 'Pending' || t.status === 'In Progress').length;

                // 4. Combine into state
                setData({
                    ...dashboardRes.data,
                    recent_tasks: recentRealTasks,
                    pending_tasks_count: pendingCount
                });

            } catch (error) {
                console.error("Error fetching dashboard data", error);
                setData(emptyDashboard());
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    // ANIMATION VARIANTS
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold animate-pulse">Loading your workspace...</p>
                </div>
            </div>
        );
    }

    const progressPercentage = data && data.required_hours > 0
        ? Math.min((data.total_hours_rendered / data.required_hours) * 100, 100)
        : 0;

    const performanceScore = data?.performance_score ?? 0;
    const performanceTone = performanceScore >= 90
        ? 'text-emerald-600'
        : performanceScore >= 75
            ? 'text-blue-600'
            : performanceScore >= 50
                ? 'text-amber-600'
                : 'text-rose-600';
    const performanceNote = !data?.has_activity
        ? 'Complete a shift or task to start your score.'
        : performanceScore >= 90
            ? 'Keep up the great work!'
            : performanceScore >= 75
                ? 'Solid standing. Stay consistent with your shifts.'
                : performanceScore >= 50
                    ? 'Room to improve on attendance and tasks.'
                    : 'Needs attention. Review tasks and disciplinary records.';

    return (
        <div className="space-y-8 font-sans">
            
            {/* DARK THEME HEADER - OVERVIEW */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <LayoutDashboard className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Workspace</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Dashboard Overview
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Welcome back, {userName.split(' ')[0]}. Manage your hours, track tasks, and monitor your overall progress.
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                        <CheckCircle className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Department Supervisor</span>
                        <span className="text-sm font-extrabold text-emerald-400">
                            {supervisorNames.length > 0 ? supervisorNames.join(', ') : 'Not assigned'}
                        </span>
                        {assignedOffice && (
                            <span className="text-[10px] font-medium text-slate-400 mt-0.5">{assignedOffice}</span>
                        )}
                    </div>
                </div>
            </motion.div>

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            >
                {/* Stat Card 1: Hours Rendered */}
                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-blue-300 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Hours Rendered</p>
                            <h3 className="text-3xl font-black text-slate-900">{Number(data?.total_hours_rendered ?? 0).toFixed(2)} <span className="text-sm font-bold text-slate-400">/ {data?.required_hours ?? 100}</span></h3>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Clock className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-sm text-slate-500 mt-4 font-medium">
                        {(data?.penalty_hours ?? 0) > 0
                            ? `${Number(data?.logged_hours ?? 0).toFixed(1)} logged, ${Number(data?.penalty_hours).toFixed(1)} penalty hrs deducted.`
                            : 'Credited from your completed attendance logs.'}
                    </p>
                    <div className="w-full bg-slate-100 rounded-full h-2 mt-4 overflow-hidden">
                        <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPercentage}%` }}
                            transition={{ duration: 1, delay: 0.5 }}
                            className="bg-blue-600 h-2 rounded-full"
                        ></motion.div>
                    </div>
                </motion.div>

                {/* Stat Card 2: Performance */}
                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-emerald-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Performance</p>
                            <h3 className={`text-3xl font-black ${performanceTone}`}>{performanceScore}%</h3>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-sm text-slate-500 mt-4 font-medium flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-emerald-500" /> {performanceNote}
                    </p>
                </motion.div>

                {/* Stat Card 3: DYNAMIC Pending Tasks */}
                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-amber-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active Tasks</p>
                            <h3 className="text-3xl font-black text-slate-900">
                                {data?.pending_tasks_count || 0}
                            </h3>
                        </div>
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Briefcase className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-sm text-slate-500 mt-4 font-medium">Requires your attention today.</p>
                </motion.div>

                {/* Stat Card 4: Violations */}
                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-slate-300 transition-colors">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Disciplinary</p>
                            <h3 className="text-3xl font-black text-slate-900">{data?.violations}</h3>
                        </div>
                        <div className="p-3 bg-slate-100 text-slate-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <AlertCircle className="w-6 h-6" />
                        </div>
                    </div>
                    <p className={`text-sm mt-4 font-medium flex items-center gap-1.5 ${(data?.violations ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {(data?.violations ?? 0) > 0 ? (
                            <><AlertCircle className="w-4 h-4" /> Open records on file.</>
                        ) : (
                            <><CheckCircle className="w-4 h-4" /> Clean record so far.</>
                        )}
                    </p>
                </motion.div>
            </motion.div>

            {/* Bottom Section: Tables / Lists */}
            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 lg:grid-cols-2 gap-8"
            >
                {/* Upcoming Schedule */}
                <motion.div variants={itemVariants} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 tracking-tight">
                            <Calendar className="w-5 h-5 text-blue-600" />
                            Upcoming Shifts
                        </h3>
                    </div>
                    <div className="p-4 flex-1">
                        {data?.upcoming_schedules.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                                <Calendar className="w-12 h-12 mb-3 opacity-20" />
                                <p className="font-bold">No upcoming shifts scheduled.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {data?.upcoming_schedules.map((sched) => (
                                    <div key={sched.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all group cursor-default">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-blue-50 text-blue-700 w-12 h-12 rounded-xl flex items-center justify-center font-black">
                                                <span className="text-xs uppercase">{sched.day.substring(0,3)}</span>
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900">{sched.location}</p>
                                                <p className="text-sm text-slate-500 font-bold flex items-center gap-1 mt-0.5">
                                                    <Clock className="w-3.5 h-3.5" /> {sched.time_start} - {sched.time_end}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* DYNAMIC Recent Tasks */}
                <motion.div variants={itemVariants} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 tracking-tight">
                            <FileText className="w-5 h-5 text-blue-600" />
                            Recent Tasks
                        </h3>
                    </div>
                    <div className="p-0 flex-1">
                        {data?.recent_tasks.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                                <FileText className="w-12 h-12 mb-3 opacity-20" />
                                <p className="font-bold">No recent tasks logged.</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {data?.recent_tasks.map((task) => (
                                    <li key={task.id} className="p-5 hover:bg-slate-50 transition-colors flex items-center justify-between group cursor-pointer">
                                        <div>
                                            <p className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                                {task.title || 'Untitled Task'}
                                            </p>
                                            <p className="text-xs text-slate-500 font-medium mt-1">
                                                {task.date || 'Recently Assigned'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className={`px-3 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full border ${
                                                task.status === 'Completed' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                                task.status === 'In Progress' ? 'bg-blue-50 border-blue-200 text-blue-700 animate-pulse' :
                                                'bg-amber-50 border-amber-200 text-amber-700'
                                            }`}>
                                                {task.status}
                                            </span>
                                            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-600 transition-colors" />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default StudentOverview;