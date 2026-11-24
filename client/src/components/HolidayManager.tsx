import { useCallback, useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import {
    Calendar,
    CalendarPlus,
    Clock,
    Coffee,
    Pencil,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import AuditPager, { pageSlice } from './AuditPager';
import FeatureSection from './FeatureSection';
import { HelpDisclosure } from './HelpDisclosure';

export interface Holiday {
    id: number;
    date: string;
    end_date?: string | null;
    name: string;
    kind?: 'holiday' | 'break' | string | null;
    portion?: 'full' | 'half' | string | null;
    starts_at?: string | null;
    ends_at?: string | null;
}

interface HolidayManagerProps {
    onChange?: (holidays: Holiday[]) => void;
    onToast?: (message: string, type?: 'success' | 'error') => void;
}

const todayKey = () => new Date().toISOString().split('T')[0];

const formatHolidayWhen = (holiday: Pick<Holiday, 'date' | 'end_date'>) => {
    const startLabel = new Date(`${holiday.date.slice(0, 10)}T00:00:00`).toLocaleDateString(
        'en-US',
        { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
    );
    const endKey = (holiday.end_date || holiday.date).slice(0, 10);
    if (endKey === holiday.date.slice(0, 10)) return startLabel;
    const endLabel = new Date(`${endKey}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
    const start = new Date(`${holiday.date.slice(0, 10)}T00:00:00`);
    const end = new Date(`${endKey}T00:00:00`);
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    return `${startLabel} – ${endLabel} · ${days} days`;
};

const HolidayManager = ({ onChange, onToast }: HolidayManagerProps) => {
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [holidayPage, setHolidayPage] = useState(1);
    const [holidayDate, setHolidayDate] = useState(todayKey);
    const [holidayEndDate, setHolidayEndDate] = useState(todayKey);
    const [holidaySpan, setHolidaySpan] = useState<'single' | 'multiple'>('single');
    const [holidayKind, setHolidayKind] = useState<'holiday' | 'break'>('holiday');
    const [holidayPortion, setHolidayPortion] = useState<'full' | 'half'>('full');
    const [holidayStartTime, setHolidayStartTime] = useState('13:00');
    const [holidayEndTime, setHolidayEndTime] = useState('17:00');
    const [holidayName, setHolidayName] = useState('');
    const [holidaySaving, setHolidaySaving] = useState(false);
    const [editingHolidayId, setEditingHolidayId] = useState<number | null>(null);

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        onToast?.(message, type);
    };

    const loadHolidays = useCallback(() => {
        return axios
            .get('/api/holidays')
            .then((response) => {
                const rows = Array.isArray(response.data) ? (response.data as Holiday[]) : [];
                setHolidays(rows);
                onChange?.(rows);
                return rows;
            })
            .catch((error) => {
                console.error('Failed to load holidays', error);
                return [] as Holiday[];
            });
    }, [onChange]);

    useEffect(() => {
        loadHolidays();
    }, [loadHolidays]);

    const holidayListing = pageSlice(holidays, holidayPage);
    useEffect(() => {
        if (holidayListing.page !== holidayPage) setHolidayPage(holidayListing.page);
    }, [holidayListing.page, holidayPage]);

    const beginHolidayEdit = (holiday: Holiday) => {
        const end = (holiday.end_date || holiday.date).slice(0, 10);
        setEditingHolidayId(holiday.id);
        setHolidayDate(holiday.date.slice(0, 10));
        setHolidayEndDate(end);
        setHolidaySpan(end === holiday.date.slice(0, 10) ? 'single' : 'multiple');
        setHolidayKind(holiday.kind === 'break' ? 'break' : 'holiday');
        setHolidayPortion(holiday.portion === 'half' ? 'half' : 'full');
        setHolidayStartTime((holiday.starts_at || '13:00').slice(0, 5));
        setHolidayEndTime((holiday.ends_at || '17:00').slice(0, 5));
        setHolidayName(holiday.name);
        document
            .getElementById('dtr-holiday-form')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const cancelHolidayEdit = () => {
        setEditingHolidayId(null);
        setHolidayName('');
        setHolidaySpan('single');
        setHolidayKind('holiday');
        setHolidayPortion('full');
    };

    const saveHoliday = async (event: FormEvent) => {
        event.preventDefault();
        const halfDay =
            holidayKind === 'holiday' && holidaySpan === 'single' && holidayPortion === 'half';
        const endDate = halfDay || holidaySpan === 'single' ? holidayDate : holidayEndDate;
        if (!holidayDate || !endDate || !holidayName.trim()) return;
        if (halfDay && holidayEndTime <= holidayStartTime) {
            notify('The half-day end time must be after the start time.', 'error');
            return;
        }
        if (endDate < holidayDate) {
            notify('The end date must be on or after the start date.', 'error');
            return;
        }
        setHolidaySaving(true);
        const wasEditing = editingHolidayId !== null;
        const payload = {
            date: holidayDate,
            end_date: endDate,
            name: holidayName.trim(),
            kind: holidayKind,
            portion: halfDay ? 'half' : 'full',
            starts_at: halfDay ? holidayStartTime : null,
            ends_at: halfDay ? holidayEndTime : null,
        };
        try {
            if (editingHolidayId) {
                await axios.put(`/api/holidays/${editingHolidayId}`, payload);
            } else {
                await axios.post('/api/holidays', payload);
            }
            setHolidayName('');
            setEditingHolidayId(null);
            setHolidaySpan('single');
            setHolidayKind('holiday');
            setHolidayPortion('full');
            const rows = await loadHolidays();
            const index = rows.findIndex(
                (item) => item.date.slice(0, 10) === holidayDate && item.name === holidayName.trim()
            );
            setHolidayPage(index >= 0 ? Math.floor(index / 10) + 1 : 1);
            notify(
                wasEditing
                    ? 'Saved. The DTR remark follows the new dates.'
                    : holidayKind === 'break'
                      ? 'Class break added. Work and class schedules are hidden on those days.'
                      : halfDay
                        ? 'Half-day holiday added. Work and class schedules that overlap that time are hidden.'
                        : 'Holiday added. Work and class schedules are hidden for that day.'
            );
        } catch (error: unknown) {
            const message = axios.isAxiosError(error)
                ? error.response?.data?.message ||
                  error.response?.data?.errors?.date?.[0] ||
                  error.response?.data?.errors?.end_date?.[0] ||
                  'Could not save that holiday.'
                : 'Could not save that holiday.';
            notify(String(message), 'error');
        } finally {
            setHolidaySaving(false);
        }
    };

    const removeHoliday = async (holiday: Holiday) => {
        try {
            await axios.delete(`/api/holidays/${holiday.id}`);
            setHolidays((current) => {
                const next = current.filter((item) => item.id !== holiday.id);
                onChange?.(next);
                return next;
            });
            if (editingHolidayId === holiday.id) cancelHolidayEdit();
            notify(`${holiday.name} removed.`);
        } catch (error) {
            console.error('Failed to remove holiday', error);
            notify('Could not remove that holiday.', 'error');
        }
    };

    const isHalfDay =
        holidayKind === 'holiday' && holidaySpan === 'single' && holidayPortion === 'half';

    return (
        <FeatureSection
            defaultOpen={false}
            title="Holidays & Class Breaks"
            icon={
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200/80">
                    <CalendarPlus className="h-4 w-4" />
                </span>
            }
        >
            {/* INTRO & HELP */}
            <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
                <p className="text-xs font-medium leading-relaxed text-slate-600">
                    A full-day holiday or class break hides classes for those dates. A half-day holiday hides only the classes that overlap its hours.
                </p>
                <HelpDisclosure
                    variant="inline"
                    title="How holidays affect schedules"
                    className="mt-2"
                    items={[
                        'Full-day holidays and class breaks hide work and class schedules on the selected dates.',
                        'Half-day holidays hide only the scheduled hours that overlap the configured time window.',
                    ]}
                />
            </div>

            {/* FORM DECK */}
            <form
                id="dtr-holiday-form"
                onSubmit={saveHoliday}
                className="space-y-4 border-b border-slate-100 bg-white px-6 py-5"
            >
                {editingHolidayId !== null && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 text-xs font-extrabold text-amber-900">
                            <Pencil className="h-3.5 w-3.5 text-amber-600" />
                            Editing entry #{editingHolidayId}
                        </span>
                        <button
                            type="button"
                            onClick={cancelHolidayEdit}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:underline"
                        >
                            <X className="h-3.5 w-3.5" />
                            Cancel edit
                        </button>
                    </div>
                )}

                {/* SEGMENTED CONTROLS */}
                <div className="flex flex-wrap gap-2.5">
                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                        {(
                            [
                                ['holiday', 'Holiday'],
                                ['break', 'Class break'],
                            ] as const
                        ).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => {
                                    setHolidayKind(value);
                                    if (value === 'break') setHolidayPortion('full');
                                }}
                                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                    holidayKind === value
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                        {(
                            [
                                ['single', 'Single date'],
                                ['multiple', 'Multiple dates'],
                            ] as const
                        ).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => {
                                    setHolidaySpan(value);
                                    if (value === 'multiple') {
                                        setHolidayPortion('full');
                                        if (holidayEndDate < holidayDate) {
                                            setHolidayEndDate(holidayDate);
                                        }
                                    }
                                }}
                                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                    holidaySpan === value
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {holidayKind === 'holiday' && holidaySpan === 'single' && (
                        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                            {(
                                [
                                    ['full', 'Full day'],
                                    ['half', 'Half day'],
                                ] as const
                            ).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setHolidayPortion(value)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                        holidayPortion === value
                                            ? 'bg-amber-600 text-white shadow-sm'
                                            : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* MAIN INPUT ROW */}
                <div
                    className={`grid grid-cols-1 items-end gap-3.5 ${
                        holidaySpan === 'multiple'
                            ? 'md:grid-cols-[170px_170px_1fr_auto]'
                            : 'md:grid-cols-[185px_1fr_auto]'
                    }`}
                >
                    <div>
                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            {holidaySpan === 'multiple' ? 'Start Date' : 'Date'}
                        </label>
                        <input
                            type="date"
                            value={holidayDate}
                            onChange={(event) => {
                                const next = event.target.value;
                                setHolidayDate(next);
                                if (holidayEndDate < next) setHolidayEndDate(next);
                            }}
                            required
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
                        />
                    </div>

                    {holidaySpan === 'multiple' && (
                        <div>
                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                End Date
                            </label>
                            <input
                                type="date"
                                value={holidayEndDate}
                                min={holidayDate}
                                onChange={(event) => setHolidayEndDate(event.target.value)}
                                required
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
                            />
                        </div>
                    )}

                    <div>
                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            {holidayKind === 'break' ? 'Break Name' : 'Holiday Name'}
                        </label>
                        <input
                            type="text"
                            value={holidayName}
                            onChange={(event) => setHolidayName(event.target.value)}
                            required
                            maxLength={120}
                            placeholder={
                                holidayKind === 'break' ? 'e.g. Wellness Break' : 'e.g. Family Day'
                            }
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        {editingHolidayId && (
                            <button
                                type="button"
                                onClick={cancelHolidayEdit}
                                className="h-[42px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={holidaySaving}
                            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-50"
                        >
                            <CalendarPlus className="h-3.5 w-3.5" />
                            {holidaySaving
                                ? 'Saving…'
                                : editingHolidayId
                                  ? 'Save Changes'
                                  : holidayKind === 'break'
                                    ? 'Add Class Break'
                                    : 'Add Holiday'}
                        </button>
                    </div>
                </div>

                {/* HALF-DAY TIME WINDOW */}
                {isHalfDay && (
                    <div className="grid grid-cols-1 gap-3.5 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 sm:grid-cols-2 sm:max-w-md">
                        <div>
                            <label className="mb-1.5 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-amber-800">
                                <Clock className="h-3 w-3" />
                                Starts
                            </label>
                            <input
                                type="time"
                                value={holidayStartTime}
                                onChange={(event) => setHolidayStartTime(event.target.value)}
                                required
                                className="w-full rounded-xl border border-amber-200 bg-white px-3.5 py-2 font-mono text-sm font-bold text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-amber-800">
                                <Clock className="h-3 w-3" />
                                Ends
                            </label>
                            <input
                                type="time"
                                value={holidayEndTime}
                                onChange={(event) => setHolidayEndTime(event.target.value)}
                                required
                                className="w-full rounded-xl border border-amber-200 bg-white px-3.5 py-2 font-mono text-sm font-bold text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                            />
                        </div>
                    </div>
                )}
            </form>

            {/* HOLIDAYS LIST */}
            <div className="bg-slate-50/40 px-6 py-5">
                {holidays.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
                        <Calendar className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
                        <p className="text-sm font-extrabold text-slate-700">
                            No holidays or class breaks yet
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            Add a holiday or class break above to automatically adjust campus schedules.
                        </p>
                    </div>
                ) : (
                    <ul className="space-y-2.5">
                        {holidayListing.rows.map((holiday) => {
                            const isBreak = holiday.kind === 'break';
                            const isHalf = !isBreak && holiday.portion === 'half';
                            const isEditing = editingHolidayId === holiday.id;
                            return (
                                <li
                                    key={holiday.id}
                                    className={`relative flex flex-col justify-between gap-3 overflow-hidden rounded-2xl border px-5 py-3.5 transition sm:flex-row sm:items-center ${
                                        isEditing
                                            ? 'border-amber-300 bg-amber-50/70 shadow-sm'
                                            : 'border-slate-200/90 bg-white shadow-2xs hover:border-slate-300'
                                    }`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${
                                            isBreak ? 'bg-indigo-500' : 'bg-amber-500'
                                        }`}
                                    />

                                    <div className="min-w-0 pl-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-extrabold text-slate-900">
                                                {holiday.name}
                                            </p>
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                    isBreak
                                                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                                        : isHalf
                                                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                                                          : 'border-slate-200 bg-slate-100 text-slate-600'
                                                }`}
                                            >
                                                {isBreak ? (
                                                    <>
                                                        <Coffee className="h-3 w-3" />
                                                        Class Break
                                                    </>
                                                ) : isHalf ? (
                                                    <>
                                                        <Clock className="h-3 w-3" />
                                                        Half Day
                                                        {holiday.starts_at && holiday.ends_at
                                                            ? ` ${holiday.starts_at.slice(0, 5)}–${holiday.ends_at.slice(0, 5)}`
                                                            : ''}
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles className="h-3 w-3" />
                                                        Full Day
                                                    </>
                                                )}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs font-medium text-slate-500">
                                            {formatHolidayWhen(holiday)}
                                        </p>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2 pl-2 sm:pl-0">
                                        <button
                                            type="button"
                                            onClick={() => beginHolidayEdit(holiday)}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-50"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeHoliday(holiday)}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            Remove
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                <AuditPager
                    page={holidayListing.page}
                    totalPages={holidayListing.totalPages}
                    total={holidayListing.total}
                    onPage={setHolidayPage}
                />
            </div>
        </FeatureSection>
    );
};

export default HolidayManager;