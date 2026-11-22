import axios from 'axios';

export type ClassScheduleOption = {
  id: number;
  day: string | null;
  time: string | null;
  subject: string | null;
  room: string | null;
  instructor: string | null;
  label: string;
  in_session: boolean;
};

export type ClassClockInClass = {
  schedule_id?: number | null;
  day?: string | null;
  time?: string | null;
  subject?: string | null;
  room?: string | null;
  instructor?: string | null;
  label?: string;
};

export type ClassClockInAttendance = {
  id: number;
  time_in?: string | null;
  time_out?: string | null;
  rendered_hours?: number | string | null;
  computed_hours?: number | string | null;
  status?: string | null;
};

export type ClassClockInRequestRow = {
  id: number;
  user_id: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | string;
  decision_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
  class: ClassClockInClass;
  attendance?: ClassClockInAttendance | null;
  student_name?: string;
  student_id_number?: string | null;
  assigned_office?: string | null;
  year_level?: string | number | null;
};

export const classClockInRequestService = {
  async classes(): Promise<ClassScheduleOption[]> {
    const { data } = await axios.get('/api/attendance/class-clock-in-requests/classes');
    return Array.isArray(data?.classes) ? data.classes : [];
  },

  async mine(): Promise<ClassClockInRequestRow[]> {
    const { data } = await axios.get('/api/attendance/class-clock-in-requests/mine');
    return Array.isArray(data?.requests) ? data.requests : [];
  },

  async list(): Promise<ClassClockInRequestRow[]> {
    const { data } = await axios.get('/api/attendance/class-clock-in-requests');
    return Array.isArray(data?.requests) ? data.requests : [];
  },

  async submit(payload: { schedule_id: number; reason: string }) {
    const { data } = await axios.post('/api/attendance/class-clock-in-requests', payload);
    return data as { message: string; request: ClassClockInRequestRow };
  },

  async cancel(id: number) {
    const { data } = await axios.delete(`/api/attendance/class-clock-in-requests/${id}`);
    return data as { message: string };
  },

  async decide(id: number, status: 'Approved' | 'Rejected') {
    const { data } = await axios.patch(`/api/attendance/class-clock-in-requests/${id}`, { status });
    return data as { message: string; request: ClassClockInRequestRow };
  },
};
