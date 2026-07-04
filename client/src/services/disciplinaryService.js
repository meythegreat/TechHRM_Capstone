import axios from 'axios';

export const getMyViolations = async () => axios.get('/api/disciplinary/my-records');
export const submitAppeal = async (id, appeal_notes) =>
    axios.post(`/api/disciplinary/${id}/appeal`, { appeal_notes });

export const getAllViolations = async () => axios.get('/api/disciplinary');
export const issueViolation = async (data) => axios.post('/api/disciplinary', data);
export const resolveViolation = async (id, data) =>
    axios.post(`/api/disciplinary/${id}/resolve`, data);
