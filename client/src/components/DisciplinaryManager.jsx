import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { getAllViolations, issueViolation, resolveViolation } from '../services/disciplinaryService';
import { 
    Scale, 
    ShieldAlert, 
    ShieldCheck, 
    CheckCircle2, 
    AlertTriangle, 
    Clock, 
    User, 
    FileWarning, 
    X, 
    Gavel,
    Send
} from 'lucide-react';

const DisciplinaryManager = () => {
    const [records, setRecords] = useState([]);
    const [students, setStudents] = useState([]);
    const [formData, setFormData] = useState({
        student_id: '',
        violation_type: 'Tardiness',
        description: '',
        penalty_hours: 0,
    });
    const [resolveModal, setResolveModal] = useState(null); // Stores the record to resolve
    const [resolveData, setResolveData] = useState({ status: 'Resolved', resolution_remarks: '' });
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchRecords();
        
        // Fetching Students safely
        axios.get('/api/users')
            .then(res => {
                const usersArray = Array.isArray(res.data) ? res.data : res.data?.data;
                if (!Array.isArray(usersArray)) {
                    console.error('Could not find an array of users in the response', res.data);
                    setStudents([]);
                    return;
                }
                const studentUsers = usersArray.filter(
                    user => user.role && user.role.toLowerCase() === 'student'
                );
                setStudents(studentUsers);
            })
            .catch(err => console.error('Failed to load students', err));
    }, []);

    const fetchRecords = async () => {
        setIsLoading(true);
        try {
            const res = await getAllViolations();
            setRecords(res.data);
        } catch (err) {
            console.error('Failed to fetch records', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIssue = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await issueViolation(formData);
            setFormData({ student_id: '', violation_type: 'Tardiness', description: '', penalty_hours: 0 });
            fetchRecords();
        } catch (err) {
            console.error('Failed to issue violation', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResolve = async () => {
        if (!resolveData.resolution_remarks.trim() || !resolveModal) return;
        
        // Optimistic UI update
        const recordId = resolveModal.id || resolveModal;
        setRecords(prev => prev.map(r => r.id === recordId ? { ...r, status: 'Resolved', resolution_remarks: resolveData.resolution_remarks } : r));
        
        setResolveModal(null);
        setResolveData({ status: 'Resolved', resolution_remarks: '' });

        try {
            await resolveViolation(recordId, resolveData);
            fetchRecords();
        } catch (err) {
            console.error('Failed to resolve violation', err);
            fetchRecords(); // Revert on fail
        }
    };

    const activeCasesCount = records.filter(r => r.status !== 'Resolved').length;

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
                <p className="text-slate-500 font-bold animate-pulse">Loading compliance data...</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
            
            {/* DARK THEME HEADER - DISCIPLINARY COMMAND CENTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Glowing Orbs (Red & Amber for Disciplinary Context) */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-red-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-amber-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldAlert className="w-5 h-5 text-red-400" />
                        <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Conduct & Compliance</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Infraction Manager
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Issue official disciplinary actions, apply penalty hours, and manage ongoing student conduct cases.
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activeCasesCount > 0 ? 'bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(248,113,113,0.3)]' : 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'}`}>
                        {activeCasesCount > 0 ? <AlertTriangle className="w-5 h-5 animate-pulse" /> : <ShieldCheck className="w-5 h-5" />}
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Cases</span>
                        <span className={`text-sm font-extrabold ${activeCasesCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {activeCasesCount > 0 ? `${activeCasesCount} Unresolved Case(s)` : 'All Cases Resolved'}
                        </span>
                    </div>
                </div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* LEFT COLUMN: ISSUE VIOLATION FORM */}
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="lg:col-span-1 bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 sticky top-6"
                >
                    <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2 tracking-tight">
                        <Gavel className="w-5 h-5 text-red-600" /> Issue Violation
                    </h3>
                    
                    <form onSubmit={handleIssue} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Student Worker</label>
                            <select
                                required
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                                value={formData.student_id}
                                onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                            >
                                <option value="" disabled>-- Select a student --</option>
                                {students.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.profile?.student_id_number || 'No ID'})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Violation Type</label>
                            <select
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                                value={formData.violation_type}
                                onChange={(e) => setFormData({ ...formData, violation_type: e.target.value })}
                            >
                                <option value="Tardiness">Tardiness</option>
                                <option value="Absenteeism">Absenteeism</option>
                                <option value="Insubordination">Insubordination</option>
                                <option value="Property Damage">Property Damage</option>
                                <option value="Policy Breach">Policy Breach</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Penalty Hours</label>
                            <div className="relative">
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    className="w-full p-3.5 pr-12 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all"
                                    value={formData.penalty_hours}
                                    onChange={(e) => setFormData({ ...formData, penalty_hours: Number(e.target.value) })}
                                />
                                <span className="absolute inset-y-0 right-4 flex items-center text-xs font-bold text-slate-400 pointer-events-none">hrs</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Hours to be deducted from final rendered time.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Incident Description</label>
                            <textarea
                                required
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all h-32 resize-none placeholder:text-slate-400"
                                placeholder="Describe the incident in detail..."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        <button 
                            type="submit" 
                            disabled={isSubmitting || !formData.student_id}
                            className="w-full py-3.5 mt-2 bg-slate-900 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-slate-900/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? 'Issuing...' : <><Send className="w-5 h-5" /> Issue Violation</>}
                        </button>
                    </form>
                </motion.div>

                {/* RIGHT COLUMN: CASE GRID */}
                <div className="lg:col-span-2">
                    {records.length === 0 ? (
                        <div className="bg-white rounded-3xl p-16 text-center border border-slate-200 flex flex-col items-center shadow-sm">
                            <ShieldCheck className="w-16 h-16 text-emerald-400 mb-4 opacity-50" />
                            <h3 className="text-xl font-bold text-slate-700">No Disciplinary Records</h3>
                            <p className="text-slate-500 mt-2">All students currently have clean records.</p>
                        </div>
                    ) : (
                        <motion.div 
                            variants={containerVariants}
                            initial="hidden"
                            animate="show"
                            className="grid grid-cols-1 md:grid-cols-2 gap-5"
                        >
                            <AnimatePresence>
                                {records.map((record) => (
                                    <motion.div 
                                        layout
                                        variants={itemVariants}
                                        key={record.id} 
                                        className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all group relative overflow-hidden flex flex-col"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
                                                record.status === 'Resolved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                'bg-red-50 text-red-700 border-red-200 animate-pulse'
                                            }`}>
                                                {record.status === 'Resolved' && <CheckCircle2 className="w-3 h-3" />}
                                                {record.status !== 'Resolved' && <AlertTriangle className="w-3 h-3" />}
                                                {record.status || 'Pending'}
                                            </span>
                                            
                                            {record.penalty_hours > 0 && (
                                                <span className="text-[11px] font-black text-red-700 bg-red-100 px-2.5 py-1 rounded-md">
                                                    -{record.penalty_hours} hrs
                                                </span>
                                            )}
                                        </div>

                                        <h4 className="font-black text-slate-900 text-lg leading-tight mb-2 group-hover:text-red-700 transition-colors">
                                            {record.violation_type || 'Standard Violation'}
                                        </h4>
                                        <p className="text-sm text-slate-500 font-medium mb-4 line-clamp-3 flex-1">
                                            {record.description || <span className="italic opacity-50">No description provided.</span>}
                                        </p>

                                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
                                                    {(record.student?.name || '?').charAt(0)}
                                                </div>
                                                <span className="truncate max-w-[120px]">{record.student?.name || 'Unknown Student'}</span>
                                            </div>
                                            
                                            {record.status !== 'Resolved' && (
                                                <button 
                                                    onClick={() => setResolveModal(record)}
                                                    className="px-3 py-1.5 bg-slate-100 hover:bg-emerald-600 text-slate-700 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                                                >
                                                    <Scale className="w-3.5 h-3.5" /> Resolve
                                                </button>
                                            )}
                                        </div>

                                        {record.status === 'Resolved' && record.resolution_remarks && (
                                            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Resolution Note
                                                </p>
                                                <p className="text-xs text-slate-700 font-medium italic">"{record.resolution_remarks}"</p>
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </div>
            </div>

            {/* RESOLUTION MODAL */}
            <AnimatePresence>
                {resolveModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                        >
                            <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                    <Scale className="w-5 h-5 text-emerald-600" /> Resolve Case
                                </h3>
                                <button onClick={() => setResolveModal(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 sm:p-8 space-y-4">
                                <div>
                                    <p className="text-xs text-slate-500 font-medium mb-3">
                                        Log official remarks regarding how this disciplinary issue was handled or dismissed.
                                    </p>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Resolution Remarks</label>
                                    <textarea
                                        autoFocus
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all h-32 resize-none"
                                        placeholder="State why this was dismissed or resolved..."
                                        value={resolveData.resolution_remarks}
                                        onChange={e => setResolveData({ ...resolveData, resolution_remarks: e.target.value })}
                                    />
                                </div>
                                
                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                    <button 
                                        onClick={() => setResolveModal(null)} 
                                        className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleResolve}
                                        disabled={!resolveData.resolution_remarks.trim()}
                                        className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-600/25 disabled:opacity-50 transition-all flex items-center gap-2"
                                    >
                                        <CheckCircle2 className="w-4 h-4" /> Finalize Case
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

export default DisciplinaryManager;