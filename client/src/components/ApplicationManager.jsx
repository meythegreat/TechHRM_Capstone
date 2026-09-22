import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
    getAllApplications,
    updateApplicationStatus,
    updateApplicationSchedule,
    getMatchingSuggestions,
    assignPlacement,
    deleteApplication,
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
    Target,
    FileText,
    Search,
    Eye,
    Mail,
    Phone,
    Copy,
    XCircle,
    Trash2,
} from 'lucide-react';
import { openSecureFile } from '../utils/secureFile';

const UNIVERSITY_OFFICES = [
    "University President", "Quality Assurance", "Human Resource Development Center", "Office of the Student Affairs", "University Chaplain", "Alumni Affairs", "VP-Administration", "Superintendent Buildings & Grounds / Officer Pollution Control", "Security Office", "Safety and Disaster Management", "Sports", "Socio-Cultural", "WSPO", "Health Services", "General Services", "Mass Media", "ICT Services Office", "Higher Education Laboratory", "VP-Academic Affairs", "Graduate School", "College of Arts and Sciences", "College of Business and Accountancy", "College of Computer Studies", "College of Criminal Justice Education", "College of Electronic Engineering", "College of Hospitality and Tourism Management", "College of Nursing", "College of Teacher Education", "Kindergarten/Elementary", "High School", "University Registrar", "Director of Libraries", "Guidance & Counselling Center", "NSTP", "VP-REIID", "International Program Office", "Community Extension", "Research", "VP-Finance", "Accountant/Budget Officer", "Business Manager", "Property Custodian", "University Enterprise"
];

const PIPELINE_STAGES = ['Pending', 'Interview', 'Training', 'For Result', 'Approved'];
const STAGE_ORDER = PIPELINE_STAGES;

