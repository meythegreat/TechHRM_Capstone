import axios from 'axios';

const API_URL = '/api/applications';

export const submitApplication = async (data) => {
    return await axios.post(API_URL, data);
};

export const getAllApplications = async () => {
    return await axios.get(API_URL);
};

export const updateApplicationStatus = async (id, status) => {
    const value = typeof status === 'string' ? status : status?.status;
    return await axios.put(`${API_URL}/${id}/status`, { status: value });
};

export const assignPlacement = async (id, placementData) => {
    return await axios.put(`${API_URL}/${id}/placement`, placementData);
};

export const updateApplicationSchedule = async (id, data) => {
    return await axios.put(`${API_URL}/${id}/schedule`, data);
};

export const getMatchingSuggestions = async (id) => {
    return await axios.get(`${API_URL}/${id}/match`);
};

export const deleteApplication = async (id) => {
    return await axios.delete(`${API_URL}/${id}`);
};