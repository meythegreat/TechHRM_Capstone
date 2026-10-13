import axios from "axios";

const API_BASE_URL = "/api";

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
});

export const financialService = {
  getRecords: async (params?: Record<string, any>) => {
    const response = await axios.get(`${API_BASE_URL}/financial/records`, {
      ...getAuthHeaders(),
      params,
    });
    return response.data;
  },

  computePeriod: async (payload: {
    period_start: string;
    period_end: string;
    hourly_rate: number;
    department?: string;
  }) => {
    const response = await axios.post(
      `${API_BASE_URL}/financial/compute-period`,
      payload,
      getAuthHeaders(),
    );
    return response.data;
  },

  updateAdjustments: async (
    id: number,
    payload: {
      allowances?: number;
      penalty_deductions?: number;
      notes?: string;
      status?: string;
      adjustment_reason?: string;
    },
  ) => {
    const response = await axios.put(
      `${API_BASE_URL}/financial/records/${id}/adjustments`,
      payload,
      getAuthHeaders(),
    );
    return response.data;
  },

  cancelRecord: async (id: number) => {
    const response = await axios.delete(
      `${API_BASE_URL}/financial/records/${id}`,
      getAuthHeaders(),
    );
    return response.data;
  },

  getStudentCompensation: async () => {
    const response = await axios.get(
      `${API_BASE_URL}/financial/my-compensation`,
      getAuthHeaders(),
    );
    return response.data;
  },

  getMyHours: async (period_start: string, period_end: string) => {
    const response = await axios.get(`${API_BASE_URL}/financial/my-hours`, {
      ...getAuthHeaders(),
      params: { period_start, period_end },
    });
    return response.data;
  },

  getHourStudents: async () => {
    const response = await axios.get(`${API_BASE_URL}/financial/hour-events/students`, getAuthHeaders());
    return response.data;
  },

  getHourEvents: async (period_start: string, period_end: string) => {
    const response = await axios.get(`${API_BASE_URL}/financial/hour-events`, {
      ...getAuthHeaders(),
      params: { period_start, period_end },
    });
    return response.data;
  },

  getHoursReport: async (period_start: string, period_end: string) => {
    const response = await axios.get(`${API_BASE_URL}/financial/hours-report`, {
      ...getAuthHeaders(),
      params: { period_start, period_end },
    });
    return response.data;
  },

  saveHourEvent: async (payload: Record<string, unknown>, id?: number) => {
    const response = id
      ? await axios.put(`${API_BASE_URL}/financial/hour-events/${id}`, payload, getAuthHeaders())
      : await axios.post(`${API_BASE_URL}/financial/hour-events`, payload, getAuthHeaders());
    return response.data;
  },

  deleteHourEvent: async (id: number) => {
    const response = await axios.delete(`${API_BASE_URL}/financial/hour-events/${id}`, getAuthHeaders());
    return response.data;
  },

  markHourEvent: async (id: number, marks: { user_id: number; status: string }[]) => {
    const response = await axios.post(`${API_BASE_URL}/financial/hour-events/${id}/marks`, { marks }, getAuthHeaders());
    return response.data;
  },

  scanHourEvent: async (id: number, student_id_number: string) => {
    const response = await axios.post(
      `${API_BASE_URL}/financial/hour-events/${id}/scan`,
      { student_id_number },
      getAuthHeaders(),
    );
    return response.data;
  },

  markHourEventAbsent: async (id: number) => {
    const response = await axios.post(`${API_BASE_URL}/financial/hour-events/${id}/mark-absent`, {}, getAuthHeaders());
    return response.data;
  },

  correctHourTime: async (id: number, user_id: number, time: string) => {
    const response = await axios.patch(
      `${API_BASE_URL}/financial/hour-events/${id}/time`,
      { user_id, time },
      getAuthHeaders(),
    );
    return response.data;
  },

  exportCsvUrl: (params?: Record<string, any>) => {
    const query = new URLSearchParams(params).toString();
    return `${API_BASE_URL}/financial/export-csv?${query}`;
  },
};
