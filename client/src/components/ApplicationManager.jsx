import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getAllApplications,
    updateApplicationStatus,
    updateApplicationSchedule,
    getMatchingSuggestions,
    assignPlacement,
} from '../services/applicationService';
import { 
    Users, 
    UserPlus, 
    Clock, 
    CalendarCheck, 
    BookOpen, 
    FileSignature, 
    CheckCircle2, 
    ChevronRight, 
    X, 
    Calendar,
    Briefcase,
    Target
} from 'lucide-react';

const STAGE_ORDER = ['Pending', 'Interview', 'Training', 'For Result', 'Approved'];

const COLUMN_CONFIG = {
    'Pending': { icon: Clock, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600' },
    'Interview': { icon: CalendarCheck, color: 'text-amber-600', bg: 'bg-amber-50/50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
    'Training': { icon: BookOpen, color: 'text-purple-600', bg: 'bg-purple-50/50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
    'For Result': { icon: FileSignature, color: 'text-blue-600', bg: 'bg-blue-50/50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
    'Approved': { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50/50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' }
};

const getNextStage = (status) => {
    const index = STAGE_ORDER.indexOf(status);
    if (index === -1 || index >= STAGE_ORDER.length - 1) return null;
    return STAGE_ORDER[index + 1];
};

const getTemporaryPassword = (lastName) => {
    if (!lastName) return '';
    const normalizedLastName = lastName.toLowerCase();
    return `FCU${normalizedLastName.charAt(0).toUpperCase()}${normalizedLastName.slice(1)}`;
};

const ApplicationManager = () => {
    const [applications, setApplications] = useState([]);
    const [modalView, setModalView] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [placementData, setPlacementData] = useState({ assigned_department: '', assigned_position: '' });
    const [interviewData, setInterviewData] = useState({ interview_date: '', interview_remarks: '' });
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { fetchApplications(); }, []);

    const fetchApplications = async () => {
        setIsLoading(true);
        try {
            setError(null);
            const res = await getAllApplications();
            setApplications(res.data);
        } catch (err) {
            setError('Failed to fetch applications');
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatusUpdate = async (app) => {
        const next = getNextStage(app.status);
        if (!next) return;

        if (next === 'Interview') {
            setSelectedApp(app);
            setModalView('interview');
            return;
        }

        if (next === 'Approved') {
            setSelectedApp(app);
            await loadSuggestions(app.id);
            setModalView('placement');
            return;
        }

        // Optimistic Update
        setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: next } : a));
        try {
            await updateApplicationStatus(app.id, { status: next });
            fetchApplications();
        } catch (err) {
            fetchApplications(); // Revert on failure
        }
    };

    const submitInterview = async () => {
        if (!interviewData.interview_date) return;
        
        // Optimistic Update
        setApplications(prev => prev.map(a => a.id === selectedApp.id ? { ...a, status: 'Interview', interview_date: interviewData.interview_date } : a));
        setModalView('');
        
        try {
            await updateApplicationStatus(selectedApp.id, { status: 'Interview' });
            await updateApplicationSchedule(selectedApp.id, interviewData);
            setInterviewData({ interview_date: '', interview_remarks: '' });
            fetchApplications();
        } catch (err) {
            fetchApplications(); // Revert
        }
    };

    const loadSuggestions = async (appId) => {
        try {
            const res = await getMatchingSuggestions(appId);
            setSuggestions(res.data.suggestions || []);
        } catch (err) {
            console.error("Failed to load suggestions");
            setSuggestions([]);
        }
    };

    const handleSelectSuggestion = (dept) => {
        setPlacementData({ assigned_department: dept, assigned_position: 'Student Assistant' });
    };

    const submitPlacement = async () => {
        if (!placementData.assigned_department || !placementData.assigned_position) return;
        
        // Optimistic Update
        setApplications(prev => prev.map(a => a.id === selectedApp.id ? { ...a, status: 'Approved' } : a));
        setModalView('');

        try {
            const payload = {
                status: 'Approved',
                department_id: placementData.assigned_department,
                position_assignment: placementData.assigned_position
            };
            await assignPlacement(selectedApp.id, payload);
            setPlacementData({ assigned_department: '', assigned_position: '' });
            fetchApplications();
        } catch (err) {
            fetchApplications(); // Revert
        }
    };

    const activeCount = applications.filter(a => a.status !== 'Approved' && a.status !== 'Rejected').length;

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                <p className="text-slate-500 font-bold animate-pulse">Loading application pipeline...</p>
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto space-y-8 font-sans p-4 sm:p-8">
            
            {/* DARK THEME HEADER - PIPELINE MANAGER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Glowing Orbs */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Recruitment & Placement</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Applicant Pipeline
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Manage prospective student workers from initial application to final department deployment.
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                        <UserPlus className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Pipeline</span>
                        <span className="text-sm font-extrabold text-blue-400">
                            {activeCount} Candidate(s)
                        </span>
                    </div>
                </div>
            </motion.div>

            {error && (
                <div className="p-4 bg-red-50 text-red-700 font-bold rounded-xl border border-red-200">
                    {error}
                </div>
            )}

            {/* KANBAN BOARD */}
            <div className="flex overflow-x-auto gap-6 pb-8 custom-scrollbar items-start">
                {STAGE_ORDER.map(stage => {
                    const columnApps = applications.filter(app => app.status === stage);
                    const config = COLUMN_CONFIG[stage] || COLUMN_CONFIG['Pending'];
                    const Icon = config.icon;

                    return (
                        <div key={stage} className={`flex flex-col rounded-3xl border ${config.border} ${config.bg} overflow-hidden shadow-sm min-w-[320px] max-w-[320px] shrink-0 h-[650px]`}>
                            
                            {/* Column Header */}
                            <div className="p-5 border-b border-slate-200/50 flex items-center justify-between bg-white/50 backdrop-blur-sm">
                                <h3 className={`font-extrabold text-base flex items-center gap-2 ${config.color}`}>
                                    <Icon className="w-5 h-5" />
                                    {stage}
                                </h3>
                                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${config.badge}`}>
                                    {columnApps.length}
                                </span>
                            </div>

                            {/* Column Body (Cards) */}
                            <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                                <AnimatePresence>
                                    {columnApps.length === 0 ? (
                                        <motion.div 
                                            initial={{ opacity: 0 }} 
                                            animate={{ opacity: 1 }} 
                                            className="m-auto flex flex-col items-center justify-center text-center p-6 text-slate-400"
                                        >
                                            <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center mb-2">
                                                <UserPlus className="w-5 h-5 text-slate-300" />
                                            </div>
                                            <p className="text-sm font-bold">Empty</p>
                                        </motion.div>
                                    ) : (
                                        columnApps.map(app => (
                                            <motion.div
                                                layout
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                                key={app.id}
                                                className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all group relative overflow-hidden"
                                            >
                                                <h4 className="font-bold text-slate-900 leading-tight mb-1 group-hover:text-blue-700 transition-colors truncate">
                                                    {app.first_name} {app.last_name}
                                                </h4>
                                                <p className="text-xs font-medium text-slate-500 mb-3 truncate">
                                                    {app.course} • Yr {app.year_level}
                                                </p>
                                                
                                                {stage === 'Interview' && app.interview_date && (
                                                    <div className="mb-3 px-2.5 py-1.5 bg-amber-50 rounded-lg border border-amber-100 flex items-center gap-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-widest">
                                                        <Calendar className="w-3 h-3" />
                                                        {new Date(app.interview_date).toLocaleDateString()}
                                                    </div>
                                                )}
                                                
                                                {getNextStage(stage) && (
                                                    <div className="pt-3 border-t border-slate-100 mt-2">
                                                        <button 
                                                            onClick={() => handleStatusUpdate(app)}
                                                            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 text-xs font-bold rounded-xl transition-colors group/btn border border-transparent hover:border-blue-200"
                                                        >
                                                            Move to {getNextStage(stage)}
                                                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover/btn:text-blue-600 group-hover/btn:translate-x-0.5 transition-all" />
                                                        </button>
                                                    </div>
                                                )}
                                            </motion.div>
                                        ))
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* INTERVIEW MODAL */}
            <AnimatePresence>
                {modalView === 'interview' && selectedApp && (
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
                                    <Calendar className="w-5 h-5 text-blue-600" /> Schedule Interview
                                </h3>
                                <button onClick={() => setModalView('')} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 sm:p-8 space-y-5">
                                <p className="text-sm font-medium text-slate-600">
                                    Set the interview schedule for <span className="font-black text-slate-900">{selectedApp.first_name} {selectedApp.last_name}</span>.
                                </p>
                                
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Interview Date & Time</label>
                                    <input
                                        type="datetime-local"
                                        value={interviewData.interview_date}
                                        onChange={(e) => setInterviewData({ ...interviewData, interview_date: e.target.value })}
                                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all cursor-pointer"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Remarks / Room Link</label>
                                    <textarea
                                        rows={3}
                                        value={interviewData.interview_remarks}
                                        onChange={(e) => setInterviewData({ ...interviewData, interview_remarks: e.target.value })}
                                        placeholder="e.g. Please proceed to the WSPO Office..."
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all resize-none"
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                    <button onClick={() => setModalView('')} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
                                        Cancel
                                    </button>
                                    <button
                                        onClick={submitInterview}
                                        disabled={!interviewData.interview_date}
                                        className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/25 disabled:opacity-50 transition-all flex items-center gap-2"
                                    >
                                        <CheckCircle2 className="w-4 h-4" /> Confirm Schedule
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* PLACEMENT MODAL */}
            <AnimatePresence>
                {modalView === 'placement' && selectedApp && (
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
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                    <Target className="w-5 h-5 text-emerald-600" /> Finalize Placement
                                </h3>
                                <button onClick={() => setModalView('')} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 sm:p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                                <div>
                                    <p className="text-sm font-medium text-slate-600">
                                        Deploying <span className="font-black text-slate-900">{selectedApp.first_name} {selectedApp.last_name}</span>.
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                        Temp Password: <span className="text-blue-600">{getTemporaryPassword(selectedApp.last_name)}</span>
                                    </p>
                                </div>

                                {suggestions.length > 0 && (
                                    <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
                                        <label className="block text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-3">AI Matching Suggestions</label>
                                        <div className="space-y-2">
                                            {suggestions.map((s, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => handleSelectSuggestion(s.department)}
                                                    className="w-full text-left p-3 rounded-xl border border-blue-200 bg-white hover:border-blue-400 hover:shadow-sm transition-all"
                                                >
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="font-bold text-slate-900">{s.department}</span>
                                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded uppercase tracking-wider">{s.match_score}% Match</span>
                                                    </div>
                                                    <span className="text-xs text-slate-500 font-medium">{s.reason}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Final Department</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. CCS Office"
                                            value={placementData.assigned_department}
                                            onChange={(e) => setPlacementData({ ...placementData, assigned_department: e.target.value })}
                                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all placeholder:text-slate-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Position Assignment</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Student Assistant"
                                            value={placementData.assigned_position}
                                            onChange={(e) => setPlacementData({ ...placementData, assigned_position: e.target.value })}
                                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all placeholder:text-slate-400"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                                <button onClick={() => setModalView('')} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors">
                                    Cancel
                                </button>
                                <button
                                    onClick={submitPlacement}
                                    disabled={!placementData.assigned_department || !placementData.assigned_position}
                                    className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl shadow-lg shadow-emerald-500/25 disabled:opacity-50 transition-all flex items-center gap-2"
                                >
                                    <Briefcase className="w-4 h-4" /> Deploy & Approve
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ApplicationManager;