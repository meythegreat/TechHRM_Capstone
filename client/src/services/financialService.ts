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

  exportCsvUrl: (params?: Record<string, any>) => {
    const query = new URLSearchParams(params).toString();
    return `${API_BASE_URL}/financial/export-csv?${query}`;
  },
};
