import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import Toast from './Toast';
import { openSecureFile } from '../utils/secureFile';
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
    User
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
        }
    }
}

const RequirementManagement = () => {
    const isAudit = localStorage.getItem('user_role') === 'Super Admin';
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [toastMsg, setToastMsg] = useState<{text: string, type: 'success' | 'error'} | null>(null);

    // Reject Modal State
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [selectedReqId, setSelectedReqId] = useState<number | null>(null);
    const [rejectRemarks, setRejectRemarks] = useState('');

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
            console.error("Failed to fetch requirements", error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const showToast = (text: string, type: 'success' | 'error') => {
        setToastMsg({ text, type });
    };

    const handleUpdateStatus = async (id: number, status: 'verified' | 'rejected', remarks: string = '') => {
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
            showToast(error.response?.data?.message || `Failed to update document status.`, 'error');
        }
    };

    const visibleRequirements = useMemo(() => {
        const rows = isAudit ? requirements.filter((item) => item.status === 'verified') : requirements;
        return [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [requirements, isAudit]);
    const pagedRequirements = pageSlice(visibleRequirements, page);
    const pendingCount = requirements.filter(r => r.status === 'pending').length;

    // STRICT TYPESCRIPT VARIANTS
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const rowVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
            
            {/* DARK THEME HEADER - COMPLIANCE CENTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
            >

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="w-5 h-5 text-blue-400" />
                        <span className="text-sm font-medium text-slate-500">Compliance Management</span>
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                        Document Verification
                    </h1>
                    <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
                        {isAudit
                            ? 'Students whose documents passed review, newest first. Open a file to view the submission.'
                            : 'Review uploaded student requirements. Verify valid documents or reject them with feedback for correction.'}
                    </p>
                </div>

                <div className="shrink-0 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${pendingCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {pendingCount > 0 ? <FileSearch className="w-5 h-5 animate-pulse" /> : <CheckCircle2 className="w-5 h-5" />}
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verification Queue</span>
                        <span className={`text-sm font-semibold ${pendingCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {pendingCount > 0 ? `${pendingCount} Pending Review(s)` : 'All Caught Up!'}
                        </span>
                    </div>
                </div>
            </motion.div>

            <Toast
                message={toastMsg?.text ?? null}
                type={toastMsg?.type}
                onClose={() => setToastMsg(null)}
            />

            {/* MAIN TABLE */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden relative">
                
                {isLoading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200">
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Student Details</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Document Info</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Verification Action</th>
                            </tr>
                        </thead>
                        <motion.tbody 
                            variants={containerVariants}
                            initial="hidden"
                            animate={!isLoading ? "show" : "hidden"}
                            className="divide-y divide-slate-100"
                        >
                            {!isLoading && pagedRequirements.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="text-base font-semibold text-slate-600">{isAudit ? 'No passed documents' : 'No documents found'}</p>
                                        <p className="text-sm font-medium">{isAudit ? 'Verified submissions will appear here, newest first.' : 'Students have not uploaded any requirements yet.'}</p>
                                    </td>
                                </tr>
                            ) : (
                                pagedRequirements.rows.map((req) => (
                                    <motion.tr variants={rowVariants} key={req.id} className="hover:bg-slate-50 transition-colors group">
                                        
                                        {/* Student Details Column */}
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-3">
                                                <UserAvatar
                                                    name={req.user?.name}
                                                    picture={req.user?.profile_picture}
                                                    className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm"
                                                />
                                                <div>
                                                    <p className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                                        {req.user?.name || 'Unknown User'}
                                                    </p>
                                                    <div className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                                                        <User className="w-3 h-3 text-slate-400" /> {req.user?.profile?.student_id_number || 'N/A'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Document Info Column */}
                                        <td className="px-6 py-5 align-top">
                                            <p className="text-sm font-bold text-slate-900">{req.document_type}</p>
                                            <p className="text-xs font-medium text-slate-500 mt-1 flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" /> Uploaded: {new Date(req.created_at).toLocaleDateString()}
                                            </p>
                                            <button 
                                                onClick={() => openSecureFile(req.file_path)}
                                                className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                                            >
                                                <Eye className="w-3.5 h-3.5" /> View Secure File
                                            </button>
                                        </td>

                                        {/* Status Column */}
                                        <td className="px-6 py-5 align-top">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
                                                req.status === 'verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                req.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                                                'bg-amber-50 text-amber-700 border-amber-200'
                                            }`}>
                                                {req.status === 'verified' && <CheckCircle2 className="w-3 h-3" />}
                                                {req.status === 'rejected' && <XCircle className="w-3 h-3" />}
                                                {req.status === 'pending' && <Clock className="w-3 h-3" />}
                                                {req.status}
                                            </span>
                                            
                                            {req.status === 'rejected' && req.remarks && (
                                                <p className="text-[11px] text-red-600 font-medium mt-2 bg-red-50/50 p-2 rounded-lg border border-red-100 max-w-[200px] leading-snug">
                                                    <span className="font-bold">Note:</span> {req.remarks}
                                                </p>
                                            )}
                                        </td>

                                        {/* Verification Action Column */}
                                        <td className="px-6 py-5 align-top text-right">
                                            {isAudit ? (
                                                <span className="text-xs font-bold text-emerald-600">Passed</span>
                                            ) : req.status === 'pending' ? (
                                                <div className="flex flex-col items-end gap-2">
                                                    <button 
                                                        onClick={() => handleUpdateStatus(req.id, 'verified')}
                                                        className="w-full sm:w-auto px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm shadow-emerald-500/20 transition-colors flex items-center justify-center gap-1.5"
                                                    >
                                                        <CheckCircle2 className="w-4 h-4" /> Verify
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            setSelectedReqId(req.id);
                                                            setIsRejectModalOpen(true);
                                                        }}
                                                        className="w-full sm:w-auto px-4 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                                                    >
                                                        <XCircle className="w-4 h-4" /> Reject
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs font-bold text-slate-400 italic flex items-center justify-end gap-1">
                                                    <ShieldCheck className="w-4 h-4" /> Processed
                                                </span>
                                            )}
                                        </td>

                                    </motion.tr>
                                ))
                            )}
                        </motion.tbody>
                    </table>
                </div>
                {isAudit && <AuditPager page={pagedRequirements.page} totalPages={pagedRequirements.totalPages} total={pagedRequirements.total} onPage={setPage} />}
            </div>

            {/* REJECT MODAL */}
            <AnimatePresence>
                {isRejectModalOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
                        {...bindPopup(() => setIsRejectModalOpen(false))}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                        >
                            <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                                    <AlertCircle className="w-5 h-5 text-red-600" /> Reject Document
                                </h3>
                                <button onClick={() => setIsRejectModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 sm:p-8 space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Reason for Rejection
                                    </label>
                                    <p className="text-xs text-slate-500 font-medium mb-3">
                                        Please provide a clear reason so the student knows exactly what needs to be fixed and re-uploaded.
                                    </p>
                                    <textarea 
                                        autoFocus
                                        value={rejectRemarks}
                                        onChange={(e) => setRejectRemarks(e.target.value)}
                                        placeholder="e.g., Image is too blurry, missing signature, incorrect document type..."
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white transition-all h-32 resize-none"
                                    />
                                </div>
                                
                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                    <button 
                                        onClick={() => setIsRejectModalOpen(false)} 
                                        className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={() => selectedReqId && handleUpdateStatus(selectedReqId, 'rejected', rejectRemarks)}
                                        disabled={!rejectRemarks.trim()}
                                        className="px-6 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-lg shadow-red-600/25 disabled:opacity-50 transition-all flex items-center gap-2"
                                    >
                                        <XCircle className="w-4 h-4" /> Confirm Rejection
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