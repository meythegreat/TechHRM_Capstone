import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Plus, Trash2, Users, X } from 'lucide-react';
import { financialService } from '../../services/financialService';
import {
  janitorialGroupService,
  type JanitorialGroup,
  type JanitorialLeader,
} from '../../services/janitorialGroupService';
import { bindPopup } from '../../utils/popupDismiss';
import { HelpDisclosure } from '../HelpDisclosure';

type StudentOption = {
  id: number;
  name: string;
  student_id_number?: string | null;
  year_level?: number | null;
  year_label?: string;
  assigned_office?: string | null;
};

const apiError = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : '';
  return first || data?.message || fallback;
};

const studentLabel = (student: { name: string; assigned_office?: string | null; student_id_number?: string | null }) => {
  const office = (student.assigned_office || '').trim();
  const id = (student.student_id_number || '').trim();
  return [student.name, office, id].filter(Boolean).join(' · ');
};

export function JanitorialGroupsDialog({ onClose }: { onClose: () => void }) {
  const [leaders, setLeaders] = useState<JanitorialLeader[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [leaderUserId, setLeaderUserId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [department, setDepartment] = useState('');
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [offices, setOffices] = useState<string[]>([]);
  const [immediates, setImmediates] = useState<StudentOption[]>([]);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<'none' | 'leader' | 'group'>('none');

  const load = async () => {
    const [leaderRows, studentRes, officeRes, immediateRes] = await Promise.all([
      janitorialGroupService.leaders(),
      financialService.getHourStudents(),
      axios.get('/api/offices').catch(() => null),
      axios.get('/api/users', { params: { role: 'Immediate Supervisor', per_page: 100 } }).catch(() => null),
    ]);
    setLeaders(leaderRows);
    setStudents((studentRes.students || []) as StudentOption[]);
    const officeRows = Array.isArray(officeRes?.data) ? officeRes.data : [];
    setOffices(officeRows.map((office: { name?: string }) => (office.name || '').trim()).filter(Boolean));
    const immediateRows = immediateRes?.data?.data;
    setImmediates(Array.isArray(immediateRows) ? immediateRows.map((person: StudentOption & { profile?: { assigned_office?: string | null } }) => ({
      id: person.id,
      name: person.name,
      assigned_office: person.assigned_office || person.profile?.assigned_office,
      role: 'Immediate Supervisor',
    })) : []);
  };

  useEffect(() => {
    load().catch(() => {
      setNoticeError(true);
      setNotice('Could not load janitorial leaders.');
    });
  }, []);

  const leaderUserIds = useMemo(() => new Set(leaders.map((leader) => leader.user?.id).filter(Boolean) as number[]), [leaders]);
  const memberUserIds = useMemo(() => {
    const ids = new Set<number>();
    leaders.forEach((leader) => {
      leader.groups.forEach((group) => {
        if (editingId && group.id === editingId) return;
        group.members.forEach((member) => ids.add(member.id));
      });
    });
    return ids;
  }, [leaders, editingId]);

  const term = search.trim().toLowerCase();
  const matches = (student: StudentOption) => {
    if (!term) return true;
    return student.name.toLowerCase().includes(term)
      || (student.student_id_number || '').toLowerCase().includes(term)
      || (student.assigned_office || '').toLowerCase().includes(term);
  };

  const leaderChoices = useMemo(
    () => students.filter((student) => matches(student) && !leaderUserIds.has(student.id) && !memberUserIds.has(student.id)),
    [students, term, leaderUserIds, memberUserIds],
  );

  const matchedImmediate = useMemo(() => {
    const key = department.trim().toLowerCase();
    if (!key) return null;
    return immediates.find((person) => (person.assigned_office || '').trim().toLowerCase() === key) || null;
  }, [department, immediates]);

  const departmentChoices = useMemo(() => {
    const names = new Set(offices);
    if (department.trim() && !names.has(department.trim())) names.add(department.trim());
    return Array.from(names);
  }, [offices, department]);

  const memberChoices = useMemo(
    () => students.filter((student) => (
      matches(student)
      && student.id !== leaderUserId
      && !leaderUserIds.has(student.id)
      && !memberUserIds.has(student.id)
    )),
    [students, term, leaderUserId, leaderUserIds, memberUserIds],
  );

  const resetPanel = () => {
    setPanel('none');
    setEditingId(null);
    setLeaderUserId(null);
    setName('');
    setArea('');
    setDepartment('');
    setMemberIds([]);
    setSearch('');
  };

  const startAddLeader = () => {
    resetPanel();
    setPanel('leader');
  };

  const startAddGroup = (leader: JanitorialLeader) => {
    resetPanel();
    setPanel('group');
    setLeaderUserId(leader.user?.id ?? null);
  };

  const startEdit = (leader: JanitorialLeader, group: JanitorialGroup) => {
    setPanel('group');
    setEditingId(group.id);
    setLeaderUserId(leader.user?.id ?? group.supervisor?.id ?? null);
    setName(group.name === group.area ? '' : group.name);
    setArea(group.area);
    setDepartment(group.department || '');
    setMemberIds(group.members.map((member) => member.id));
    setSearch('');
  };

  const toggleMember = (id: number) => {
    setMemberIds((current) => (
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id].slice(0, 6)
    ));
  };

  const saveLeader = async () => {
    if (!leaderUserId) {
      setNoticeError(true);
      setNotice('Choose a janitorial leader.');
      return;
    }
    setSaving(true);
    try {
      const res = await janitorialGroupService.addLeader(leaderUserId);
      setNoticeError(false);
      setNotice(res.message || 'Leader added.');
      await load();
      resetPanel();
    } catch (error) {
      setNoticeError(true);
      setNotice(apiError(error, 'Could not add the leader.'));
    } finally {
      setSaving(false);
    }
  };

  const saveGroup = async () => {
    if (!leaderUserId) {
      setNoticeError(true);
      setNotice('Choose a janitorial leader first.');
      return;
    }
    if (!department.trim()) {
      setNoticeError(true);
      setNotice('Select the department area. Its immediate supervisor is assigned automatically.');
      return;
    }
    if (!matchedImmediate) {
      setNoticeError(true);
      setNotice(`No immediate supervisor is assigned to ${department}. Create that account first. It is separate from the department secretary.`);
      return;
    }
    if (!area.trim()) {
      setNoticeError(true);
      setNotice('Enter the area this group will clean.');
      return;
    }
    setSaving(true);
    try {
      const res = await janitorialGroupService.save({
        id: editingId || undefined,
        department: department.trim(),
        name: name.trim() || area.trim(),
        area: area.trim(),
        supervisor_user_id: leaderUserId,
        member_ids: memberIds.filter((id) => id !== leaderUserId).slice(0, 6),
      });
      setNoticeError(false);
      setNotice(res.message || 'Saved.');
      await load();
      resetPanel();
    } catch (error) {
      setNoticeError(true);
      setNotice(apiError(error, 'Could not save the group.'));
    } finally {
      setSaving(false);
    }
  };

  const setPresence = async (leader: JanitorialLeader, isPresent: boolean) => {
    if ((leader.is_present !== false) === isPresent) return;
    try {
      const res = await janitorialGroupService.setPresence(leader.id, isPresent);
      setNoticeError(false);
      setNotice(res.message || 'Updated.');
      await load();
    } catch (error) {
      setNoticeError(true);
      setNotice(apiError(error, 'Could not update whether this leader is present.'));
    }
  };

  const removeLeader = async (leader: JanitorialLeader) => {
    const label = leader.user?.name || 'this leader';
    if (!window.confirm(`Remove ${label} and their janitorial groups?`)) return;
    try {
      const res = await janitorialGroupService.removeLeader(leader.id);
      setNoticeError(false);
      setNotice(res.message || 'Leader removed.');
      await load();
      if (leaderUserId === leader.user?.id) resetPanel();
    } catch (error) {
      setNoticeError(true);
      setNotice(apiError(error, 'Could not remove the leader.'));
    }
  };

  const removeGroup = async (id: number) => {
    if (!window.confirm('Remove this janitorial group?')) return;
    try {
      const res = await janitorialGroupService.remove(id);
      setNoticeError(false);
      setNotice(res.message || 'Removed.');
      await load();
      if (editingId === id) resetPanel();
    } catch (error) {
      setNoticeError(true);
      setNotice(apiError(error, 'Could not remove the group.'));
    }
  };

  const activeLeader = leaders.find((leader) => leader.user?.id === leaderUserId) ?? null;

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      {...bindPopup(onClose)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 bg-slate-950 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-white">Janitorial Leaders</h2>
              <p className="text-[11px] font-medium text-slate-400">
                Assign janitorial supervisors, immediate supervisors, and group members by cleaning area
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startAddLeader}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-500"
            >
              <Plus className="h-3.5 w-3.5" /> Add Leader
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          <HelpDisclosure
            variant="inline"
            title="Group rules & approval flow"
            items={[
              'Select the department area first. The immediate supervisor for that department is assigned automatically.',
              'Members can come from any department. One janitorial supervisor can cover up to 3 cleaning areas, with up to 6 members in each group.',
              'The janitorial supervisor can recommend approval, deduct hours, and add notes.',
              'The immediate supervisor reviews that recommendation and has the final say. This account is separate from the department secretary. The department supervisor can approve only when an absence is reported in advance.',
            ]}
          />

          {notice && (
            <div className={`rounded-xl border px-4 py-3 text-xs font-bold ${noticeError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              {notice}
            </div>
          )}

          {panel === 'leader' && (
            <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-5">
              <p className="text-sm font-black tracking-tight text-slate-900">New Janitorial Leader</p>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students from every department…"
                className={inputClass}
              />
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2">
                {leaderChoices.length === 0 ? (
                  <li className="px-2.5 py-2 text-xs font-medium text-slate-500">No matching students.</li>
                ) : leaderChoices.map((student) => (
                  <li key={`lead-${student.id}`}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs transition hover:bg-slate-50">
                      <input
                        type="radio"
                        name="janitorial-new-leader"
                        checked={leaderUserId === student.id}
                        onChange={() => setLeaderUserId(student.id)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <span className="font-bold text-slate-800">{studentLabel(student)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={resetPanel} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="button" disabled={saving} onClick={saveLeader} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white transition hover:bg-emerald-700 disabled:opacity-45">
                  {saving ? 'Saving…' : 'Add Leader'}
                </button>
              </div>
            </div>
          )}

          {panel === 'group' && (
            <div className="space-y-3.5 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-5">
              <p className="text-sm font-black tracking-tight text-slate-900">
                {editingId ? 'Edit Group' : 'New Group'} for {activeLeader?.user?.name || 'this leader'}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Department area</label>
                  <select
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select the department</option>
                    {departmentChoices.map((office) => (
                      <option key={office} value={office}>{office}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Immediate supervisor</label>
                  <p className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-900">
                    {matchedImmediate?.name || (department ? 'None assigned to this department' : 'Chosen from the department')}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Cleaning area</label>
                  <input
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="e.g. East wing hallways"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Group Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Defaults to the area"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Search Members</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Any department…"
                  className={inputClass}
                />
              </div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Members (up to 6) · {memberIds.length}/6
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2">
                {memberChoices.length === 0 ? (
                  <li className="px-2.5 py-2 text-xs font-medium text-slate-500">No matching students.</li>
                ) : memberChoices.map((student) => (
                  <li key={`mem-${student.id}`}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs transition hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={memberIds.includes(student.id)}
                        disabled={!memberIds.includes(student.id) && memberIds.length >= 6}
                        onChange={() => toggleMember(student.id)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <span className="font-bold text-slate-800">{studentLabel(student)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {memberIds.length > 0 && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-semibold text-emerald-800">
                  Selected: {memberIds.map((id) => students.find((student) => student.id === id)?.name).filter(Boolean).join(', ')}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={resetPanel} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="button" disabled={saving} onClick={saveGroup} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white transition hover:bg-emerald-700 disabled:opacity-45">
                  {saving ? 'Saving…' : (editingId ? 'Update Group' : 'Add Group')}
                </button>
              </div>
            </div>
          )}

          <ul className="space-y-3">
            {leaders.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
                <Users className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
                <p className="text-sm font-extrabold text-slate-700">No janitorial leaders yet</p>
                <p className="mt-1 text-xs font-medium text-slate-400">Add a leader above to begin assigning cleaning areas.</p>
              </li>
            ) : leaders.map((leader) => (
              <li key={leader.id} className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 pl-6 shadow-2xs space-y-3.5">
                <span className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${leader.is_present === false ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black tracking-tight text-slate-900">
                        {leader.user?.name || 'Leader'}
                      </p>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-[10px] font-extrabold text-slate-600">
                        {leader.group_count}/{leader.max_groups} groups
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs font-medium text-slate-500">
                      {[leader.user?.assigned_office, leader.user?.student_id_number].filter(Boolean).join(' · ') || 'Any department'}
                    </p>
                    <div className="mt-2.5 inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
                      <button
                        type="button"
                        onClick={() => setPresence(leader, true)}
                        className={`rounded-lg px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider transition ${leader.is_present !== false ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        Present
                      </button>
                      <button
                        type="button"
                        onClick={() => setPresence(leader, false)}
                        className={`rounded-lg px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider transition ${leader.is_present === false ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        Absent
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                      {leader.is_present === false
                        ? 'Code disabled — members submit offline attendance with timestamped camera photos.'
                        : "Members can clock in with live photos or this leader's code."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={leader.group_count >= leader.max_groups}
                      onClick={() => startAddGroup(leader)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
                    >
                      Add Group
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLeader(leader)}
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
                {leader.groups.length === 0 ? (
                  <p className="text-xs font-medium text-slate-400">No groups assigned yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {leader.groups.map((group) => (
                      <li key={group.id} className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-extrabold text-slate-900">{group.name}</p>
                            <p className="mt-0.5 text-xs font-medium text-slate-500">Department: {group.department || '—'} · Area: {group.area}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-600">
                              Immediate supervisor: <span className="text-slate-900">{group.immediate_supervisor?.name || 'Not assigned'}</span>
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600">
                              Members: {group.members.map((member) => member.name).join(', ') || 'None'}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => startEdit(leader, group)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">Edit</button>
                            <button type="button" onClick={() => removeGroup(group.id)} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50">Delete</button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
