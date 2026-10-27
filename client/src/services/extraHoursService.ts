import axios from 'axios';

const API_BASE_URL = '/api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
});

export type ExtraHoursStudent = {
  id: number;
  name: string;
  gender?: string | null;
  student_id_number?: string | null;
  assigned_office?: string | null;
};

export type ExtraHoursRequestRow = {
  id: number;
  department: string;
  requester_title?: string | null;
  duty_description: string;
  period_label: string;
  period_start: string;
  period_end: string;
  approved_hours: number;
  status: 'Draft' | 'Pending' | 'Approved' | 'Rejected' | string;
  approval_letter_path?: string | null;
  decision_note?: string | null;
  requested_by?: string | null;
  requested_by_id?: number;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  students: ExtraHoursStudent[];
  created_at?: string;
  updated_at?: string;
};

export type ExtraHoursMeta = {
  semester: {
    id: number;
    label: string;
    starts_on: string;
    ends_on: string;
    months: number;
  } | null;
  period_label: string;
  weekly_standard: number;
  weekly_extended: number;
  monthly_max: number;
};

export const extraHoursService = {
  list: async (status?: string) => {
    const response = await axios.get(`${API_BASE_URL}/extra-hours`, {
      ...getAuthHeaders(),
      params: status ? { status } : undefined,
    });
    return response.data as { requests: ExtraHoursRequestRow[] };
  },

  candidates: async () => {
    const response = await axios.get(`${API_BASE_URL}/extra-hours/candidates`, getAuthHeaders());
    return response.data as { students: ExtraHoursStudent[] };
  },

  signatories: async () => {
    const response = await axios.get(`${API_BASE_URL}/extra-hours/signatories`, getAuthHeaders());
    return response.data as { coordinator: string; president: string };
  },

  meta: async () => {
    const response = await axios.get(`${API_BASE_URL}/extra-hours/meta`, getAuthHeaders());
    return response.data as ExtraHoursMeta;
  },

  saveDraft: async (payload: FormData | Record<string, unknown>, draftId?: number | null) => {
    if (draftId) {
      const response = await axios.patch(
        `${API_BASE_URL}/extra-hours/${draftId}/draft`,
        payload,
        getAuthHeaders(),
      );
      return response.data as { message: string; request: ExtraHoursRequestRow };
    }
    if (payload instanceof FormData) {
      payload.append('as_draft', '1');
      const response = await axios.post(`${API_BASE_URL}/extra-hours`, payload, {
        ...getAuthHeaders(),
        headers: { ...getAuthHeaders().headers, 'Content-Type': 'multipart/form-data' },
      });
      return response.data as { message: string; request: ExtraHoursRequestRow };
    }
    const response = await axios.post(
      `${API_BASE_URL}/extra-hours`,
      { ...payload, as_draft: true },
      getAuthHeaders(),
    );
    return response.data as { message: string; request: ExtraHoursRequestRow };
  },

  finalize: async (draftId: number | null, body: FormData) => {
    if (draftId) {
      const response = await axios.post(`${API_BASE_URL}/extra-hours/${draftId}/finalize`, body, {
        ...getAuthHeaders(),
        headers: { ...getAuthHeaders().headers, 'Content-Type': 'multipart/form-data' },
      });
      return response.data as { message: string; request: ExtraHoursRequestRow };
    }
    const response = await axios.post(`${API_BASE_URL}/extra-hours`, body, {
      ...getAuthHeaders(),
      headers: { ...getAuthHeaders().headers, 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { message: string; request: ExtraHoursRequestRow };
  },

  decide: async (id: number, payload: { status: 'Approved' | 'Rejected'; decision_note?: string }) => {
    const response = await axios.patch(
      `${API_BASE_URL}/extra-hours/${id}`,
      payload,
      getAuthHeaders(),
    );
    return response.data as { message: string; request: ExtraHoursRequestRow };
  },

  deleteDraft: async (id: number) => {
    const response = await axios.delete(`${API_BASE_URL}/extra-hours/${id}`, getAuthHeaders());
    return response.data as { message: string };
  },
};
