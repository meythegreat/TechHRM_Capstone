import axios from 'axios';

const API_BASE_URL = '/api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
});

export interface HourLimitStatus {
  weekly_hours: number;
  monthly_hours: number;
  weekly_standard: number;
  weekly_extended: number;
  weekly_cap: number;
  monthly_cap: number;
  weekly_remaining: number;
  monthly_remaining: number;
  remaining: number;
  extension_approved: boolean;
  extension_pending: boolean;
  extra_hours_approved?: boolean;
  extra_hours_period_label?: string | null;
  week_start: string;
  week_end: string;
  month_start: string;
  month_end: string;
  can_request_extension: boolean;
}

export interface HourLimitApprovalRow {
  id: number;
  user_id: number;
  student_name?: string;
  student_id_number?: string;
  assigned_office?: string;
  week_start: string;
  week_end: string;
  approved_hours: number;
  status: 'pending' | 'approved' | 'rejected' | string;
  reason?: string | null;
  decision_note?: string | null;
  requested_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  weekly_hours: number;
  weekly_standard: number;
  weekly_extended: number;
  created_at?: string;
}

export const hourLimitService = {
  getMine: async (): Promise<HourLimitStatus> => {
    const response = await axios.get(`${API_BASE_URL}/hour-limits`, getAuthHeaders());
    return response.data;
  },

  requestExtension: async (payload?: { reason?: string; week_start?: string }) => {
    const response = await axios.post(
      `${API_BASE_URL}/hour-limits/request`,
      payload ?? {},
      getAuthHeaders(),
    );
    return response.data as { message: string; hour_limits: HourLimitStatus };
  },

  listApprovals: async (status?: string) => {
    const response = await axios.get(`${API_BASE_URL}/hour-limits/approvals`, {
      ...getAuthHeaders(),
      params: status ? { status } : undefined,
    });
    return response.data as { approvals: HourLimitApprovalRow[] };
  },

  decide: async (
    id: number,
    payload: { status: 'approved' | 'rejected'; approved_hours?: number; decision_note?: string },
  ) => {
    const response = await axios.patch(
      `${API_BASE_URL}/hour-limits/approvals/${id}`,
      payload,
      getAuthHeaders(),
    );
    return response.data;
  },

  grant: async (payload: {
    user_id: number;
    week_start?: string;
    approved_hours?: number;
    decision_note?: string;
  }) => {
    const response = await axios.post(
      `${API_BASE_URL}/hour-limits/grant`,
      payload,
      getAuthHeaders(),
    );
    return response.data;
  },
};
