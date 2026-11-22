import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import UserAvatar from './UserAvatar';
import { REALTIME_EVENT } from '../utils/realtime';
import { bindPopup } from '../utils/popupDismiss';
import {
    ShieldAlert,
    Terminal,
    Globe,
    Clock,
    ChevronLeft,
    ChevronRight,
    Search,
    ListTree,
    X,
    FileText,
    Filter,
    User,
    Radio,
} from 'lucide-react';
import SecureFileViewerModal from './SecureFileViewerModal';

interface BreakdownStep {
    title: string;
    detail: string;
}

interface BreakdownDocument {
    name: string;
    path: string;
}

interface LogRecord {
    id: number;
    admin_id: number;
    admin_name: string;
    account_deleted?: boolean;
    admin?: {
        name?: string;
        profile_picture?: string | null;
    } | null;
    action: string;
    description: string;
    ip_address: string;
    created_at: string;
    breakdown?: {
        steps: BreakdownStep[];
        documents: BreakdownDocument[];
    };
}

const ACTION_CATEGORIES = [
    { id: 'all', label: 'All Actions' },
    { id: 'session', label: 'Authentication' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'documents', label: 'Documents' },
    { id: 'schedules', label: 'Schedules' },
    { id: 'accounts', label: 'Accounts' },
] as const;

type ActionCategory = (typeof ACTION_CATEGORIES)[number]['id'];