const COLUMN_CONFIG = {
    'Pending': { icon: Clock, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600' },
    'Interview': { icon: CalendarCheck, color: 'text-amber-600', bg: 'bg-amber-50/50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
    'Training': { icon: BookOpen, color: 'text-purple-600', bg: 'bg-purple-50/50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
    'For Result': { icon: FileSignature, color: 'text-blue-600', bg: 'bg-blue-50/50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
    'Approved': { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50/50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
};

const canRemove = (status) => status !== 'Approved';

const getNextStage = (status) => {
    const index = PIPELINE_STAGES.indexOf(status);
    if (index === -1 || index >= PIPELINE_STAGES.length - 1) return null;
    return PIPELINE_STAGES[index + 1];
};

const ApplicationManager = () => {
    const [applications, setApplications] = useState([]);
    const [modalView, setModalView] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [placementData, setPlacementData] = useState({ assigned_department: '' });
    const [departmentSupervisors, setDepartmentSupervisors] = useState({});
    const [interviewData, setInterviewData] = useState({ interview_date: '', interview_remarks: '' });
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [issuedCredentials, setIssuedCredentials] = useState(null);
    const [copiedField, setCopiedField] = useState(null);

    useEffect(() => {
        fetchApplications();
        fetch('/api/departments', { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } })
            .then(res => res.ok ? res.json() : [])
            .then(setDepartments)
            .catch(() => setDepartments([]));
        axios.get('/api/department-supervisors')
            .then((response) => setDepartmentSupervisors(response.data || {}))
            .catch(() => setDepartmentSupervisors({}));
    }, []);

    const supervisorLabelForOffice = (office) => {
        if (!office) return 'No supervisor assigned';
        const names = departmentSupervisors[office] || [];
        return names.length > 0 ? names.join(', ') : 'No supervisor assigned';
    };

    const fetchApplications = async () => {
        setIsLoading(true);
        try {
            setError(null);
            const res = await getAllApplications();
            const payload = res.data;
            setApplications(Array.isArray(payload) ? payload : (payload?.data || []));
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
            setPlacementData({
                assigned_department: app.preferred_department || '',
            });
            await loadSuggestions(app.id);
            setModalView('placement');
            return;
        }

        setModalView('');
        setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: next } : a));
        try {
            await updateApplicationStatus(app.id, { status: next });
            fetchApplications();
        } catch (err) {
            fetchApplications(); // Revert on failure
        }
    };

    const handleDecline = (app) => {
        if (!canRemove(app.status)) return;
        setSelectedApp(app);
        setModalView('decline');
    };

    const handleDelete = (app) => {
        if (!canRemove(app.status)) return;
        setSelectedApp(app);
        setModalView('delete');
    };

    const submitRemove = async () => {
        if (!selectedApp) return;
        try {
            await deleteApplication(selectedApp.id);
            setApplications((prev) => prev.filter((a) => a.id !== selectedApp.id));
            setModalView('');
            setError(null);
        } catch (err) {
            setError(err.response?.data?.message || Object.values(err.response?.data?.errors || {}).flat()[0] || 'Failed to remove this applicant.');
        }
    };

    const submitInterview = async () => {
        if (!interviewData.interview_date) {
            setError('Please choose an interview date and time.');
            return;
        }

        try {
            await updateApplicationSchedule(selectedApp.id, {
                interview_date: interviewData.interview_date,
                interview_remarks: interviewData.interview_remarks || null,
            });
            setApplications((prev) => prev.map((a) => a.id === selectedApp.id
                ? { ...a, status: 'Interview', interview_date: interviewData.interview_date, interview_remarks: interviewData.interview_remarks }
                : a));
            setInterviewData({ interview_date: '', interview_remarks: '' });
            setModalView('');
            setError(null);
            fetchApplications();
        } catch (err) {
            setError(err.response?.data?.message || Object.values(err.response?.data?.errors || {}).flat()[0] || 'Failed to schedule the interview.');
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
        setPlacementData({ assigned_department: dept });
    };

    const submitPlacement = async () => {
        if (!placementData.assigned_department) {
            setError('Select a department before approving.');
            return;
        }

        try {
            const res = await assignPlacement(selectedApp.id, {
                assigned_department: placementData.assigned_department,
            });
            setApplications((prev) => prev.map((a) => a.id === selectedApp.id ? { ...a, status: 'Approved' } : a));
            setIssuedCredentials(res.data.credentials || null);
            setPlacementData({ assigned_department: '' });
            setModalView('');
            setError(null);
            fetchApplications();
        } catch (err) {
            setError(err.response?.data?.message || Object.values(err.response?.data?.errors || {}).flat()[0] || 'Failed to approve this applicant.');
        }
    };

    const copyCredential = (text, field) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const officeOptions = Array.from(new Set([
        ...(departments.length > 0 ? departments.map((department) => department.name) : UNIVERSITY_OFFICES),
        ...suggestions.map((item) => item.department),
        placementData.assigned_department,
        selectedApp?.preferred_department,
    ].filter(Boolean)));

    const activeCount = applications.filter(a => a.status !== 'Approved' && a.status !== 'Rejected').length;
    const filteredApplications = applications.filter((app) => {
        const haystack = [
            app.first_name,
            app.last_name,
            app.email,
            app.course,
            app.preferred_department,
            app.contact_number,
            app.status,
        ].join(' ').toLowerCase();
        return haystack.includes(searchQuery.trim().toLowerCase());
    });

    const openApplicant = (app) => {
        setSelectedApp(app);
        setModalView('details');
    };

    const nextStageButton = (app, variant = 'table') => {
        const next = getNextStage(app.status);
        if (!next) return null;

        const styles = variant === 'primary'
            ? 'inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/20'
            : variant === 'card'
                ? 'w-full flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors'
                : 'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl';

        return (
            <button
                type="button"
                onClick={() => handleStatusUpdate(app)}
                className={styles}
            >
                Move to {next}
                <ChevronRight className="w-3.5 h-3.5" />
            </button>
        );
    };

    const declineButton = (app, variant = 'table') => {
        if (!canRemove(app.status)) return null;

        const styles = variant === 'primary'
            ? 'inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-xl'
            : variant === 'card'
                ? 'w-full flex items-center justify-center gap-1 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-100 transition-colors'
                : 'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-xl';

        return (
            <button
                type="button"
                onClick={() => handleDecline(app)}
                className={styles}
            >
                <XCircle className="w-3.5 h-3.5" /> Decline
            </button>
        );
    };

    const deleteButton = (app, variant = 'table') => {
        if (!canRemove(app.status)) return null;

        const styles = variant === 'primary'
            ? 'inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl'
            : variant === 'card'
                ? 'w-full flex items-center justify-center gap-1 px-3 py-2 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl border border-slate-200 transition-colors'
                : 'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl';

        return (
            <button
                type="button"
                onClick={() => handleDelete(app)}
                className={styles}
            >
                <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
        );
    };

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
                        Applicant Sign-ups
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Review every student who applied to the Work-Study Program, open their documents, and move them through placement.
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                        <UserPlus className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Sign-ups</span>
                        <span className="text-sm font-extrabold text-blue-400">
                            {applications.length} Applicant(s)
                        </span>
                    </div>
                </div>
            </motion.div>

            {error && (
                <div className="p-4 bg-red-50 text-red-700 font-bold rounded-xl border border-red-200">
                    {error}
                </div>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-black text-slate-900">All applicants</h2>
                        <p className="text-sm text-slate-500 font-medium">{activeCount} still in review</p>
                    </div>
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search name, email, or department..."
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-5 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Applicant</th>
                                <th className="px-5 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Preferred Dept</th>
                                <th className="px-5 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Documents</th>
                                <th className="px-5 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-5 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredApplications.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400 font-bold">No applicants found.</td>
                                </tr>
                            ) : (
                                filteredApplications.map((app) => (
                                    <tr key={app.id} className="hover:bg-slate-50">
                                        <td className="px-5 py-4">
                                            <p className="font-bold text-slate-900">{app.first_name} {app.last_name}</p>
                                            <p className="text-xs font-medium text-slate-500">{app.email || 'No email'} · {app.course || 'No course'}</p>
                                        </td>
                                        <td className="px-5 py-4 text-sm font-semibold text-slate-700">{app.preferred_department || '—'}</td>
                                        <td className="px-5 py-4 text-sm font-semibold text-indigo-700">{(app.documents || []).length}</td>
                                        <td className="px-5 py-4">
                                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">{app.status}</span>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openApplicant(app)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl"
                                                >
                                                    <Eye className="w-3.5 h-3.5" /> View
                                                </button>
                                                {declineButton(app)}
                                                {deleteButton(app)}
                                                {nextStageButton(app)}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* KANBAN BOARD */}
            <div className="flex overflow-x-auto gap-5 pb-8 custom-scrollbar items-start">
                {STAGE_ORDER.map(stage => {
                    const columnApps = applications.filter(app => app.status === stage);
                    const config = COLUMN_CONFIG[stage] || COLUMN_CONFIG['Pending'];
                    const Icon = config.icon;

                    return (
                        <div key={stage} className={`flex flex-col rounded-3xl border ${config.border} ${config.bg} shadow-sm min-w-[300px] w-[300px] shrink-0`}>
                            
                            {/* Column Header */}
                            <div className="p-4 border-b border-slate-200/50 flex items-center justify-between bg-white/70 rounded-t-3xl shrink-0">
                                <h3 className={`font-extrabold text-sm flex items-center gap-2 ${config.color}`}>
                                    <Icon className="w-4 h-4" />
                                    {stage}
                                </h3>
                                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${config.badge}`}>
                                    {columnApps.length}
                                </span>
                            </div>

                            {/* Column Body (Cards) */}
                            <div className="p-3 flex flex-col gap-3 min-h-[180px]">
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
                                                className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all"
                                            >
                                                <h4 className="font-bold text-slate-900 leading-tight mb-1 truncate">
                                                    {app.first_name} {app.last_name}
                                                </h4>
                                                <p className="text-xs font-medium text-slate-500 mb-2 truncate">
                                                    {app.course} • Yr {app.year_level}
                                                </p>
                                                <p className="text-[11px] font-semibold text-indigo-700 mb-3">
                                                    {(app.documents || []).length} document{(app.documents || []).length === 1 ? '' : 's'} submitted
                                                </p>
                                                
                                                {stage === 'Interview' && app.interview_date && (
                                                    <div className="mb-3 px-2.5 py-1.5 bg-amber-50 rounded-lg border border-amber-100 flex items-center gap-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-widest">
                                                        <Calendar className="w-3 h-3" />
                                                        {new Date(app.interview_date).toLocaleDateString()}
                                                    </div>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => openApplicant(app)}
                                                    className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 text-xs font-bold rounded-xl transition-colors"
                                                >
                                                    <Eye className="w-3.5 h-3.5 shrink-0" /> View application
                                                </button>
                                                {(canRemove(app.status) || getNextStage(app.status)) && (
                                                    <div className="flex flex-col gap-2">
                                                        {nextStageButton(app, 'card')}
                                                        {declineButton(app, 'card')}
                                                        {deleteButton(app, 'card')}
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

            <AnimatePresence>
                {(modalView === 'decline' || modalView === 'delete') && selectedApp && (
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
                            <div className="p-6 sm:p-8 border-b border-red-100 bg-red-50 flex justify-between items-center">
                                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                    {modalView === 'delete' ? <Trash2 className="w-5 h-5 text-red-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                                    {modalView === 'delete' ? 'Delete Applicant' : 'Decline Applicant'}
                                </h3>
                                <button onClick={() => setModalView('')} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-red-100 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 sm:p-8 space-y-5">
                                <p className="text-sm font-medium text-slate-600">
                                    {modalView === 'delete' ? 'Delete' : 'Decline'} <span className="font-black text-slate-900">{selectedApp.first_name} {selectedApp.last_name}</span>? Their signup, documents, and unused student account will be removed permanently.
                                </p>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button type="button" onClick={() => setModalView('')} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl">
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={submitRemove}
                                        className="px-6 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-lg shadow-red-600/25 flex items-center gap-2"
                                    >
                                        {modalView === 'delete' ? <Trash2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                        {modalView === 'delete' ? 'Confirm Delete' : 'Confirm Decline'}
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
                                        Deploying <span className="font-black text-slate-900">{selectedApp.first_name} {selectedApp.last_name}</span>. Approving this applicant will issue a one-time login password.
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
                                        <select
                                            value={placementData.assigned_department}
                                            onChange={(e) => setPlacementData({ ...placementData, assigned_department: e.target.value })}
                                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all placeholder:text-slate-400"
                                        >
                                            <option value="">-- Select the assigned department --</option>
                                            {officeOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                                        </select>
                                        {placementData.assigned_department && (
                                            <p className="mt-2 text-xs font-semibold text-indigo-700">
                                                Supervisor: {supervisorLabelForOffice(placementData.assigned_department)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                                <button onClick={() => setModalView('')} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors">
                                    Cancel
                                </button>
                                <button
                                    onClick={submitPlacement}
                                    disabled={!placementData.assigned_department}
                                    className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl shadow-lg shadow-emerald-500/25 disabled:opacity-50 transition-all flex items-center gap-2"
                                >
                                    <Briefcase className="w-4 h-4" /> Deploy & Approve
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {modalView === 'details' && selectedApp && (
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
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-blue-600" /> Applicant Profile
                                </h3>
                                <button onClick={() => setModalView('')} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 sm:p-8 space-y-6 overflow-y-auto">
                                <div>
                                    <h4 className="text-2xl font-black text-slate-900">{selectedApp.first_name} {selectedApp.middle_name} {selectedApp.last_name}</h4>
                                    <p className="text-sm font-bold text-blue-700 mt-1">{selectedApp.status}</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="flex items-start gap-2">
                                        <Mail className="w-4 h-4 text-slate-400 mt-0.5" />
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Email</p>
                                            <p className="text-sm font-bold text-slate-800">{selectedApp.email || '—'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Contact</p>
                                            <p className="text-sm font-bold text-slate-800">{selectedApp.contact_number || '—'}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Course / Year</p>
                                        <p className="text-sm font-bold text-slate-800">{selectedApp.course || '—'} · {selectedApp.year_level || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Preferred Department</p>
                                        <p className="text-sm font-bold text-slate-800">{selectedApp.preferred_department || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Age</p>
                                        <p className="text-sm font-bold text-slate-800">{selectedApp.age || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Gender</p>
                                        <p className="text-sm font-bold text-slate-800">{selectedApp.gender || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Address</p>
                                        <p className="text-sm font-bold text-slate-800">{selectedApp.address || '—'}</p>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Available Days</p>
                                    <p className="text-sm font-bold text-slate-800">{(selectedApp.available_schedules || []).join(', ') || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Reason for Applying</p>
                                    <p className="text-sm font-medium text-slate-700 leading-relaxed">{selectedApp.reason_for_applying || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Submitted Documents</p>
                                    {(selectedApp.documents || []).length === 0 ? (
                                        <p className="text-sm font-bold text-slate-400">No documents were attached.</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {selectedApp.documents.map((doc) => (
                                                <li key={doc.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => openSecureFile(doc.file_path)}
                                                        className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                                                    >
                                                        <p className="text-sm font-bold text-slate-800 truncate">{doc.original_name}</p>
                                                        <p className="text-[11px] font-medium text-blue-600 mt-1">Open file</p>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                            {getNextStage(selectedApp.status) || canRemove(selectedApp.status) ? (
                                <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-wrap justify-end gap-3 shrink-0">
                                    {deleteButton(selectedApp, 'primary')}
                                    {declineButton(selectedApp, 'primary')}
                                    {nextStageButton(selectedApp, 'primary')}
                                </div>
                            ) : null}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {issuedCredentials && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                        >
                            <div className="p-6 sm:p-8 border-b border-emerald-100 bg-emerald-50 text-center">
                                <div className="w-14 h-14 mx-auto mb-3 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                    <CheckCircle2 className="w-7 h-7" />
                                </div>
                                <h3 className="text-xl font-black text-slate-900">Applicant Approved</h3>
                                <p className="text-sm font-medium text-emerald-800 mt-2">{issuedCredentials.name} can now log in with these credentials.</p>
                            </div>
                            <div className="p-6 sm:p-8 space-y-4">
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Username / Email</label>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-base font-black text-indigo-700 select-all truncate">{issuedCredentials.username}</span>
                                        <button type="button" onClick={() => copyCredential(issuedCredentials.username, 'username')} className="p-2 bg-white border border-slate-200 rounded-lg">
                                            {copiedField === 'username' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Temporary Password</label>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-base font-black text-slate-900 select-all">{issuedCredentials.password}</span>
                                        <button type="button" onClick={() => copyCredential(issuedCredentials.password, 'password')} className="p-2 bg-white border border-slate-200 rounded-lg">
                                            {copiedField === 'password' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
                                    Share these credentials with the student. The password is shown only once.
                                </p>
                                <button type="button" onClick={() => setIssuedCredentials(null)} className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl">
                                    Done
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
