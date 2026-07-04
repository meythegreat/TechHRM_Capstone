import axios from 'axios';

export const getDashboardStats = async () => axios.get('/api/analytics/dashboard');

export const downloadCSV = async () => {
    const response = await axios.get('/api/analytics/export-attendance', {
        responseType: 'blob',
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `attendance_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};