const ActivityLogs = () => {
    const [logs, setLogs] = useState<LogRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<LogRecord | null>(null);
    const [documentViewer, setDocumentViewer] = useState<{ path: string; title: string } | null>(
        null
    );
    const [category, setCategory] = useState<ActionCategory>('all');
    const [nameInput, setNameInput] = useState('');
    const [name, setName] = useState('');
    const [people, setPeople] = useState<string[]>([]);
    const appliedName = useRef('');

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        axios
            .get<string[]>('/api/logs/people')
            .then((response) => setPeople(response.data))
            .catch(() => setPeople([]));
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const next = nameInput.trim();
            if (appliedName.current === next) return;
            appliedName.current = next;
            setName(next);
            setCurrentPage(1);
        }, 300);

        return () => window.clearTimeout(timer);
    }, [nameInput]);

    useEffect(() => {
        fetchLogs(currentPage, category, name);
        const refresh = () => fetchLogs(currentPage, category, name, true);
        const interval = setInterval(refresh, 5000);
        window.addEventListener(REALTIME_EVENT, refresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, refresh);
        };
    }, [currentPage, category, name]);

    const openBreakdown = (log: LogRecord) => {
        setSelectedLog(log);
    };

    const selectCategory = (next: ActionCategory) => {
        setSelectedLog(null);
        setCategory(next);
        setCurrentPage(1);
    };

    const fetchLogs = async (
        page: number,
        selectedCategory: ActionCategory,
        selectedName: string,
        silent = false
    ) => {
        if (!silent) setIsLoading(true);
        try {
            const response = await axios.get('/api/logs', {
                params: {
                    page,
                    category: selectedCategory === 'all' ? undefined : selectedCategory,
                    name: selectedName || undefined,
                },
            });
            setLogs(response.data.data);
            setCurrentPage(response.data.current_page);
            setTotalPages(response.data.last_page);
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const getActionBadge = (action: string) => {
        const act = action.toLowerCase();
        const baseStyle =
            'inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap';

        if (act.includes('login') || act.includes('logout')) {
            return `${baseStyle} border-purple-200 bg-purple-50 text-purple-700`;
        }
        if (
            act.includes('create') ||
            act.includes('add') ||
            act.includes('assign') ||
            act.includes('issue')
        ) {
            return `${baseStyle} border-emerald-200 bg-emerald-50 text-emerald-700`;
        }
        if (
            act.includes('update') ||
            act.includes('edit') ||
            act.includes('approve') ||
            act.includes('resolve')
        ) {
            return `${baseStyle} border-blue-200 bg-blue-50 text-blue-700`;
        }
        if (act.includes('delete') || act.includes('remove') || act.includes('reject')) {
            return `${baseStyle} border-rose-200 bg-rose-50 text-rose-700`;
        }

        return `${baseStyle} border-slate-200 bg-slate-100 text-slate-600`;
    };

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.04 } },
    };

    const rowVariants: Variants = {
        hidden: { opacity: 0, x: -8 },
        show: { opacity: 1, x: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
    };

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
            {/* OBSIDIAN AUDIT COMMAND HERO */}
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
                    className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-indigo-600/25 blur-3xl"
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/25 bg-indigo-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-indigo-300">
                            <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                            System Security
                        </span>
                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            System Audit Trail
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            Real-time immutable monitoring of all administrative and system-level activities across WoSPIS.
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
                            <Radio className="h-5 w-5 animate-pulse" />
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Tracking Status
                            </p>
                            <p className="mt-0.5 text-sm font-black text-emerald-300">
                                Active Monitoring
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            {/* UNIFIED CONTROL CONSOLE */}
            <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="flex flex-col gap-4 rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm"
            >
                <div className="relative w-full md:max-w-md">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="search"
                        value={nameInput}
                        onChange={(event) => setNameInput(event.target.value)}
                        list="audit-user-names"
                        placeholder="Search logs by administrator name…"
                        aria-label="Filter trails by name"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-11 text-base font-bold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
                    />
                    {nameInput && (
                        <button
                            type="button"
                            onClick={() => setNameInput('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                            aria-label="Clear name filter"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                    <datalist id="audit-user-names">
                        {people.map((person) => (
                            <option key={person} value={person} />
                        ))}
                    </datalist>
                </div>

                {/* Category Filter Pills */}
                <div className="custom-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
                    <div className="mr-1 flex shrink-0 items-center gap-1.5">
                        <Filter className="h-3.5 w-3.5 text-slate-400" />
                        <span className="hidden text-[10px] font-extrabold uppercase tracking-widest text-slate-400 sm:block">
                            Filters:
                        </span>
                    </div>
                    {ACTION_CATEGORIES.map((item) => {
                        const active = category === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => selectCategory(item.id)}
                                className={`shrink-0 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
                                    active
                                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700'
                                }`}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            </motion.section>

            {/* MAIN AUDIT TABLE */}
            <section className="relative min-h-[400px] overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                {isLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-9 w-9 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                            <span className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
                                Scanning records…
                            </span>
                        </div>
                    </div>
                )}

                <div className="custom-scrollbar overflow-x-auto">
                    <table className="app-data-table w-full min-w-[800px] border-collapse text-left">
                        <thead>
                            <tr className="bg-slate-950 text-white">
                                <th className="w-28 px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Log ID
                                </th>
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Administrator
                                </th>
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Action Type
                                </th>
                                <th className="w-1/3 px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Description
                                </th>
                                <th className="px-6 py-4 text-right text-[11px] font-extrabold uppercase tracking-widest">
                                    Technical Details
                                </th>
                            </tr>
                        </thead>

                        <motion.tbody
                            variants={containerVariants}
                            initial="hidden"
                            animate={!isLoading ? 'show' : 'hidden'}
                            className="divide-y divide-slate-100"
                        >
                            {!isLoading && logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-slate-400">
                                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                            <ShieldAlert className="h-7 w-7" />
                                        </div>
                                        <p className="text-sm font-extrabold text-slate-700">
                                            No activity logs found
                                        </p>
                                        <p className="mt-1 text-xs font-medium text-slate-400">
                                            {name
                                                ? `No security trails match the name “${name}”.`
                                                : category === 'all'
                                                  ? 'System activity will appear here.'
                                                  : 'Nothing recorded in this specific category yet.'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <motion.tr
                                        variants={rowVariants}
                                        key={log.id}
                                        className="group transition-colors hover:bg-slate-50/80"
                                    >
                                        <td className="px-6 py-5 align-top">
                                            <span className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-600">
                                                #{String(log.id).padStart(5, '0')}
                                            </span>
                                        </td>

                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-3">
                                                <UserAvatar
                                                    name={log.admin?.name || log.admin_name}
                                                    picture={log.admin?.profile_picture}
                                                    className="h-10 w-10 shrink-0 rounded-full border border-indigo-100 bg-indigo-50 text-sm text-indigo-700"
                                                />
                                                <div>
                                                    <span className="block text-sm font-extrabold text-slate-900 transition-colors group-hover:text-indigo-700">
                                                        {log.admin_name}
                                                    </span>
                                                    {log.account_deleted && (
                                                        <span className="mt-1 inline-flex rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                                                            Account deleted
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-6 py-5 align-top">
                                            <span className={getActionBadge(log.action)}>
                                                {log.action}
                                            </span>
                                        </td>

                                        <td className="px-6 py-5 align-top">
                                            <p className="text-xs font-medium leading-relaxed text-slate-600 sm:text-sm">
                                                {log.description}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => openBreakdown(log)}
                                                className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100"
                                            >
                                                <ListTree className="h-3.5 w-3.5" />
                                                View Breakdown
                                            </button>
                                        </td>

                                        <td className="px-6 py-5 text-right align-top">
                                            <div className="flex flex-col items-end gap-2">
                                                <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-600">
                                                    <Globe className="h-3 w-3 text-slate-400" />
                                                    {log.ip_address}
                                                </div>
                                                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    {new Date(log.created_at).toLocaleString('en-US', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric',
                                                        hour: 'numeric',
                                                        minute: '2-digit',
                                                        hour12: true,
                                                    })}
                                                </div>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </motion.tbody>
                    </table>
                </div>

                {/* PAGINATION FOOTER */}
                {!isLoading && logs.length > 0 && (
                    <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row">
                        <span className="text-xs font-semibold text-slate-500">
                            Showing page{' '}
                            <span className="font-extrabold text-slate-900">{currentPage}</span> of{' '}
                            <span className="font-extrabold text-slate-900">{totalPages}</span>
                        </span>
                        <div className="flex w-full gap-2 sm:w-auto">
                            <button
                                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                            >
                                <ChevronLeft className="h-4 w-4" /> Prev
                            </button>
                            <button
                                onClick={() =>
                                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                                }
                                disabled={currentPage === totalPages}
                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                            >
                                Next <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* OBSIDIAN BREAKDOWN MODAL */}
            {typeof document !== 'undefined' &&
                createPortal(
                    <AnimatePresence>
                        {selectedLog && (
                            <motion.div
                                key="audit-breakdown"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                                {...bindPopup(() => setSelectedLog(null))}
                            >
                                <motion.div
                                    initial={{ scale: 0.96, opacity: 0, y: 16 }}
                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                    exit={{ scale: 0.96, opacity: 0, y: 16 }}
                                    role="dialog"
                                    aria-modal="true"
                                    aria-labelledby="trail-breakdown-title"
                                    className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    {/* Modal Header */}
                                    <div className="relative flex shrink-0 items-start justify-between gap-4 overflow-hidden bg-slate-950 px-6 py-5 text-white sm:px-7">
                                        <div
                                            className="pointer-events-none absolute inset-0 opacity-20"
                                            style={{
                                                backgroundImage:
                                                    'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                                                backgroundSize: '18px 18px',
                                            }}
                                            aria-hidden="true"
                                        />
                                        <div className="relative z-10">
                                            <p className="mb-1 font-mono text-[10px] font-extrabold uppercase tracking-widest text-indigo-300">
                                                Log Entry #{String(selectedLog.id).padStart(5, '0')}
                                            </p>
                                            <h2
                                                id="trail-breakdown-title"
                                                className="flex items-center gap-2 text-xl font-black tracking-tight"
                                            >
                                                <ShieldAlert className="h-5 w-5 text-indigo-400" />
                                                Activity Breakdown
                                            </h2>
                                            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-300">
                                                <User className="h-3.5 w-3.5 text-indigo-300" />
                                                <span>{selectedLog.admin_name}</span>
                                                <span className="text-slate-500">·</span>
                                                <span className="text-indigo-200">
                                                    {selectedLog.action}
                                                </span>
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedLog(null)}
                                            className="relative z-10 rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                            aria-label="Close breakdown"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>

                                    {/* Modal Body */}
                                    <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto bg-slate-50/70 px-6 py-6 sm:px-7">
                                        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                                            <p className="text-sm font-bold leading-relaxed text-slate-800">
                                                {selectedLog.description}
                                            </p>
                                        </div>

                                        <div className="space-y-3.5">
                                            <h4 className="flex items-center gap-2 border-b border-slate-200 pb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                                <ListTree className="h-4 w-4 text-indigo-500" />
                                                Sequential Steps
                                            </h4>
                                            <ol className="space-y-3">
                                                {(selectedLog.breakdown?.steps ?? []).length ===
                                                0 ? (
                                                    <p className="text-xs font-medium italic text-slate-500">
                                                        No complex steps recorded for this simple action.
                                                    </p>
                                                ) : (
                                                    (selectedLog.breakdown?.steps ?? []).map(
                                                        (step, index) => (
                                                            <li
                                                                key={`${step.title}-${index}`}
                                                                className="flex gap-3.5"
                                                            >
                                                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-900 font-mono text-xs font-black text-white shadow-xs">
                                                                    {index + 1}
                                                                </span>
                                                                <div className="w-full rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                                                                    <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                                        {step.title}
                                                                    </p>
                                                                    <p className="text-sm font-medium leading-relaxed text-slate-800">
                                                                        {step.detail}
                                                                    </p>
                                                                </div>
                                                            </li>
                                                        )
                                                    )
                                                )}
                                            </ol>
                                        </div>

                                        {(selectedLog.breakdown?.documents.length ?? 0) > 0 && (
                                            <div className="space-y-3.5">
                                                <h4 className="flex items-center gap-2 border-b border-slate-200 pb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                                    <FileText className="h-4 w-4 text-indigo-500" />
                                                    Associated Documents
                                                </h4>
                                                <div className="grid grid-cols-1 gap-3">
                                                    {selectedLog.breakdown?.documents.map(
                                                        (document) => (
                                                            <div
                                                                key={document.path}
                                                                className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-2xs transition hover:border-indigo-300 sm:flex-row sm:items-center"
                                                            >
                                                                <div className="flex min-w-0 items-center gap-3">
                                                                    <div className="shrink-0 rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
                                                                        <FileText className="h-4 w-4" />
                                                                    </div>
                                                                    <p className="truncate text-sm font-bold text-slate-800">
                                                                        {document.name}
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setDocumentViewer({
                                                                            path: document.path,
                                                                            title: document.name,
                                                                        })
                                                                    }
                                                                    className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-600 sm:w-auto"
                                                                >
                                                                    <FileText className="h-3.5 w-3.5" />
                                                                    View Document
                                                                </button>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Modal Footer */}
                                    <div className="flex shrink-0 justify-end border-t border-slate-100 bg-white px-6 py-4">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedLog(null)}
                                            className="w-full rounded-xl bg-slate-100 px-5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 sm:w-auto"
                                        >
                                            Close Window
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}

            <SecureFileViewerModal
                filePath={documentViewer?.path || null}
                title={documentViewer?.title || 'Submitted document'}
                onClose={() => setDocumentViewer(null)}
            />
        </div>
    );
};

export default ActivityLogs;