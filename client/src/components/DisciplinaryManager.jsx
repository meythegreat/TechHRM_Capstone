import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { ConductPanels } from './ConductPanels';
import { decideViolation, getAllViolations, getConductCatalog, issueViolation, resolveViolation } from '../services/disciplinaryService';
import { withHomeDepartmentNote } from '../utils/studentAssignment';
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
    const currentUserRole = localStorage.getItem('user_role') || '';
    const isCoordinator = currentUserRole === 'WSPO Staff' || currentUserRole === 'Super Admin';
    const [records, setRecords] = useState([]);
    const [students, setStudents] = useState([]);
    const emptyForm = () => ({
        student_id: '',
        violation_type: 'Tardiness',
        incident_date: new Date().toISOString().split('T')[0],
        description: '',
        penalty: '',
        penalty_hours: '',
        resolution_remarks: '',
        suspension_span: '',
        suspension_days: '1',
        suspension_reason: '',
    });
    const [formData, setFormData] = useState(emptyForm);
    const [formError, setFormError] = useState('');
    const [resolveModal, setResolveModal] = useState(null); // Stores the record to resolve
    const [resolveData, setResolveData] = useState({ status: 'Resolved', resolution_remarks: '' });
    const [decideModal, setDecideModal] = useState(null);
    const [decideData, setDecideData] = useState({ penalty: 'Suspension', penalty_hours: '', resolution_remarks: '', suspension_span: '', suspension_days: '1', suspension_reason: '' });
    const [decideError, setDecideError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [section, setSection] = useState('offenses');
    const [offenseCatalog, setOffenseCatalog] = useState({ minor: [], major: [] });

    useEffect(() => {
        fetchRecords();
        getConductCatalog()
            .then((res) => setOffenseCatalog({ minor: res.data.minor || [], major: res.data.major || [] }))
            .catch(() => {});
        
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

    const apiError = (err, fallback) => {
        const errors = err?.response?.data?.errors;
        if (errors) {
            const first = Object.values(errors)[0];
            if (Array.isArray(first) && first[0]) return first[0];
        }
        return err?.response?.data?.message || fallback;
    };

    const handleIssue = async (e) => {
        e.preventDefault();
        setFormError('');
        if (isCoordinator && formData.penalty === 'DTR Deduction' && Number(formData.penalty_hours) < 0.5) {
            setFormError('Enter the number of duty hours to deduct.');
            return;
        }
        const suspensionError = suspensionProblem(formData);
        if (isCoordinator && suspensionError) {
            setFormError(suspensionError);
            return;
        }
        setIsSubmitting(true);
        try {
            const payload = isCoordinator
                ? {
                    student_id: formData.student_id,
                    violation_type: formData.violation_type,
                    incident_date: formData.incident_date,
                    description: formData.description,
                    penalty: formData.penalty,
                    penalty_hours: formData.penalty === 'DTR Deduction' ? Number(formData.penalty_hours) : undefined,
                    resolution_remarks: formData.penalty === 'Dismissed' ? formData.resolution_remarks : undefined,
                    ...suspensionPayload(formData),
                }
                : {
                    student_id: formData.student_id,
                    violation_type: formData.violation_type,
                    incident_date: formData.incident_date,
                    description: formData.description,
                };
            await issueViolation(payload);
            setFormData(emptyForm());
            fetchRecords();
        } catch (err) {
            console.error('Failed to issue violation', err);
            setFormError(apiError(err, 'Could not issue this infraction.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const openDecide = (record) => {
        setDecideError('');
        setDecideData({ penalty: 'Suspension', penalty_hours: '', resolution_remarks: '', suspension_span: '', suspension_days: '1', suspension_reason: '' });
        setDecideModal(record);
    };

    const handleDecide = async () => {
        if (!decideModal) return;
        if (decideData.penalty === 'DTR Deduction' && Number(decideData.penalty_hours) < 0.5) {
            setDecideError('Enter the number of duty hours to deduct.');
            return;
        }
        const suspensionError = suspensionProblem(decideData);
        if (suspensionError) {
            setDecideError(suspensionError);
            return;
        }
        setIsSubmitting(true);
        setDecideError('');
        try {
            await decideViolation(decideModal.id, {
                penalty: decideData.penalty,
                penalty_hours: decideData.penalty === 'DTR Deduction' ? Number(decideData.penalty_hours) : undefined,
                resolution_remarks: decideData.penalty === 'Dismissed' ? decideData.resolution_remarks : undefined,
                ...suspensionPayload(decideData),
            });
            setDecideModal(null);
            fetchRecords();
        } catch (err) {
            console.error('Failed to decide infraction', err);
            setDecideError(apiError(err, 'Could not save this decision.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResolve = async (status = 'Resolved') => {
        if (!resolveData.resolution_remarks.trim() || !resolveModal) return;

        const recordId = resolveModal.id || resolveModal;
        const payload = { status, resolution_remarks: resolveData.resolution_remarks };
        setRecords(prev => prev.map(r => r.id === recordId ? { ...r, status, resolution_remarks: resolveData.resolution_remarks, penalty_hours: status === 'Dismissed' ? 0 : r.penalty_hours, penalty: status === 'Dismissed' ? 'Dismissed' : r.penalty } : r));

        setResolveModal(null);
        setResolveData({ status: 'Resolved', resolution_remarks: '' });

        try {
            await resolveViolation(recordId, payload);
            fetchRecords();
        } catch (err) {
            console.error('Failed to resolve violation', err);
            fetchRecords();
        }
    };

    const needsDecision = (record) => isCoordinator && record.penalty === 'Pending' && !['Resolved', 'Dismissed'].includes(record.status);

    const suspensionProblem = (data) => {
        if (data.penalty !== 'Suspension') return '';
        if (!data.suspension_span) return 'Choose how long the suspension lasts.';
        if (data.suspension_span === 'days' && (Number(data.suspension_days) < 1 || Number(data.suspension_days) > 7)) {
            return 'Choose 1 to 7 days.';
        }
        if (!String(data.suspension_reason || '').trim()) return 'Explain why the student is suspended.';
        return '';
    };

    const suspensionPayload = (data) => (
        data.penalty === 'Suspension'
            ? {
                suspension_span: data.suspension_span,
                suspension_days: data.suspension_span === 'days' ? Number(data.suspension_days) : undefined,
                suspension_reason: data.suspension_reason,
            }
            : {}
    );

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
                        Record minor and major offenses, performance outcomes, and year-end awards. Only department supervisors and the WSPO coordinator use this record.
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

            <div className="flex flex-wrap gap-2">
                {[
                    ['offenses', 'Offenses'],
                    ['performance', 'Performance'],
                    ['awards', 'Year-end Awards'],
                ].map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setSection(id)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold ${section === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {section !== 'offenses' && (
                <ConductPanels section={section} students={students} records={records} isCoordinator={isCoordinator} />
            )}

            {section === 'offenses' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* LEFT COLUMN: ISSUE VIOLATION FORM */}
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="lg:col-span-1 bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 sticky top-6"
                >
                    <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2 tracking-tight">
                        <Gavel className="w-5 h-5 text-red-600" /> {isCoordinator ? 'Issue Infraction' : 'Report Infraction'}
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
                                    <option key={s.id} value={s.id}>{withHomeDepartmentNote(`${s.name} (${s.profile?.student_id_number || 'No ID'})`, s.profile?.course, s.profile?.assigned_office, s.profile?.year_level)}</option>
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
                                <optgroup label="Minor offenses">
                                    {(offenseCatalog.minor.length ? offenseCatalog.minor : [{ name: 'Tardiness' }]).map((offense) => (
                                        <option key={offense.name} value={offense.name}>{offense.name}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="Major offenses">
                                    {offenseCatalog.major.map((offense) => (
                                        <option key={offense.name} value={offense.name}>{offense.name}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Incident Description</label>
                            <textarea
                                required
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all h-32 resize-none placeholder:text-slate-400"
                                placeholder="Describe the incident in more detail..."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Incident Date</label>
                            <input
                                required
                                type="date"
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all"
                                value={formData.incident_date}
                                onChange={(e) => setFormData({ ...formData, incident_date: e.target.value })}
                            />
                        </div>

                        {isCoordinator ? (
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Penalty Decision</label>
                                <select
                                    required
                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                                    value={formData.penalty}
                                    onChange={(e) => setFormData({ ...formData, penalty: e.target.value })}
                                >
                                    <option value="" disabled>Choose a penalty</option>
                                    <option value="Suspension">Suspension</option>
                                    <option value="DTR Deduction">DTR deduction of duty</option>
                                    <option value="Dismissed">Dismiss infraction</option>
                                </select>
                                <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                                    {formData.penalty === 'Suspension' && 'The student cannot clock in until the suspension ends.'}
                                    {formData.penalty === 'DTR Deduction' && 'These hours are removed from the student\'s official DTR.'}
                                    {formData.penalty === 'Dismissed' && 'No penalty is applied. The infraction is closed as dismissed.'}
                                    {!formData.penalty && 'Suspension, a duty-hour deduction, or dismissal.'}
                                </p>
                            </div>

                            {formData.penalty === 'Suspension' && (
                            <>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Suspension Length</label>
                                <select
                                    required
                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                                    value={formData.suspension_span}
                                    onChange={(e) => setFormData({ ...formData, suspension_span: e.target.value })}
                                >
                                    <option value="" disabled>Choose a length</option>
                                    <option value="days">1–7 days</option>
                                    <option value="2 weeks">2 weeks</option>
                                    <option value="3 weeks">3 weeks</option>
                                    <option value="1 month">1 month</option>
                                </select>
                            </div>
                            {formData.suspension_span === 'days' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Number of Days</label>
                                <select
                                    required
                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                                    value={formData.suspension_days}
                                    onChange={(e) => setFormData({ ...formData, suspension_days: e.target.value })}
                                >
                                    {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                                        <option key={day} value={day}>{day} {day === 1 ? 'day' : 'days'}</option>
                                    ))}
                                </select>
                            </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Why</label>
                                <textarea
                                    required
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all h-24 resize-none placeholder:text-slate-400"
                                    placeholder="Explain why this student is suspended..."
                                    value={formData.suspension_reason}
                                    onChange={(e) => setFormData({ ...formData, suspension_reason: e.target.value })}
                                />
                            </div>
                            </>
                            )}

                            {formData.penalty === 'DTR Deduction' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Hours to Deduct</label>
                                <div className="relative">
                                    <input
                                        required
                                        type="number"
                                        min="0.5"
                                        step="0.5"
                                        className="w-full p-3.5 pr-12 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all"
                                        value={formData.penalty_hours}
                                        onChange={(e) => setFormData({ ...formData, penalty_hours: e.target.value })}
                                    />
                                    <span className="absolute inset-y-0 right-4 flex items-center text-xs font-bold text-slate-400 pointer-events-none">hrs</span>
                                </div>
                            </div>
                            )}

                            {formData.penalty === 'Dismissed' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Dismissal Note</label>
                                <textarea
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all h-24 resize-none placeholder:text-slate-400"
                                    placeholder="Why this infraction is dismissed..."
                                    value={formData.resolution_remarks}
                                    onChange={(e) => setFormData({ ...formData, resolution_remarks: e.target.value })}
                                />
                            </div>
                            )}
                        </div>
                        ) : (
                        <p className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                            The WSPO coordinator will choose suspension, a DTR hour deduction, or dismissal.
                        </p>
                        )}

                        {formError && (
                            <p className="text-sm font-bold text-red-600">{formError}</p>
                        )}

                        <button 
                            type="submit" 
                            disabled={isSubmitting || !formData.student_id || (isCoordinator && !formData.penalty)}
                            className="w-full py-3.5 mt-2 bg-slate-900 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-slate-900/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? 'Saving...' : <><Send className="w-5 h-5" /> {isCoordinator ? 'Issue Infraction' : 'Report Infraction'}</>}
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
                                                record.status === 'Dismissed' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                                                record.penalty === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                'bg-red-50 text-red-700 border-red-200 animate-pulse'
                                            }`}>
                                                {['Resolved', 'Dismissed'].includes(record.status) ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                                {record.penalty === 'Pending' && record.status === 'Active' ? 'Awaiting decision' : (record.status || 'Pending')}
                                            </span>
                                            
                                            <div className="flex flex-col items-end gap-1">
                                                {record.penalty && record.penalty !== 'Pending' && (
                                                    <span className="text-[11px] font-black text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                                                        {record.penalty === 'DTR Deduction' ? 'DTR deduction' : record.penalty}
                                                    </span>
                                                )}
                                                {record.penalty === 'Suspension' && record.suspension_length && (
                                                    <span className="text-[11px] font-black text-red-700 bg-red-100 px-2.5 py-1 rounded-md">
                                                        {record.suspension_length}
                                                    </span>
                                                )}
                                                {record.penalty === 'DTR Deduction' && Number(record.penalty_hours) > 0 && (
                                                    <span className="text-[11px] font-black text-red-700 bg-red-100 px-2.5 py-1 rounded-md">
                                                        -{record.penalty_hours} hrs
                                                    </span>
                                                )}
                                                {Number(record.deduction_amount || 0) > 0 && (
                                                    <span className="text-[11px] font-black text-red-700 bg-red-100 px-2.5 py-1 rounded-md">
                                                        -₱{Number(record.deduction_amount).toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <h4 className="font-black text-slate-900 text-lg leading-tight mb-2 group-hover:text-red-700 transition-colors">
                                            {record.violation_type || 'Standard Violation'}
                                        </h4>
                                        {record.offense_level && (
                                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${record.offense_level === 'major' ? 'text-red-600' : 'text-amber-600'}`}>
                                                {record.offense_level} offense
                                            </p>
                                        )}
                                        <p className="text-sm text-slate-500 font-medium mb-4 line-clamp-3 flex-1">
                                            {record.description || <span className="italic opacity-50">No description provided.</span>}
                                        </p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                                            Incident: {record.incident_date ? new Date(record.incident_date).toLocaleDateString() : new Date(record.created_at).toLocaleDateString()}
                                        </p>
                                        {record.penalty === 'Suspension' && record.suspension_reason && (
                                            <p className="text-xs text-slate-600 font-medium mb-4">
                                                Suspended{record.suspension_ends_at ? ` until ${new Date(record.suspension_ends_at).toLocaleDateString()}` : ''}: {record.suspension_reason}
                                            </p>
                                        )}

                                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
                                                    {(record.student?.name || '?').charAt(0)}
                                                </div>
                                                <span className="truncate max-w-[120px]">{record.student?.name || 'Unknown Student'}</span>
                                                {record.student?.deleted_at && (
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                                        Account deleted
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {needsDecision(record) && (
                                                <button
                                                    onClick={() => openDecide(record)}
                                                    className="px-3 py-1.5 bg-slate-900 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                                                >
                                                    <Gavel className="w-3.5 h-3.5" /> Decide Penalty
                                                </button>
                                            )}
                                            {!needsDecision(record) && record.status !== 'Resolved' && record.status !== 'Dismissed' && (isCoordinator || record.status !== 'Pending Appeal') && (
                                                <button 
                                                    onClick={() => setResolveModal(record)}
                                                    className="px-3 py-1.5 bg-slate-100 hover:bg-emerald-600 text-slate-700 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                                                >
                                                    <Scale className="w-3.5 h-3.5" /> {record.status === 'Pending Appeal' ? 'Decide Appeal' : 'Resolve'}
                                                </button>
                                            )}
                                            {!isCoordinator && record.status === 'Pending Appeal' && (
                                                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Awaiting coordinator</span>
                                            )}
                                        </div>

                                        {record.appeal_notes && (
                                            <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                                                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                    <FileWarning className="w-3 h-3" /> Appeal to Coordinator
                                                </p>
                                                <p className="text-xs text-blue-800 font-medium italic">"{record.appeal_notes}"</p>
                                            </div>
                                        )}

                                        {['Resolved', 'Dismissed'].includes(record.status) && record.resolution_remarks && (
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
            )}

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
                                        {resolveModal.status === 'Pending Appeal'
                                            ? 'The student appealed this case to the WSPO coordinator. Log the official decision below.'
                                            : 'Log official remarks regarding how this disciplinary issue was handled or dismissed.'}
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
                                
                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 flex-wrap">
                                    <button 
                                        onClick={() => setResolveModal(null)} 
                                        className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    {isCoordinator && (
                                        <button
                                            onClick={() => handleResolve('Dismissed')}
                                            disabled={!resolveData.resolution_remarks.trim()}
                                            className="px-5 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl disabled:opacity-50 transition-all"
                                        >
                                            Dismiss Infraction
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleResolve('Resolved')}
                                        disabled={!resolveData.resolution_remarks.trim()}
                                        className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-600/25 disabled:opacity-50 transition-all flex items-center gap-2"
                                    >
                                        <CheckCircle2 className="w-4 h-4" /> {resolveModal.status === 'Pending Appeal' ? 'Keep Penalty' : 'Close Case'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {decideModal && (
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
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col"
                        >
                            <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                    <Gavel className="w-5 h-5 text-red-600" /> Decide Penalty
                                </h3>
                                <button onClick={() => setDecideModal(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 sm:p-8 space-y-4 overflow-y-auto">
                                <p className="text-sm font-bold text-slate-900">{decideModal.violation_type}</p>
                                <p className="text-xs text-slate-500 font-medium">{decideModal.student?.name} — choose suspension, a DTR hour deduction, or dismissal.</p>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Penalty</label>
                                    <select
                                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none"
                                        value={decideData.penalty}
                                        onChange={(e) => setDecideData({ ...decideData, penalty: e.target.value })}
                                    >
                                        <option value="Suspension">Suspension</option>
                                        <option value="DTR Deduction">DTR deduction of duty</option>
                                        <option value="Dismissed">Dismiss infraction</option>
                                    </select>
                                </div>
                                {decideData.penalty === 'Suspension' && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Suspension Length</label>
                                            <select
                                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none"
                                                value={decideData.suspension_span}
                                                onChange={(e) => setDecideData({ ...decideData, suspension_span: e.target.value })}
                                            >
                                                <option value="" disabled>Choose a length</option>
                                                <option value="days">1–7 days</option>
                                                <option value="2 weeks">2 weeks</option>
                                                <option value="3 weeks">3 weeks</option>
                                                <option value="1 month">1 month</option>
                                            </select>
                                        </div>
                                        {decideData.suspension_span === 'days' && (
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Number of Days</label>
                                                <select
                                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none"
                                                    value={decideData.suspension_days}
                                                    onChange={(e) => setDecideData({ ...decideData, suspension_days: e.target.value })}
                                                >
                                                    {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                                                        <option key={day} value={day}>{day} {day === 1 ? 'day' : 'days'}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Why</label>
                                            <textarea
                                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none h-24 resize-none"
                                                placeholder="Explain why this student is suspended..."
                                                value={decideData.suspension_reason}
                                                onChange={(e) => setDecideData({ ...decideData, suspension_reason: e.target.value })}
                                            />
                                        </div>
                                    </>
                                )}
                                {decideData.penalty === 'DTR Deduction' && (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Hours to Deduct</label>
                                        <input
                                            type="number"
                                            min="0.5"
                                            step="0.5"
                                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none"
                                            value={decideData.penalty_hours}
                                            onChange={(e) => setDecideData({ ...decideData, penalty_hours: e.target.value })}
                                        />
                                    </div>
                                )}
                                {decideData.penalty === 'Dismissed' && (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Dismissal Note</label>
                                        <textarea
                                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none h-24 resize-none"
                                            value={decideData.resolution_remarks}
                                            onChange={(e) => setDecideData({ ...decideData, resolution_remarks: e.target.value })}
                                        />
                                    </div>
                                )}
                                {decideError && <p className="text-sm font-bold text-red-600">{decideError}</p>}
                                <div className="flex justify-end gap-3 pt-2">
                                    <button onClick={() => setDecideModal(null)} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancel</button>
                                    <button
                                        onClick={handleDecide}
                                        disabled={isSubmitting}
                                        className="px-6 py-2.5 text-sm font-bold text-white bg-slate-900 hover:bg-red-600 rounded-xl disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Saving...' : 'Save Decision'}
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
