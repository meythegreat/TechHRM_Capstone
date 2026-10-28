import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { financialService } from '../../services/financialService';
import { bindPopup } from '../../utils/popupDismiss';

interface StudentOption {
  id: number;
  name: string;
  student_id_number?: string | null;
  year_level?: number | null;
  year_label: string;
  is_leader?: boolean;
}

interface CleaningGroup {
  id: number;
  name: string;
  student_count: number;
  students: StudentOption[];
}

const YEAR_SECTIONS = [
  { key: 1, label: '1st Year' },
  { key: 2, label: '2nd Year' },
  { key: 3, label: '3rd Year' },
  { key: 4, label: '4th Year' },
] as const;

const yearKey = (student: StudentOption) => {
  const year = Number(student.year_level);
  return year >= 1 && year <= 4 ? year : 0;
};

const matchesSearch = (student: StudentOption, term: string) => (
  !term
  || student.name.toLowerCase().includes(term)
  || (student.student_id_number || '').toLowerCase().includes(term)
  || student.year_label.toLowerCase().includes(term)
);

const apiError = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : '';
  return first || data?.message || fallback;
};

export function CleaningGroupsDialog({ onClose }: { onClose: () => void }) {
  const [groups, setGroups] = useState<CleaningGroup[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [leaderId, setLeaderId] = useState<number | null>(null);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const [groupRes, studentRes] = await Promise.all([
      financialService.getCleaningGroups(),
      financialService.getHourStudents(),
    ]);
    setGroups(groupRes.groups || []);
    setStudents(studentRes.students || []);
  };

  useEffect(() => {
    load().catch(() => {
      setNoticeError(true);
      setNotice('Could not load groups.');
    });
  }, []);

  const membership = useMemo(() => {
    const map = new Map<number, { name: string; leads: boolean }>();
    groups.forEach((group) => {
      group.students.forEach((student) => {
        map.set(student.id, { name: group.name, leads: Boolean(student.is_leader) });
      });
    });
    return map;
  }, [groups]);

  const eligibleStudents = useMemo(
    () => students.filter((student) => yearKey(student) !== 0),
    [students],
  );

  const term = search.trim().toLowerCase();
  const visibleStudents = useMemo(
    () => eligibleStudents.filter((student) => matchesSearch(student, term)),
    [eligibleStudents, term],
  );

  const memberSections = useMemo(() => {
    const pool = visibleStudents.filter((student) => student.id !== leaderId);
    return YEAR_SECTIONS
      .map((section) => ({
        ...section,
        students: pool.filter((student) => yearKey(student) === section.key),
      }))
      .filter((section) => section.students.length > 0);
  }, [visibleStudents, leaderId]);

  const resetEditor = () => {
    setCreating(false);
    setEditingId(null);
    setName('');
    setLeaderId(null);
    setMemberIds([]);
    setSearch('');
  };

  const startCreate = () => {
    resetEditor();
    setCreating(true);
    setNotice(null);
    setNoticeError(false);
  };

  const startEdit = (group: CleaningGroup) => {
    const leaders = group.students.filter((student) => student.is_leader && yearKey(student) !== 0);
    const soleLeader = leaders.length === 1 ? leaders[0].id : null;
    const skipped = group.students.filter((student) => yearKey(student) === 0).length;
    setCreating(false);
    setEditingId(group.id);
    setName(group.name);
    setLeaderId(soleLeader);
    setMemberIds(group.students.filter((student) => student.id !== soleLeader && yearKey(student) !== 0).map((student) => student.id));
    setSearch('');
    setNoticeError(skipped > 0 || leaders.length > 1);
    setNotice(skipped > 0
      ? 'Some students have no year level, so they are not in this editor. Set their year level before adding them back.'
      : leaders.length > 1
        ? 'This group has more than one leader. Choose the single leader, then save.'
        : null);
  };

  const chooseLeader = (id: number) => {
    setLeaderId(id);
    setMemberIds((current) => current.filter((memberId) => memberId !== id));
  };

  const toggleMember = (id: number) => {
    if (id === leaderId) return;
    setMemberIds((current) => current.includes(id) ? current.filter((memberId) => memberId !== id) : [...current, id]);
  };

  const placementNote = (student: StudentOption) => {
    const currentGroup = membership.get(student.id);
    const staysHere = Boolean(editingId && groups.find((group) => group.id === editingId)?.students.some((member) => member.id === student.id));
    if (!currentGroup || staysHere) return '';
    return currentGroup.leads ? ` · leads ${currentGroup.name}` : ` · now in ${currentGroup.name}`;
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!leaderId) {
      setNoticeError(true);
      setNotice('Choose one leader before saving the group.');
      return;
    }
    setSaving(true);
    setNotice(null);
    setNoticeError(false);
    try {
      await financialService.saveCleaningGroup({
        name: name.trim(),
        leader_user_id: leaderId,
        user_ids: memberIds.filter((id) => id !== leaderId),
      }, editingId ?? undefined);
      setNoticeError(false);
      setNotice(editingId ? 'Group updated.' : 'Group saved.');
      resetEditor();
      await load();
    } catch (error) {
      setNoticeError(true);
      setNotice(apiError(error, 'Could not save that group.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (group: CleaningGroup) => {
    if (!window.confirm(`Remove ${group.name}? Past activities keep the students they already have.`)) return;
    setNotice(null);
    setNoticeError(false);
    try {
      await financialService.deleteCleaningGroup(group.id);
      if (editingId === group.id) resetEditor();
      setNoticeError(false);
      setNotice('Group removed.');
      await load();
    } catch (error) {
      setNoticeError(true);
      setNotice(apiError(error, 'Could not remove that group.'));
    }
  };

  const editorOpen = creating || editingId !== null;
  const leader = eligibleStudents.find((student) => student.id === leaderId) || null;

  const groupSummary = (group: CleaningGroup) => {
    const leaders = group.students.filter((student) => student.is_leader);
    const leaderName = leaders.length === 1
      ? `${leaders[0].name} (${leaders[0].year_label})`
      : leaders.length > 1
        ? leaders.map((student) => student.name).join(', ')
        : 'No leader yet';
    const memberCount = group.students.filter((student) => !student.is_leader).length;
    return `Leader: ${leaderName} · ${memberCount} member${memberCount === 1 ? '' : 's'}`;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" {...bindPopup(onClose)}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Groups</h3>
            <p className="mt-1 text-sm text-slate-500">These groups are used for every activity. Only the WSPO coordinator can assign them. Choose one leader from any year level first, then add members by year. A group can mix years. The leader can open attendance, the QR code, and the passcode for their own year level only.</p>
          </div>
          <button type="button" onClick={startCreate} className="shrink-0 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl">New group</button>
        </div>

        {notice && <div className={`text-sm font-semibold rounded-2xl px-5 py-3 border ${noticeError ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>{notice}</div>}

        {groups.length === 0 && !editorOpen ? (
          <p className="text-sm text-slate-500">No groups yet.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <div key={group.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${editingId === group.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
                <button type="button" onClick={() => startEdit(group)} className="min-w-0 flex-1 text-left">
                  <p className="font-bold text-slate-900">{group.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{groupSummary(group)}</p>
                </button>
                <button type="button" onClick={() => remove(group)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg" aria-label={`Remove ${group.name}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {editorOpen && (
          <form onSubmit={save} className="space-y-4 border-t border-slate-100 pt-5">
            <h4 className="font-semibold text-slate-900">{editingId ? 'Edit group' : 'New group'}</h4>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Group name
              <input required value={name} onChange={(input) => setName(input.target.value)} placeholder="Group A" className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Search
              <input value={search} onChange={(input) => setSearch(input.target.value)} placeholder="Search name, ID, or year" className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold" />
            </label>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Leader · one student, any year</p>
              <p className="mt-1 text-sm text-slate-500">{leader ? `${leader.name} · ${leader.year_label}` : 'Select the leader first.'}</p>
              <div className="mt-2 max-h-44 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {visibleStudents.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-slate-500">No students match that search.</p>
                ) : visibleStudents.map((student) => (
                  <label key={student.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <input type="radio" name="group-leader" checked={leaderId === student.id} onChange={() => chooseLeader(student.id)} />
                    <span className="font-bold text-slate-900">{student.name}</span>
                    <span className="text-slate-500">{student.student_id_number || 'No ID'} · {student.year_label}{placementNote(student)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Members by year level · {memberIds.length} selected</p>
              <p className="mt-1 text-sm text-slate-500">Pick members from each year. Years can be mixed. The leader is not listed here.</p>
              <div className="mt-2 space-y-3">
                {memberSections.length === 0 ? (
                  <p className="text-sm text-slate-500 border border-slate-200 rounded-xl px-3 py-3">No members match that search.</p>
                ) : memberSections.map((section) => {
                  const selected = section.students.filter((student) => memberIds.includes(student.id)).length;
                  return (
                    <div key={section.key} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{section.label}</p>
                        <p className="text-xs font-semibold text-slate-500">{selected} selected</p>
                      </div>
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                        {section.students.map((student) => (
                          <label key={student.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <input type="checkbox" checked={memberIds.includes(student.id)} onChange={() => toggleMember(student.id)} />
                            <span className="font-bold text-slate-900">{student.name}</span>
                            <span className="text-slate-500">{student.student_id_number || 'No ID'}{placementNote(student)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={resetEditor} className="px-4 py-2.5 font-bold text-slate-500">Cancel</button>
              <button type="submit" disabled={saving || !leaderId} className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50">{saving ? 'Saving...' : 'Save group'}</button>
            </div>
          </form>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2.5 font-bold text-slate-500">Close</button>
        </div>
      </div>
    </div>
  );
}
