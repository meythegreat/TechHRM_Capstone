import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { REALTIME_EVENT } from '../utils/realtime';
import {
    readStudentDashboardCache,
    writeStudentDashboardCache,
} from '../utils/studentDashboardCache';
import { useSyncStatus } from '../utils/syncStatus';
import {
    Clock,
    Calendar,
    CheckCircle2,
    AlertCircle,
    Award,
    Building2,
    ShieldCheck,
    ShieldAlert,
    MapPin,
    Sparkles,
    UserCheck,
    CalendarClock,
    Info,
    Activity,
    Radio,
    ArrowRight,
    Users,
} from 'lucide-react';
import OrganizationScheduleCalendar from './OrganizationScheduleCalendar';
import { BulletinBoard } from './Bulletins';
import { type HourLimitStatus } from '../services/hourLimitService';
import { formatClockTime } from '../utils/scheduleTime';
import { type StudentActivityItem } from '../types/studentActivity';

interface DashboardData {
    total_hours_rendered: number;
    logged_hours: number;
    penalty_hours: number;
    required_hours: number;
    special_hours_request?: boolean;
    upcoming_schedules: any[];
    current_activities: StudentActivityItem[];
    upcoming_activities: StudentActivityItem[];
    performance_score: number;
    has_activity: boolean;
    violations: number;
    hour_limits?: HourLimitStatus | null;
}

const emptyDashboard = (): DashboardData => ({
    total_hours_rendered: 0,
    logged_hours: 0,
    penalty_hours: 0,
    required_hours: 80,
    upcoming_schedules: [],
    current_activities: [],
    upcoming_activities: [],
    performance_score: 0,
    has_activity: false,
    violations: 0,
    hour_limits: null,
});

