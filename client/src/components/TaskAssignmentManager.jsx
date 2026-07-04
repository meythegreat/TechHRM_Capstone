import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getSupervisorTasks, assignTask, addSupervisorNote } from '../services/taskService';

const TaskAssignmentManager = () => {
    const [tasks, setTasks] = useState([]);
    const [students, setStudents] = useState([]);
    const [formData, setFormData] = useState({ student_id: '', title: '', description: '', due_date: '' });
    const [noteModal, setNoteModal] = useState(null);
    const [feedbackNote, setFeedbackNote] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { 
        fetchTasks(); 
        
        // Let's log the raw response to the console to see what's happening
        axios.get('/api/users').then(res => {
            console.log("RAW API RESPONSE:", res.data);
            
            // Check 1: Is Laravel paginating the response? (e.g., res.data.data)
            const usersArray = Array.isArray(res.data) ? res.data : res.data.data;
            
            if (!usersArray) {
                console.error("Could not find an array of users in the response!");
                return;
            }

            // Check 2: Safely filter (ignoring case sensitivity just in case)
            const studentUsers = usersArray.filter(u => 
                u.role && u.role.toLowerCase() === 'student'
            );
            
            console.log("FILTERED STUDENTS:", studentUsers);
            setStudents(studentUsers);

        }).catch(err => console.error("Error fetching users:", err));
    }, []);

    const fetchTasks = async () => {
        try {
            const res = await getSupervisorTasks();
            setTasks(res.data);
        } catch (err) {
            console.error('Failed to load tasks', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAssign = async (e) => {
        e.preventDefault();
        await assignTask(formData);
        fetchTasks();
        setFormData({ student_id: '', title: '', description: '', due_date: '' });
    };

    const submitFeedback = async () => {
        if (!feedbackNote.trim()) return;
        await addSupervisorNote(noteModal, feedbackNote);
        setNoteModal(null);
        setFeedbackNote('');
        fetchTasks();
    };

    if (isLoading) {
        return <div className="p-6 text-gray-500 font-bold">Loading task management...</div>;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="col-span-1 bg-white p-6 rounded-xl shadow-sm border h-fit">
                <h2 className="font-bold text-lg mb-4">Assign New Task</h2>
                <form onSubmit={handleAssign} className="space-y-4">
                    <div>
                        <label className="text-sm font-bold block mb-1">Assign To</label>
                        <select
                            required
                            className="w-full p-2 border rounded"
                            value={formData.student_id}
                            onChange={e => setFormData({ ...formData, student_id: e.target.value })}
                        >
                            <option value="">Select Student...</option>
                            {students.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-bold block mb-1">Task Title</label>
                        <input
                            required
                            type="text"
                            className="w-full p-2 border rounded"
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-bold block mb-1">Description</label>
                        <textarea
                            required
                            className="w-full p-2 border rounded"
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-bold block mb-1">Due Date (Optional)</label>
                        <input
                            type="datetime-local"
                            className="w-full p-2 border rounded"
                            value={formData.due_date}
                            onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                        />
                    </div>
                    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-2 rounded">
                        Assign Task
                    </button>
                </form>
            </div>

            <div className="col-span-2">
                <h2 className="font-bold text-lg mb-4">Task Monitor & Logs</h2>
                {tasks.length === 0 ? (
                    <p className="text-gray-500 italic">No tasks assigned yet.</p>
                ) : (
                    <div className="space-y-4">
                        {tasks.map(task => (
                            <div key={task.id} className="bg-white p-4 rounded-xl shadow-sm border">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 className="font-bold">{task.title}</h4>
                                        <p className="text-sm text-gray-500">Assigned to: {task.student?.name}</p>
                                        <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                                    </div>
                                    <span className={`px-2 py-1 rounded text-xs font-bold shrink-0 ${
                                        task.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                        {task.status}
                                    </span>
                                </div>

                                {task.status === 'Completed' && (
                                    <div className="mt-4 p-3 bg-gray-50 rounded border">
                                        <p className="text-sm font-bold text-gray-700">Student Log:</p>
                                        <p className="text-sm text-gray-600 mb-3 italic">
                                            &ldquo;{task.completion_log || 'No log submitted.'}&rdquo;
                                        </p>
                                        {task.supervisor_notes ? (
                                            <p className="text-sm text-blue-700 font-bold">
                                                Your Feedback: <span className="font-normal">{task.supervisor_notes}</span>
                                            </p>
                                        ) : (
                                            <button
                                                onClick={() => { setNoteModal(task.id); setFeedbackNote(''); }}
                                                className="text-xs text-blue-600 underline font-bold"
                                            >
                                                Add Supervisor Note
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {noteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-96 shadow-xl">
                        <h3 className="font-bold mb-4">Add Supervisor Feedback</h3>
                        <textarea
                            className="w-full p-2 border rounded mb-4"
                            value={feedbackNote}
                            onChange={(e) => setFeedbackNote(e.target.value)}
                            placeholder="Acknowledge work or provide correction..."
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setNoteModal(null)} className="px-4 py-2 bg-gray-200 rounded font-bold">
                                Cancel
                            </button>
                            <button
                                onClick={submitFeedback}
                                disabled={!feedbackNote.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded font-bold disabled:opacity-50"
                            >
                                Save Feedback
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaskAssignmentManager;
