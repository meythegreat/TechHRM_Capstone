import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
    CalendarDays,
    CalendarPlus,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    GraduationCap,
    Briefcase,
    Flag,
    Radio,
    Sparkles,
} from 'lucide-react';
import { REALTIME_EVENT } from '../utils/realtime';
import {
    compareSchedules,
    formatShiftEnd,
    formatClockTime,
    formatShiftStart,
    happensNow,
    shiftWindow,
} from '../utils/scheduleTime';
import { WEEKDAYS, monthCells } from '../utils/organizationCalendar';
import UserAvatar from './UserAvatar';
import ComboFilter from './ComboFilter';
import { type StudentActivityItem } from '../types/studentActivity';

interface OrgSchedule {
    id: number;
    uid?: string;
    day: string;
    time: string;
    kind: string;
    duty_type?: string | null;
    subject?: string | null;
    room?: string | null;
    instructor?: string | null;
    department?: string | null;
    assigned_office?: string | null;
    assignment_label?: string | null;
    student_name: string;
    profile_picture?: string | null;
    event_date?: string | null;
    activity_kind_label?: string | null;
    activity_hours?: number | null;
    activity_valid_until?: string | null;
    activity_happening_now?: boolean;
}

interface HolidaySpan {
    id: number;
    date: string;
    end_date?: string | null;
    name: string;
    kind?: string | null;
    portion?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
}

interface SemesterWindow {
    label: string;
    starts_on: string;
    ends_on: string;
    months: number;
}

