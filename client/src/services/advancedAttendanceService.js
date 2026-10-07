import axios from 'axios';

export const generateSecureToken = async (type, description = '') =>
    axios.post('/api/attendance/generate-token', { type, description });

export const fetchLivePasscode = async (type, description = '') =>
    axios.get('/api/attendance/passcode', { params: { type, description } });

export const fetchLiveQr = async (type) =>
    axios.get('/api/attendance/qr-code', { params: { type } });

export const fetchAnomalyLogs = async () => axios.get('/api/attendance/anomalies');

export const submitSecureClockIn = async (tokenCode, attendanceType, method = 'passcode') =>
    axios.post('/api/attendance/secure-clock-in', {
        token_code: tokenCode,
        attendance_type: attendanceType,
        method,
    });

export const submitSecureClockOut = async (attendanceId, tokenCode, method = 'passcode') =>
    axios.put(`/api/attendance/secure-clock-out/${attendanceId}`, {
        token_code: tokenCode,
        method,
    });

export const fetchWorkHourSummary = async () => axios.get('/api/attendance/hours-summary');
