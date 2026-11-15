import axios from 'axios';

export type JanitorialStudent = {
  id: number;
  name: string;
  student_id_number?: string | null;
  year_level?: number | string | null;
  year_label?: string;
  assigned_office?: string | null;
};

export type JanitorialGroup = {
  id: number;
  department: string;
  name: string;
  area: string;
  supervisor: JanitorialStudent | null;
  members: JanitorialStudent[];
  member_count: number;
  max_members: number;
  max_per_department: number;
};

export const janitorialGroupService = {
  async list(): Promise<JanitorialGroup[]> {
    const { data } = await axios.get('/api/attendance/janitorial-groups');
    return Array.isArray(data?.groups) ? data.groups : [];
  },

  async save(payload: {
    id?: number;
    department: string;
    name: string;
    area: string;
    supervisor_user_id: number;
    member_ids: number[];
  }) {
    const body = {
      department: payload.department,
      name: payload.name,
      area: payload.area,
      supervisor_user_id: payload.supervisor_user_id,
      member_ids: payload.member_ids,
    };
    const { data } = payload.id
      ? await axios.put(`/api/attendance/janitorial-groups/${payload.id}`, body)
      : await axios.post('/api/attendance/janitorial-groups', body);
    return data as { message: string; group: JanitorialGroup };
  },

  async remove(id: number) {
    const { data } = await axios.delete(`/api/attendance/janitorial-groups/${id}`);
    return data as { message: string };
  },

  async passcode() {
    const { data } = await axios.get('/api/attendance/janitorial-passcode');
    return data as {
      token_code: string;
      seconds_remaining: number;
      ttl_seconds: number;
      group?: { id: number; name: string; area: string };
      department?: string;
    };
  },

  async qr() {
    const { data } = await axios.get('/api/attendance/janitorial-qr');
    return data as {
      payload: string;
      seconds_remaining: number;
      ttl_seconds: number;
      group?: { id: number; name: string; area: string };
      department?: string;
    };
  },
};
