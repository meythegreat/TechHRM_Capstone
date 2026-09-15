import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { getSupervisorTasks, assignTask, addSupervisorNote, verifyTask } from '../services/taskService';
import { 
    ClipboardCheck, 
    Send, 
    MessageSquare, 
    CheckCircle2, 
    Clock, 
    User, 
    Calendar, 
    X, 
    Briefcase,
    PlayCircle,
    Target
} from 'lucide-react';

const TaskAssignmentManager = () => {
    const [tasks, setTasks] = useState([]);
    const [students, setStudents] = useState([]);
    const [formData, setFormData] = useState({
        student_id: '',
        title: '',
        description: '',
        task_type: 'Routine',
        priority: 'Medium',
        due_date: '',
    });
    const [noteModal, setNoteModal] = useState(null);
    const [feedbackNote, setFeedbackNote] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => { 
        fetchTasks(); 
        
        // Fetching Students
        axios.get('/api/users').then(res => {
            console.log("RAW API RESPONSE:", res.data);
            const usersArray = Array.isArray(res.data) ? res.data : res.data.data;
            if (!usersArray) {
                console.error("Could not find an array of users in the response!");
                return;
            }
            const studentUsers = usersArray.filter(u => u.role && u.role.toLowerCase() === 'student');
            setStudents(studentUsers);
        }).catch(err => console.error("Error fetching students:", err));
    }, []);

    const fetchTasks = async () => {
        setIsLoading(true);
        try {
            const res = await getSupervisorTasks();
            setTasks(res.data);
        } catch (err) {
            console.error('Failed to fetch tasks', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAssign = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await assignTask(formData);
            setFormData({
                student_id: '',
                title: '',
                description: '',
                task_type: 'Routine',
                priority: 'Medium',
                due_date: '',
            });
            fetchTasks();
        } catch (err) {
            console.error('Failed to assign task', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const submitFeedback = async () => {
        if (!feedbackNote.trim()) return;
        try {
            await verifyTask(noteModal, feedbackNote);
            setNoteModal(null);
            setFeedbackNote('');
            fetchTasks();
        } catch (err) {
            console.error('Failed to add note', err);
        }
    };

    const normalizeStatus = (status) => status === 'Assigned' ? 'Pending' : status;
    const activeTasksCount = tasks.filter(t => ['Pending', 'Assigned', 'In Progress'].includes(t.status)).length;

    // ANIMATION VARIANTS
    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
            
            {/* DARK THEME HEADER - DELEGATION COMMAND CENTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <Target className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Task Delegation</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Assignment Manager
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Deploy duties to your assigned student workers, monitor their progress, and provide official feedback upon completion.
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activeTasksCount > 0 ? 'bg-amber-500/20 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'}`}>
                        {activeTasksCount > 0 ? <Clock className="w-5 h-5 animate-pulse" /> : <CheckCircle2 className="w-5 h-5" />}
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Workload</span>
                        <span className={`text-sm font-extrabold ${activeTasksCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {activeTasksCount > 0 ? `${activeTasksCount} Task(s) In Pipeline` : 'All Tasks Completed'}
                        </span>
                    </div>
                </div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* LEFT COLUMN: DEPLOYMENT FORM */}
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="lg:col-span-1 bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 sticky top-6"
                >
                    <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2 tracking-tight">
                        <Send className="w-5 h-5 text-blue-600" /> Deploy New Task
                    </h3>
                    
                    <form onSubmit={handleAssign} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Assign To Student</label>
                            <select
                                required
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
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
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Task Title</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. Catalog 50 Books"
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all placeholder:text-slate-400 placeholder:font-medium"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Due Date</label>
                            <input
                                required
                                type="date"
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all cursor-pointer"
                                value={formData.due_date}
                                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Task Type</label>
                                <select
                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                                    value={formData.task_type}
                                    onChange={(e) => setFormData({ ...formData, task_type: e.target.value })}
                                >
                                    <option value="Routine">Routine</option>
                                    <option value="Special Project">Special Project</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Priority</label>
                                <select
                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                                    value={formData.priority}
                                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Detailed Instructions</label>
                            <textarea
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all h-32 resize-none placeholder:text-slate-400"
                                placeholder="Provide specific instructions or expectations for this task..."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        <button 
                            type="submit" 
                            disabled={isSubmitting || !formData.student_id}
                            className="w-full py-3.5 mt-2 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-slate-900/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? 'Deploying...' : <><ClipboardCheck className="w-5 h-5" /> Issue Task</>}
                        </button>
                    </form>
                </motion.div>

                {/* RIGHT COLUMN: TASK GRID */}
                <div className="lg:col-span-2">
                    {isLoading ? (
                        <div className="flex justify-center p-12">
                            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="bg-white rounded-3xl p-16 text-center border border-slate-200 flex flex-col items-center shadow-sm">
                            <Briefcase className="w-16 h-16 text-slate-300 mb-4 opacity-50" />
                            <h3 className="text-xl font-bold text-slate-700">No Tasks Deployed</h3>
                            <p className="text-slate-500 mt-2">Use the form to assign tasks to your student workers.</p>
                        </div>
                    ) : (
                        <motion.div 
                            variants={containerVariants}
                            initial="hidden"
                            animate="show"
                            className="grid grid-cols-1 md:grid-cols-2 gap-5"
                        >
                            <AnimatePresence>
                                {tasks.map((task) => (
                                    <motion.div 
                                        layout
                                        variants={itemVariants}
                                        key={task.id} 
                                        className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all group relative overflow-hidden flex flex-col"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
                                                task.status === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                task.status === 'Completed' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                task.status === 'In Progress' ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' :
                                                'bg-slate-50 text-slate-600 border-slate-200'
                                            }`}>
                                                {task.status === 'Verified' && <CheckCircle2 className="w-3 h-3" />}
                                                {task.status === 'Completed' && <MessageSquare className="w-3 h-3" />}
                                                {task.status === 'In Progress' && <PlayCircle className="w-3 h-3" />}
                                                {['Pending', 'Assigned'].includes(task.status) && <Clock className="w-3 h-3" />}
                                                {normalizeStatus(task.status)}
                                            </span>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`text-[11px] font-black px-2.5 py-1 rounded-md ${
                                                    task.priority === 'High' ? 'bg-red-100 text-red-700' :
                                                    task.priority === 'Low' ? 'bg-slate-100 text-slate-600' :
                                                    'bg-amber-100 text-amber-700'
                                                }`}>
                                                    {task.priority || 'Medium'}
                                                </span>
                                                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                                                    {task.task_type || 'Routine'}
                                                </span>
                                            </div>
                                        </div>

                                        <h4 className="font-black text-slate-900 text-lg leading-tight mb-2 group-hover:text-blue-700 transition-colors">
                                            {task.title}
                                        </h4>
                                        <p className="text-sm text-slate-500 font-medium mb-4 line-clamp-2 flex-1">
                                            {task.description || <span className="italic opacity-50">No description</span>}
                                        </p>

                                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center border border-blue-200">
                                                    {(task.student?.name || '?').charAt(0)}
                                                </div>
                                                <span className="truncate max-w-[100px]">{task.student?.name || 'Unknown'}</span>
                                            </div>
                                            
                                            {task.status === 'Completed' && !task.evaluation_notes && !task.supervisor_notes && (
                                                <button 
                                                    onClick={() => setNoteModal(task.id)}
                                                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                                                >
                                                    <MessageSquare className="w-3.5 h-3.5" /> Add Note
                                                </button>
                                            )}
                                        </div>

                                        {(task.evaluation_notes || task.supervisor_notes) && (
                                            <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                                <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Evaluation Notes
                                                </p>
                                                <p className="text-xs text-emerald-700 font-medium italic">"{task.evaluation_notes || task.supervisor_notes}"</p>
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </div>
            </div>

            {/* FEEDBACK MODAL */}
            <AnimatePresence>
                {noteModal && (
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
                                    <MessageSquare className="w-5 h-5 text-blue-600" /> Provide Feedback
                                </h3>
                                <button onClick={() => setNoteModal(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 sm:p-8 space-y-4">
                                <div>
                                    <p className="text-xs text-slate-500 font-medium mb-3">
                                        Acknowledge the completion of this task or provide constructive correction for the student worker.
                                    </p>
                                    <textarea
                                        autoFocus
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all h-32 resize-none"
                                        value={feedbackNote}
                                        onChange={(e) => setFeedbackNote(e.target.value)}
                                        placeholder="e.g., Great job organizing these records quickly."
                                    />
                                </div>
                                
                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                    <button 
                                        onClick={() => setNoteModal(null)} 
                                        className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={submitFeedback}
                                        disabled={!feedbackNote.trim()}
                                        className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/25 disabled:opacity-50 transition-all flex items-center gap-2"
                                    >
                                        <CheckCircle2 className="w-4 h-4" /> Save Feedback
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

export default TaskAssignmentManager;
