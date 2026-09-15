import axios from 'axios';

export const taskService = {
    getTasks: async () => (await axios.get('/api/tasks')).data,
    createTask: async (data) => (await axios.post('/api/tasks', data)).data,
    updateStatus: async (id, status) => {
        const payload = typeof status === 'string' ? { status } : status;
        return (await axios.put(`/api/tasks/${id}/status`, payload)).data;
    },
    verifyTask: async (id, notes = '') =>
        (await axios.put(`/api/tasks/${id}/verify`, { evaluation_notes: notes })).data,
};

export const getMyTasks = async () => axios.get('/api/tasks/my-tasks');
export const updateTaskStatus = async (id, data) => axios.put(`/api/tasks/${id}/status`, data);

export const getSupervisorTasks = async () => axios.get('/api/tasks');
export const assignTask = async (data) => axios.post('/api/tasks', data);
export const addSupervisorNote = async (id, notes) =>
    axios.put(`/api/tasks/${id}/notes`, typeof notes === 'string' ? { supervisor_notes: notes } : notes);
export const verifyTask = async (id, notes = '') =>
    axios.put(`/api/tasks/${id}/verify`, { evaluation_notes: notes });
