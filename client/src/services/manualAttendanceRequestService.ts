import axios from 'axios';

export type ManualAttendanceRequestType = 'regular' | 'janitorial' | 'class_hours';

export type ManualAttendanceShiftInput = {
  date: string;
  time_in: string;
  time_out: string;
  janitorial_area?: string;
  janitorial_group_id?: number;
  before_photo?: File;
  after_photo?: File;
  before_captured_at?: string;
  after_captured_at?: string;
  capture_source?: string;
};

export type ManualAttendanceShiftRow = ManualAttendanceShiftInput & {
  id: number;
  sort_order: number;
  attendance_id?: number | null;
  before_photo_path?: string | null;
  after_photo_path?: string | null;
  before_captured_at?: string | null;
  after_captured_at?: string | null;
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
    if (payload.request_type !== 'janitorial') {
      const { data } = await axios.post('/api/attendance/manual-requests', payload);
      return data as { message: string; request: ManualAttendanceRequestRow };
    }

    const form = new FormData();
    form.append('request_type', 'janitorial');
    if (payload.reason) form.append('reason', payload.reason);
    payload.shifts.forEach((shift, index) => {
      form.append(`shifts[${index}][date]`, shift.date);
      form.append(`shifts[${index}][time_in]`, shift.time_in);
      form.append(`shifts[${index}][time_out]`, shift.time_out);
      if (shift.janitorial_group_id) {
        form.append(`shifts[${index}][janitorial_group_id]`, String(shift.janitorial_group_id));
      }
      if (shift.before_photo) form.append(`shifts[${index}][before_photo]`, shift.before_photo);
      if (shift.after_photo) form.append(`shifts[${index}][after_photo]`, shift.after_photo);
      if (shift.before_captured_at) form.append(`shifts[${index}][before_captured_at]`, shift.before_captured_at);
      if (shift.after_captured_at) form.append(`shifts[${index}][after_captured_at]`, shift.after_captured_at);
      if (shift.capture_source) form.append(`shifts[${index}][capture_source]`, shift.capture_source);
    });
    const { data } = await axios.post('/api/attendance/manual-requests', form);
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
