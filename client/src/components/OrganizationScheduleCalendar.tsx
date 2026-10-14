import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, GraduationCap, Briefcase, Flag } from 'lucide-react';
import { REALTIME_EVENT } from '../utils/realtime';
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
    student_name: string;
    profile_picture?: string | null;
}

interface HolidaySpan {
    id: number;
    date: string;
    end_date?: string | null;
    name: string;
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

function holidayOn(date: Date, holidays: HolidaySpan[]) {
    const key = dateKey(date);
    return holidays.find((holiday) => {
        const start = holiday.date.slice(0, 10);
        const end = (holiday.end_date || holiday.date).slice(0, 10);
        return key >= start && key <= end;
    }) ?? null;
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

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function startMinutes(time: string) {
    const match = String(time || '').match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!match) return 24 * 60;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = match[3]?.toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return hour * 60 + minute;
}

function sameDay(left: Date, right: Date) {
    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}

function monthCells(cursor: Date) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let index = 0; index < lead; index += 1) cells.push(null);
    for (let day = 1; day <= count; day += 1) cells.push(new Date(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

function scheduleTitle(shift: OrgSchedule) {
    if (shift.kind === 'class') return shift.subject || 'Class';
    return shift.duty_type || 'Work';
}

function isClassShift(shift: OrgSchedule) {
    return shift.kind === 'class';
}

function ScheduleGroup({ title, shifts, tone }: { title: string; shifts: OrgSchedule[]; tone: 'work' | 'class' }) {
    const isClass = tone === 'class';
    return (
        <section className="border-b border-slate-100 last:border-b-0">
            <div className={`flex items-center gap-2 px-6 py-3 text-xs font-semibold uppercase tracking-wide ${isClass ? 'bg-violet-50/70 text-violet-700' : 'bg-blue-50/70 text-blue-700'}`}>
                {isClass ? <GraduationCap className="h-3.5 w-3.5" /> : <Briefcase className="h-3.5 w-3.5" />}
                {title}
                <span className="ml-auto tabular-nums">{shifts.length}</span>
            </div>
            {shifts.length === 0 ? (
                <p className="px-6 py-4 text-sm text-slate-500">No {title.toLowerCase()} schedules.</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {shifts.map((shift) => (
                        <li key={shift.id} className="flex items-start gap-3 px-6 py-3.5">
                            <UserAvatar name={shift.student_name} picture={shift.profile_picture} className="h-9 w-9 rounded-full bg-slate-100 text-xs text-slate-600" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900">{shift.student_name}</p>
                                <p className="mt-0.5 truncate text-sm text-slate-700">{scheduleTitle(shift)}</p>
                                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                    <Clock className="h-3.5 w-3.5" />
                                    {shift.time}
                                    {shift.department ? ` · ${shift.department}` : ''}
                                    {shift.room ? ` · ${shift.room}` : ''}
                                    {shift.instructor ? ` · ${shift.instructor}` : ''}
                                </p>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

const OrganizationScheduleCalendar = () => {
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
    const [category, setCategory] = useState<'all' | 'work' | 'class' | 'holiday'>('all');

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const [scheduleResult, holidayResult] = await Promise.allSettled([
                    axios.get('/api/organization-schedules'),
                    axios.get('/api/holidays'),
                ]);
                if (!active) return;
                if (scheduleResult.status === 'fulfilled') {
                    const response = scheduleResult.value;
                    setSchedules(Array.isArray(response.data?.schedules) ? response.data.schedules : []);
                    setPlaces(Array.isArray(response.data?.offices) ? response.data.offices.filter((name: unknown) => typeof name === 'string' && name.trim() !== '') : []);
                    const nextSemester = response.data?.semester;
                    setSemester(nextSemester?.starts_on && nextSemester?.ends_on ? nextSemester : null);
                } else {
                    console.error('Failed to load organization schedules', scheduleResult.reason);
                    setSchedules([]);
                }
                if (holidayResult.status === 'fulfilled') {
                    setHolidays(Array.isArray(holidayResult.value.data) ? holidayResult.value.data : []);
                } else {
                    console.error('Failed to load holidays', holidayResult.reason);
                    setHolidays([]);
                }
            } catch (error) {
                console.error('Failed to load organization calendar', error);
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
        window.addEventListener(REALTIME_EVENT, load);
        return () => {
            active = false;
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, load);
        };
    }, []);

    const offices = useMemo(() => {
        const fromSchedules = schedules
            .map((shift) => (shift.department || '').trim())
            .filter((name) => name !== '');
        return [...new Set([...places, ...fromSchedules])].sort((left, right) => left.localeCompare(right));
    }, [places, schedules]);

    const officeSchedules = useMemo(() => {
        if (!office) return schedules;
        return schedules.filter((shift) => (shift.department || '').trim() === office);
    }, [schedules, office]);

    const showWork = category === 'all' || category === 'work';
    const showClass = category === 'all' || category === 'class';
    const showHoliday = category === 'all' || category === 'holiday';

    const visible = useMemo(() => {
        if (category === 'work') return officeSchedules.filter((shift) => !isClassShift(shift));
        if (category === 'class') return officeSchedules.filter((shift) => isClassShift(shift));
        if (category === 'holiday') return [];
        return officeSchedules;
    }, [officeSchedules, category]);

    const byWeekday = useMemo(() => {
        const grouped = new Map<string, OrgSchedule[]>();
        WEEKDAYS.forEach((day) => grouped.set(day, []));
        visible.forEach((shift) => {
            const bucket = grouped.get(shift.day);
            if (bucket) bucket.push(shift);
        });
        grouped.forEach((bucket) => bucket.sort((left, right) => startMinutes(left.time) - startMinutes(right.time) || left.student_name.localeCompare(right.student_name)));
        return grouped;
    }, [visible]);

    const cells = monthCells(cursor);
    const today = new Date();
    const selectedName = selected.toLocaleDateString('en-US', { weekday: 'long' });
    const selectedInSemester = insideSemester(selected, semester);
    const selectedShifts = selectedInSemester ? (byWeekday.get(selectedName) ?? []) : [];
    const selectedWork = selectedShifts.filter((shift) => !isClassShift(shift));
    const selectedClass = selectedShifts.filter((shift) => isClassShift(shift));
    const selectedHoliday = holidayOn(selected, holidays);
    const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const shiftMonth = (delta: number) => {
        setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
    };

    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                        <CalendarDays className="h-5 w-5 text-blue-600" />
                        Organization schedule
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                        {semester
                            ? `${semester.label} runs ${formatSemesterDate(semester.starts_on)} through ${formatSemesterDate(semester.ends_on)}. Schedules repeat each week inside that window.`
                            : 'Schedules repeat each week after WSPO staff or a super admin sets the semester length.'}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-xs font-semibold">
                        <span className="inline-flex items-center gap-1.5 text-blue-700">
                            <Briefcase className="h-3.5 w-3.5" /> Work
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-violet-700">
                            <GraduationCap className="h-3.5 w-3.5" /> Class
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-amber-700">
                            <Flag className="h-3.5 w-3.5" /> Holiday
                        </span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <ComboFilter
                        commitOnType={false}
                        value={office}
                        onChange={setOffice}
                        options={offices}
                        placeholder="All departments and offices"
                        emptyLabel="All departments and offices"
                        className="w-full min-w-0 sm:w-72"
                    />
                    <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value as 'all' | 'work' | 'class' | 'holiday')}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
                        aria-label="Filter by schedule category"
                    >
                        <option value="all">All categories</option>
                        <option value="work">Work</option>
                        <option value="class">Class</option>
                        <option value="holiday">Holiday</option>
                    </select>
                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                        <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-900" aria-label="Previous month">
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="min-w-36 px-2 text-center text-sm font-semibold text-slate-900">{monthLabel}</span>
                        <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-900" aria-label="Next month">
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
                <div className="border-b border-slate-100 p-4 sm:p-6 lg:border-b-0 lg:border-r">
                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {WEEKDAYS.map((day) => (
                            <div key={day} className="py-1">{day.slice(0, 3)}</div>
                        ))}
                    </div>
                    {isLoading ? (
                        <div className="mt-2 grid grid-cols-7 gap-1">
                            {Array.from({ length: 35 }, (_, index) => (
                                <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                            ))}
                        </div>
                    ) : (
                        <div className="mt-2 grid grid-cols-7 gap-1">
                            {cells.map((date, index) => {
                                if (!date) return <div key={`empty-${index}`} className="h-24 rounded-xl bg-slate-50/60" />;
                                const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
                                const inWindow = insideSemester(date, semester);
                                const dayShifts = inWindow ? (byWeekday.get(weekday) ?? []) : [];
                                const workCount = dayShifts.filter((shift) => !isClassShift(shift)).length;
                                const classCount = dayShifts.filter((shift) => isClassShift(shift)).length;
                                const holiday = showHoliday ? holidayOn(date, holidays) : null;
                                const isToday = sameDay(date, today);
                                const isSelected = sameDay(date, selected);
                                return (
                                    <button
                                        key={date.toISOString()}
                                        type="button"
                                        onClick={() => setSelected(date)}
                                        aria-pressed={isSelected}
                                        aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, ${workCount} work, ${classCount} class${holiday ? `, holiday ${holiday.name}` : ''}`}
                                        className={`flex h-24 flex-col items-start rounded-xl px-1.5 py-1.5 text-left transition-colors sm:px-2 ${
                                            isSelected
                                                ? 'bg-slate-900 text-white'
                                                : !inWindow
                                                    ? 'text-slate-300 hover:bg-slate-50'
                                                    : isToday
                                                        ? 'bg-slate-100 text-slate-900 ring-1 ring-inset ring-slate-300'
                                                        : 'text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="text-sm font-semibold tabular-nums">{date.getDate()}</span>
                                        <span className="mt-auto flex w-full flex-col gap-0.5">
                                            {holiday && (
                                                <span title={holiday.name} className={`truncate rounded px-1 text-[10px] font-semibold leading-4 ${isSelected ? 'bg-amber-500/30 text-amber-100' : 'bg-amber-50 text-amber-800'}`}>
                                                    {holiday.name}
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

                <div className="flex min-h-72 flex-col">
                    <div className="border-b border-slate-100 px-6 py-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium">
                            {showWork && <span className="text-blue-700">{selectedWork.length} work</span>}
                            {showClass && <span className="text-violet-700">{selectedClass.length} class</span>}
                            {showHoliday && selectedHoliday && <span className="text-amber-700">Holiday</span>}
                            {category === 'holiday' && !selectedHoliday && <span className="text-slate-500">No holiday</span>}
                        </p>
                    </div>
                    <div className="max-h-[28rem] overflow-y-auto">
                    {showHoliday && selectedHoliday && (
                        <section className="border-b border-slate-100">
                            <div className="flex items-center gap-2 bg-amber-50/80 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-amber-800">
                                <Flag className="h-3.5 w-3.5" />
                                Holiday
                            </div>
                            <div className="px-6 py-3.5">
                                <p className="text-sm font-semibold text-slate-900">{selectedHoliday.name}</p>
                                <p className="mt-1 text-xs text-slate-500">{holidayRangeLabel(selectedHoliday)}</p>
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
                    ) : selectedShifts.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                            <CalendarDays className="mb-3 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-medium text-slate-600">Nothing is scheduled on {selectedName}s.</p>
                        </div>
                    ) : (
                        <div>
                            {showWork && <ScheduleGroup title="Work" shifts={selectedWork} tone="work" />}
                            {showClass && <ScheduleGroup title="Class" shifts={selectedClass} tone="class" />}
                        </div>
                    )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default OrganizationScheduleCalendar;
