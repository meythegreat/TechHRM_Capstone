import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { financialService } from '../../services/financialService';
import {
  janitorialGroupService,
  type JanitorialGroup,
  type JanitorialLeader,
} from '../../services/janitorialGroupService';
import { bindPopup } from '../../utils/popupDismiss';

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
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<'none' | 'leader' | 'group'>('none');

  const load = async () => {
    const [leaderRows, studentRes] = await Promise.all([
      janitorialGroupService.leaders(),
      financialService.getHourStudents(),
    ]);
    setLeaders(leaderRows);
    setStudents((studentRes.students || []) as StudentOption[]);
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
    if (!area.trim()) {
      setNoticeError(true);
      setNotice('Enter the area this group will clean.');
      return;
    }
    setSaving(true);
    try {
      const res = await janitorialGroupService.save({
        id: editingId || undefined,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" {...bindPopup(onClose)}>
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Janitorial leaders</h2>
            <p className="text-sm text-slate-500 mt-1">
              Add a leader from any department. Each leader can take up to 3 groups in 3 different areas, and each group can have up to 6 members from any department. The leader shows that group&apos;s QR and passcode, then accepts or declines the photos. An accepted entry is recorded as exactly 4 hours from clock-in.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800 text-sm font-bold">Close</button>
        </div>

        <div className="p-6 space-y-5">
          {notice && (
            <p className={`text-sm font-medium ${noticeError ? 'text-rose-600' : 'text-emerald-700'}`}>{notice}</p>
          )}

          <button
            type="button"
            onClick={startAddLeader}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold"
          >
            <Plus className="w-4 h-4" /> Add leader
          </button>

          {panel === 'leader' && (
            <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-900">New leader</p>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students from every department"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
              <ul className="max-h-48 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-2">
                {leaderChoices.length === 0 ? (
                  <li className="text-sm text-slate-500 px-2 py-1.5">No matching students.</li>
                ) : leaderChoices.map((student) => (
                  <li key={`lead-${student.id}`}>
                    <label className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-slate-50">
                      <input
                        type="radio"
                        name="janitorial-new-leader"
                        checked={leaderUserId === student.id}
                        onChange={() => setLeaderUserId(student.id)}
                      />
                      <span className="font-medium text-slate-800">{studentLabel(student)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={saveLeader} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
                  {saving ? 'Saving…' : 'Add leader'}
                </button>
                <button type="button" onClick={resetPanel} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {panel === 'group' && (
            <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-900">
                {editingId ? 'Edit group' : 'New group'} for {activeLeader?.user?.name || 'this leader'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Area</label>
                  <input
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="e.g. East wing hallways"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Group name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Defaults to the area"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Search members</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Any department"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Members (up to 6)</p>
              <ul className="max-h-48 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-2">
                {memberChoices.length === 0 ? (
                  <li className="text-sm text-slate-500 px-2 py-1.5">No matching students.</li>
                ) : memberChoices.map((student) => (
                  <li key={`mem-${student.id}`}>
                    <label className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={memberIds.includes(student.id)}
                        disabled={!memberIds.includes(student.id) && memberIds.length >= 6}
                        onChange={() => toggleMember(student.id)}
                      />
                      <span className="font-medium text-slate-800">{studentLabel(student)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {memberIds.length > 0 && (
                <p className="text-xs text-slate-600">
                  Selected: {memberIds.map((id) => students.find((student) => student.id === id)?.name).filter(Boolean).join(', ')}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={saveGroup} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
                  {saving ? 'Saving…' : (editingId ? 'Update group' : 'Add group')}
                </button>
                <button type="button" onClick={resetPanel} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <ul className="space-y-3">
            {leaders.length === 0 ? (
              <li className="text-sm text-slate-500">No janitorial leaders yet.</li>
            ) : leaders.map((leader) => (
              <li key={leader.id} className="rounded-xl border border-slate-200 px-4 py-3 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400" />
                      {leader.user?.name || 'Leader'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {[leader.user?.assigned_office, leader.user?.student_id_number].filter(Boolean).join(' · ') || 'Any department'}
                      {' · '}
                      {leader.group_count} of {leader.max_groups} groups
                    </p>
                    <div className="mt-2 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setPresence(leader, true)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${leader.is_present !== false ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}
                      >
                        Present
                      </button>
                      <button
                        type="button"
                        onClick={() => setPresence(leader, false)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${leader.is_present === false ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                      >
                        Absent
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {leader.is_present === false
                        ? 'Members cannot scan a code. They submit offline attendance with a time in and camera photos stamped with the date and time.'
                        : 'Members can use a photo or this leader\'s code.'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={leader.group_count >= leader.max_groups}
                      onClick={() => startAddGroup(leader)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40"
                    >
                      Add group
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLeader(leader)}
                      className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
                {leader.groups.length === 0 ? (
                  <p className="text-xs text-slate-500">No groups assigned yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {leader.groups.map((group) => (
                      <li key={group.id} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{group.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">Area: {group.area}</p>
                            <p className="text-xs text-slate-600 mt-1">
                              Members: {group.members.map((member) => member.name).join(', ') || 'None'}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => startEdit(leader, group)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold">Edit</button>
                            <button type="button" onClick={() => removeGroup(group.id)} className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold">Delete</button>
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
      </div>
    </div>
  );
}
