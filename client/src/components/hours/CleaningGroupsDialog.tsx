import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { financialService } from '../../services/financialService';
import { bindPopup } from '../../utils/popupDismiss';

interface StudentOption {
  id: number;
  name: string;
  student_id_number?: string | null;
  year_label: string;
}

interface CleaningGroup {
  id: number;
  name: string;
  leader_id?: number | null;
  leader?: StudentOption | null;
  student_count: number;
  students: StudentOption[];
}

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
  const [userIds, setUserIds] = useState<number[]>([]);
  const [leaderId, setLeaderId] = useState<number | ''>('');
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
      setNotice('Could not load cleaning groups.');
    });
  }, []);

  const membership = useMemo(() => {
    const map = new Map<number, string>();
    groups.forEach((group) => {
      group.students.forEach((student) => map.set(student.id, group.name));
    });
    return map;
  }, [groups]);

  const visibleStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) =>
      student.name.toLowerCase().includes(term)
      || (student.student_id_number || '').toLowerCase().includes(term)
      || student.year_label.toLowerCase().includes(term)
    );
  }, [students, search]);

  const selectedStudents = useMemo(
    () => students.filter((student) => userIds.includes(student.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [students, userIds],
  );

  const startCreate = () => {
    setCreating(true);
    setEditingId(null);
    setName('');
    setUserIds([]);
    setLeaderId('');
    setNotice(null);
    setNoticeError(false);
  };

  const startEdit = (group: CleaningGroup) => {
    setCreating(false);
    setEditingId(group.id);
    setName(group.name);
    setUserIds(group.students.map((student) => student.id));
    setLeaderId(group.leader_id || group.leader?.id || '');
    setNotice(null);
    setNoticeError(false);
  };

  const toggleStudent = (id: number) => {
    setUserIds((current) => {
      const next = current.includes(id) ? current.filter((userId) => userId !== id) : [...current, id];
      setLeaderId((currentLeader) => {
        if (currentLeader && !next.includes(Number(currentLeader))) return '';
        return currentLeader;
      });
      return next;
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!leaderId) {
      setNoticeError(true);
      setNotice('Choose a leader or representative from the selected students.');
      return;
    }
    setSaving(true);
    setNotice(null);
    setNoticeError(false);
    try {
      await financialService.saveCleaningGroup({
        name: name.trim(),
        user_ids: userIds,
        leader_id: Number(leaderId),
      }, editingId ?? undefined);
      setNoticeError(false);
      setNotice(editingId ? 'Group updated.' : 'Group saved.');
      setCreating(false);
      setEditingId(null);
      setName('');
      setUserIds([]);
      setLeaderId('');
      await load();
    } catch (error) {
      setNoticeError(true);
      setNotice(apiError(error, 'Could not save that group.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (group: CleaningGroup) => {
    if (!window.confirm(`Remove ${group.name}? Past cleaning activities keep the students they already have.`)) return;
    setNotice(null);
    setNoticeError(false);
    try {
      await financialService.deleteCleaningGroup(group.id);
      if (editingId === group.id) {
        setEditingId(null);
        setCreating(false);
      }
      setNoticeError(false);
      setNotice('Group removed.');
      await load();
    } catch (error) {
      setNoticeError(true);
      setNotice(apiError(error, 'Could not remove that group.'));
    }
  };

  const editorOpen = creating || editingId !== null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" {...bindPopup(onClose)}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Cleaning groups</h3>
            <p className="mt-1 text-sm text-slate-500">A student belongs to one group. Saving moves them out of any other group. Each group needs a leader or representative who can show the activity passcode and QR. Past cleaning activities keep the roster they already have.</p>
          </div>
          <button type="button" onClick={startCreate} className="shrink-0 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl">New group</button>
        </div>

        {notice && <div className={`text-sm font-semibold rounded-2xl px-5 py-3 border ${noticeError ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>{notice}</div>}

        {groups.length === 0 && !editorOpen ? (
          <p className="text-sm text-slate-500">No cleaning groups yet.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <div key={group.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${editingId === group.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
                <button type="button" onClick={() => startEdit(group)} className="min-w-0 flex-1 text-left">
                  <p className="font-bold text-slate-900">{group.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Leader: {group.leader?.name || 'Not set'} · {group.student_count} student{group.student_count === 1 ? '' : 's'} · {group.students.map((student) => student.name).join(', ') || 'No students'}
                  </p>
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
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Students · {userIds.length} selected</p>
                <input value={search} onChange={(input) => setSearch(input.target.value)} placeholder="Search name, ID, or year" className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>
              <div className="mt-2 max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {visibleStudents.map((student) => {
                  const currentGroup = membership.get(student.id);
                  const elsewhere = currentGroup && !(editingId && groups.find((group) => group.id === editingId)?.students.some((member) => member.id === student.id));
                  return (
                    <label key={student.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input type="checkbox" checked={userIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                      <span className="font-bold text-slate-900">{student.name}</span>
                      <span className="text-slate-500">{student.student_id_number || 'No ID'} · {student.year_label}{elsewhere && currentGroup ? ` · now in ${currentGroup}` : ''}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Leader / representative
              <select
                required
                value={leaderId}
                onChange={(input) => setLeaderId(input.target.value ? Number(input.target.value) : '')}
                className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
              >
                <option value="">Choose from selected students</option>
                {selectedStudents.map((student) => (
                  <option key={student.id} value={student.id}>{student.name}</option>
                ))}
              </select>
            </label>
            <p className="text-sm text-slate-500">The leader must be one of the selected students and can show the same activity passcode and QR for this group&apos;s daily cleaning.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setCreating(false); setEditingId(null); }} className="px-4 py-2.5 font-bold text-slate-500">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50">{saving ? 'Saving...' : 'Save group'}</button>
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