function parseLocalDate(iso: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatActivityDateBadge(iso: string): { month: string; day: string; full: string } {
    const parsed = parseLocalDate(iso);
    if (!parsed) return { month: 'ACT', day: '--', full: iso };
    return {
        month: parsed.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
        day: String(parsed.getDate()),
        full: parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    };
}

function formatActivityTimeRange(activity: StudentActivityItem): string {
    const start = formatClockTime(activity.starts_at);
    const end = formatClockTime(activity.ends_at);
    if (start && end) return `${start} – ${end}`;
    if (start) return `Starts ${start}`;
    return 'All day';
}

function isTomorrowDate(iso: string, now: Date): boolean {
    const parsed = parseLocalDate(iso);
    if (!parsed) return false;
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return (
        parsed.getFullYear() === tomorrow.getFullYear() &&
        parsed.getMonth() === tomorrow.getMonth() &&
        parsed.getDate() === tomorrow.getDate()
    );
}

function greetingFor(date: Date) {
    const hour = date.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

function RadialGauge({
    value,
    strokeClass,
    reduceMotion,
    size = 88,
}: {
    value: number;
    strokeClass: string;
    reduceMotion: boolean | null;
    size?: number;
}) {
    const strokeWidth = 7;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.min(Math.max(value, 0), 100);
    const offset = circumference - (clamped / 100) * circumference;

    return (
        <div
            className="relative flex shrink-0 items-center justify-center"
            style={{ width: size, height: size }}
        >
            <svg
                viewBox={`0 0 ${size} ${size}`}
                className="-rotate-90"
                width={size}
                height={size}
                aria-hidden="true"
            >
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    className="stroke-slate-100"
                />
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={
                        reduceMotion
                            ? { strokeDashoffset: offset }
                            : { strokeDashoffset: circumference }
                    }
                    animate={{ strokeDashoffset: offset }}
                    transition={{
                        duration: reduceMotion ? 0 : 1,
                        ease: [0.22, 1, 0.36, 1],
                    }}
                    className={strokeClass}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Award className="h-5 w-5 text-slate-400" />
            </div>
        </div>
    );
}

const StudentOverview = () => {
    const navigate = useNavigate();
    const sync = useSyncStatus();
    const [data, setData] = useState<DashboardData | null>(() => {
        const saved = readStudentDashboardCache<DashboardData>();
        return saved ? { ...emptyDashboard(), ...saved.dashboard } : null;
    });
    const [isLoading, setIsLoading] = useState(
        () => readStudentDashboardCache<DashboardData>() == null
    );
    const [userName, setUserName] = useState(
        localStorage.getItem('user_name') || 'Student Worker'
    );
    const [supervisorNames, setSupervisorNames] = useState<string[]>(
        () => readStudentDashboardCache<DashboardData>()?.supervisors ?? []
    );
    const [assignedOffice, setAssignedOffice] = useState(
        localStorage.getItem('assigned_office') || ''
    );
    const reduceMotion = useReducedMotion();

    useEffect(() => {
        let active = true;
        const fetchDashboardData = async () => {
            try {
                const profileRes = await axios
                    .get('/api/user')
                    .catch(() => ({ data: {} as any }));
                const profile = profileRes.data || {};
                if (!active) return;

                if (profile.name) {
                    setUserName(profile.name);
                    localStorage.setItem('user_name', profile.name);
                }
                const office =
                    profile.profile?.assignment_label ||
                    profile.profile?.assigned_office ||
                    '';
                setAssignedOffice(
                    office || localStorage.getItem('assigned_office') || ''
                );
                if (office) localStorage.setItem('assigned_office', office);
                const supervisors = Array.isArray(profile.department_supervisors)
                    ? profile.department_supervisors
                    : null;
                if (supervisors) setSupervisorNames(supervisors);

                const dashboardRes = await axios.get('/api/student/dashboard', { timeout: 8000 });
                if (!active) return;
                const dashboard = {
                    ...emptyDashboard(),
                    ...dashboardRes.data,
                };
                setData(dashboard);
                writeStudentDashboardCache({
                    dashboard,
                    supervisors: supervisors ?? readStudentDashboardCache<DashboardData>()?.supervisors ?? [],
                });
            } catch (error) {
                console.error('Error fetching dashboard data', error);
                if (!active) return;
                setData((current) => {
                    if (current) return current;
                    const saved = readStudentDashboardCache<DashboardData>();
                    return saved ? { ...emptyDashboard(), ...saved.dashboard } : emptyDashboard();
                });
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
            transition: { staggerChildren: reduceMotion ? 0 : 0.07 },
        },
    };

    const itemVariants: Variants = {
        hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 },
        show: {
            opacity: 1,
            y: 0,
            transition: {
                duration: reduceMotion ? 0 : 0.42,
                ease: [0.22, 1, 0.36, 1],
            },
        },
    };

    if (isLoading) {
        return (
            <div
                className="space-y-6 animate-pulse"
                aria-busy="true"
                aria-label="Loading your workspace"
            >
                <div className="h-56 rounded-[2rem] bg-slate-900/90" />
                <div className="grid gap-5 lg:grid-cols-12">
                    <div className="h-80 rounded-[1.75rem] bg-slate-200/80 lg:col-span-7" />
                    <div className="grid gap-5 lg:col-span-5">
                        <div className="h-36 rounded-[1.75rem] bg-slate-200/80" />
                        <div className="h-36 rounded-[1.75rem] bg-slate-200/80" />
                    </div>
                </div>
                <div className="h-64 rounded-[1.75rem] bg-slate-200/80" />
            </div>
        );
    }

    const rendered = Number(data?.total_hours_rendered ?? 0);
    const logged = Number(data?.logged_hours ?? 0);
    const penalty = Number(data?.penalty_hours ?? 0);
    const required = data?.required_hours ?? 80;
    const progressPercentage =
        required > 0 ? Math.min((rendered / required) * 100, 100) : 0;
    const remaining = Math.max(required - rendered, 0);

    const now = new Date();
    const todayName = now.toLocaleDateString(undefined, { weekday: 'long' });
    const dateLabel = now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });
    const firstName = userName.split(' ')[0];

    const performanceScore = data?.performance_score ?? 0;
    const perfTier = !data?.has_activity
        ? {
              label: 'Awaiting Activity',
              stroke: 'stroke-slate-400',
              text: 'text-slate-700',
              badge: 'bg-slate-100 text-slate-600 border-slate-200',
              bars: 0,
              barColor: 'bg-slate-300',
              note: 'Complete a shift to start building your performance score.',
          }
        : performanceScore >= 90
          ? {
                label: 'Exemplary',
                stroke: 'stroke-emerald-500',
                text: 'text-emerald-600',
                badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                bars: 4,
                barColor: 'bg-emerald-500',
                note: 'Outstanding attendance and reliability. Keep it up.',
            }
          : performanceScore >= 75
            ? {
                  label: 'Good Standing',
                  stroke: 'stroke-blue-500',
                  text: 'text-blue-600',
                  badge: 'bg-blue-50 text-blue-700 border-blue-200',
                  bars: 3,
                  barColor: 'bg-blue-500',
                  note: 'Solid standing. Stay consistent with your assigned shifts.',
              }
            : performanceScore >= 50
              ? {
                    label: 'Needs Focus',
                    stroke: 'stroke-amber-500',
                    text: 'text-amber-600',
                    badge: 'bg-amber-50 text-amber-700 border-amber-200',
                    bars: 2,
                    barColor: 'bg-amber-500',
                    note: 'Room to improve on attendance and punctuality.',
                }
              : {
                    label: 'At Risk',
                    stroke: 'stroke-rose-500',
                    text: 'text-rose-600',
                    badge: 'bg-rose-50 text-rose-700 border-rose-200',
                    bars: 1,
                    barColor: 'bg-rose-500',
                    note: 'Review your attendance and disciplinary records immediately.',
                };

    const supervisorLabel =
        supervisorNames.length > 0 ? supervisorNames.join(', ') : 'Not assigned';
    const shifts = data?.upcoming_schedules ?? [];
    const todayShift = shifts.find((s) => s.day === todayName);
    const spotlightShift = todayShift || shifts[0] || null;
    const currentActivities = Array.isArray(data?.current_activities)
        ? data.current_activities
        : [];
    const upcomingActivities = Array.isArray(data?.upcoming_activities)
        ? data.upcoming_activities
        : [];
    const allDashboardActivities = [...currentActivities, ...upcomingActivities];
    const heroActivity =
        currentActivities[0] ||
        upcomingActivities.find((item) => item.is_today) ||
        (!spotlightShift ? upcomingActivities[0] : null) ||
        null;

    const violations = data?.violations ?? 0;
    const limits = data?.hour_limits;
    const weeklyPct =
        limits && limits.weekly_cap > 0
            ? Math.min((limits.weekly_hours / limits.weekly_cap) * 100, 100)
            : 0;
    const monthlyPct =
        limits && limits.monthly_cap > 0
            ? Math.min((limits.monthly_hours / limits.monthly_cap) * 100, 100)
            : 0;

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-6 font-sans"
        >
            <BulletinBoard />
            {/* LIVE ACTIVITY ALERT BANNER (Assemblies, Devotionals, Cleaning Happening Right Now) */}
            {currentActivities.length > 0 && (
                <motion.section
                    variants={itemVariants}
                    aria-live="polite"
                    className="relative overflow-hidden rounded-[2rem] border border-emerald-500/40 bg-gradient-to-br from-emerald-950 via-slate-950 to-teal-950 p-6 text-white shadow-2xl shadow-emerald-950/25 sm:p-7"
                >
                    <div
                        className="pointer-events-none absolute inset-0 opacity-20"
                        style={{
                            backgroundImage:
                                'radial-gradient(rgba(52,211,153,0.45) 1px, transparent 1px)',
                            backgroundSize: '18px 18px',
                        }}
                        aria-hidden="true"
                    />
                    <div
                        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-500/25 blur-3xl"
                        aria-hidden="true"
                    />

                    <div className="relative z-10 space-y-4">
                        {currentActivities.map((activity) => {
                            const isTimedIn = activity.attendance_status === 'timed_in';
                            const isDone =
                                activity.attendance_status === 'on_time' ||
                                activity.attendance_status === 'late';
                            const cutoffLabel = formatClockTime(activity.valid_until);
                            const timeInLabel = formatClockTime(activity.time_in);

                            return (
                                <div
                                    key={`live-activity-${activity.id}`}
                                    className="flex flex-col gap-5 rounded-2xl border border-emerald-400/20 bg-white/[0.05] p-4 backdrop-blur-xl sm:p-5 lg:flex-row lg:items-center lg:justify-between"
                                >
                                    <div className="min-w-0 space-y-2.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-950 shadow-sm shadow-emerald-500/30">
                                                <Radio className="h-3 w-3 animate-pulse" />
                                                Happening Now
                                            </span>
                                            <span className="rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-200">
                                                {activity.kind_label}
                                            </span>
                                            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-slate-200">
                                                <Users className="h-3 w-3 text-emerald-300" />
                                                {activity.audience_label}
                                            </span>
                                            <span className="rounded-full border border-amber-300/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-extrabold text-amber-200">
                                                +{activity.hours.toFixed(1)} hrs
                                            </span>
                                        </div>

                                        <div>
                                            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                                                {activity.title}
                                            </h2>
                                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-emerald-100/90">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Clock className="h-3.5 w-3.5 text-emerald-400" />
                                                    {formatActivityTimeRange(activity)}
                                                </span>
                                                {cutoffLabel && !isTimedIn && !isDone && (
                                                    <span className="text-amber-200">
                                                        On-time check-in until {cutoffLabel}
                                                    </span>
                                                )}
                                                {isTimedIn && timeInLabel && (
                                                    <span className="text-emerald-300">
                                                        Clocked in at {timeInLabel} — remember to time out when finished
                                                    </span>
                                                )}
                                                {isDone && (
                                                    <span className="text-emerald-300">
                                                        Attendance recorded ({activity.attendance_status === 'on_time' ? 'On time' : 'Late'})
                                                    </span>
                                                )}
                                            </div>
                                            {activity.notes && (
                                                <p className="mt-2 max-w-2xl text-xs font-medium text-slate-300">
                                                    {activity.notes}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                                        {isDone ? (
                                            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-2.5 text-xs font-extrabold text-emerald-200">
                                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                                Completed
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => navigate('/attendance')}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-300"
                                            >
                                                <span>
                                                    {isTimedIn ? 'Time Out in Terminal' : 'Clock In Now'}
                                                </span>
                                                <ArrowRight className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.section>
            )}

            {/* TIER 1: OBSIDIAN COMMAND HERO + NEXT SHIFT SPOTLIGHT */}
            <motion.section
                variants={itemVariants}
                className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
            >
                {/* Architectural Dot Grid + Ambient Mesh */}
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
                    className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-600/25 blur-3xl"
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
                    {/* Left: Greeting & Identity Pills */}
                    <div className="min-w-0 lg:col-span-7">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300 backdrop-blur-md">
                                <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                                {dateLabel}
                            </span>
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
                                sync.state === 'connected'
                                    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                                    : sync.state === 'syncing'
                                      ? 'border-amber-400/20 bg-amber-500/10 text-amber-200'
                                      : 'border-white/10 bg-white/5 text-slate-300'
                            }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${
                                    sync.state === 'connected'
                                        ? 'bg-emerald-400'
                                        : sync.state === 'syncing'
                                          ? 'bg-amber-300'
                                          : sync.state === 'error'
                                            ? 'bg-red-400'
                                            : 'bg-slate-400'
                                }`} />
                                {sync.state === 'connected'
                                    ? 'Live Sync'
                                    : sync.state === 'syncing'
                                      ? 'Syncing'
                                      : sync.state === 'offline'
                                        ? 'Saved copy'
                                        : 'Not synced'}
                            </span>
                        </div>

                        <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
                            {greetingFor(now)},{' '}
                            <span className="bg-gradient-to-r from-blue-300 via-indigo-200 to-white bg-clip-text text-transparent">
                                {firstName}
                            </span>
                        </h1>

                        <p className="mt-2.5 max-w-xl text-sm font-medium leading-relaxed text-slate-300">
                            {progressPercentage >= 100
                                ? 'You have completed your required work-study hours for this term.'
                                : `You have ${remaining.toFixed(1)} hours left to complete your ${required}-hour term requirement.`}
                        </p>

                        {/* Identity Meta Chips */}
                        <div className="mt-5 flex flex-wrap items-center gap-2.5">
                            <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 backdrop-blur-md">
                                <UserCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                                <div className="min-w-0 text-xs">
                                    <span className="text-slate-400">Supervisor: </span>
                                    <span className="font-bold text-white">
                                        {supervisorLabel}
                                    </span>
                                </div>
                            </div>

                            {assignedOffice && (
                                <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 backdrop-blur-md">
                                    <Building2 className="h-4 w-4 shrink-0 text-blue-300" />
                                    <span className="break-words text-xs font-bold leading-snug text-white">
                                        {assignedOffice}
                                    </span>
                                </div>
                            )}

                            {data?.special_hours_request && (
                                <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-200">
                                    <Info className="h-3.5 w-3.5 shrink-0" />
                                    Special 100-hr target active
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Frosted Next Shift Spotlight */}
                    <div className="lg:col-span-5">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-xl">
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    <CalendarClock className="h-3.5 w-3.5 text-blue-400" />
                                    {todayShift ? "Today's Duty" : 'Next Scheduled Duty'}
                                </span>
                                {todayShift ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-300 ring-1 ring-blue-400/30">
                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                                        Today
                                    </span>
                                ) : (
                                    <span className="text-[11px] font-semibold text-slate-400">
                                        {shifts.length} total
                                    </span>
                                )}
                            </div>

                            {spotlightShift ? (
                                <div className="mt-4 flex items-center gap-4">
                                    <div
                                        className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl font-black ${
                                            todayShift
                                                ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-600/30'
                                                : 'border border-white/15 bg-white/10 text-white'
                                        }`}
                                    >
                                        <span className="text-xs uppercase tracking-wider">
                                            {String(spotlightShift.day).substring(0, 3)}
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-base font-extrabold text-white">
                                            {spotlightShift.location}
                                        </p>
                                        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-blue-200">
                                            <Clock className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                                            <span>
                                                {spotlightShift.time_start}
                                                {spotlightShift.time_end
                                                    ? ` – ${spotlightShift.time_end}`
                                                    : ''}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            ) : heroActivity ? (
                                <div className="mt-4 flex items-center gap-4">
                                    <div
                                        className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl font-black ${
                                            heroActivity.is_happening_now
                                                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/30'
                                                : 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-600/30'
                                        }`}
                                    >
                                        <span className="text-[10px] uppercase tracking-wider opacity-90">
                                            {formatActivityDateBadge(heroActivity.event_date).month}
                                        </span>
                                        <span className="text-base leading-none">
                                            {formatActivityDateBadge(heroActivity.event_date).day}
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-base font-extrabold text-white">
                                            {heroActivity.title}
                                        </p>
                                        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                                            <Clock className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                            <span>
                                                {heroActivity.kind_label} · {formatActivityTimeRange(heroActivity)}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4 flex items-center gap-3.5 text-slate-400">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                                        <Calendar className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-200">
                                            No upcoming shifts
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            Waiting for supervisor assignment
                                        </p>
                                    </div>
                                </div>
                            )}

                            {spotlightShift && heroActivity && (
                                <div className="mt-3.5 flex items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs">
                                    <div className="min-w-0">
                                        <span className="font-extrabold uppercase tracking-wider text-emerald-300">
                                            {heroActivity.is_happening_now ? 'Live Activity: ' : "Today's Activity: "}
                                        </span>
                                        <span className="font-bold text-white">
                                            {heroActivity.title}
                                        </span>
                                        <span className="ml-1.5 text-emerald-200/80">
                                            ({formatActivityTimeRange(heroActivity)})
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.section>

            {/* TIER 2: ASYMMETRIC TELEMETRY BENTO */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                {/* LEFT (7 COLS): HOURS & QUOTA TELEMETRY HUB */}
                <motion.section
                    variants={itemVariants}
                    className="flex flex-col justify-between rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-7 lg:col-span-7"
                >
                    <div>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                                        Term Progress
                                    </span>
                                    <span
                                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                            progressPercentage >= 100
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-blue-50 text-blue-700'
                                        }`}
                                    >
                                        {progressPercentage >= 100
                                            ? 'Completed'
                                            : `${progressPercentage.toFixed(0)}% Done`}
                                    </span>
                                </div>
                                <div className="mt-2.5 flex items-baseline gap-2.5">
                                    <span className="text-5xl font-black tracking-tight tabular-nums text-slate-900">
                                        {rendered.toFixed(2)}
                                    </span>
                                    <span className="text-sm font-bold text-slate-400">
                                        of {required} required hrs
                                    </span>
                                </div>
                            </div>

                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20">
                                <Clock className="h-6 w-6" />
                            </div>
                        </div>

                        {/* Milestone Progress Track */}
                        <div className="mt-6">
                            <div className="relative h-3.5 overflow-hidden rounded-full bg-slate-100 p-0.5 shadow-inner">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progressPercentage}%` }}
                                    transition={{
                                        duration: reduceMotion ? 0 : 0.9,
                                        delay: reduceMotion ? 0 : 0.15,
                                        ease: [0.22, 1, 0.36, 1],
                                    }}
                                    className={`h-full rounded-full ${
                                        progressPercentage >= 100
                                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                            : 'bg-gradient-to-r from-blue-600 via-indigo-500 to-sky-400'
                                    }`}
                                />
                            </div>
                            <div className="mt-2 flex justify-between text-[10px] font-bold tabular-nums text-slate-400">
                                <span>0%</span>
                                <span>25%</span>
                                <span>50%</span>
                                <span>75%</span>
                                <span>100%</span>
                            </div>
                        </div>

                        {/* 3-Column Mini Breakdown */}
                        <div className="mt-5 grid grid-cols-3 gap-3">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Logged
                                </p>
                                <p className="mt-1 text-lg font-black tabular-nums text-slate-900">
                                    {logged > 0 ? logged.toFixed(1) : rendered.toFixed(1)}
                                    <span className="ml-0.5 text-xs font-semibold text-slate-400">
                                        h
                                    </span>
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Penalties
                                </p>
                                <p
                                    className={`mt-1 text-lg font-black tabular-nums ${
                                        penalty > 0 ? 'text-rose-600' : 'text-slate-900'
                                    }`}
                                >
                                    {penalty > 0 ? `-${penalty.toFixed(1)}` : '0.0'}
                                    <span className="ml-0.5 text-xs font-semibold text-slate-400">
                                        h
                                    </span>
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Remaining
                                </p>
                                <p className="mt-1 text-lg font-black tabular-nums text-blue-600">
                                    {remaining.toFixed(1)}
                                    <span className="ml-0.5 text-xs font-semibold text-blue-400">
                                        h
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Weekly & Monthly Quotas */}
                    {limits && (
                        <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {/* Weekly Quota Card */}
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-slate-700">
                                            Weekly Quota
                                        </span>
                                        <span
                                            className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                weeklyPct >= 100
                                                    ? 'bg-rose-50 text-rose-700'
                                                    : weeklyPct >= 80
                                                      ? 'bg-amber-50 text-amber-700'
                                                      : limits.extension_approved
                                                        ? 'bg-emerald-50 text-emerald-700'
                                                        : 'bg-slate-100 text-slate-600'
                                            }`}
                                        >
                                            {weeklyPct >= 100
                                                ? 'Maxed'
                                                : limits.extension_approved
                                                  ? `Ext ${limits.weekly_cap}h`
                                                  : `Cap ${limits.weekly_standard}h`}
                                        </span>
                                    </div>
                                    <div className="mt-2.5 flex items-baseline justify-between text-xs">
                                        <span className="text-lg font-black tabular-nums text-slate-900">
                                            {limits.weekly_hours.toFixed(1)}
                                            <span className="text-xs font-semibold text-slate-400">
                                                {' '}
                                                / {limits.weekly_cap} hrs
                                            </span>
                                        </span>
                                        <span className="font-bold tabular-nums text-slate-500">
                                            {weeklyPct.toFixed(0)}%
                                        </span>
                                    </div>
                                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                                weeklyPct >= 100
                                                    ? 'bg-rose-500'
                                                    : weeklyPct >= 80
                                                      ? 'bg-amber-500'
                                                      : 'bg-slate-900'
                                            }`}
                                            style={{ width: `${weeklyPct}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Monthly Quota Card */}
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-slate-700">
                                            Monthly Quota
                                        </span>
                                        <span
                                            className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                monthlyPct >= 100
                                                    ? 'bg-rose-50 text-rose-700'
                                                    : monthlyPct >= 80
                                                      ? 'bg-amber-50 text-amber-700'
                                                      : 'bg-slate-100 text-slate-600'
                                            }`}
                                        >
                                            {monthlyPct >= 100
                                                ? 'Maxed'
                                                : `Cap ${limits.monthly_cap}h`}
                                        </span>
                                    </div>
                                    <div className="mt-2.5 flex items-baseline justify-between text-xs">
                                        <span className="text-lg font-black tabular-nums text-slate-900">
                                            {limits.monthly_hours.toFixed(1)}
                                            <span className="text-xs font-semibold text-slate-400">
                                                {' '}
                                                / {limits.monthly_cap} hrs
                                            </span>
                                        </span>
                                        <span className="font-bold tabular-nums text-slate-500">
                                            {monthlyPct.toFixed(0)}%
                                        </span>
                                    </div>
                                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                                monthlyPct >= 100
                                                    ? 'bg-rose-500'
                                                    : monthlyPct >= 80
                                                      ? 'bg-amber-500'
                                                      : 'bg-slate-900'
                                            }`}
                                            style={{ width: `${monthlyPct}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {limits.extra_hours_approved && (
                                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800">
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                    <span>
                                        Extra Hours approved
                                        {limits.extra_hours_period_label
                                            ? ` for ${limits.extra_hours_period_label}`
                                            : ''}
                                        : up to {limits.weekly_cap} hrs/week.
                                    </span>
                                </div>
                            )}

                            {limits.extension_approved &&
                                !limits.extra_hours_approved && (
                                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800">
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                        <span>Extension approved for this week.</span>
                                    </div>
                                )}

                            {!limits.extension_approved &&
                                limits.monthly_remaining > 0 &&
                                limits.weekly_remaining <= 2 && (
                                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-800">
                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                        <span>
                                            Near weekly cap. Ask your supervisor for a signed
                                            Extra Hours letter to unlock up to{' '}
                                            {limits.weekly_extended} hrs/week.
                                        </span>
                                    </div>
                                )}

                            <p className="text-[11px] font-medium leading-relaxed text-slate-400">
                                Standard limit: {limits.weekly_standard} hrs/week (up to{' '}
                                {limits.weekly_extended} hrs with Extra Hours approval) ·{' '}
                                {limits.monthly_cap} hrs/month max.
                            </p>
                        </div>
                    )}
                </motion.section>

                {/* RIGHT (5 COLS): PERFORMANCE & CONDUCT STACK */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
                    {/* Performance Standing Card */}
                    <motion.section
                        variants={itemVariants}
                        className="flex flex-col justify-between rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all duration-200 hover:border-blue-200 hover:shadow-md"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                                    Performance Score
                                </p>
                                <div className="mt-2 flex items-baseline gap-2.5">
                                    <span
                                        className={`text-4xl font-black tracking-tight tabular-nums ${perfTier.text}`}
                                    >
                                        {performanceScore}%
                                    </span>
                                </div>
                                <span
                                    className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${perfTier.badge}`}
                                >
                                    {perfTier.label}
                                </span>
                            </div>

                            <RadialGauge
                                value={performanceScore}
                                strokeClass={perfTier.stroke}
                                reduceMotion={reduceMotion}
                            />
                        </div>

                        {/* 4-Tier Visual Scale */}
                        <div className="mt-5">
                            <div className="grid grid-cols-4 gap-1.5">
                                {[1, 2, 3, 4].map((step) => (
                                    <div
                                        key={step}
                                        className={`h-1.5 rounded-full transition-colors ${
                                            step <= perfTier.bars
                                                ? perfTier.barColor
                                                : 'bg-slate-100'
                                        }`}
                                    />
                                ))}
                            </div>
                            <p className="mt-2.5 text-xs font-medium leading-relaxed text-slate-500">
                                {perfTier.note}
                            </p>
                        </div>
                    </motion.section>

                    {/* Disciplinary / Conduct Card */}
                    <motion.section
                        variants={itemVariants}
                        className={`relative overflow-hidden rounded-[1.75rem] border p-6 shadow-sm transition-all duration-200 hover:shadow-md ${
                            violations > 0
                                ? 'border-rose-200 bg-gradient-to-br from-rose-50 to-rose-50/40'
                                : 'border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-emerald-50/40'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                                    Conduct & Compliance
                                </p>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <span className="text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                        {violations}
                                    </span>
                                    <span className="text-xs font-bold text-slate-500">
                                        {violations === 1 ? 'record' : 'records'}
                                    </span>
                                </div>
                            </div>

                            <div
                                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-sm ${
                                    violations > 0
                                        ? 'bg-rose-500/20 text-rose-700 ring-1 ring-rose-500/30'
                                        : 'bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-500/30'
                                }`}
                            >
                                {violations > 0 ? (
                                    <ShieldAlert className="h-7 w-7" />
                                ) : (
                                    <ShieldCheck className="h-7 w-7" />
                                )}
                            </div>
                        </div>

                        <div
                            className={`mt-5 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold ${
                                violations > 0
                                    ? 'bg-rose-500/15 text-rose-800'
                                    : 'bg-emerald-500/15 text-emerald-800'
                            }`}
                        >
                            {violations > 0 ? (
                                <>
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <span>
                                        Open disciplinary records require attention.
                                    </span>
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>Clean record — no active violations.</span>
                                </>
                            )}
                        </div>
                    </motion.section>
                </div>
            </div>

            {/* TIER 2.5: CAMPUS & GROUP ACTIVITIES (Assemblies, Devotionals, Cleaning) */}
            <motion.section
                variants={itemVariants}
                className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-7"
            >
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black tracking-tight text-slate-900">
                                Campus &amp; Group Activities
                            </h2>
                            <p className="text-xs font-medium text-slate-500">
                                Ongoing and upcoming assembly meetings, devotionals, and group cleaning duties
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {currentActivities.length > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-xs">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                                {currentActivities.length} happening now
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-extrabold tabular-nums text-slate-700">
                            <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                            {allDashboardActivities.length === 0
                                ? '0 scheduled'
                                : `${allDashboardActivities.length} scheduled`}
                        </span>
                    </div>
                </div>

                {allDashboardActivities.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200/70">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-extrabold text-slate-700">
                            No ongoing or upcoming activities right now
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            Scheduled assembly meetings, devotional meetings, and cleaning activities will appear here automatically.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {allDashboardActivities.map((activity) => {
                            const badge = formatActivityDateBadge(activity.event_date);
                            const isLive = activity.is_happening_now;
                            const isSoon = activity.is_starting_soon;
                            const isToday = activity.is_today;
                            const isTomorrow = isTomorrowDate(activity.event_date, now);
                            const isTimedIn = activity.attendance_status === 'timed_in';
                            const isDone =
                                activity.attendance_status === 'on_time' ||
                                activity.attendance_status === 'late';
                            const cutoffLabel = formatClockTime(activity.valid_until);

                            const kindTone =
                                activity.kind === 'meeting_assembly'
                                    ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80'
                                    : activity.kind === 'devotional'
                                      ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/80'
                                      : 'bg-teal-50 text-teal-800 ring-1 ring-teal-200/80';

                            return (
                                <motion.div
                                    key={`activity-card-${activity.id}`}
                                    variants={itemVariants}
                                    whileHover={reduceMotion ? undefined : { y: -2 }}
                                    className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all sm:p-5 ${
                                        isLive
                                            ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/60 shadow-md shadow-emerald-900/5 ring-1 ring-emerald-300/60'
                                            : isToday
                                              ? 'border-blue-200 bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/40 shadow-xs'
                                              : 'border-slate-200/90 bg-slate-50/40 hover:border-slate-300 hover:bg-white hover:shadow-sm'
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 items-start gap-3.5">
                                                <div
                                                    className={`flex h-13 w-13 shrink-0 flex-col items-center justify-center rounded-2xl font-black ${
                                                        isLive
                                                            ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/25'
                                                            : isToday
                                                              ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/20'
                                                              : 'border border-slate-200 bg-white text-slate-800'
                                                    }`}
                                                >
                                                    <span className="text-[10px] uppercase tracking-wider opacity-85">
                                                        {badge.month}
                                                    </span>
                                                    <span className="text-base leading-none">
                                                        {badge.day}
                                                    </span>
                                                </div>

                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span
                                                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${kindTone}`}
                                                        >
                                                            {activity.kind_label}
                                                        </span>
                                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold tabular-nums text-slate-700">
                                                            +{activity.hours.toFixed(1)} hrs
                                                        </span>
                                                    </div>
                                                    <h3 className="mt-1.5 truncate text-base font-black tracking-tight text-slate-900">
                                                        {activity.title}
                                                    </h3>
                                                </div>
                                            </div>

                                            {isLive ? (
                                                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-xs">
                                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                                                    Live Now
                                                </span>
                                            ) : isSoon ? (
                                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                                                    Starting Soon
                                                </span>
                                            ) : isToday ? (
                                                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
                                                    Today
                                                </span>
                                            ) : isTomorrow ? (
                                                <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                                                    Tomorrow
                                                </span>
                                            ) : (
                                                <span className="shrink-0 rounded-full bg-slate-200/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                    {badge.full}
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-3.5 space-y-1.5 text-xs font-semibold text-slate-600">
                                            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <span className="inline-flex items-center gap-1.5 text-slate-800">
                                                    <Clock className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                                    {formatActivityTimeRange(activity)}
                                                </span>
                                                {cutoffLabel && (
                                                    <span className="text-emerald-700">
                                                        · On time until {cutoffLabel}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="flex items-center gap-1.5 text-slate-500">
                                                <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                <span>{activity.audience_label}</span>
                                            </p>
                                            {activity.notes && (
                                                <p className="line-clamp-2 text-xs font-medium text-slate-500">
                                                    {activity.notes}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {(isLive || isToday || isTimedIn || isDone) && (
                                        <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200/70 pt-3">
                                            <span
                                                className={`text-[11px] font-extrabold ${
                                                    isDone
                                                        ? 'text-emerald-700'
                                                        : isTimedIn
                                                          ? 'text-blue-700'
                                                          : isLive
                                                            ? 'text-emerald-800'
                                                            : 'text-slate-500'
                                                }`}
                                            >
                                                {isDone
                                                    ? 'Attendance completed'
                                                    : isTimedIn
                                                      ? 'Clocked in · Time out when done'
                                                      : isLive
                                                        ? 'In session — ready for check-in'
                                                        : 'Scheduled for today'}
                                            </span>

                                            {!isDone && (isLive || isTimedIn) && (
                                                <button
                                                    type="button"
                                                    onClick={() => navigate('/attendance')}
                                                    className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-extrabold text-white transition hover:bg-emerald-600"
                                                >
                                                    <span>{isTimedIn ? 'Time Out' : 'Clock In'}</span>
                                                    <ArrowRight className="h-3 w-3" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </motion.section>

            {/* TIER 3A: PERSONAL SCHEDULE CALENDAR */}
            <motion.div variants={itemVariants}>
                <OrganizationScheduleCalendar personal />
            </motion.div>

            {/* TIER 3B: UPCOMING SHIFTS TICKET GRID */}
            <motion.section
                variants={itemVariants}
                className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-7"
            >
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                            <Calendar className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black tracking-tight text-slate-900">
                                Upcoming Duty Shifts
                            </h2>
                            <p className="text-xs font-medium text-slate-500">
                                Your assigned weekly schedule across campus offices
                            </p>
                        </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-extrabold tabular-nums text-slate-700">
                        <Activity className="h-3.5 w-3.5 text-blue-600" />
                        {shifts.length === 0
                            ? '0 scheduled'
                            : `${shifts.length} scheduled`}
                    </span>
                </div>

                {shifts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-14 text-center">
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200/70">
                            <Calendar className="h-6 w-6" />
                        </div>
                        <p className="text-sm font-extrabold text-slate-700">
                            No upcoming shifts scheduled
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            Your supervisor will assign your duty shifts here.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {shifts.map((sched) => {
                            const isToday = sched.day === todayName;
                            return (
                                <motion.div
                                    key={sched.id}
                                    variants={itemVariants}
                                    whileHover={reduceMotion ? undefined : { y: -3 }}
                                    className={`group relative overflow-hidden rounded-2xl border p-4 transition-all ${
                                        isToday
                                            ? 'border-blue-300 bg-gradient-to-br from-blue-50/80 via-slate-50 to-indigo-50/50 shadow-md shadow-blue-900/5'
                                            : 'border-slate-200/90 bg-slate-50/40 hover:border-slate-300 hover:bg-white hover:shadow-sm'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div
                                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-black uppercase tracking-wider ${
                                                isToday
                                                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25'
                                                    : 'border border-slate-200 bg-white text-slate-800'
                                            }`}
                                        >
                                            {String(sched.day).substring(0, 3)}
                                        </div>

                                        {isToday ? (
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
                                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                                                Today
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-slate-200/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                {sched.day}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-4">
                                        <p className="flex items-center gap-1.5 truncate text-sm font-extrabold text-slate-900">
                                            <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                                            <span className="truncate">
                                                {sched.location}
                                            </span>
                                        </p>
                                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            <span>
                                                {sched.time_start}
                                                {sched.time_end
                                                    ? ` – ${sched.time_end}`
                                                    : ''}
                                            </span>
                                        </p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </motion.section>
        </motion.div>
    );
};

export default StudentOverview;