import axios from 'axios';

export const getMyTasks = async () => axios.get('/api/tasks/my-tasks');
export const updateTaskStatus = async (id, data) => axios.put(`/api/tasks/${id}/status`, data);

export const getSupervisorTasks = async () => axios.get('/api/tasks');
export const assignTask = async (data) => axios.post('/api/tasks', data);
export const addSupervisorNote = async (id, notes) =>
    axios.put(`/api/tasks/${id}/notes`, { supervisor_notes: notes });