function dateKey(date: Date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function formatSemesterDate(iso: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return iso;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

function coversDate(holiday: HolidaySpan, key: string) {
    const start = holiday.date.slice(0, 10);
    const end = (holiday.end_date || holiday.date).slice(0, 10);
    return key >= start && key <= end;
}

function holidayOn(date: Date, holidays: HolidaySpan[]) {
    const key = dateKey(date);
    return holidays.find((holiday) => (holiday.kind || 'holiday') !== 'break' && coversDate(holiday, key)) ?? null;
}

function breakOn(date: Date, holidays: HolidaySpan[]) {
    const key = dateKey(date);
    return holidays.find((holiday) => holiday.kind === 'break' && coversDate(holiday, key)) ?? null;
}

function clockMinutes(value: string) {
    const match = String(value).match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
}

function scheduleBlocked(date: Date, shift: OrgSchedule, holidays: HolidaySpan[]) {
    const key = dateKey(date);
    const window = shiftWindow(shift.time);
    return holidays.some((holiday) => {
        if (!coversDate(holiday, key)) return false;
        const fullClosure = holiday.kind === 'break' || (holiday.portion || 'full') !== 'half';
        if (fullClosure) return true;
        const start = holiday.starts_at ? clockMinutes(holiday.starts_at) : null;
        const end = holiday.ends_at ? clockMinutes(holiday.ends_at) : null;
        if (start == null || end == null || !window) return true;
        return window[0] < end && start < window[1];
    });
}

function holidayRangeLabel(holiday: HolidaySpan) {
    const start = holiday.date.slice(0, 10);
    const end = (holiday.end_date || holiday.date).slice(0, 10);
    if (start === end) return formatSemesterDate(start);
    return `${formatSemesterDate(start)} – ${formatSemesterDate(end)}`;
}

function insideSemester(date: Date, semester: SemesterWindow | null) {
    if (!semester) return false;
    const key = dateKey(date);
    return key >= semester.starts_on && key <= semester.ends_on;
}

function sameDay(left: Date, right: Date) {
    return (
        left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth() &&
        left.getDate() === right.getDate()
    );
}

function scheduleTitle(shift: OrgSchedule) {
    if (shift.kind === 'activity') return shift.subject || shift.duty_type || 'Campus Activity';
    if (shift.kind === 'class') return shift.subject || 'Class';
    return shift.duty_type || 'Work';
}

function isClassShift(shift: OrgSchedule) {
    return shift.kind === 'class';
}

function isActivityShift(shift: OrgSchedule) {
    return shift.kind === 'activity';
}

function activityToSchedule(activity: StudentActivityItem, studentName: string, avatar?: string | null): OrgSchedule {
    const timeRange =
        activity.starts_at && activity.ends_at
            ? `${activity.starts_at} - ${activity.ends_at}`
            : activity.starts_at || '';

    return {
        id: -Math.abs(Number(activity.id)),
        uid: `activity-${activity.id}`,
        day: activity.day,
        time: timeRange,
        kind: 'activity',
        duty_type: activity.kind_label,
        subject: activity.title,
        room: activity.valid_until ? `On time until ${formatClockTime(activity.valid_until)}` : null,
        instructor: activity.hours ? `+${Number(activity.hours).toFixed(1)} hrs` : null,
        department: activity.audience_label,
        assigned_office: activity.audience_label,
        assignment_label: `${activity.kind_label} · ${activity.audience_label}`,
        student_name: studentName,
        profile_picture: avatar ?? null,
        event_date: activity.event_date,
        activity_kind_label: activity.kind_label,
        activity_hours: activity.hours,
        activity_valid_until: activity.valid_until,
        activity_happening_now: Boolean(activity.is_happening_now),
    };
}

function shiftOffice(shift: OrgSchedule) {
    return (shift.assigned_office || shift.department || '').trim();
}

const CATEGORIES: Array<{ id: 'all' | 'work' | 'class' | 'activity' | 'holiday' | 'break'; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'work', label: 'Work' },
    { id: 'class', label: 'Class' },
    { id: 'activity', label: 'Activity' },
    { id: 'holiday', label: 'Holiday' },
    { id: 'break', label: 'Break' },
];

function ScheduleCard({
    shift,
    personal = false,
    active = false,
    hideTime = false,
}: {
    shift: OrgSchedule;
    personal?: boolean;
    active?: boolean;
    hideTime?: boolean;
}) {
    const isClass = isClassShift(shift);
    const isActivity = isActivityShift(shift);
    const office = shiftOffice(shift);
    const timeDetail = !hideTime
        ? shift.time
            ? `${formatShiftStart(shift.time)}${formatShiftEnd(shift.time) ? ` – ${formatShiftEnd(shift.time)}` : ''}`
            : 'All day'
        : '';
    const details = [
        timeDetail,
        isActivity
            ? shift.assignment_label || office
            : (!personal || !isClass) && (shift.assignment_label || office)
              ? shift.assignment_label || office
              : '',
        shift.room || '',
        shift.instructor || '',
    ].filter(Boolean);

    return (
        <article
            className={`group relative flex min-w-0 items-start gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 transition-all ${
                active
                    ? isActivity
                        ? 'border-emerald-400 bg-gradient-to-br from-emerald-50 to-teal-50/40 shadow-md shadow-emerald-900/10 ring-1 ring-emerald-400/60'
                        : isClass
                          ? 'border-violet-400 bg-gradient-to-br from-violet-50 to-violet-50/40 shadow-md shadow-violet-900/10 ring-1 ring-violet-400/60'
                          : 'border-blue-400 bg-gradient-to-br from-blue-50 to-blue-50/40 shadow-md shadow-blue-900/10 ring-1 ring-blue-400/60'
                    : isActivity
                      ? 'border-emerald-200/90 bg-emerald-50/25 hover:border-emerald-300 hover:bg-white hover:shadow-sm'
                      : isClass
                        ? 'border-slate-200/90 bg-white hover:border-violet-300 hover:shadow-sm'
                        : 'border-slate-200/90 bg-white hover:border-blue-300 hover:shadow-sm'
            }`}
            aria-current={active ? 'true' : undefined}
        >
            {/* Left Accent Bar */}
            <span
                aria-hidden="true"
                className={`absolute inset-y-2.5 left-0 w-1 rounded-r-full ${
                    active
                        ? 'bg-emerald-500'
                        : isActivity
                          ? 'bg-teal-500'
                          : isClass
                            ? 'bg-violet-500'
                            : 'bg-blue-600'
                }`}
            />

            {!personal && !isActivity && (
                <UserAvatar
                    name={shift.student_name}
                    picture={shift.profile_picture}
                    className="ml-1 h-9 w-9 rounded-xl bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-slate-200/70"
                />
            )}
            {(personal || isActivity) && (
                <div
                    className={`ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isActivity
                            ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/70'
                            : isClass
                              ? 'bg-violet-50 text-violet-600 ring-1 ring-violet-200/70'
                              : 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/70'
                    }`}
                >
                    {isActivity ? (
                        <Sparkles className="h-4 w-4" />
                    ) : isClass ? (
                        <GraduationCap className="h-4 w-4" />
                    ) : (
                        <Briefcase className="h-4 w-4" />
                    )}
                </div>
            )}

            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        {!personal && !isActivity && (
                            <p className="truncate text-sm font-bold text-slate-900">{shift.student_name}</p>
                        )}
                        <p
                            className={`truncate text-sm ${
                                personal || isActivity ? 'font-bold text-slate-900' : 'font-medium text-slate-600'
                            }`}
                        >
                            {scheduleTitle(shift)}
                        </p>
                    </div>
                    <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                            active
                                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                                : isActivity
                                  ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80'
                                  : isClass
                                    ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/70'
                                    : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/70'
                        }`}
                    >
                        {active && (
                            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                            </span>
                        )}
                        {active
                            ? isActivity
                                ? 'Activity now'
                                : isClass
                                  ? 'Class now'
                                  : 'Work now'
                            : isActivity
                              ? shift.activity_kind_label || 'Activity'
                              : isClass
                                ? 'Class'
                                : 'Work'}
                    </span>
                </div>

                {details.length > 0 && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        {!hideTime && <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        <span className="truncate">{details.join(' · ')}</span>
                    </p>
                )}
            </div>
        </article>
    );
}

function HappeningNowSlideshow({
    shifts,
    personal,
    clockLabel,
}: {
    shifts: OrgSchedule[];
    personal: boolean;
    clockLabel: string;
}) {
    const [index, setIndex] = useState(0);
    const [expanded, setExpanded] = useState(false);
    const [paused, setPaused] = useState(false);
    const reduceMotion = useReducedMotion();
    const count = shifts.length;
    const safeIndex = count === 0 ? 0 : index % count;

    useEffect(() => {
        setIndex((current) => (count === 0 ? 0 : current % count));
    }, [count]);

    useEffect(() => {
        if (expanded || paused || count < 2 || reduceMotion) return undefined;
        const timer = window.setInterval(() => {
            setIndex((current) => (current + 1) % count);
        }, 5000);
        return () => window.clearInterval(timer);
    }, [expanded, paused, count, reduceMotion]);

    const current = shifts[safeIndex];
    const go = (delta: number) => setIndex((currentIndex) => (currentIndex + delta + count) % count);

    if (!current) return null;

    return (
        <div
            className="border-b border-emerald-200/70 bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-emerald-50/90 px-5 py-4 sm:px-6"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-white shadow-sm shadow-emerald-600/20">
                        <Radio className="h-3 w-3 animate-pulse" />
                        Live Now
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-extrabold tabular-nums text-emerald-800 ring-1 ring-emerald-200">
                        {count} active
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-emerald-700">{clockLabel}</span>
                </div>
                <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    aria-expanded={expanded}
                    className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm ring-1 ring-emerald-200 transition-colors hover:bg-emerald-50"
                >
                    {expanded ? 'Slideshow view' : 'Show all'}
                </button>
            </div>

            {expanded ? (
                <ul className="mt-3.5 grid max-h-96 gap-2.5 overflow-y-auto pr-1 xl:grid-cols-2">
                    {shifts.map((shift) => (
                        <li key={`now-${shift.uid ?? shift.id}`}>
                            <ScheduleCard shift={shift} personal={personal} active />
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="mt-3.5">
                    <div aria-live="polite">
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={current.uid ?? current.id}
                                initial={reduceMotion ? false : { opacity: 0, x: 18 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, x: -18 }}
                                transition={{ duration: reduceMotion ? 0 : 0.25 }}
                            >
                                <ScheduleCard shift={current} personal={personal} active />
                            </motion.div>
                        </AnimatePresence>
                    </div>
                    {count > 1 && (
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => go(-1)}
                                aria-label="Previous happening now"
                                className="rounded-xl bg-white p-1.5 text-emerald-800 shadow-sm ring-1 ring-emerald-200 transition-colors hover:bg-emerald-50"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <div
                                className="flex min-w-0 items-center justify-center gap-1.5"
                                role="tablist"
                                aria-label="Happening now slides"
                            >
                                {count <= 8 ? (
                                    shifts.map((shift, slideIndex) => (
                                        <button
                                            key={`now-dot-${shift.uid ?? shift.id}`}
                                            type="button"
                                            role="tab"
                                            aria-selected={slideIndex === safeIndex}
                                            aria-label={`Show ${personal ? scheduleTitle(shift) : shift.student_name}`}
                                            onClick={() => setIndex(slideIndex)}
                                            className={`h-1.5 rounded-full transition-all ${
                                                slideIndex === safeIndex
                                                    ? 'w-6 bg-emerald-600'
                                                    : 'w-1.5 bg-emerald-200 hover:bg-emerald-300'
                                            }`}
                                        />
                                    ))
                                ) : (
                                    <span className="text-xs font-bold tabular-nums text-emerald-800">
                                        {safeIndex + 1} / {count}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => go(1)}
                                aria-label="Next happening now"
                                className="rounded-xl bg-white p-1.5 text-emerald-800 shadow-sm ring-1 ring-emerald-200 transition-colors hover:bg-emerald-50"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface OrganizationScheduleCalendarProps {
    /** When true, show only the signed-in student's work and class schedule. */
    personal?: boolean;
}

const OrganizationScheduleCalendar = ({ personal = false }: OrganizationScheduleCalendarProps) => {
    const [schedules, setSchedules] = useState<OrgSchedule[]>([]);
    const [activities, setActivities] = useState<OrgSchedule[]>([]);
    const [holidays, setHolidays] = useState<HolidaySpan[]>([]);
    const [semester, setSemester] = useState<SemesterWindow | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [cursor, setCursor] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const [selected, setSelected] = useState(() => new Date());
    const [office, setOffice] = useState('');
    const [places, setPlaces] = useState<string[]>([]);
    const [scope, setScope] = useState<'organization' | 'office'>('organization');
    const [category, setCategory] = useState<'all' | 'work' | 'class' | 'activity' | 'holiday' | 'break'>('all');
    const [clock, setClock] = useState(() => new Date());
    const [googleBusy, setGoogleBusy] = useState(false);
    const [googleNote, setGoogleNote] = useState<string | null>(null);
    const [googleConnected, setGoogleConnected] = useState(false);
    const [googleEmail, setGoogleEmail] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(() => {
        if (typeof window === 'undefined') return true;
        const key = personal ? 'wospis-calendar-expanded-personal' : 'wospis-calendar-expanded-org';
        const stored = window.localStorage.getItem(key);
        if (stored === '0') return false;
        if (stored === '1') return true;
        return true;
    });

    useEffect(() => {
        let active = true;
        axios
            .get('/api/calendar/google/status')
            .then((response) => {
                if (!active) return;
                setGoogleConnected(Boolean(response.data?.connected));
                setGoogleEmail(typeof response.data?.email === 'string' ? response.data.email : null);
            })
            .catch(() => {
                if (active) setGoogleConnected(false);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                if (personal) {
                    const studentName = localStorage.getItem('user_name') || 'Student';
                    const avatar = localStorage.getItem('profile_picture');
                    const [mineResult, activitiesResult, holidayResult, semesterResult] = await Promise.allSettled([
                        axios.get('/api/my-schedule'),
                        axios.get('/api/my-activities'),
                        axios.get('/api/holidays'),
                        axios.get('/api/semester'),
                    ]);
                    if (!active) return;
                    if (mineResult.status === 'fulfilled') {
                        const rows = Array.isArray(mineResult.value.data) ? mineResult.value.data : [];
                        setSchedules(
                            rows.map((shift: Record<string, unknown>) => ({
                                id: Number(shift.id),
                                uid: `shift-${shift.id}`,
                                day: String(shift.day || ''),
                                time: String(shift.time || ''),
                                kind: String(shift.kind || 'work'),
                                duty_type: (shift.duty_type as string | null) ?? null,
                                subject: (shift.subject as string | null) ?? null,
                                room: (shift.room as string | null) ?? null,
                                instructor: (shift.instructor as string | null) ?? (shift.supervisor as string | null) ?? null,
                                department: (shift.department as string | null) ?? null,
                                assigned_office:
                                    (shift.assigned_office as string | null) ?? (shift.department as string | null) ?? null,
                                student_name: studentName,
                                profile_picture: avatar,
                            }))
                        );
                        setPlaces([]);
                        setScope('organization');
                    } else {
                        console.error('Failed to load personal schedules', mineResult.reason);
                        setSchedules([]);
                    }
                    if (activitiesResult.status === 'fulfilled') {
                        const rows: StudentActivityItem[] = Array.isArray(activitiesResult.value.data?.activities)
                            ? activitiesResult.value.data.activities
                            : [];
                        setActivities(rows.map((row) => activityToSchedule(row, studentName, avatar)));
                    } else {
                        setActivities([]);
                    }
                    if (holidayResult.status === 'fulfilled') {
                        setHolidays(Array.isArray(holidayResult.value.data) ? holidayResult.value.data : []);
                    } else {
                        console.error('Failed to load holidays', holidayResult.reason);
                        setHolidays([]);
                    }
                    if (semesterResult.status === 'fulfilled') {
                        const nextSemester = semesterResult.value.data?.semester;
                        setSemester(nextSemester?.starts_on && nextSemester?.ends_on ? nextSemester : null);
                    } else {
                        console.error('Failed to load semester', semesterResult.reason);
                        setSemester(null);
                    }
                } else {
                    const [scheduleResult, holidayResult] = await Promise.allSettled([
                        axios.get('/api/organization-schedules'),
                        axios.get('/api/holidays'),
                    ]);
                    if (!active) return;
                    if (scheduleResult.status === 'fulfilled') {
                        const response = scheduleResult.value;
                        setSchedules(Array.isArray(response.data?.schedules) ? response.data.schedules : []);
                        const orgActivities: StudentActivityItem[] = Array.isArray(response.data?.activities)
                            ? response.data.activities
                            : [];
                        setActivities(orgActivities.map((row) => activityToSchedule(row, row.audience_label)));
                        setPlaces(
                            Array.isArray(response.data?.offices)
                                ? response.data.offices.filter((name: unknown) => typeof name === 'string' && name.trim() !== '')
                                : []
                        );
                        setScope(response.data?.scope === 'office' ? 'office' : 'organization');
                        const nextSemester = response.data?.semester;
                        setSemester(nextSemester?.starts_on && nextSemester?.ends_on ? nextSemester : null);
                    } else {
                        console.error('Failed to load organization schedules', scheduleResult.reason);
                        setSchedules([]);
                        setActivities([]);
                        setScope('organization');
                    }
                    if (holidayResult.status === 'fulfilled') {
                        setHolidays(Array.isArray(holidayResult.value.data) ? holidayResult.value.data : []);
                    } else {
                        console.error('Failed to load holidays', holidayResult.reason);
                        setHolidays([]);
                    }
                }
            } catch (error) {
                console.error(personal ? 'Failed to load personal calendar' : 'Failed to load organization calendar', error);
                if (active) {
                    setSchedules([]);
                    setHolidays([]);
                }
            } finally {
                if (active) setIsLoading(false);
            }
        };
        load();
        const interval = setInterval(load, 15000);
        const clockTimer = setInterval(() => setClock(new Date()), 30000);
        window.addEventListener(REALTIME_EVENT, load);
        return () => {
            active = false;
            clearInterval(interval);
            clearInterval(clockTimer);
            window.removeEventListener(REALTIME_EVENT, load);
        };
    }, [personal]);

    const offices = useMemo(() => {
        const fromSchedules = schedules.map((shift) => shiftOffice(shift)).filter((name) => name !== '');
        return [...new Set([...places, ...fromSchedules])].sort((left, right) => left.localeCompare(right));
    }, [places, schedules]);

    const officeSchedules = useMemo(() => {
        if (!office) return schedules;
        return schedules.filter((shift) => shiftOffice(shift) === office);
    }, [schedules, office]);

    const showWork = category === 'all' || category === 'work';
    const showClass = category === 'all' || category === 'class';
    const showActivity = category === 'all' || category === 'activity';
    const showHoliday = category === 'all' || category === 'holiday';
    const showBreak = category === 'all' || category === 'break';

    const visible = useMemo(() => {
        if (category === 'work') return officeSchedules.filter((shift) => !isClassShift(shift));
        if (category === 'class') return officeSchedules.filter((shift) => isClassShift(shift));
        if (category === 'activity' || category === 'holiday' || category === 'break') return [];
        return officeSchedules;
    }, [officeSchedules, category]);

    const activitiesByDate = useMemo(() => {
        const grouped = new Map<string, OrgSchedule[]>();
        activities.forEach((act) => {
            if (!act.event_date) return;
            const list = grouped.get(act.event_date) ?? [];
            list.push(act);
            grouped.set(act.event_date, list);
        });
        grouped.forEach((list) => list.sort(compareSchedules));
        return grouped;
    }, [activities]);

    const byWeekday = useMemo(() => {
        const grouped = new Map<string, OrgSchedule[]>();
        WEEKDAYS.forEach((day) => grouped.set(day, []));
        visible.forEach((shift) => {
            const bucket = grouped.get(shift.day);
            if (bucket) bucket.push(shift);
        });
        grouped.forEach((bucket) => bucket.sort(compareSchedules));
        return grouped;
    }, [visible]);

    const cells = monthCells(cursor);
    const today = clock;
    const selectedName = selected.toLocaleDateString('en-US', { weekday: 'long' });
    const selectedInSemester = insideSemester(selected, semester);
    const weekdayShifts = selectedInSemester ? byWeekday.get(selectedName) ?? [] : [];
    const selectedShifts = weekdayShifts.filter((shift) => !scheduleBlocked(selected, shift, holidays));
    const hiddenShifts = weekdayShifts.filter((shift) => scheduleBlocked(selected, shift, holidays));
    const selectedWork = selectedShifts.filter((shift) => !isClassShift(shift));
    const selectedClass = selectedShifts.filter((shift) => isClassShift(shift));
    const selectedActivities = showActivity ? activitiesByDate.get(dateKey(selected)) ?? [] : [];
    const selectedHoliday = showHoliday ? holidayOn(selected, holidays) : null;
    const selectedBreak = showBreak ? breakOn(selected, holidays) : null;
    const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const selectedIsToday = sameDay(selected, today);
    const todayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    const todayInSemester = insideSemester(today, semester);
    const todayWeekdayShifts = todayInSemester ? byWeekday.get(todayName) ?? [] : [];
    const todayShifts = todayWeekdayShifts.filter((shift) => !scheduleBlocked(today, shift, holidays));
    const todayWork = todayShifts.filter((shift) => !isClassShift(shift));
    const todayClasses = todayShifts.filter((shift) => isClassShift(shift));
    const todayActivities = showActivity ? activitiesByDate.get(dateKey(today)) ?? [] : [];
    const todayAgenda = [
        ...(showWork ? todayWork : []),
        ...(showClass ? todayClasses : []),
        ...(showActivity ? todayActivities : []),
    ].sort(compareSchedules);
    const selectedAgenda = [
        ...(showWork ? selectedWork : []),
        ...(showClass ? selectedClass : []),
        ...(showActivity ? selectedActivities : []),
    ].sort(compareSchedules);
    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    const isLive = (shift: OrgSchedule) =>
        isActivityShift(shift)
            ? Boolean(shift.activity_happening_now) || (shift.time ? happensNow(shift.time, nowMinutes) : true)
            : happensNow(shift.time, nowMinutes);
    const liveShifts = todayAgenda.filter(isLive);
    const showTodayPanel = personal && (showWork || showClass || showActivity);
    const officeScoped = !personal && scope === 'office';
    const calendarTitle = personal ? 'My Schedule' : officeScoped ? 'Office Schedule' : 'Organization Schedule';
    const clockLabel = today.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const shiftMonth = (delta: number) => {
        setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
    };

    const toggleExpanded = () => {
        setIsExpanded((current) => {
            const next = !current;
            const key = personal ? 'wospis-calendar-expanded-personal' : 'wospis-calendar-expanded-org';
            window.localStorage.setItem(key, next ? '1' : '0');
            return next;
        });
    };

    const goToToday = () => {
        setSelected(today);
        setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    };

    const connectGoogleCalendar = async () => {
        setGoogleBusy(true);
        setGoogleNote(null);
        try {
            if (googleConnected) {
                await axios.delete('/api/calendar/google/connection');
                setGoogleConnected(false);
                setGoogleEmail(null);
                setGoogleNote('Google Calendar is disconnected. New duty and holiday changes stay in TechHRM.');
                return;
            }
            const response = await axios.get('/api/calendar/google/connect');
            if (response.data?.url) {
                window.location.assign(response.data.url);
                return;
            }
            setGoogleNote('Google Calendar is not configured on the server.');
        } catch (error) {
            const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
            setGoogleNote(typeof message === 'string' && message.trim() !== '' ? message : 'Google Calendar could not be connected.');
        } finally {
            setGoogleBusy(false);
        }
    };

    const semesterLine = semester
        ? `${semester.label} runs ${formatSemesterDate(semester.starts_on)} through ${formatSemesterDate(semester.ends_on)}.`
        : '';

    return (
        <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
            {/* OBSIDIAN COLLAPSIBLE HEADER */}
            <div className="relative overflow-hidden bg-slate-950 px-5 py-5 text-white sm:px-7">
                <div
                    className="pointer-events-none absolute inset-0 opacity-15"
                    style={{
                        backgroundImage: 'radial-gradient(rgba(148,163,184,0.45) 1px, transparent 1px)',
                        backgroundSize: '18px 18px',
                    }}
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-600/20 blur-3xl"
                    aria-hidden="true"
                />

                <button
                    type="button"
                    onClick={toggleExpanded}
                    aria-expanded={isExpanded}
                    aria-controls="schedule-calendar-body"
                    className="relative z-10 flex w-full items-start justify-between gap-4 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-600/25">
                                <CalendarDays className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-lg font-black tracking-tight text-white sm:text-xl">
                                        {calendarTitle}
                                    </h2>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-300">
                                        <Clock className="h-3 w-3 text-blue-400" />
                                        {clockLabel}
                                    </span>
                                </div>

                                {!isExpanded && (
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
                                        <span className="text-slate-200">{monthLabel}</span>
                                        <span>·</span>
                                        {liveShifts.length > 0 ? (
                                            <span className="font-bold text-emerald-400">
                                                {liveShifts.length} happening now
                                            </span>
                                        ) : (
                                            <>
                                                <span className="font-semibold text-blue-300">
                                                    {todayWork.length} work today
                                                </span>
                                                <span>·</span>
                                                <span className="font-semibold text-violet-300">
                                                    {todayClasses.length} class today
                                                </span>
                                                {todayActivities.length > 0 && (
                                                    <>
                                                        <span>·</span>
                                                        <span className="font-semibold text-emerald-300">
                                                            {todayActivities.length} activity today
                                                        </span>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {isExpanded && (
                            <>
                                <p className="mt-3 max-w-2xl text-xs font-medium leading-relaxed text-slate-400 sm:text-sm">
                                    {semesterLine
                                        ? `${semesterLine} · Select a day to inspect scheduled shifts and classes.`
                                        : 'Select a day to view work shifts and class blocks once the semester window is set.'}
                                </p>

                                {/* Legend Chips */}
                                <div className="mt-3.5 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-500/15 px-2.5 py-1 text-blue-200">
                                        <Briefcase className="h-3 w-3 text-blue-400" /> Work
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-500/15 px-2.5 py-1 text-violet-200">
                                        <GraduationCap className="h-3 w-3 text-violet-400" /> Class
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2.5 py-1 text-emerald-200">
                                        <Sparkles className="h-3 w-3 text-emerald-400" /> Activity
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/15 px-2.5 py-1 text-amber-200">
                                        <Flag className="h-3 w-3 text-amber-400" /> Holiday
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/20 bg-teal-500/15 px-2.5 py-1 text-teal-200">
                                        <Flag className="h-3 w-3 text-teal-400" /> Class break
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10">
                        <ChevronDown
                            className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                        />
                    </span>
                </button>
            </div>

            {isExpanded && (
                <div id="schedule-calendar-body">
                    {/* FILTER & NAVIGATION DECK */}
                    <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <div
                                className="inline-flex flex-wrap rounded-xl border border-slate-200/90 bg-white p-1 shadow-xs"
                                role="group"
                                aria-label="Filter by schedule category"
                            >
                                {CATEGORIES.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        aria-pressed={category === item.id}
                                        onClick={() => setCategory(item.id)}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                                            category === item.id
                                                ? 'bg-slate-900 text-white shadow-sm'
                                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>

                            {!personal && offices.length > 1 && (
                                <ComboFilter
                                    commitOnType={false}
                                    value={office}
                                    onChange={setOffice}
                                    options={offices}
                                    placeholder={officeScoped ? 'All of your offices' : 'All departments and offices'}
                                    emptyLabel={officeScoped ? 'All of your offices' : 'All departments and offices'}
                                    className="w-full min-w-0 sm:w-64"
                                />
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-2 sm:justify-end">
                            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white p-1 shadow-xs">
                                <button
                                    type="button"
                                    onClick={() => shiftMonth(-1)}
                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                                    aria-label="Previous month"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="min-w-36 px-2 text-center text-xs font-extrabold uppercase tracking-wider text-slate-900">
                                    {monthLabel}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => shiftMonth(1)}
                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                                    aria-label="Next month"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={connectGoogleCalendar}
                                disabled={googleBusy}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-wait disabled:opacity-60"
                            >
                                <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                                {googleBusy
                                    ? 'Working…'
                                    : googleConnected
                                      ? 'Disconnect Google'
                                      : 'Connect Google'}
                            </button>
                            <button
                                type="button"
                                onClick={goToToday}
                                className="rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                            >
                                Today
                            </button>
                        </div>
                    </div>

                    {googleNote && (
                        <p className="border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs font-medium leading-relaxed text-slate-600 sm:px-6">
                            {googleNote}
                        </p>
                    )}
                    {googleConnected && !googleNote && (
                        <p className="border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs font-medium leading-relaxed text-slate-600 sm:px-6">
                            {googleEmail
                                ? `Connected to ${googleEmail}. Duty, class, and holiday changes appear in that Google Calendar when they are saved.`
                                : 'Connected to Google Calendar. Duty, class, and holiday changes appear there when they are saved.'}
                        </p>
                    )}

                    {/* HAPPENING NOW SLIDESHOW */}
                    {liveShifts.length > 0 && (
                        <HappeningNowSlideshow shifts={liveShifts} personal={personal} clockLabel={clockLabel} />
                    )}

                    {/* PERSONAL TODAY AGENDA STRIP */}
                    {showTodayPanel && (
                        <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-6">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-blue-700 ring-1 ring-blue-200/60">
                                        <Sparkles className="h-3 w-3" />
                                        Today&apos;s Agenda
                                    </span>
                                    <span className="text-xs font-bold text-slate-500">
                                        {today.toLocaleDateString('en-US', {
                                            weekday: 'long',
                                            month: 'long',
                                            day: 'numeric',
                                        })}
                                    </span>
                                </div>
                                {!selectedIsToday && (
                                    <button
                                        type="button"
                                        onClick={goToToday}
                                        className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs ring-1 ring-slate-200 transition-colors hover:bg-slate-50"
                                    >
                                        Jump to today
                                    </button>
                                )}
                            </div>
                            {todayAgenda.length === 0 ? (
                                <p className="mt-3 text-xs font-medium text-slate-500">
                                    {category === 'activity'
                                        ? 'No campus or group activities scheduled for today.'
                                        : showWork && showClass
                                          ? 'No work, class, or campus activity scheduled for today.'
                                          : showWork
                                            ? 'No work scheduled for today.'
                                            : 'No classes scheduled for today.'}
                                </p>
                            ) : (
                                <ul className="mt-3 grid gap-2.5 md:grid-cols-2">
                                    {todayAgenda.map((shift) => (
                                        <li key={`today-${shift.uid ?? shift.id}`}>
                                            <ScheduleCard shift={shift} personal active={isLive(shift)} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* CALENDAR GRID + SELECTED DAY TIMELINE */}
                    <div className="grid gap-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.85fr)] lg:items-stretch">
                        {/* MONTH GRID */}
                        <div className="border-b border-slate-100 p-4 sm:p-6 lg:min-h-0 lg:border-b-0 lg:border-r">
                            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                {WEEKDAYS.map((day) => (
                                    <div key={day} className="py-1.5">
                                        {day.slice(0, 3)}
                                    </div>
                                ))}
                            </div>

                            {isLoading ? (
                                <div className="mt-2 grid grid-cols-7 gap-1.5">
                                    {Array.from({ length: 35 }, (_, index) => (
                                        <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
                                    ))}
                                </div>
                            ) : (
                                <div className="mt-2 grid grid-cols-7 gap-1.5">
                                    {cells.map((date, index) => {
                                        if (!date) {
                                            return (
                                                <div
                                                    key={`empty-${index}`}
                                                    className="h-28 rounded-2xl bg-slate-50/60"
                                                />
                                            );
                                        }
                                        const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
                                        const inWindow = insideSemester(date, semester);
                                        const dayShifts = (inWindow ? byWeekday.get(weekday) ?? [] : []).filter(
                                            (shift) => !scheduleBlocked(date, shift, holidays)
                                        );
                                        const workCount = dayShifts.filter((shift) => !isClassShift(shift)).length;
                                        const classCount = dayShifts.filter((shift) => isClassShift(shift)).length;
                                        const dayActivities = showActivity ? activitiesByDate.get(dateKey(date)) ?? [] : [];
                                        const activityCount = dayActivities.length;
                                        const holiday = showHoliday ? holidayOn(date, holidays) : null;
                                        const classBreak = showBreak ? breakOn(date, holidays) : null;
                                        const isToday = sameDay(date, today);
                                        const isSelected = sameDay(date, selected);
                                        const hasActivity = activityCount > 0;
                                        const hasClass = classCount > 0;
                                        const hasWorkOnly = workCount > 0 && !hasClass;
                                        const liveCount = isToday
                                            ? dayShifts.filter(isLive).length + dayActivities.filter(isLive).length
                                            : 0;

                                        return (
                                            <button
                                                key={date.toISOString()}
                                                type="button"
                                                onClick={() => setSelected(date)}
                                                aria-pressed={isSelected}
                                                aria-current={isToday ? 'date' : undefined}
                                                aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, ${workCount} work, ${classCount} class, ${activityCount} activity${liveCount ? `, ${liveCount} happening now` : ''}${holiday ? `, holiday ${holiday.name}${holiday.portion === 'half' ? ' half day' : ''}` : ''}${classBreak ? `, class break ${classBreak.name}` : ''}`}
                                                className={`flex h-28 flex-col items-start rounded-2xl p-1.5 text-left transition-all sm:p-2 ${
                                                    isSelected
                                                        ? hasActivity
                                                            ? 'bg-emerald-700 text-white shadow-md shadow-emerald-900/20 ring-2 ring-emerald-300'
                                                            : personal && hasClass
                                                              ? 'bg-violet-700 text-white shadow-md shadow-violet-900/20 ring-2 ring-violet-300'
                                                              : personal && hasWorkOnly
                                                                ? 'bg-blue-700 text-white shadow-md shadow-blue-900/20 ring-2 ring-blue-300'
                                                                : 'bg-slate-900 text-white shadow-md shadow-slate-900/20'
                                                        : !inWindow && !hasActivity
                                                          ? 'text-slate-300 hover:bg-slate-50'
                                                          : hasActivity
                                                            ? isToday
                                                                ? 'bg-emerald-50 text-slate-900 ring-2 ring-inset ring-emerald-400'
                                                                : 'bg-emerald-50/60 text-slate-900 ring-1 ring-inset ring-emerald-200/80 hover:bg-emerald-50'
                                                            : personal && hasClass
                                                              ? isToday
                                                                  ? 'bg-violet-50 text-slate-900 ring-2 ring-inset ring-violet-400'
                                                                  : 'bg-violet-50/60 text-slate-900 ring-1 ring-inset ring-violet-200/80 hover:bg-violet-50'
                                                              : personal && hasWorkOnly
                                                                ? isToday
                                                                    ? 'bg-blue-50 text-slate-900 ring-2 ring-inset ring-blue-400'
                                                                    : 'bg-blue-50/60 text-slate-900 ring-1 ring-inset ring-blue-200/80 hover:bg-blue-50'
                                                                : isToday
                                                                  ? 'bg-slate-100 text-slate-900 ring-2 ring-inset ring-slate-300'
                                                                  : 'border border-slate-100 bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50/80'
                                                }`}
                                            >
                                                <span
                                                    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-extrabold tabular-nums ${
                                                        isToday && !isSelected ? 'bg-slate-900 text-white' : ''
                                                    }`}
                                                >
                                                    {date.getDate()}
                                                </span>

                                                <span className="mt-auto flex w-full flex-col gap-0.5">
                                                    {classBreak && (
                                                        <span
                                                            title={classBreak.name}
                                                            className={`truncate rounded-md px-1.5 text-[10px] font-bold leading-4 ${
                                                                isSelected
                                                                    ? 'bg-teal-400/25 text-teal-100'
                                                                    : 'bg-teal-50 text-teal-800'
                                                            }`}
                                                        >
                                                            {classBreak.name}
                                                        </span>
                                                    )}
                                                    {holiday && (
                                                        <span
                                                            title={holiday.name}
                                                            className={`truncate rounded-md px-1.5 text-[10px] font-bold leading-4 ${
                                                                isSelected
                                                                    ? 'bg-amber-400/25 text-amber-100'
                                                                    : 'bg-amber-50 text-amber-800'
                                                            }`}
                                                        >
                                                            {holiday.portion === 'half'
                                                                ? `${holiday.name} · Half`
                                                                : holiday.name}
                                                        </span>
                                                    )}
                                                    {liveCount > 0 && (
                                                        <span
                                                            className={`truncate rounded-md px-1.5 text-[10px] font-bold leading-4 ${
                                                                isSelected
                                                                    ? 'bg-emerald-400/25 text-emerald-100'
                                                                    : 'bg-emerald-50 text-emerald-800'
                                                            }`}
                                                        >
                                                            {liveCount} now
                                                        </span>
                                                    )}
                                                    {activityCount > 0 && (
                                                        <span
                                                            title={dayActivities.map((act) => act.subject || act.duty_type).join(', ')}
                                                            className={`truncate rounded-md px-1.5 text-[10px] font-bold leading-4 ${
                                                                isSelected
                                                                    ? 'bg-emerald-400/25 text-emerald-100'
                                                                    : 'bg-emerald-100/80 text-emerald-900'
                                                            }`}
                                                        >
                                                            {activityCount === 1
                                                                ? dayActivities[0].activity_kind_label || '1 activity'
                                                                : `${activityCount} activities`}
                                                        </span>
                                                    )}
                                                    {workCount > 0 && (
                                                        <span
                                                            className={`truncate rounded-md px-1.5 text-[10px] font-bold leading-4 ${
                                                                isSelected
                                                                    ? 'bg-blue-400/25 text-blue-100'
                                                                    : 'bg-blue-50 text-blue-700'
                                                            }`}
                                                        >
                                                            {workCount} work
                                                        </span>
                                                    )}
                                                    {classCount > 0 && (
                                                        <span
                                                            className={`truncate rounded-md px-1.5 text-[10px] font-bold leading-4 ${
                                                                isSelected
                                                                    ? 'bg-violet-400/25 text-violet-100'
                                                                    : 'bg-violet-50 text-violet-700'
                                                            }`}
                                                        >
                                                            {classCount} class
                                                        </span>
                                                    )}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* SELECTED DAY AGENDA PANEL */}
                        <div className="relative min-h-80 bg-slate-50/50 lg:min-h-0">
                            <div className="flex flex-col overflow-hidden lg:absolute lg:inset-0">
                                <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                                            {selected.toLocaleDateString('en-US', {
                                                weekday: 'long',
                                                month: 'long',
                                                day: 'numeric',
                                            })}
                                        </p>
                                        {selectedIsToday && (
                                            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                                                Today
                                            </span>
                                        )}
                                        {selectedIsToday && selectedAgenda.some(isLive) && (
                                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                                                {selectedAgenda.filter(isLive).length} now
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                                        {showWork && (
                                            <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-blue-700">
                                                {selectedWork.length} work
                                            </span>
                                        )}
                                        {showClass && (
                                            <span className="rounded-lg bg-violet-50 px-2 py-0.5 text-violet-700">
                                                {selectedClass.length} class
                                            </span>
                                        )}
                                        {showActivity && selectedActivities.length > 0 && (
                                            <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-emerald-800">
                                                {selectedActivities.length}{' '}
                                                {selectedActivities.length === 1 ? 'activity' : 'activities'}
                                            </span>
                                        )}
                                        {category === 'activity' && selectedActivities.length === 0 && (
                                            <span className="text-slate-400">No activities</span>
                                        )}
                                        {showHoliday && selectedHoliday && (
                                            <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-amber-700">
                                                {selectedHoliday.portion === 'half' ? 'Half-day holiday' : 'Holiday'}
                                            </span>
                                        )}
                                        {showBreak && selectedBreak && (
                                            <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-teal-700">
                                                Class break
                                            </span>
                                        )}
                                        {category === 'holiday' && !selectedHoliday && (
                                            <span className="text-slate-400">No holiday</span>
                                        )}
                                        {category === 'break' && !selectedBreak && (
                                            <span className="text-slate-400">No class break</span>
                                        )}
                                    </div>
                                </div>

                                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                                    {showHoliday && selectedHoliday && (
                                        <section className="m-4 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60">
                                            <div className="flex items-center gap-2 border-b border-amber-200/70 bg-amber-100/60 px-4 py-2 text-[11px] font-extrabold uppercase tracking-widest text-amber-800">
                                                <Flag className="h-3.5 w-3.5" />
                                                Holiday
                                            </div>
                                            <div className="px-4 py-3">
                                                <p className="text-sm font-bold text-slate-900">
                                                    {selectedHoliday.name}
                                                </p>
                                                <p className="mt-1 text-xs font-medium text-slate-600">
                                                    {holidayRangeLabel(selectedHoliday)}
                                                    {selectedHoliday.portion === 'half' &&
                                                    selectedHoliday.starts_at &&
                                                    selectedHoliday.ends_at
                                                        ? ` · ${formatClockTime(String(selectedHoliday.starts_at).slice(0, 5))}–${formatClockTime(String(selectedHoliday.ends_at).slice(0, 5))}`
                                                        : selectedHoliday.portion === 'half'
                                                          ? ' · Half day'
                                                          : ''}
                                                </p>
                                                {hiddenShifts.length > 0 && (
                                                    <p className="mt-2 text-xs font-medium text-amber-800">
                                                        Work and class schedules during this holiday are hidden.
                                                    </p>
                                                )}
                                            </div>
                                        </section>
                                    )}

                                    {showBreak && selectedBreak && (
                                        <section className="m-4 overflow-hidden rounded-2xl border border-teal-200 bg-teal-50/60">
                                            <div className="flex items-center gap-2 border-b border-teal-200/70 bg-teal-100/60 px-4 py-2 text-[11px] font-extrabold uppercase tracking-widest text-teal-800">
                                                <Flag className="h-3.5 w-3.5" />
                                                Class break
                                            </div>
                                            <div className="px-4 py-3">
                                                <p className="text-sm font-bold text-slate-900">
                                                    {selectedBreak.name}
                                                </p>
                                                <p className="mt-1 text-xs font-medium text-slate-600">
                                                    {holidayRangeLabel(selectedBreak)}
                                                </p>
                                                {hiddenShifts.length > 0 && (
                                                    <p className="mt-2 text-xs font-medium text-teal-800">
                                                        Work and class schedules during this break are hidden.
                                                    </p>
                                                )}
                                            </div>
                                        </section>
                                    )}

                                    {category === 'holiday' ? (
                                        selectedHoliday ? null : (
                                            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-xs ring-1 ring-slate-200/70">
                                                    <Flag className="h-6 w-6" />
                                                </div>
                                                <p className="text-sm font-bold text-slate-600">
                                                    No holiday on this date.
                                                </p>
                                            </div>
                                        )
                                    ) : category === 'break' ? (
                                        selectedBreak ? null : (
                                            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-xs ring-1 ring-slate-200/70">
                                                    <Flag className="h-6 w-6" />
                                                </div>
                                                <p className="text-sm font-bold text-slate-600">
                                                    No class break on this date.
                                                </p>
                                            </div>
                                        )
                                    ) : category === 'activity' && selectedActivities.length === 0 ? (
                                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-xs ring-1 ring-slate-200/70">
                                                <Sparkles className="h-6 w-6" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-600">
                                                No campus or group activity on this date.
                                            </p>
                                        </div>
                                    ) : !semester && selectedActivities.length === 0 ? (
                                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-xs ring-1 ring-slate-200/70">
                                                <CalendarDays className="h-6 w-6" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-600">
                                                Set the semester before the weekly loop appears on the calendar.
                                            </p>
                                        </div>
                                    ) : !selectedInSemester && selectedActivities.length === 0 ? (
                                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-xs ring-1 ring-slate-200/70">
                                                <CalendarDays className="h-6 w-6" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-600">
                                                This date is outside {semester!.label}.
                                            </p>
                                            <p className="mt-1 text-xs font-medium text-slate-400">
                                                Weekly schedules repeat from {formatSemesterDate(semester!.starts_on)}{' '}
                                                through {formatSemesterDate(semester!.ends_on)}.
                                            </p>
                                        </div>
                                    ) : selectedAgenda.length === 0 && hiddenShifts.length === 0 ? (
                                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-xs ring-1 ring-slate-200/70">
                                                <CalendarDays className="h-6 w-6" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-600">
                                                {category === 'work'
                                                    ? `No work is scheduled on ${selectedName}s.`
                                                    : category === 'class'
                                                      ? `No classes are scheduled on ${selectedName}s.`
                                                      : `Nothing is scheduled on ${selectedName}s.`}
                                            </p>
                                        </div>
                                    ) : selectedAgenda.length === 0 ? null : (
                                        <ol className="relative space-y-3 px-4 py-4 sm:px-5">
                                            {selectedAgenda.map((shift) => {
                                                const active = selectedIsToday && isLive(shift);
                                                return (
                                                    <li
                                                        key={shift.uid ?? shift.id}
                                                        className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-2.5"
                                                    >
                                                        <div
                                                            className={`pt-3 text-right ${
                                                                active ? 'text-emerald-700' : 'text-slate-600'
                                                            }`}
                                                        >
                                                            <p className="text-xs font-extrabold tabular-nums">
                                                                {formatShiftStart(shift.time)}
                                                            </p>
                                                            <p className="text-[10px] font-semibold tabular-nums text-slate-400">
                                                                {formatShiftEnd(shift.time)}
                                                            </p>
                                                        </div>
                                                        <ScheduleCard
                                                            shift={shift}
                                                            personal={personal}
                                                            active={active}
                                                            hideTime
                                                        />
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default OrganizationScheduleCalendar;