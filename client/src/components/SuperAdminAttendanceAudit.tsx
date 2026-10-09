import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Clock, ShieldCheck, User } from 'lucide-react';
import AuditPager, { pageSlice } from './AuditPager';

interface LoginRecord {
    id: number;
    time_in: string;
    time_out: string | null;
    check_in_method?: string | null;
    work_type?: string | null;
    user?: {
        name?: string;
        profile?: { assigned_office?: string | null; student_id_number?: string | null } | null;
    } | null;
}

const formatWhen = (value: string | null) => {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const SuperAdminAttendanceAudit = () => {
    const [records, setRecords] = useState<LoginRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [error, setError] = useState('');

    useEffect(() => {
        axios.get('/api/attendance')
            .then((response) => setRecords(Array.isArray(response.data) ? response.data : []))
            .catch(() => setError('Could not load attendance logins.'))
            .finally(() => setIsLoading(false));
    }, []);

    const paged = pageSlice(records, page);

    return (
        <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl">
                <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Audit log</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Attendance Hub</h1>
                <p className="mt-2 text-slate-400 font-medium max-w-xl">
                    Students who logged in for duty. Passcode and QR generation are not available on this account.
                </p>
            </motion.div>

            {error && <p className="text-sm font-bold text-red-600">{error}</p>}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative min-h-[280px]">
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
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Office</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Logged in</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Logged out</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Method</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {!isLoading && paged.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-slate-500">
                                        <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                        No student logins recorded yet.
                                    </td>
                                </tr>
                            ) : paged.rows.map((record) => (
                                <tr key={record.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-900">{record.user?.name || 'Unknown'}</p>
                                        <p className="text-xs text-slate-500">{record.user?.profile?.student_id_number || 'No ID'}</p>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-semibold text-slate-700">{record.user?.profile?.assigned_office || 'Unassigned'}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-slate-700">
                                        <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" />{formatWhen(record.time_in)}</span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium text-slate-700">{record.time_out ? formatWhen(record.time_out) : 'Still in'}</td>
                                    <td className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-600">{record.check_in_method || record.work_type || '—'}</td>
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

export default SuperAdminAttendanceAudit;
