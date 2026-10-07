import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
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
    ExternalLink,
    Filter,
    User,
    AlertCircle
} from 'lucide-react';
import { openSecureFile } from '../utils/secureFile';

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
    const [openingPath, setOpeningPath] = useState<string | null>(null);
    const [openError, setOpenError] = useState('');
    const [category, setCategory] = useState<ActionCategory>('all');
    const [nameInput, setNameInput] = useState('');
    const [name, setName] = useState('');
    const [people, setPeople] = useState<string[]>([]);
    const appliedName = useRef('');
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        axios.get<string[]>('/api/logs/people')
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
    }, [currentPage, category, name]);

    const openBreakdown = (log: LogRecord) => {
        setOpenError('');
        setOpeningPath(null);
        setSelectedLog(log);
    };

    const openDocument = async (filePath: string) => {
        setOpenError('');
        setOpeningPath(filePath);
        try {
            await openSecureFile(filePath);
        } catch {
            setOpenError('This document could not be opened. It may have been replaced or removed.');
        } finally {
            setOpeningPath(null);
        }
    };

    const selectCategory = (next: ActionCategory) => {
        setSelectedLog(null);
        setCategory(next);
        setCurrentPage(1);
    };

    const fetchLogs = async (page: number, selectedCategory: ActionCategory, selectedName: string) => {
        setIsLoading(true);
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
            setIsLoading(false);
        }
    };

    // Helper to dynamically color-code actions
    const getActionBadge = (action: string) => {
        const act = action.toLowerCase();
        const baseStyle = "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap";
        
        if (act.includes('login') || act.includes('logout')) 
            return `${baseStyle} bg-purple-50 text-purple-700 border-purple-200`;
        if (act.includes('create') || act.includes('add') || act.includes('assign') || act.includes('issue')) 
            return `${baseStyle} bg-emerald-50 text-emerald-700 border-emerald-200`;
        if (act.includes('update') || act.includes('edit') || act.includes('approve') || act.includes('resolve')) 
            return `${baseStyle} bg-blue-50 text-blue-700 border-blue-200`;
        if (act.includes('delete') || act.includes('remove') || act.includes('reject')) 
            return `${baseStyle} bg-red-50 text-red-700 border-red-200`;
            
        return `${baseStyle} bg-slate-50 text-slate-600 border-slate-200`;
    };

    // STRICT TYPESCRIPT VARIANTS
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.05 } }
    };

    const rowVariants: Variants = {
        hidden: { opacity: 0, x: -10 },
        show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 font-sans p-4 sm:p-8">
            
            {/* DARK THEME HEADER - AUDIT COMMAND CENTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Glowing Orbs */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <Terminal className="w-5 h-5 text-indigo-400" />
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">System Security</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        System Audit Trail
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md leading-relaxed">
                        Real-time immutable monitoring of all administrative and system-level activities.
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)] shrink-0">
                        <ShieldAlert className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tracking Status</span>
                        <span className="text-sm font-extrabold text-emerald-400">
                            Active Monitoring
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* UNIFIED CONTROL CONSOLE */}
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col gap-4"
            >
                {/* Search Bar (text-base prevents iOS Zoom) */}
                <div className="relative w-full md:max-w-md">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                        type="search"
                        value={nameInput}
                        onChange={(event) => setNameInput(event.target.value)}
                        list="audit-user-names"
                        placeholder="Search logs by administrator name..."
                        aria-label="Filter trails by name"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-12 text-base font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-600/20 transition-all shadow-sm [&::-webkit-search-cancel-button]:hidden"
                    />
                    {nameInput && (
                        <button
                            type="button"
                            onClick={() => setNameInput('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
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

                {/* Category Pills (Wraps cleanly on mobile) */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 -mx-2 px-2 sm:mx-0 sm:px-0 sm:flex-wrap sm:pb-0">
                    <div className="flex items-center gap-1.5 mr-2 shrink-0">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hidden sm:block">Filters:</span>
                    </div>
                    {ACTION_CATEGORIES.map((item) => {
                        const active = category === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => selectCategory(item.id)}
                                className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all shrink-0 ${
                                    active
                                        ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/50'
                                }`}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            </motion.div>

            {/* MAIN TABLE */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative min-h-[400px]">
                
                {/* Loading Overlay */}
                {isLoading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                            <span className="text-sm font-bold text-indigo-700 animate-pulse">Scanning records...</span>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200">
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-400 uppercase tracking-wider w-24">Log ID</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Administrator</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Action Type</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-1/3">Description</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider text-right">Technical Details</th>
                            </tr>
                        </thead>
                        <motion.tbody 
                            variants={containerVariants}
                            initial="hidden"
                            animate={!isLoading ? "show" : "hidden"}
                            className="divide-y divide-slate-100"
                        >
                            {!isLoading && logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-slate-400">
                                        <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                        <p className="text-lg font-bold text-slate-600">No activity logs found</p>
                                        <p className="text-sm font-medium mt-1">
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
                                    <motion.tr variants={rowVariants} key={log.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-5 align-top">
                                            <span className="text-xs font-bold text-slate-400 font-mono bg-slate-100 px-2 py-1 rounded-md">#{String(log.id).padStart(5, '0')}</span>
                                        </td>
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0 border border-indigo-100 shadow-inner">
                                                    {log.admin_name.charAt(0)}
                                                </div>
                                                <div>
                                                    <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors block">
                                                        {log.admin_name}
                                                    </span>
                                                    {log.account_deleted && (
                                                        <span className="mt-1 inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
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
                                            <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                                {log.description}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => openBreakdown(log)}
                                                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 rounded-lg text-xs font-bold transition-colors"
                                            >
                                                <ListTree className="w-3.5 h-3.5" /> View Breakdown
                                            </button>
                                        </td>
                                        <td className="px-6 py-5 align-top text-right">
                                            <div className="flex flex-col items-end gap-2">
                                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                                    <Globe className="w-3 h-3 text-slate-400" /> {log.ip_address}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                                                    <Clock className="w-3.5 h-3.5" /> {new Date(log.created_at).toLocaleString()}
                                                </div>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </motion.tbody>
                    </table>
                </div>

                {/* PREMIUM PAGINATION FOOTER */}
                {!isLoading && logs.length > 0 && (
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <span className="text-sm text-slate-500 font-medium">
                            Showing page <span className="font-bold text-slate-900">{currentPage}</span> of <span className="font-bold text-slate-900">{totalPages}</span>
                        </span>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button 
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="flex-1 sm:flex-none px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-1"
                            >
                                <ChevronLeft className="w-4 h-4" /> Prev
                            </button>
                            <button 
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="flex-1 sm:flex-none px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-1"
                            >
                                Next <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* BREAKDOWN MODAL (Mobile-Optimized Glassmorphism) */}
            {createPortal(
                <AnimatePresence>
                {selectedLog && (
                    <motion.div 
                        key="audit-breakdown"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" 
                        onClick={() => setSelectedLog(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="trail-breakdown-title"
                            className="w-full max-w-2xl bg-white shadow-2xl rounded-3xl flex flex-col overflow-hidden max-h-[90vh]"
                            onClick={(event) => event.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="px-6 sm:px-8 py-6 border-b border-slate-200 bg-slate-900 text-white flex items-start justify-between gap-4 shrink-0 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500 rounded-full blur-3xl opacity-20"></div>
                                <div className="relative z-10">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 font-mono mb-1">
                                        Log Entry #{String(selectedLog.id).padStart(5, '0')}
                                    </p>
                                    <h2 id="trail-breakdown-title" className="text-2xl font-black tracking-tight flex items-center gap-2">
                                        <ShieldAlert className="w-6 h-6 text-indigo-400" />
                                        Activity Breakdown
                                    </h2>
                                    <p className="mt-1.5 text-sm font-medium text-slate-300 flex items-center gap-1.5">
                                        <User className="w-4 h-4" /> {selectedLog.admin_name} <span className="text-slate-500 mx-1">•</span> {selectedLog.action}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedLog(null)}
                                    className="relative z-10 p-2.5 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                                    aria-label="Close breakdown"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-8 custom-scrollbar bg-slate-50">
                                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                    <p className="text-sm font-bold text-slate-700 leading-relaxed">{selectedLog.description}</p>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 border-b border-slate-200 pb-2">
                                        <ListTree className="w-4 h-4 text-indigo-400" /> Sequential Steps
                                    </h4>
                                    <ol className="space-y-4">
                                        {(selectedLog.breakdown?.steps ?? []).length === 0 ? (
                                            <p className="text-sm font-medium text-slate-500 italic">No complex steps recorded for this simple action.</p>
                                        ) : (
                                            (selectedLog.breakdown?.steps ?? []).map((step, index) => (
                                                <li key={`${step.title}-${index}`} className="flex gap-4">
                                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700 border border-indigo-200 shadow-sm">
                                                        {index + 1}
                                                    </span>
                                                    <div className="bg-white border border-slate-200 p-4 rounded-2xl w-full shadow-sm">
                                                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">{step.title}</p>
                                                        <p className="text-sm font-medium text-slate-800 leading-relaxed">{step.detail}</p>
                                                    </div>
                                                </li>
                                            ))
                                        )}
                                    </ol>
                                </div>

                                {(selectedLog.breakdown?.documents.length ?? 0) > 0 && (
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 border-b border-slate-200 pb-2">
                                            <FileText className="w-4 h-4 text-indigo-400" /> Associated Documents
                                        </h4>
                                        <div className="grid grid-cols-1 gap-3">
                                            {selectedLog.breakdown?.documents.map((document) => (
                                                <div key={document.path} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:border-indigo-300 transition-colors">
                                                    <div className="min-w-0 flex items-center gap-3">
                                                        <div className="p-2.5 bg-indigo-50 rounded-xl shrink-0">
                                                            <FileText className="w-5 h-5 text-indigo-600" />
                                                        </div>
                                                        <p className="truncate text-sm font-bold text-slate-800">{document.name}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => openDocument(document.path)}
                                                        disabled={openingPath === document.path}
                                                        className="shrink-0 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60 transition-all shadow-md shadow-indigo-600/20"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                        {openingPath === document.path ? 'Opening…' : 'View Document'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        {openError && (
                                            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm font-bold text-red-700">
                                                <AlertCircle className="w-5 h-5 shrink-0" />
                                                <p>{openError}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {/* Modal Footer */}
                            <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setSelectedLog(null)}
                                    className="px-6 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors w-full sm:w-auto"
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
        </div>
    );
};

export default ActivityLogs;