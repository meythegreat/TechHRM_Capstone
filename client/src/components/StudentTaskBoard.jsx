import React, { useEffect, useState } from 'react';
import { getMyTasks, updateTaskStatus } from '../services/taskService';

const COLUMNS = ['Pending', 'In Progress', 'Completed'];

const StudentTaskBoard = () => {
    const [tasks, setTasks] = useState([]);
    const [logModal, setLogModal] = useState(null);
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

    const handleStatusUpdate = async (id, status) => {
        if (status === 'Completed') {
            setLogModal(id);
            setCompletionLog('');
        } else {
            await updateTaskStatus(id, { status });
            fetchTasks();
        }
    };

    const submitCompletion = async () => {
        if (!completionLog.trim()) return;
        await updateTaskStatus(logModal, { status: 'Completed', completion_log: completionLog });
        setLogModal(null);
        setCompletionLog('');
        fetchTasks();
    };

    if (isLoading) {
        return <div className="p-6 text-gray-500 font-bold">Loading your tasks...</div>;
    }

    return (
        <div className="fade-in">
            <h2 className="text-2xl font-bold mb-6">My Duty Tasks</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {COLUMNS.map(columnStatus => (
                    <div key={columnStatus} className="bg-gray-100 p-4 rounded-xl min-h-[400px]">
                        <h3 className="font-bold text-gray-700 mb-4">{columnStatus}</h3>
                        <div className="space-y-4">
                            {tasks.filter(t => t.status === columnStatus).length === 0 && (
                                <p className="text-sm text-gray-400 italic">No tasks here.</p>
                            )}
                            {tasks.filter(t => t.status === columnStatus).map(task => (
                                <div key={task.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                                    <h4 className="font-bold">{task.title}</h4>
                                    <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                                    <p className="text-xs text-blue-600 mt-2">From: {task.supervisor?.name}</p>
                                    {task.due_date && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Due: {new Date(task.due_date).toLocaleString()}
                                        </p>
                                    )}

                                    <div className="mt-4 pt-4 border-t flex gap-2">
                                        {task.status === 'Pending' && (
                                            <button
                                                onClick={() => handleStatusUpdate(task.id, 'In Progress')}
                                                className="bg-blue-600 text-white text-xs px-3 py-1 rounded font-bold w-full"
                                            >
                                                Start Task
                                            </button>
                                        )}
                                        {task.status === 'In Progress' && (
                                            <button
                                                onClick={() => handleStatusUpdate(task.id, 'Completed')}
                                                className="bg-green-600 text-white text-xs px-3 py-1 rounded font-bold w-full"
                                            >
                                                Mark Complete
                                            </button>
                                        )}
                                    </div>

                                    {task.status === 'Completed' && task.completion_log && (
                                        <p className="mt-3 text-xs text-gray-600 italic border-t pt-2">
                                            Log: {task.completion_log}
                                        </p>
                                    )}
                                    {task.status === 'Completed' && task.supervisor_notes && (
                                        <div className="mt-3 p-2 bg-yellow-50 text-yellow-800 text-xs rounded font-medium">
                                            Feedback: {task.supervisor_notes}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {logModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-96 shadow-xl">
                        <h3 className="font-bold mb-2">Submit Completion Log</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Briefly describe what you accomplished or any issues you faced.
                        </p>
                        <textarea
                            className="w-full p-2 border rounded mb-4 h-24"
                            value={completionLog}
                            onChange={(e) => setCompletionLog(e.target.value)}
                            placeholder="e.g., Sorted 50 records in the archive..."
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setLogModal(null)} className="px-4 py-2 bg-gray-200 rounded font-bold">
                                Cancel
                            </button>
                            <button
                                onClick={submitCompletion}
                                disabled={!completionLog.trim()}
                                className="px-4 py-2 bg-green-600 text-white rounded font-bold disabled:opacity-50"
                            >
                                Submit & Complete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentTaskBoard;
