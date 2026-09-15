import axios from 'axios';

export const disciplinaryService = {
    getRecords: async () => (await axios.get('/api/disciplinary')).data,
    logViolation: async (data) => (await axios.post('/api/disciplinary', data)).data,
    resolveAppeal: async (id, data) => (await axios.post(`/api/disciplinary/${id}/resolve`, data)).data,
    getStudentRecords: async () => (await axios.get('/api/disciplinary/my-records')).data,
    fileAppeal: async (id, appeal) =>
        (await axios.post(`/api/disciplinary/${id}/appeal`, { appeal_notes: appeal, student_appeal: appeal })).data,
};

export const getMyViolations = async () => axios.get('/api/disciplinary/my-records');
export const submitAppeal = async (id, appeal_notes) =>
    axios.post(`/api/disciplinary/${id}/appeal`, { appeal_notes, student_appeal: appeal_notes });

export const getAllViolations = async () => axios.get('/api/disciplinary');
export const issueViolation = async (data) => axios.post('/api/disciplinary', data);
export const resolveViolation = async (id, data) =>
    axios.post(`/api/disciplinary/${id}/resolve`, data);
