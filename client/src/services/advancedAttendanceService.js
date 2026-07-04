import axios from 'axios';

export const generateSecureToken = async (type, description = '') =>
    axios.post('/api/attendance/generate-token', { type, description });

export const fetchAnomalyLogs = async () => axios.get('/api/attendance/anomalies');

export const submitSecureClockIn = async (tokenCode, attendanceType) =>
    axios.post('/api/attendance/secure-clock-in', {
        token_code: tokenCode,
        attendance_type: attendanceType,
    });

export const submitSecureClockOut = async (attendanceId) =>
    axios.put(`/api/attendance/secure-clock-out/${attendanceId}`);

export const fetchWorkHourSummary = async () => axios.get('/api/attendance/hours-summary');
