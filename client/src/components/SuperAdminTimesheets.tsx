import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Calendar, Clock, Search, ShieldCheck } from 'lucide-react';
import AuditPager, { pageSlice } from './AuditPager';
import ComboFilter from './ComboFilter';
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
        profile?: { assigned_office?: string | null; student_id_number?: string | null } | null;
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
    });
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

    useEffect(() => {
        axios.get('/api/offices')
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
        axios.get('/api/attendance', { params })
            .then((response) => setRecords(Array.isArray(response.data) ? response.data : []))
            .catch(() => setError('Could not load attendance records.'))
            .finally(() => setIsLoading(false));
    }, [date]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return records.filter((record) => {
            const office = record.user?.profile?.assigned_office || 'Unassigned';
            if (department && office !== department) return false;
            if (!query) return true;
            const haystack = [record.user?.name, record.user?.profile?.student_id_number, office, record.status]
                .join(' ')
                .toLowerCase();
            return haystack.includes(query);
        });
    }, [records, department, search]);

    useEffect(() => {
        setPage(1);
    }, [date, department, search]);

    const paged = pageSlice(filtered, page);

    return (
        <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl"
            >
                <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Read only</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Recent Attendances</h1>
                <p className="mt-2 text-slate-400 font-medium max-w-xl">
                    Attendance records from every office. Filters and search are for audit review only.
                </p>
            </motion.div>

            <Toast message={error} type="error" onClose={() => setError(null)} />

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                        type="date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none"
                    />
                </label>
                <ComboFilter
                    commitOnType={false}
                    value={department}
                    onChange={setDepartment}
                    options={offices}
                    placeholder="All departments"
                    emptyLabel="All departments"
                />
                <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search student, ID, or status"
                        className="w-full bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
                    />
                </label>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative min-h-[320px]">
                {isLoading && (
                    <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center">
                        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Student</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Department</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Time in</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Time out</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Hours</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {!isLoading && paged.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-slate-500 font-medium">
                                        <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                        No attendance records match these filters.
                                    </td>
                                </tr>
                            ) : paged.rows.map((record) => (
                                <tr key={record.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-900">{record.user?.name || 'Unknown'}</p>
                                        <p className="text-xs text-slate-500">{record.user?.profile?.student_id_number || 'No ID'}</p>
                                        {(record.account_deleted || record.user?.deleted_at) && (
                                            <span className="mt-1 inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                                Account deleted
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-semibold text-slate-700">{record.user?.profile?.assigned_office || 'Unassigned'}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-slate-700">{formatWhen(record.time_in)}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-slate-700">{record.time_out ? formatWhen(record.time_out) : 'Still in'}</td>
                                    <td className="px-6 py-4 text-sm font-black text-slate-900">{record.rendered_hours ?? '—'}</td>
                                    <td className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-600">{record.status || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <AuditPager page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={setPage} />
            </div>
        </div>
    );
};

export default SuperAdminTimesheets;
