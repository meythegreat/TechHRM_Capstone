import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
    Clock,
    ShieldCheck,
    User,
    AlertCircle,
    QrCode,
    KeyRound,
    Activity,
} from 'lucide-react';
import AuditPager, { pageSlice } from './AuditPager';

interface LoginRecord {
    id: number;
    time_in: string;
    time_out: string | null;
    check_in_method?: string | null;
    work_type?: string | null;
    user?: {
        name?: string;
        profile?: {
            assigned_office?: string | null;
            assignment_label?: string | null;
            student_id_number?: string | null;
        } | null;
    } | null;
}

const formatWhen = (value: string | null) => {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
};

const MethodBadge = ({
    method,
    workType,
}: {
    method?: string | null;
    workType?: string | null;
}) => {
    const raw = (method || '').toLowerCase();
    if (raw === 'qr') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                <QrCode className="h-3 w-3" />
                QR Code
            </span>
        );
    }
    if (raw === 'passcode') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                <KeyRound className="h-3 w-3" />
                Passcode
            </span>
        );
    }
    return (
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
            {method || workType || '—'}
        </span>
    );
};

const SuperAdminAttendanceAudit = () => {
    const [records, setRecords] = useState<LoginRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [error, setError] = useState('');

    useEffect(() => {
        axios
            .get('/api/attendance')
            .then((response) => setRecords(Array.isArray(response.data) ? response.data : []))
            .catch(() => setError('Could not load attendance logins.'))
            .finally(() => setIsLoading(false));
    }, []);

    const paged = pageSlice(records, page);
    const activeCount = records.filter((r) => !r.time_out).length;

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
            {/* OBSIDIAN AUDIT LOG HERO */}
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
                    className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl"
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-300">
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                                Audit Log
                            </span>
                            {activeCount > 0 && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-200">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                                    {activeCount} still clocked in
                                </span>
                            )}
                        </div>

                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Attendance Hub
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            Audit live and historical student duty logins across all offices.
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
                            <Activity className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Recorded Logins
                            </p>
                            <p className="mt-0.5 font-mono text-2xl font-black tabular-nums text-white">
                                {records.length}
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            {error && (
                <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-sm font-bold text-rose-800 shadow-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                </div>
            )}

            {/* AUDIT TABLE CARD */}
            <section className="relative min-h-[300px] overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                {isLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 backdrop-blur-[2px]">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
                            <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-700">
                                Loading logins…
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
                                    Office
                                </th>
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Logged In
                                </th>
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Logged Out
                                </th>
                                <th className="px-6 py-4 text-right text-[11px] font-extrabold uppercase tracking-widest">
                                    Method
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {!isLoading && paged.rows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-6 py-16 text-center text-slate-400"
                                    >
                                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                            <User className="h-6 w-6" />
                                        </div>
                                        <p className="text-sm font-extrabold text-slate-700">
                                            No student logins recorded yet
                                        </p>
                                        <p className="mt-1 text-xs font-medium text-slate-400">
                                            Attendance clock-ins will appear here once students start their shifts.
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
                                        </td>
                                        <td className="px-6 py-4 text-xs font-bold text-slate-700">
                                            {record.user?.profile?.assignment_label ||
                                                record.user?.profile?.assigned_office ||
                                                'Unassigned'}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 font-mono text-xs font-semibold text-slate-700">
                                            <span className="inline-flex items-center gap-1.5">
                                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                {formatWhen(record.time_in)}
                                            </span>
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
                                        <td className="px-6 py-4 text-right">
                                            <MethodBadge
                                                method={record.check_in_method}
                                                workType={record.work_type}
                                            />
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

export default SuperAdminAttendanceAudit;