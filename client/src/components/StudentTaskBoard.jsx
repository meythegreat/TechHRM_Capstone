import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMyTasks, updateTaskStatus } from '../services/taskService';
import { 
    ClipboardList, 
    Clock, 
    PlayCircle, 
    CheckCircle2, 
    FileText, 
    X, 
    Calendar,
    Check,
    Briefcase
} from 'lucide-react';

const COLUMNS = ['Pending', 'In Progress', 'Completed'];

// Visual configuration for each column to make them distinct
const COLUMN_CONFIG = {
    'Pending': { icon: Clock, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600' },
    'In Progress': { icon: PlayCircle, color: 'text-blue-600', bg: 'bg-blue-50/50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700 animate-pulse' },
    'Completed': { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50/50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' }
};

const StudentTaskBoard = () => {
    const [tasks, setTasks] = useState([]);
    const [logModal, setLogModal] = useState(null); // stores the task object
    const [completionLog, setCompletionLog] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { fetchTasks(); }, []);

    const fetchTasks = async () => {
        try {
            const res = await getMyTasks();
            setTasks(res.data);
        } catch (err) {
            console.error('Failed to load tasks', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatusUpdate = async (task, newStatus) => {
        if (newStatus === 'Completed') {
            setLogModal(task);
            setCompletionLog('');
        } else {
            // Optimistic UI update for smoother animation
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
            await updateTaskStatus(task.id, { status: newStatus });
            fetchTasks();
        }
    };

    const submitCompletion = async () => {
        if (!completionLog.trim() || !logModal) return;
        
        const taskId = logModal.id;
        
        // Optimistic UI update
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'Completed', completion_log: completionLog } : t));
        setLogModal(null);
        setCompletionLog('');
        
        await updateTaskStatus(taskId, { status: 'Completed', completion_log: completionLog });
        fetchTasks();
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                <p className="text-slate-500 font-bold animate-pulse">Loading your task board...</p>
            </div>
        );
    }

    const activeTasksCount = tasks.filter(t => t.status === 'Pending' || t.status === 'In Progress').length;

    return (
        <div className="max-w-7xl mx-auto font-sans space-y-6">
            
            {/* DARK THEME HEADER - TASK BOARD */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Subtle blue/indigo glow for task context */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <ClipboardList className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Duty Assignment</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        My Task Board
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Manage your assigned duties. Move tasks to "In Progress" when you start them, and submit a completion log when you finish.
                    </p>
                </div>

                {/* Dynamic Status Box */}
                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activeTasksCount > 0 ? 'bg-amber-500/20 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'}`}>
                        {activeTasksCount > 0 ? <Clock className="w-5 h-5 animate-pulse" /> : <CheckCircle2 className="w-5 h-5" />}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Workload Status</span>
                        <span className={`text-sm font-extrabold ${activeTasksCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {activeTasksCount > 0 ? `${activeTasksCount} Active Task(s)` : 'All Caught Up!'}
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* KANBAN BOARD */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                {COLUMNS.map((columnName) => {
                    const columnTasks = tasks.filter(t => t.status === columnName);
                    const config = COLUMN_CONFIG[columnName];
                    const Icon = config.icon;

                    return (
                        <div key={columnName} className={`flex flex-col rounded-3xl border ${config.border} ${config.bg} overflow-hidden shadow-sm h-full min-h-[500px]`}>
                            
                            {/* Column Header */}
                            <div className="p-5 border-b border-slate-200/50 flex items-center justify-between bg-white/50 backdrop-blur-sm">
                                <h3 className={`font-extrabold text-base flex items-center gap-2 ${config.color}`}>
                                    <Icon className="w-5 h-5" />
                                    {columnName}
                                </h3>
                                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${config.badge}`}>
                                    {columnTasks.length}
                                </span>
                            </div>

                            {/* Column Body (Task Cards) */}
                            <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                                <AnimatePresence>
                                    {columnTasks.length === 0 ? (
                                        <motion.div 
                                            initial={{ opacity: 0 }} 
                                            animate={{ opacity: 1 }} 
                                            className="m-auto flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl"
                                        >
                                            <Briefcase className="w-8 h-8 text-slate-300 mb-2" />
                                            <p className="text-sm font-bold text-slate-400">No tasks here</p>
                                        </motion.div>
                                    ) : (
                                        columnTasks.map((task) => (
                                            <motion.div
                                                layout // THIS makes the card animate between columns!
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                                key={task.id}
                                                className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all group"
                                            >
                                                <h4 className="font-bold text-slate-900 leading-tight mb-2 group-hover:text-blue-700 transition-colors">
                                                    {task.title || 'Untitled Task'}
                                                </h4>
                                                
                                                {task.description && (
                                                    <p className="text-xs text-slate-500 font-medium mb-4 line-clamp-2">
                                                        {task.description}
                                                    </p>
                                                )}

                                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {task.date || new Date().toLocaleDateString()}
                                                </div>

                                                {/* Action Buttons based on status */}
                                                <div className="pt-4 border-t border-slate-100 flex justify-end">
                                                    {columnName === 'Pending' && (
                                                        <button 
                                                            onClick={() => handleStatusUpdate(task, 'In Progress')}
                                                            className="w-full flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-bold rounded-lg transition-colors"
                                                        >
                                                            <PlayCircle className="w-4 h-4" /> Start Task
                                                        </button>
                                                    )}
                                                    {columnName === 'In Progress' && (
                                                        <button 
                                                            onClick={() => handleStatusUpdate(task, 'Completed')}
                                                            className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-100 hover:bg-emerald-600 hover:text-white text-blue-700 text-xs font-bold rounded-lg transition-colors"
                                                        >
                                                            <CheckCircle2 className="w-4 h-4" /> Mark Complete
                                                        </button>
                                                    )}
                                                    {columnName === 'Completed' && (
                                                        <span className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-lg cursor-default">
                                                            <Check className="w-4 h-4" /> Completed
                                                        </span>
                                                    )}
                                                </div>
                                            </motion.div>
                                        ))
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* COMPLETION LOG MODAL */}
            <AnimatePresence>
                {logModal && (
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
                                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                    <FileText className="w-6 h-6 text-blue-600" />
                                    Submit Completion Log
                                </h3>
                                <button 
                                    onClick={() => setLogModal(null)}
                                    className="p-2 bg-slate-200/50 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 sm:p-8 space-y-6">
                                <div>
                                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Task Details</p>
                                    <p className="font-bold text-slate-900">{logModal.title || 'Selected Task'}</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Accomplishment Report
                                    </label>
                                    <textarea
                                        autoFocus
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all h-32 resize-none"
                                        value={completionLog}
                                        onChange={(e) => setCompletionLog(e.target.value)}
                                        placeholder="Briefly describe what you accomplished, any issues faced, or files updated..."
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button 
                                        onClick={() => setLogModal(null)} 
                                        className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={submitCompletion}
                                        disabled={!completionLog.trim()}
                                        className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        <CheckCircle2 className="w-4 h-4" /> Submit & Complete
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

export default StudentTaskBoard;