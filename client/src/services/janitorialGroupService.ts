import axios from 'axios';

export type JanitorialStudent = {
  id: number;
  name: string;
  student_id_number?: string | null;
  year_level?: number | string | null;
  year_label?: string;
  assigned_office?: string | null;
  role?: string | null;
};

export type JanitorialGroup = {
  id: number;
  department: string;
  name: string;
  area: string;
  supervisor: JanitorialStudent | null;
  immediate_supervisor?: JanitorialStudent | null;
  members: JanitorialStudent[];
  member_count: number;
  max_members: number;
  max_groups: number;
  leader_present?: boolean;
};

export type JanitorialLeader = {
  id: number;
  user: JanitorialStudent | null;
  groups: JanitorialGroup[];
  group_count: number;
  max_groups: number;
  is_present: boolean;
};

export type JanitorialSupervisorAbsence = {
  id: number;
  user_id: number;
  leader_name?: string | null;
  absent_on: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | string;
  decision_note?: string | null;
  reviewed_by?: string | null;
};

export const janitorialGroupService = {
  async list(): Promise<JanitorialGroup[]> {
    const { data } = await axios.get('/api/attendance/janitorial-groups');
    return Array.isArray(data?.groups) ? data.groups : [];
  },

  async leaders(): Promise<JanitorialLeader[]> {
    const { data } = await axios.get('/api/attendance/janitorial-groups');
    return Array.isArray(data?.leaders) ? data.leaders : [];
  },

  async absenceRequests(): Promise<JanitorialSupervisorAbsence[]> {
    const { data } = await axios.get('/api/attendance/janitorial-groups');
    return Array.isArray(data?.absence_requests) ? data.absence_requests : [];
  },

  async requestAbsence(absentOn: string, reason: string) {
    const { data } = await axios.post('/api/attendance/janitorial-supervisor-absence', {
      absent_on: absentOn,
      reason,
    });
    return data as { message: string; absence: JanitorialSupervisorAbsence };
  },

  async decideAbsence(id: number, status: 'Approved' | 'Rejected') {
    const { data } = await axios.patch(`/api/attendance/janitorial-supervisor-absence/${id}`, { status });
    return data as { message: string; absence: JanitorialSupervisorAbsence };
  },

  async addLeader(userId: number) {
    const { data } = await axios.post('/api/attendance/janitorial-leaders', { user_id: userId });
    return data as { message: string; leader: JanitorialLeader };
  },

  async setPresence(id: number, isPresent: boolean) {
    const { data } = await axios.patch(`/api/attendance/janitorial-leaders/${id}`, {
      is_present: isPresent,
    });
    return data as { message: string; leader: JanitorialLeader };
  },

  async removeLeader(id: number) {
    const { data } = await axios.delete(`/api/attendance/janitorial-leaders/${id}`);
    return data as { message: string };
  },

  async save(payload: {
    id?: number;
    department: string;
    name?: string;
    area: string;
    supervisor_user_id: number;
    member_ids: number[];
  }) {
    const body = {
      department: payload.department,
      name: payload.name || payload.area,
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

  async passcode(groupId: number) {
    const { data } = await axios.get('/api/attendance/janitorial-passcode', {
      params: { group_id: groupId },
    });
    return data as JanitorialCodeSession & { token_code: string };
  },

  async qr(groupId: number) {
    const { data } = await axios.get('/api/attendance/janitorial-qr', {
      params: { group_id: groupId },
    });
    return data as JanitorialCodeSession & { payload: string };
  },
};

export type JanitorialCodeSession = {
  expires_at: string;
  seconds_remaining: number;
  ttl_seconds: number;
  department?: string;
  fixed_hours?: number;
  group?: { id: number; name: string; area: string; department?: string };
};
