import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import Toast from './Toast';
import SecureFileViewerModal from './SecureFileViewerModal';
import { bindPopup } from '../utils/popupDismiss';
import {
    FileText,
    CheckCircle2,
    XCircle,
    Clock,
    AlertCircle,
    Eye,
    ShieldCheck,
    FileSearch,
    X,
    User,
} from 'lucide-react';
import AuditPager, { pageSlice } from './AuditPager';
import UserAvatar from './UserAvatar';
import { REALTIME_EVENT } from '../utils/realtime';

interface Requirement {
    id: number;
    document_type: string;
    file_path: string;
    status: string;
    remarks: string | null;
    created_at: string;
    user?: {
        name: string;
        profile_picture?: string | null;
        profile?: {
            student_id_number: string;
            assigned_office: string;
        };
    };
}

const RequirementManagement = () => {
    const isAudit = localStorage.getItem('user_role') === 'Super Admin';
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(
        null
    );

    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [selectedReqId, setSelectedReqId] = useState<number | null>(null);
    const [rejectRemarks, setRejectRemarks] = useState('');
    const [documentViewer, setDocumentViewer] = useState<{ path: string; title: string } | null>(
        null
    );

    useEffect(() => {
        fetchRequirements();
        const refresh = () => fetchRequirements(true);
        const interval = setInterval(refresh, 5000);
        window.addEventListener(REALTIME_EVENT, refresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, refresh);
        };
    }, []);

    const fetchRequirements = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const res = await axios.get('/api/requirements');
            setRequirements(res.data);
        } catch (error) {
            console.error('Failed to fetch requirements', error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const showToast = (text: string, type: 'success' | 'error') => {
        setToastMsg({ text, type });
    };

    const handleUpdateStatus = async (
        id: number,
        status: 'verified' | 'rejected',
        remarks: string = ''
    ) => {
        try {
            await axios.patch(`/api/requirements/${id}/status`, { status, remarks });
            showToast(`Document successfully ${status}.`, 'success');

            if (status === 'rejected') {
                setIsRejectModalOpen(false);
                setRejectRemarks('');
                setSelectedReqId(null);
            }

            fetchRequirements();
        } catch (error: any) {
            showToast(
                error.response?.data?.message || 'Failed to update document status.',
                'error'
            );
        }
    };

    const visibleRequirements = useMemo(() => {
        const rows = isAudit
            ? requirements.filter((item) => item.status === 'verified')
            : requirements;
        return [...rows].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }, [requirements, isAudit]);

    const pagedRequirements = pageSlice(visibleRequirements, page);
    const pendingCount = requirements.filter((r) => r.status === 'pending').length;

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.04 },
        },
    };

    const rowVariants: Variants = {
        hidden: { opacity: 0, y: 8 },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
        },
    };

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
            <SecureFileViewerModal
                filePath={documentViewer?.path || null}
                title={documentViewer?.title || 'Submitted document'}
                onClose={() => setDocumentViewer(null)}
            />

            {/* OBSIDIAN COMPLIANCE COMMAND HERO */}
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
                    className={`pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl ${
                        pendingCount > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/20'
                    }`}
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                            Compliance Management
                        </span>
                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Document Verification
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            {isAudit
                                ? 'Audit verified student requirement submissions across all departments.'
                                : 'Review and verify uploaded student requirements.'}
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                pendingCount > 0
                                    ? 'bg-amber-500/20 text-amber-300 ring-amber-400/30'
                                    : 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/30'
                            }`}
                        >
                            {pendingCount > 0 ? (
                                <FileSearch className="h-5 w-5 animate-pulse" />
                            ) : (
                                <CheckCircle2 className="h-5 w-5" />
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Verification Queue
                            </p>
                            <p
                                className={`mt-0.5 text-sm font-black ${
                                    pendingCount > 0 ? 'text-amber-300' : 'text-emerald-300'
                                }`}
                            >
                                {pendingCount > 0
                                    ? `${pendingCount} Pending Review${pendingCount === 1 ? '' : 's'}`
                                    : 'All Caught Up!'}
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            <Toast
                message={toastMsg?.text ?? null}
                type={toastMsg?.type}
                onClose={() => setToastMsg(null)}
            />

            {/* MAIN VERIFICATION TABLE */}
            <section className="relative min-h-[320px] overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                {isLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 backdrop-blur-[2px]">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                            <span className="text-xs font-extrabold uppercase tracking-widest text-blue-700">
                                Loading documents…
                            </span>
                        </div>
                    </div>
                )}

                <div className="custom-scrollbar overflow-x-auto">
                    <table className="app-data-table w-full border-collapse text-left">
                        <thead>
                            <tr className="bg-slate-950 text-white">
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Student Details
                                </th>
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Document Info
                                </th>
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Status
                                </th>
                                <th className="px-6 py-4 text-right text-[11px] font-extrabold uppercase tracking-widest">
                                    Verification Action
                                </th>
                            </tr>
                        </thead>

                        <motion.tbody
                            variants={containerVariants}
                            initial="hidden"
                            animate={!isLoading ? 'show' : 'hidden'}
                            className="divide-y divide-slate-100"
                        >
                            {!isLoading && pagedRequirements.rows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={4}
                                        className="px-6 py-16 text-center text-slate-400"
                                    >
                                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                            <FileText className="h-7 w-7" />
                                        </div>
                                        <p className="text-sm font-extrabold text-slate-700">
                                            {isAudit ? 'No passed documents' : 'No documents found'}
                                        </p>
                                        <p className="mt-1 text-xs font-medium text-slate-400">
                                            {isAudit
                                                ? 'Verified submissions will appear here, newest first.'
                                                : 'Students have not uploaded any requirements yet.'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                pagedRequirements.rows.map((req) => (
                                    <motion.tr
                                        variants={rowVariants}
                                        key={req.id}
                                        className="group transition-colors hover:bg-slate-50/80"
                                    >
                                        {/* Student Details */}
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-3.5">
                                                <UserAvatar
                                                    name={req.user?.name}
                                                    picture={req.user?.profile_picture}
                                                    className="h-10 w-10 shrink-0 rounded-full border border-blue-100 bg-blue-50 text-sm text-blue-700"
                                                />
                                                <div>
                                                    <p className="text-sm font-extrabold text-slate-900 transition-colors group-hover:text-blue-700">
                                                        {req.user?.name || 'Unknown User'}
                                                    </p>
                                                    <div className="mt-0.5 flex items-center gap-1 font-mono text-xs font-medium text-slate-500">
                                                        <User className="h-3 w-3 text-slate-400" />
                                                        {req.user?.profile?.student_id_number ||
                                                            'N/A'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Document Info */}
                                        <td className="px-6 py-5 align-top">
                                            <p className="text-sm font-extrabold text-slate-900">
                                                {req.document_type}
                                            </p>
                                            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                Uploaded:{' '}
                                                {new Date(req.created_at).toLocaleDateString()}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setDocumentViewer({
                                                        path: req.file_path,
                                                        title:
                                                            req.document_type ||
                                                            'Submitted document',
                                                    })
                                                }
                                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                                View Secure File
                                            </button>
                                        </td>

                                        {/* Status */}
                                        <td className="px-6 py-5 align-top">
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                    req.status === 'verified'
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                        : req.status === 'rejected'
                                                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                                                          : 'border-amber-200 bg-amber-50 text-amber-700'
                                                }`}
                                            >
                                                {req.status === 'verified' && (
                                                    <CheckCircle2 className="h-3 w-3" />
                                                )}
                                                {req.status === 'rejected' && (
                                                    <XCircle className="h-3 w-3" />
                                                )}
                                                {req.status === 'pending' && (
                                                    <Clock className="h-3 w-3" />
                                                )}
                                                {req.status}
                                            </span>

                                            {req.status === 'rejected' && req.remarks && (
                                                <p className="mt-2 max-w-[220px] rounded-xl border border-rose-200/80 bg-rose-50/70 p-2.5 text-[11px] font-medium leading-snug text-rose-800">
                                                    <span className="font-extrabold">Note:</span>{' '}
                                                    {req.remarks}
                                                </p>
                                            )}
                                        </td>

                                        {/* Verification Action */}
                                        <td className="px-6 py-5 text-right align-top">
                                            {isAudit ? (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Passed
                                                </span>
                                            ) : req.status === 'pending' ? (
                                                <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
                                                    <button
                                                        onClick={() =>
                                                            handleUpdateStatus(req.id, 'verified')
                                                        }
                                                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700"
                                                    >
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        Verify
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedReqId(req.id);
                                                            setIsRejectModalOpen(true);
                                                        }}
                                                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
                                                    >
                                                        <XCircle className="h-3.5 w-3.5" />
                                                        Reject
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center justify-end gap-1 text-xs font-bold italic text-slate-400">
                                                    <ShieldCheck className="h-4 w-4" />
                                                    Processed
                                                </span>
                                            )}
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </motion.tbody>
                    </table>
                </div>

                {isAudit && (
                    <AuditPager
                        page={pagedRequirements.page}
                        totalPages={pagedRequirements.totalPages}
                        total={pagedRequirements.total}
                        onPage={setPage}
                    />
                )}
            </section>

            {/* OBSIDIAN REJECT MODAL */}
            <AnimatePresence>
                {isRejectModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(() => setIsRejectModalOpen(false))}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <h3 className="flex items-center gap-2 text-base font-black tracking-tight">
                                    <AlertCircle className="h-5 w-5 text-rose-400" />
                                    Reject Document
                                </h3>
                                <button
                                    onClick={() => setIsRejectModalOpen(false)}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="space-y-4 p-6 sm:p-7">
                                <div>
                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Reason for Rejection
                                    </label>
                                    <p className="mb-3 text-xs font-medium leading-relaxed text-slate-500">
                                        Provide a clear reason so the student knows what needs to be fixed and re-uploaded.
                                    </p>
                                    <textarea
                                        autoFocus
                                        value={rejectRemarks}
                                        onChange={(e) => setRejectRemarks(e.target.value)}
                                        placeholder="e.g., Image is too blurry, missing signature, incorrect document type…"
                                        className="h-32 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20"
                                    />
                                </div>

                                <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4">
                                    <button
                                        onClick={() => setIsRejectModalOpen(false)}
                                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() =>
                                            selectedReqId &&
                                            handleUpdateStatus(
                                                selectedReqId,
                                                'rejected',
                                                rejectRemarks
                                            )
                                        }
                                        disabled={!rejectRemarks.trim()}
                                        className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-rose-600/20 transition hover:bg-rose-700 disabled:opacity-50"
                                    >
                                        <XCircle className="h-4 w-4" />
                                        Confirm Rejection
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default RequirementManagement;