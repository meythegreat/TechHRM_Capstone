import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMyViolations, submitAppeal } from '../services/disciplinaryService';
import { 
    ShieldAlert, 
    ShieldCheck, 
    Scale, 
    MessageSquare, 
    CheckCircle2, 
    X, 
    Clock, 
    AlertTriangle,
    FileWarning
} from 'lucide-react';

const StudentDisciplinaryBoard = () => {
    const [records, setRecords] = useState([]);
    const [appealModal, setAppealModal] = useState(null); // stores the record object
    const [appealNotes, setAppealNotes] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { 
        fetchRecords(); 
    }, []);

    const fetchRecords = async () => {
        try {
            const res = await getMyViolations();
            setRecords(res.data);
        } catch (err) {
            console.error('Failed to load disciplinary records', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAppealSubmit = async () => {
        if (!appealNotes.trim() || !appealModal) return;
        
        // Optimistic UI update
        const recordId = appealModal.id || appealModal;
        setRecords(prev => prev.map(r => r.id === recordId ? { ...r, status: 'Appealed' } : r));
        
        setAppealModal(null);
        setAppealNotes('');
        
        await submitAppeal(recordId, appealNotes);
        fetchRecords();
    };

    // ANIMATION VARIANTS
    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mb-3"></div>
                <p className="text-slate-500 font-bold animate-pulse">Loading compliance records...</p>
            </div>
        );
    }

    const hasCleanRecord = records.length === 0;

    return (
        <div className="max-w-6xl mx-auto space-y-6 font-sans">
            
            {/* DARK THEME HEADER - DISCIPLINARY */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Subtle red/amber glow for disciplinary context */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-red-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-amber-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldAlert className="w-5 h-5 text-red-400" />
                        <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Conduct Overview</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Disciplinary Board
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Review your official conduct records. Submit a formal appeal to the WSPO if a penalty was issued in error.
                    </p>
                </div>

                {/* Dynamic Status Box */}
                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasCleanRecord ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(248,113,113,0.3)]'}`}>
                        {hasCleanRecord ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Standing</span>
                        <span className={`text-sm font-extrabold ${hasCleanRecord ? 'text-emerald-400' : 'text-red-400'}`}>
                            {hasCleanRecord ? 'Clear Record' : 'Infractions Found'}
                        </span>
                    </div>
                </div>
            </motion.div>

            {hasCleanRecord ? (
                /* EXEMPLARY RECORD EMPTY STATE */
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-8 sm:p-12 shadow-lg shadow-emerald-600/20 text-center relative overflow-hidden flex flex-col items-center"
                >
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
                    
                    <div className="relative z-10 w-24 h-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mb-6 shadow-inner border border-white/30">
                        <ShieldCheck className="w-12 h-12 text-white" />
                    </div>
                    <h3 className="relative z-10 text-3xl font-black text-white tracking-tight mb-2">Exemplary Record</h3>
                    <p className="relative z-10 text-emerald-100 font-medium max-w-md text-lg">
                        You have no violations or penalties on your account. Thank you for your continued dedication to the Work-Study Program!
                    </p>
                </motion.div>
            ) : (
                /* RECORDS LIST */
                <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-4"
                >
                    {records.map((record) => (
                        <motion.div 
                            variants={itemVariants} 
                            key={record.id}
                            className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all group flex flex-col md:flex-row gap-6 items-start md:items-center relative overflow-hidden"
                        >
                            {/* Left Side: Icon & Details */}
                            <div className="flex-1 flex gap-5 w-full">
                                <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 shrink-0 group-hover:scale-105 transition-transform">
                                    <Scale className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <h4 className="text-lg font-black text-slate-900">{record.violation || 'Standard Policy Violation'}</h4>
                                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-red-50 text-red-700 border border-red-100 uppercase tracking-wider flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" /> Penalty: {record.penalty || 'Warning'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-500 font-medium mb-3">
                                        {record.details || 'No additional details provided by the supervisor.'}
                                    </p>
                                    <div className="flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Date Issued: {record.date || new Date().toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Right Side: Status & Action */}
                            <div className="w-full md:w-auto flex flex-col sm:flex-row md:flex-col items-center sm:items-end justify-between md:justify-center gap-3 md:pl-6 md:border-l border-slate-100">
                                <div className="flex flex-col items-start sm:items-end">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Current Status</span>
                                    {record.status === 'Resolved' && (
                                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-bold shadow-sm">
                                            <CheckCircle2 className="w-4 h-4" /> Resolved
                                        </span>
                                    )}
                                    {record.status === 'Appealed' && (
                                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-bold shadow-sm">
                                            <MessageSquare className="w-4 h-4" /> Appeal Under Review
                                        </span>
                                    )}
                                    {(!record.status || record.status === 'Pending Appeal' || record.status === 'Pending') && (
                                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm font-bold shadow-sm">
                                            <FileWarning className="w-4 h-4" /> Action Required
                                        </span>
                                    )}
                                </div>

                                {(!record.status || record.status === 'Pending Appeal' || record.status === 'Pending') && (
                                    <button
                                        onClick={() => setAppealModal(record)}
                                        className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
                                    >
                                        <MessageSquare className="w-4 h-4" /> File Appeal
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            )}

            {/* FORMAL APPEAL MODAL */}
            <AnimatePresence>
                {appealModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
                        >
                            <div className="p-6 sm:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-2 tracking-tight">
                                        <Scale className="w-6 h-6 text-slate-700" />
                                        Submit Formal Appeal
                                    </h3>
                                </div>
                                <button 
                                    onClick={() => setAppealModal(null)}
                                    className="p-2 bg-slate-200/50 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 sm:p-8 space-y-6">
                                <div>
                                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Incident Reference</p>
                                    <p className="font-bold text-slate-900 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        {appealModal.violation || 'Standard Policy Violation'}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Your Statement
                                    </label>
                                    <p className="text-xs text-slate-400 font-medium mb-3 leading-relaxed">
                                        Please provide a clear and respectful explanation of your side of the incident. This statement will be reviewed directly by the WSPO Administration.
                                    </p>
                                    <textarea
                                        autoFocus
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all h-40 resize-none leading-relaxed"
                                        placeholder="I am writing to formally appeal this record because..."
                                        value={appealNotes}
                                        onChange={e => setAppealNotes(e.target.value)}
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button 
                                        onClick={() => setAppealModal(null)} 
                                        className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleAppealSubmit}
                                        disabled={!appealNotes.trim()}
                                        className="px-6 py-2.5 bg-slate-900 hover:bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-slate-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        <ShieldCheck className="w-4 h-4" /> Submit to WSPO
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

export default StudentDisciplinaryBoard;