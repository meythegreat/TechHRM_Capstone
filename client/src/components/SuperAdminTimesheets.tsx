import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Calendar, Clock, Search, ShieldCheck, X, FileSpreadsheet } from 'lucide-react';
import AuditPager, { pageSlice } from './AuditPager';
import ComboFilter from './ComboFilter';
import SuperAdminForceClockOut from './SuperAdminForceClockOut';
import HolidayManager from './HolidayManager';
import Toast from './Toast';

interface AttendanceRecord {
    id: number;
    time_in: string;
    time_out: string | null;
    rendered_hours: number | string | null;
    status: string;
    work_type?: string | null;
    user?: {
        name?: string;
        deleted_at?: string | null;
        profile?: {
            assigned_office?: string | null;
            assignment_label?: string | null;
            student_id_number?: string | null;
        } | null;
    } | null;
    account_deleted?: boolean;
}

const formatWhen = (value: string | null) => {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
};

const statusBadge = (status?: string | null) => {
    const normalized = String(status || '').toLowerCase();
    const base =
        'inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider';
    if (normalized === 'accepted' || normalized === 'approved') {
        return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
    }
    if (normalized === 'rejected') {
        return `${base} border-rose-200 bg-rose-50 text-rose-700`;
    }
    if (normalized === 'pending') {
        return `${base} border-amber-200 bg-amber-50 text-amber-700`;
    }
    return `${base} border-slate-200 bg-slate-100 text-slate-600`;
};

const SuperAdminTimesheets = () => {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [offices, setOffices] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [date, setDate] = useState('');
    const [department, setDepartment] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [historyTick, setHistoryTick] = useState(0);

    useEffect(() => {
        axios
            .get('/api/offices')
            .then((response) => {
                const names = (Array.isArray(response.data) ? response.data : [])
                    .map((office: { name?: string }) => office.name)
                    .filter((name): name is string => Boolean(name));
                setOffices(names);
            })
            .catch(() => setOffices([]));
    }, []);

    useEffect(() => {
        setIsLoading(true);
        const params = date ? { date } : {};
        axios
            .get('/api/attendance', { params })
            .then((response) => setRecords(Array.isArray(response.data) ? response.data : []))
            .catch(() => setError('Could not load attendance records.'))
            .finally(() => setIsLoading(false));
    }, [date, historyTick]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return records.filter((record) => {
            const office =
                record.user?.profile?.assignment_label ||
                record.user?.profile?.assigned_office ||
                'Unassigned';
            if (department && office !== department) return false;
            if (!query) return true;
            const haystack = [
                record.user?.name,
                record.user?.profile?.student_id_number,
                office,
                record.status,
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(query);
        });
    }, [records, department, search]);

    useEffect(() => {
        setPage(1);
    }, [date, department, search]);

    const paged = pageSlice(filtered, page);
    const hasFilters = Boolean(date || department || search.trim());

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
            {/* OBSIDIAN AUDIT & FORCE CLOCK-OUT HERO */}
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
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                            Audit + Force Clock-Out
                        </span>
                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Recent Attendances
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            Audit campus-wide attendance records, close forgotten open sessions, and add holidays or class breaks.
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                            <FileSpreadsheet className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Matching Records
                            </p>
                            <p className="mt-0.5 font-mono text-2xl font-black tabular-nums text-white">
                                {filtered.length}
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            <Toast
                message={notice?.text ?? error}
                type={notice?.type ?? 'error'}
                onClose={() => {
                    setNotice(null);
                    setError(null);
                }}
            />

            <SuperAdminForceClockOut onClosed={() => setHistoryTick((tick) => tick + 1)} />

            <HolidayManager
                onToast={(message, type = 'success') => setNotice({ text: message, type })}
            />

            {/* FILTER DECK */}
            <section className="grid grid-cols-1 items-end gap-3 rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm md:grid-cols-3 lg:grid-cols-[1fr_1fr_1.2fr_auto]">
                <label className="block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Date
                    </span>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-blue-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-600/20">
                        <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
                        <input
                            type="date"
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                            className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none"
                        />
                    </div>
                </label>

                <label className="block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Department
                    </span>
                    <ComboFilter
                        commitOnType={false}
                        value={department}
                        onChange={setDepartment}
                        options={offices}
                        placeholder="All departments"
                        emptyLabel="All departments"
                    />
                </label>

                <label className="block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Search
                    </span>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-blue-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-600/20">
                        <Search className="h-4 w-4 shrink-0 text-slate-400" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search student, ID, or status…"
                            className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:font-medium placeholder:text-slate-400"
                        />
                    </div>
                </label>

                {hasFilters && (
                    <button
                        type="button"
                        onClick={() => {
                            setDate('');
                            setDepartment('');
                            setSearch('');
                        }}
                        className="inline-flex h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                    >
                        <X className="h-3.5 w-3.5" />
                        Clear
                    </button>
                )}
            </section>

            {/* MAIN AUDIT TABLE */}
            <section className="relative min-h-[340px] overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                {isLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 backdrop-blur-[2px]">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                            <span className="text-xs font-extrabold uppercase tracking-widest text-blue-700">
                                Loading records…
                            </span>
                        </div>
                    </div>
                )}

                <div className="custom-scrollbar overflow-x-auto">
                    <table className="app-data-table w-full border-collapse text-left">
                        <thead>
                            <tr className="bg-slate-950 text-white">
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Student
                                </th>
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Department
                                </th>
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Time In
                                </th>
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Time Out
                                </th>
                                <th className="px-6 py-4 text-right text-[11px] font-extrabold uppercase tracking-widest">
                                    Hours
                                </th>
                                <th className="px-6 py-4 text-right text-[11px] font-extrabold uppercase tracking-widest">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {!isLoading && paged.rows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-6 py-16 text-center text-slate-400"
                                    >
                                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                            <Clock className="h-6 w-6" />
                                        </div>
                                        <p className="text-sm font-extrabold text-slate-700">
                                            No attendance records match these filters
                                        </p>
                                        <p className="mt-1 text-xs font-medium text-slate-400">
                                            Adjust the date, department, or search query to view records.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                paged.rows.map((record) => (
                                    <tr
                                        key={record.id}
                                        className="transition-colors hover:bg-slate-50/80"
                                    >
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-extrabold text-slate-900">
                                                {record.user?.name || 'Unknown'}
                                            </p>
                                            <p className="mt-0.5 font-mono text-xs font-medium text-slate-500">
                                                {record.user?.profile?.student_id_number || 'No ID'}
                                            </p>
                                            {(record.account_deleted ||
                                                record.user?.deleted_at) && (
                                                <span className="mt-1 inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                    Account deleted
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-xs font-bold text-slate-700">
                                            {record.user?.profile?.assignment_label ||
                                                record.user?.profile?.assigned_office ||
                                                'Unassigned'}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 font-mono text-xs font-semibold text-slate-700">
                                            {formatWhen(record.time_in)}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 font-mono text-xs font-semibold text-slate-700">
                                            {record.time_out ? (
                                                formatWhen(record.time_out)
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-sans text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                                                    Still in
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-sm font-black text-slate-900">
                                            {record.rendered_hours ?? '—'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={statusBadge(record.status)}>
                                                {record.status || '—'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <AuditPager
                    page={paged.page}
                    totalPages={paged.totalPages}
                    total={paged.total}
                    onPage={setPage}
                />
            </section>
        </div>
    );
};

export default SuperAdminTimesheets;