import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, GraduationCap, Briefcase, Flag } from 'lucide-react';
import { REALTIME_EVENT } from '../utils/realtime';
import { compareSchedules, formatShiftEnd, formatShiftStart, happensNow, shiftWindow } from '../utils/scheduleTime';
import { WEEKDAYS, monthCells } from '../utils/organizationCalendar';
import UserAvatar from './UserAvatar';
import ComboFilter from './ComboFilter';

interface OrgSchedule {
    id: number;
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
    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}

function scheduleTitle(shift: OrgSchedule) {
    if (shift.kind === 'class') return shift.subject || 'Class';
    return shift.duty_type || 'Work';
}

function isClassShift(shift: OrgSchedule) {
    return shift.kind === 'class';
}

function shiftOffice(shift: OrgSchedule) {
    return (shift.assigned_office || shift.department || '').trim();
}

const CATEGORIES: Array<{ id: 'all' | 'work' | 'class' | 'holiday' | 'break'; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'work', label: 'Work' },
    { id: 'class', label: 'Class' },
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
    const office = shiftOffice(shift);
    const details = [
        !hideTime ? `${formatShiftStart(shift.time)}${formatShiftEnd(shift.time) ? ` – ${formatShiftEnd(shift.time)}` : ''}` : '',
        (!personal || !isClass) && (shift.assignment_label || office) ? (shift.assignment_label || office) : '',
        shift.room || '',
        shift.instructor || '',
    ].filter(Boolean);

    return (
        <article
            className={`flex min-w-0 items-start gap-3 rounded-2xl border px-3.5 py-3 transition-shadow ${
                isClass ? 'border-violet-200' : 'border-blue-200'
            } ${
                active
                    ? isClass
                        ? 'bg-violet-50 shadow-[0_10px_24px_-16px_rgba(109,40,217,0.9)] ring-2 ring-violet-500'
                        : 'bg-blue-50 shadow-[0_10px_24px_-16px_rgba(37,99,235,0.9)] ring-2 ring-blue-500'
                    : 'bg-white'
            }`}
            aria-current={active ? 'true' : undefined}
        >
            {!personal && (
                <UserAvatar name={shift.student_name} picture={shift.profile_picture} className="h-9 w-9 rounded-full bg-slate-100 text-xs text-slate-600" />
            )}
            {personal && (
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isClass ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                    {isClass ? <GraduationCap className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                </div>
            )}
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        {!personal && <p className="truncate text-sm font-semibold text-slate-900">{shift.student_name}</p>}
                        <p className={`truncate text-sm ${personal ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                            {scheduleTitle(shift)}
                        </p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        active
                            ? 'bg-emerald-600 text-white'
                            : isClass
                                ? 'bg-violet-100 text-violet-700'
                                : 'bg-blue-100 text-blue-700'
                    }`}>
                        {active && (
                            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                            </span>
                        )}
                        {active ? (isClass ? 'Class now' : 'Work now') : isClass ? 'Class' : 'Work'}
                    </span>
                </div>
                {details.length > 0 && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        {!hideTime && <Clock className="h-3.5 w-3.5 shrink-0" />}
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
            className="border-b border-emerald-100 bg-emerald-50/60 px-6 py-4"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Happening now
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold normal-case tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                        {count}
                    </span>
                    <span className="text-[11px] font-medium normal-case tracking-normal text-emerald-700">{clockLabel}</span>
                </p>
                <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    aria-expanded={expanded}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50"
                >
                    {expanded ? 'Slideshow' : 'Expand'}
                </button>
            </div>

            {expanded ? (
                <ul className="mt-3 grid max-h-96 gap-2 overflow-y-auto pr-1 xl:grid-cols-2">
                    {shifts.map((shift) => (
                        <li key={`now-${shift.id}`}>
                            <ScheduleCard shift={shift} personal={personal} active />
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="mt-3">
                    <div aria-live="polite">
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={current.id}
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
                            <button type="button" onClick={() => go(-1)} aria-label="Previous happening now" className="rounded-lg bg-white p-1.5 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <div className="flex min-w-0 items-center justify-center gap-1.5" role="tablist" aria-label="Happening now slides">
                                {count <= 8 ? shifts.map((shift, slideIndex) => (
                                    <button
                                        key={`now-dot-${shift.id}`}
                                        type="button"
                                        role="tab"
                                        aria-selected={slideIndex === safeIndex}
                                        aria-label={`Show ${personal ? scheduleTitle(shift) : shift.student_name}`}
                                        onClick={() => setIndex(slideIndex)}
                                        className={`h-1.5 rounded-full transition-all ${slideIndex === safeIndex ? 'w-5 bg-emerald-600' : 'w-1.5 bg-emerald-200 hover:bg-emerald-300'}`}
                                    />
                                )) : (
                                    <span className="text-xs font-semibold tabular-nums text-emerald-800">{safeIndex + 1} of {count}</span>
                                )}
                            </div>
                            <button type="button" onClick={() => go(1)} aria-label="Next happening now" className="rounded-lg bg-white p-1.5 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50">
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
    const [category, setCategory] = useState<'all' | 'work' | 'class' | 'holiday' | 'break'>('all');
    const [clock, setClock] = useState(() => new Date());
    const [isExpanded, setIsExpanded] = useState(() => {
        if (typeof window === 'undefined') return true;
        const key = personal ? 'techhrm-calendar-expanded-personal' : 'techhrm-calendar-expanded-org';
        const stored = window.localStorage.getItem(key);
        if (stored === '0') return false;
        if (stored === '1') return true;
        return true;
    });

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                if (personal) {
                    const studentName = localStorage.getItem('user_name') || 'Student';
                    const avatar = localStorage.getItem('profile_picture');
                    const [mineResult, holidayResult, semesterResult] = await Promise.allSettled([
                        axios.get('/api/my-schedule'),
                        axios.get('/api/holidays'),
                        axios.get('/api/semester'),
                    ]);
                    if (!active) return;
                    if (mineResult.status === 'fulfilled') {
                        const rows = Array.isArray(mineResult.value.data) ? mineResult.value.data : [];
                        setSchedules(rows.map((shift: Record<string, unknown>) => ({
                            id: Number(shift.id),
                            day: String(shift.day || ''),
                            time: String(shift.time || ''),
                            kind: String(shift.kind || 'work'),
                            duty_type: (shift.duty_type as string | null) ?? null,
                            subject: (shift.subject as string | null) ?? null,
                            room: (shift.room as string | null) ?? null,
                            instructor: (shift.instructor as string | null) ?? (shift.supervisor as string | null) ?? null,
                            department: (shift.department as string | null) ?? null,
                            assigned_office: (shift.assigned_office as string | null) ?? (shift.department as string | null) ?? null,
                            student_name: studentName,
                            profile_picture: avatar,
                        })));
                        setPlaces([]);
                        setScope('organization');
                    } else {
                        console.error('Failed to load personal schedules', mineResult.reason);
                        setSchedules([]);
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
                        setPlaces(Array.isArray(response.data?.offices) ? response.data.offices.filter((name: unknown) => typeof name === 'string' && name.trim() !== '') : []);
                        setScope(response.data?.scope === 'office' ? 'office' : 'organization');
                        const nextSemester = response.data?.semester;
                        setSemester(nextSemester?.starts_on && nextSemester?.ends_on ? nextSemester : null);
                    } else {
                        console.error('Failed to load organization schedules', scheduleResult.reason);
                        setSchedules([]);
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
        const fromSchedules = schedules
            .map((shift) => shiftOffice(shift))
            .filter((name) => name !== '');
        return [...new Set([...places, ...fromSchedules])].sort((left, right) => left.localeCompare(right));
    }, [places, schedules]);

    const officeSchedules = useMemo(() => {
        if (!office) return schedules;
        return schedules.filter((shift) => shiftOffice(shift) === office);
    }, [schedules, office]);

    const showWork = category === 'all' || category === 'work';
    const showClass = category === 'all' || category === 'class';
    const showHoliday = category === 'all' || category === 'holiday';
    const showBreak = category === 'all' || category === 'break';

    const visible = useMemo(() => {
        if (category === 'work') return officeSchedules.filter((shift) => !isClassShift(shift));
        if (category === 'class') return officeSchedules.filter((shift) => isClassShift(shift));
        if (category === 'holiday' || category === 'break') return [];
        return officeSchedules;
    }, [officeSchedules, category]);

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
    const weekdayShifts = selectedInSemester ? (byWeekday.get(selectedName) ?? []) : [];
    const selectedShifts = weekdayShifts.filter((shift) => !scheduleBlocked(selected, shift, holidays));
    const hiddenShifts = weekdayShifts.filter((shift) => scheduleBlocked(selected, shift, holidays));
    const selectedWork = selectedShifts.filter((shift) => !isClassShift(shift));
    const selectedClass = selectedShifts.filter((shift) => isClassShift(shift));
    const selectedHoliday = showHoliday ? holidayOn(selected, holidays) : null;
    const selectedBreak = showBreak ? breakOn(selected, holidays) : null;
    const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const selectedIsToday = sameDay(selected, today);
    const todayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    const todayInSemester = insideSemester(today, semester);
    const todayWeekdayShifts = todayInSemester ? (byWeekday.get(todayName) ?? []) : [];
    const todayShifts = todayWeekdayShifts.filter((shift) => !scheduleBlocked(today, shift, holidays));
    const todayWork = todayShifts.filter((shift) => !isClassShift(shift));
    const todayClasses = todayShifts.filter((shift) => isClassShift(shift));
    const todayAgenda = [...(showWork ? todayWork : []), ...(showClass ? todayClasses : [])].sort(compareSchedules);
    const selectedAgenda = [...(showWork ? selectedWork : []), ...(showClass ? selectedClass : [])].sort(compareSchedules);
    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    const isLive = (shift: OrgSchedule) => happensNow(shift.time, nowMinutes);
    const liveShifts = todayAgenda.filter(isLive);
    const showTodayPanel = personal && (showWork || showClass);
    const officeScoped = !personal && scope === 'office';
    const calendarTitle = personal ? 'My schedule' : officeScoped ? 'Office schedule' : 'Organization schedule';
    const clockLabel = today.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const shiftMonth = (delta: number) => {
        setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
    };

    const toggleExpanded = () => {
        setIsExpanded((current) => {
            const next = !current;
            const key = personal ? 'techhrm-calendar-expanded-personal' : 'techhrm-calendar-expanded-org';
            window.localStorage.setItem(key, next ? '1' : '0');
            return next;
        });
    };

    const goToToday = () => {
        setSelected(today);
        setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    };

    const semesterLine = semester
        ? `${semester.label} runs ${formatSemesterDate(semester.starts_on)} through ${formatSemesterDate(semester.ends_on)}.`
        : '';

    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className={`px-6 py-5 ${isExpanded ? 'border-b border-slate-100' : ''}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <button
                        type="button"
                        onClick={toggleExpanded}
                        aria-expanded={isExpanded}
                        aria-controls="schedule-calendar-body"
                        className="min-w-0 flex-1 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                        <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                                <h2 className="flex items-center gap-2.5 text-lg font-semibold text-slate-900">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                        <CalendarDays className="h-5 w-5" />
                                    </span>
                                    {calendarTitle}
                                </h2>
                                {isExpanded ? (
                                    <>
                                        <p className="mt-1 text-sm text-slate-500">
                                            {personal
                                                ? semesterLine
                                                    ? `${semesterLine} Select a day to see your work and class blocks, earliest first.`
                                                    : 'Select a day to see your work and class schedule once the semester window is set.'
                                                : officeScoped
                                                    ? semesterLine
                                                        ? `Students assigned to your office. ${semesterLine}`
                                                        : 'Students assigned to your office. Schedules appear after the semester window is set.'
                                                    : semesterLine
                                                        ? `${semesterLine} Every office repeats each week inside that window.`
                                                        : 'Schedules repeat each week after WSPO staff or a super admin sets the semester length.'}
                                        </p>
                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                                                <Briefcase className="h-3.5 w-3.5" /> Work
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2 py-1 text-violet-700">
                                                <GraduationCap className="h-3.5 w-3.5" /> Class
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                                                <Flag className="h-3.5 w-3.5" /> Holiday
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2 py-1 text-teal-700">
                                                <Flag className="h-3.5 w-3.5" /> Class break
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                                                <Clock className="h-3.5 w-3.5" /> {clockLabel}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                                        <span>{monthLabel}</span>
                                        <span className="text-slate-300">·</span>
                                        <span>{clockLabel}</span>
                                        {liveShifts.length > 0 ? (
                                            <span className="font-semibold text-emerald-700">{liveShifts.length} happening now</span>
                                        ) : (
                                            <>
                                                <span className="font-medium text-blue-700">{todayWork.length} work today</span>
                                                <span className="font-medium text-violet-700">{todayClasses.length} class today</span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                            <ChevronDown
                                className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                aria-hidden="true"
                            />
                        </div>
                    </button>
                    {isExpanded && (
                        <div className="flex flex-col items-stretch gap-2 sm:items-end">
                            {!personal && offices.length > 1 && (
                                <ComboFilter
                                    commitOnType={false}
                                    value={office}
                                    onChange={setOffice}
                                    options={offices}
                                    placeholder={officeScoped ? 'All of your offices' : 'All departments and offices'}
                                    emptyLabel={officeScoped ? 'All of your offices' : 'All departments and offices'}
                                    className="w-full min-w-0 sm:w-72"
                                />
                            )}
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                <div className="flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Filter by schedule category">
                                    {CATEGORIES.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            aria-pressed={category === item.id}
                                            onClick={() => setCategory(item.id)}
                                            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                                                category === item.id
                                                    ? 'bg-white text-slate-900 shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                                    <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-900" aria-label="Previous month">
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <span className="min-w-36 px-2 text-center text-sm font-semibold text-slate-900">{monthLabel}</span>
                                    <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-900" aria-label="Next month">
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={goToToday} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white hover:text-slate-900">
                                        Today
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isExpanded && (
            <div id="schedule-calendar-body">
            {liveShifts.length > 0 && (
                <HappeningNowSlideshow shifts={liveShifts} personal={personal} clockLabel={clockLabel} />
            )}

            {showTodayPanel && (
                <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <CalendarDays className="h-3.5 w-3.5" />
                                Today, earliest first
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                                {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                        {!selectedIsToday && (
                            <button
                                type="button"
                                onClick={goToToday}
                                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                            >
                                Jump to today
                            </button>
                        )}
                    </div>
                    {todayAgenda.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-500">
                            {showWork && showClass
                                ? 'No work or class scheduled for today.'
                                : showWork
                                    ? 'No work scheduled for today.'
                                    : 'No classes scheduled for today.'}
                        </p>
                    ) : (
                        <ul className="mt-3 space-y-2">
                            {todayAgenda.map((shift) => (
                                <li key={`today-${shift.id}`}>
                                    <ScheduleCard shift={shift} personal active={isLive(shift)} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)] lg:items-stretch">
                <div className="border-b border-slate-100 p-4 sm:p-6 lg:border-b-0 lg:border-r">
                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {WEEKDAYS.map((day) => (
                            <div key={day} className="py-1">{day.slice(0, 3)}</div>
                        ))}
                    </div>
                    {isLoading ? (
                        <div className="mt-2 grid grid-cols-7 gap-1.5">
                            {Array.from({ length: 35 }, (_, index) => (
                                <div key={index} className="h-28 animate-pulse rounded-xl bg-slate-100" />
                            ))}
                        </div>
                    ) : (
                        <div className="mt-2 grid grid-cols-7 gap-1.5">
                            {cells.map((date, index) => {
                                if (!date) return <div key={`empty-${index}`} className="h-28 rounded-xl bg-slate-50/60" />;
                                const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
                                const inWindow = insideSemester(date, semester);
                                const dayShifts = (inWindow ? (byWeekday.get(weekday) ?? []) : [])
                                    .filter((shift) => !scheduleBlocked(date, shift, holidays));
                                const workCount = dayShifts.filter((shift) => !isClassShift(shift)).length;
                                const classCount = dayShifts.filter((shift) => isClassShift(shift)).length;
                                const holiday = showHoliday ? holidayOn(date, holidays) : null;
                                const classBreak = showBreak ? breakOn(date, holidays) : null;
                                const isToday = sameDay(date, today);
                                const isSelected = sameDay(date, selected);
                                const hasClass = classCount > 0;
                                const hasWorkOnly = workCount > 0 && !hasClass;
                                const liveCount = isToday ? dayShifts.filter(isLive).length : 0;
                                return (
                                    <button
                                        key={date.toISOString()}
                                        type="button"
                                        onClick={() => setSelected(date)}
                                        aria-pressed={isSelected}
                                        aria-current={isToday ? 'date' : undefined}
                                        aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, ${workCount} work, ${classCount} class${liveCount ? `, ${liveCount} happening now` : ''}${holiday ? `, holiday ${holiday.name}${holiday.portion === 'half' ? ' half day' : ''}` : ''}${classBreak ? `, class break ${classBreak.name}` : ''}`}
                                        className={`flex h-28 flex-col items-start rounded-xl px-1.5 py-1.5 text-left transition-colors sm:px-2 ${
                                            isSelected
                                                ? personal && hasClass
                                                    ? 'bg-violet-700 text-white ring-2 ring-violet-300'
                                                    : personal && hasWorkOnly
                                                        ? 'bg-blue-700 text-white ring-2 ring-blue-300'
                                                        : 'bg-slate-900 text-white'
                                                : !inWindow
                                                    ? 'text-slate-300 hover:bg-slate-50'
                                                    : personal && hasClass
                                                        ? isToday
                                                            ? 'bg-violet-50 text-slate-900 ring-2 ring-inset ring-violet-400'
                                                            : 'bg-violet-50/70 text-slate-900 ring-1 ring-inset ring-violet-200 hover:bg-violet-50'
                                                        : personal && hasWorkOnly
                                                            ? isToday
                                                                ? 'bg-blue-50 text-slate-900 ring-2 ring-inset ring-blue-400'
                                                                : 'bg-blue-50/70 text-slate-900 ring-1 ring-inset ring-blue-200 hover:bg-blue-50'
                                                            : isToday
                                                                ? 'bg-slate-100 text-slate-900 ring-1 ring-inset ring-slate-300'
                                                                : 'text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums ${
                                            isToday && !isSelected ? 'bg-slate-900 text-white' : ''
                                        }`}>{date.getDate()}</span>
                                        <span className="mt-auto flex w-full flex-col gap-0.5">
                                            {classBreak && (
                                                <span title={classBreak.name} className={`truncate rounded px-1 text-[10px] font-semibold leading-4 ${isSelected ? 'bg-teal-500/30 text-teal-100' : 'bg-teal-50 text-teal-800'}`}>
                                                    {classBreak.name}
                                                </span>
                                            )}
                                            {holiday && (
                                                <span title={holiday.name} className={`truncate rounded px-1 text-[10px] font-semibold leading-4 ${isSelected ? 'bg-amber-500/30 text-amber-100' : 'bg-amber-50 text-amber-800'}`}>
                                                    {holiday.portion === 'half' ? `${holiday.name} · Half` : holiday.name}
                                                </span>
                                            )}
                                            {liveCount > 0 && (
                                                <span className={`truncate rounded px-1 text-[10px] font-semibold leading-4 ${isSelected ? 'bg-emerald-500/30 text-emerald-100' : 'bg-emerald-50 text-emerald-800'}`}>
                                                    {liveCount} now
                                                </span>
                                            )}
                                            {workCount > 0 && (
                                                <span className={`truncate rounded px-1 text-[10px] font-semibold leading-4 ${isSelected ? 'bg-blue-500/30 text-blue-100' : 'bg-blue-50 text-blue-700'}`}>
                                                    {workCount} work
                                                </span>
                                            )}
                                            {classCount > 0 && (
                                                <span className={`truncate rounded px-1 text-[10px] font-semibold leading-4 ${isSelected ? 'bg-violet-500/30 text-violet-100' : 'bg-violet-50 text-violet-700'}`}>
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

                <div className="flex min-h-72 flex-col overflow-hidden bg-slate-50/40 lg:h-full lg:min-h-0">
                    <div className="shrink-0 border-b border-slate-100 bg-white px-6 py-4">
                        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            <span>
                                {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </span>
                            {selectedIsToday && (
                                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold normal-case tracking-wide text-white">
                                    Today
                                </span>
                            )}
                            {selectedIsToday && selectedAgenda.some(isLive) && (
                                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold normal-case tracking-wide text-white">
                                    {selectedAgenda.filter(isLive).length} now
                                </span>
                            )}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium">
                            {showWork && <span className="text-blue-700">{selectedWork.length} work</span>}
                            {showClass && <span className="text-violet-700">{selectedClass.length} class</span>}
                            {showHoliday && selectedHoliday && <span className="text-amber-700">{selectedHoliday.portion === 'half' ? 'Half-day holiday' : 'Holiday'}</span>}
                            {showBreak && selectedBreak && <span className="text-teal-700">Class break</span>}
                            {category === 'holiday' && !selectedHoliday && <span className="text-slate-500">No holiday</span>}
                            {category === 'break' && !selectedBreak && <span className="text-slate-500">No class break</span>}
                        </p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {showHoliday && selectedHoliday && (
                        <section className="border-b border-slate-100">
                            <div className="flex items-center gap-2 bg-amber-50/80 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-amber-800">
                                <Flag className="h-3.5 w-3.5" />
                                Holiday
                            </div>
                            <div className="px-6 py-3.5">
                                <p className="text-sm font-semibold text-slate-900">{selectedHoliday.name}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                    {holidayRangeLabel(selectedHoliday)}
                                    {selectedHoliday.portion === 'half' && selectedHoliday.starts_at && selectedHoliday.ends_at
                                        ? ` · ${selectedHoliday.starts_at}–${selectedHoliday.ends_at}`
                                        : selectedHoliday.portion === 'half'
                                            ? ' · Half day'
                                            : ''}
                                </p>
                                {hiddenShifts.length > 0 && (
                                    <p className="mt-2 text-xs text-slate-500">Work and class schedules during this holiday are hidden.</p>
                                )}
                            </div>
                        </section>
                    )}
                    {showBreak && selectedBreak && (
                        <section className="border-b border-slate-100">
                            <div className="flex items-center gap-2 bg-teal-50/80 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-teal-800">
                                <Flag className="h-3.5 w-3.5" />
                                Class break
                            </div>
                            <div className="px-6 py-3.5">
                                <p className="text-sm font-semibold text-slate-900">{selectedBreak.name}</p>
                                <p className="mt-1 text-xs text-slate-500">{holidayRangeLabel(selectedBreak)}</p>
                                {hiddenShifts.length > 0 && (
                                    <p className="mt-2 text-xs text-slate-500">Work and class schedules during this break are hidden.</p>
                                )}
                            </div>
                        </section>
                    )}
                    {category === 'holiday' ? (
                        selectedHoliday ? null : (
                            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                                <Flag className="mb-3 h-8 w-8 text-slate-300" />
                                <p className="text-sm font-medium text-slate-600">No holiday on this date.</p>
                            </div>
                        )
                    ) : category === 'break' ? (
                        selectedBreak ? null : (
                            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                                <Flag className="mb-3 h-8 w-8 text-slate-300" />
                                <p className="text-sm font-medium text-slate-600">No class break on this date.</p>
                            </div>
                        )
                    ) : !semester ? (
                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                            <CalendarDays className="mb-3 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-medium text-slate-600">Set the semester before the weekly loop appears on the calendar.</p>
                        </div>
                    ) : !selectedInSemester ? (
                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                            <CalendarDays className="mb-3 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-medium text-slate-600">This date is outside {semester.label}.</p>
                            <p className="mt-1 text-xs text-slate-500">Weekly schedules repeat from {formatSemesterDate(semester.starts_on)} through {formatSemesterDate(semester.ends_on)}.</p>
                        </div>
                    ) : selectedAgenda.length === 0 && hiddenShifts.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                            <CalendarDays className="mb-3 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-medium text-slate-600">
                                {category === 'work'
                                    ? `No work is scheduled on ${selectedName}s.`
                                    : category === 'class'
                                        ? `No classes are scheduled on ${selectedName}s.`
                                        : `Nothing is scheduled on ${selectedName}s.`}
                            </p>
                        </div>
                    ) : selectedAgenda.length === 0 ? null : (
                        <ol className="space-y-3 px-4 py-4 sm:px-5">
                            {selectedAgenda.map((shift) => {
                                const active = selectedIsToday && isLive(shift);
                                return (
                                    <li key={shift.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-2">
                                        <div className={`pt-3 text-right ${active ? 'text-emerald-700' : 'text-slate-600'}`}>
                                            <p className="text-xs font-semibold tabular-nums">{formatShiftStart(shift.time)}</p>
                                            <p className="text-[10px] tabular-nums text-slate-400">{formatShiftEnd(shift.time)}</p>
                                        </div>
                                        <ScheduleCard shift={shift} personal={personal} active={active} hideTime />
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                    </div>
                </div>
            </div>
            </div>
            )}
        </section>
    );
};

export default OrganizationScheduleCalendar;
