import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { REALTIME_EVENT } from '../utils/realtime';
import {
    Clock,
    Calendar,
    CheckCircle,
    AlertCircle,
    Award,
} from 'lucide-react';
import OrganizationScheduleCalendar from './OrganizationScheduleCalendar';

interface DashboardData {
    total_hours_rendered: number;
    logged_hours: number;
    penalty_hours: number;
    required_hours: number;
    upcoming_schedules: any[];
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
    performance_score: 0,
    has_activity: false,
    violations: 0,
});

function greetingFor(date: Date) {
    const hour = date.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

function ScoreRing({ score, tone }: { score: number; tone: string }) {
    const radius = 22;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.min(Math.max(score, 0), 100) / 100) * circumference;

    return (
        <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90" aria-hidden="true">
            <circle cx="28" cy="28" r={radius} fill="none" strokeWidth="4" className="stroke-slate-100" />
            <circle
                cx="28"
                cy="28"
                r={radius}
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className={tone}
            />
        </svg>
    );
}

const StudentOverview = () => {
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [userName, setUserName] = useState(localStorage.getItem('user_name') || 'Student Worker');
    const [supervisorNames, setSupervisorNames] = useState<string[]>([]);
    const [assignedOffice, setAssignedOffice] = useState(localStorage.getItem('assigned_office') || '');
    const reduceMotion = useReducedMotion();

    useEffect(() => {
        let active = true;
        const fetchDashboardData = async () => {
            try {
                const profileRes = await axios.get('/api/user').catch(() => ({ data: {} as any }));
                const profile = profileRes.data || {};
                if (!active) return;
                if (profile.name) {
                    setUserName(profile.name);
                    localStorage.setItem('user_name', profile.name);
                }
                const office = profile.profile?.assigned_office || '';
                setAssignedOffice(office || localStorage.getItem('assigned_office') || '');
                if (office) localStorage.setItem('assigned_office', office);
                setSupervisorNames(Array.isArray(profile.department_supervisors) ? profile.department_supervisors : []);

                const dashboardRes = await axios.get('/api/student/dashboard');
                if (!active) return;
                setData({
                    ...emptyDashboard(),
                    ...dashboardRes.data,
                });

            } catch (error) {
                console.error("Error fetching dashboard data", error);
                if (active) setData(emptyDashboard());
            } finally {
                if (active) setIsLoading(false);
            }
        };

        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 5000);
        window.addEventListener(REALTIME_EVENT, fetchDashboardData);
        return () => {
            active = false;
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, fetchDashboardData);
        };
    }, []);

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: reduceMotion ? 0 : 0.06 }
        }
    };

    const itemVariants: Variants = {
        hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] } }
    };

    if (isLoading) {
        return (
            <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Loading your workspace">
                <div className="h-20 rounded-2xl bg-slate-200/80" />
                <div className="grid gap-4 lg:grid-cols-5">
                    <div className="h-52 rounded-2xl bg-slate-200/80 lg:col-span-3" />
                    <div className="grid gap-4 lg:col-span-2">
                        <div className="h-24 rounded-2xl bg-slate-200/80" />
                        <div className="h-24 rounded-2xl bg-slate-200/80" />
                    </div>
                </div>
                <div className="h-48 rounded-2xl bg-slate-200/80" />
            </div>
        );
    }

    const rendered = Number(data?.total_hours_rendered ?? 0);
    const required = data?.required_hours ?? 100;
    const progressPercentage = required > 0 ? Math.min((rendered / required) * 100, 100) : 0;
    const remaining = Math.max(required - rendered, 0);
    const todayName = new Date().toLocaleDateString(undefined, { weekday: 'long' });
    const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const firstName = userName.split(' ')[0];

    const performanceScore = data?.performance_score ?? 0;
    const performanceTone = performanceScore >= 90
        ? 'stroke-emerald-500'
        : performanceScore >= 75
            ? 'stroke-blue-500'
            : performanceScore >= 50
                ? 'stroke-amber-500'
                : 'stroke-rose-500';
    const performanceText = performanceScore >= 90
        ? 'text-emerald-600'
        : performanceScore >= 75
            ? 'text-blue-600'
            : performanceScore >= 50
                ? 'text-amber-600'
                : 'text-rose-600';
    const performanceNote = !data?.has_activity
        ? 'Complete a shift to start your score.'
        : performanceScore >= 90
            ? 'Keep up the great work.'
            : performanceScore >= 75
                ? 'Solid standing. Stay consistent with your shifts.'
                : performanceScore >= 50
                    ? 'Room to improve on attendance.'
                    : 'Review your attendance and disciplinary records.';

    const supervisorLabel = supervisorNames.length > 0 ? supervisorNames.join(', ') : 'Not assigned';
    const shifts = data?.upcoming_schedules ?? [];
    const violations = data?.violations ?? 0;

    return (
        <div className="space-y-5">
            <motion.header
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
            >
                <div className="min-w-0">
                    <p className="text-sm text-slate-500">{dateLabel}</p>
                    <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                        {greetingFor(new Date())}, {firstName}
                    </h1>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                        {progressPercentage >= 100
                            ? 'You have completed the required hours for this term.'
                            : `${remaining.toFixed(1)} hours left to reach your ${required}-hour requirement.`}
                    </p>
                </div>

                <div className="flex min-w-0 items-center gap-3 self-start rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:self-auto">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <CheckCircle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Supervisor</p>
                        <p className="truncate text-sm font-semibold text-slate-900">{supervisorLabel}</p>
                        {assignedOffice && (
                            <p className="truncate text-xs text-slate-500">{assignedOffice}</p>
                        )}
                    </div>
                </div>
            </motion.header>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-4 lg:grid-cols-5"
            >
                <motion.section
                    variants={itemVariants}
                    className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-3"
                >
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Hours rendered</p>
                            <p className="mt-3 flex items-baseline gap-2">
                                <span className="text-5xl font-semibold tracking-tight tabular-nums text-slate-900">
                                    {rendered.toFixed(2)}
                                </span>
                                <span className="text-sm text-slate-400">of {required}</span>
                            </p>
                        </div>
                        <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                            <Clock className="h-5 w-5" />
                        </div>
                    </div>

                    <div className="mt-6">
                        <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
                            <span>{progressPercentage.toFixed(0)}% complete</span>
                            <span className="tabular-nums">{remaining.toFixed(1)} hrs left</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercentage}%` }}
                                transition={{ duration: reduceMotion ? 0 : 0.8, delay: reduceMotion ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
                                className="h-full rounded-full bg-blue-600"
                            />
                        </div>
                    </div>

                    <p className="mt-4 text-sm text-slate-500">
                        {(data?.penalty_hours ?? 0) > 0
                            ? `${Number(data?.logged_hours ?? 0).toFixed(1)} logged, ${Number(data?.penalty_hours).toFixed(1)} penalty hours deducted.`
                            : 'Credited from your completed attendance logs.'}
                    </p>
                </motion.section>

                <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
                    <motion.section
                        variants={itemVariants}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                    >
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-500">Performance</p>
                            <p className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${performanceText}`}>
                                {performanceScore}%
                            </p>
                            <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
                                <Award className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                                {performanceNote}
                            </p>
                        </div>
                        <ScoreRing score={performanceScore} tone={performanceTone} />
                    </motion.section>

                    <motion.section
                        variants={itemVariants}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                    >
                        <div>
                            <p className="text-sm font-medium text-slate-500">Disciplinary</p>
                            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
                                {violations}
                            </p>
                            <p className={`mt-1 flex items-center gap-1.5 text-xs ${violations > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {violations > 0 ? (
                                    <><AlertCircle className="h-3.5 w-3.5" /> Open records on file.</>
                                ) : (
                                    <><CheckCircle className="h-3.5 w-3.5" /> Clean record so far.</>
                                )}
                            </p>
                        </div>
                        <div className={`rounded-xl p-2.5 ${violations > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                            <AlertCircle className="h-5 w-5" />
                        </div>
                    </motion.section>
                </div>
            </motion.div>

            <OrganizationScheduleCalendar />

            <motion.section
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
                <div className="flex items-center justify-between px-6 py-4">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        Upcoming shifts
                    </h2>
                    <span className="text-xs tabular-nums text-slate-400">
                        {shifts.length === 0 ? 'None' : `${shifts.length} scheduled`}
                    </span>
                </div>

                {shifts.length === 0 ? (
                    <div className="border-t border-slate-100 px-6 py-14 text-center">
                        <Calendar className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                        <p className="text-sm font-medium text-slate-600">No upcoming shifts scheduled.</p>
                        <p className="mt-1 text-xs text-slate-400">Your supervisor will add them here.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                        {shifts.map((sched) => {
                            const isToday = sched.day === todayName;
                            return (
                                <motion.li
                                    variants={itemVariants}
                                    key={sched.id}
                                    className="flex items-center gap-4 px-6 py-4"
                                >
                                    <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${isToday ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                        <span className="text-[11px] font-semibold uppercase tracking-wide">
                                            {String(sched.day).substring(0, 3)}
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate text-sm font-semibold text-slate-900">{sched.location}</p>
                                            {isToday && (
                                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                                                    Today
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                                            <Clock className="h-3.5 w-3.5" />
                                            {sched.time_start}{sched.time_end ? ` – ${sched.time_end}` : ''}
                                        </p>
                                    </div>
                                </motion.li>
                            );
                        })}
                    </ul>
                )}
            </motion.section>
        </div>
    );
};

export default StudentOverview;
