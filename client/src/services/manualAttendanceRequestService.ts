import axios from 'axios';

export type ManualAttendanceRequestType = 'regular' | 'janitorial' | 'class_hours';

export type ManualAttendanceShiftInput = {
  date: string;
  time_in: string;
  time_out: string;
  janitorial_area?: string;
  janitorial_group_id?: number;
};

export type ManualAttendanceShiftRow = ManualAttendanceShiftInput & {
  id: number;
  sort_order: number;
  attendance_id?: number | null;
};

export type ManualAttendanceRequestRow = {
  id: number;
  user_id: number;
  request_type?: ManualAttendanceRequestType | string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | string;
  decision_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  shifts: ManualAttendanceShiftRow[];
  student_name?: string;
  student_id_number?: string | null;
  assigned_office?: string | null;
  year_level?: string | number | null;
};

export const manualAttendanceRequestService = {
  async mine(): Promise<ManualAttendanceRequestRow[]> {
    const { data } = await axios.get('/api/attendance/manual-requests/mine');
    return Array.isArray(data?.requests) ? data.requests : [];
  },

  async list(status?: string): Promise<ManualAttendanceRequestRow[]> {
    const { data } = await axios.get('/api/attendance/manual-requests', {
      params: status ? { status } : undefined,
    });
    return Array.isArray(data?.requests) ? data.requests : [];
  },

  async submit(payload: {
    request_type?: ManualAttendanceRequestType;
    reason?: string;
    shifts: ManualAttendanceShiftInput[];
  }) {
    const { data } = await axios.post('/api/attendance/manual-requests', payload);
    return data as { message: string; request: ManualAttendanceRequestRow };
  },

  async cancel(id: number) {
    const { data } = await axios.delete(`/api/attendance/manual-requests/${id}`);
    return data as { message: string };
  },

  async decide(id: number, status: 'Approved' | 'Rejected', decision_note?: string) {
    const { data } = await axios.patch(`/api/attendance/manual-requests/${id}`, {
      status,
      decision_note: decision_note || undefined,
    });
    return data as { message: string; request: ManualAttendanceRequestRow; attendance_ids?: number[] };
  },
};
