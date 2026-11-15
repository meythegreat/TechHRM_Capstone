import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { financialService } from '../../services/financialService';
import { janitorialGroupService, type JanitorialGroup } from '../../services/janitorialGroupService';
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

export function JanitorialGroupsDialog({ onClose }: { onClose: () => void }) {
  const [groups, setGroups] = useState<JanitorialGroup[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [department, setDepartment] = useState('');
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [supervisorId, setSupervisorId] = useState<number | null>(null);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const [groupRes, studentRes] = await Promise.all([
      janitorialGroupService.list(),
      financialService.getHourStudents(),
    ]);
    setGroups(groupRes);
    setStudents((studentRes.students || []) as StudentOption[]);
  };

  useEffect(() => {
    load().catch(() => {
      setNoticeError(true);
      setNotice('Could not load janitorial groups.');
    });
  }, []);

  const departments = useMemo(() => {
    const set = new Set<string>();
    students.forEach((student) => {
      const office = (student.assigned_office || '').trim();
      if (office) set.add(office);
    });
    groups.forEach((group) => {
      if (group.department) set.add(group.department);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [students, groups]);

  const term = search.trim().toLowerCase();
  const pool = useMemo(() => {
    const scoped = department
      ? students.filter((student) => (student.assigned_office || '').toLowerCase() === department.toLowerCase())
      : students;
    if (!term) return scoped;
    return scoped.filter((student) => (
      student.name.toLowerCase().includes(term)
      || (student.student_id_number || '').toLowerCase().includes(term)
    ));
  }, [students, department, term]);

  const resetForm = () => {
    setEditingId(null);
    setDepartment(departments[0] || '');
    setName('');
    setArea('');
    setSupervisorId(null);
    setMemberIds([]);
    setCreating(false);
  };

  const startCreate = () => {
    resetForm();
    setCreating(true);
    setDepartment(departments[0] || '');
  };

  const startEdit = (group: JanitorialGroup) => {
    setCreating(true);
    setEditingId(group.id);
    setDepartment(group.department);
    setName(group.name);
    setArea(group.area);
    setSupervisorId(group.supervisor?.id ?? null);
    setMemberIds(group.members.map((member) => member.id));
  };

  const toggleMember = (id: number) => {
    if (id === supervisorId) return;
    setMemberIds((current) => (
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id].slice(0, 5)
    ));
  };

  const save = async () => {
    if (!supervisorId) {
      setNoticeError(true);
      setNotice('Choose one janitorial student supervisor.');
      return;
    }
    setSaving(true);
    try {
      const res = await janitorialGroupService.save({
        id: editingId || undefined,
        department: department.trim(),
        name: name.trim(),
        area: area.trim(),
        supervisor_user_id: supervisorId,
        member_ids: memberIds.filter((id) => id !== supervisorId).slice(0, 5),
      });
      setNoticeError(false);
      setNotice(res.message || 'Saved.');
      await load();
      resetForm();
    } catch (error) {
      setNoticeError(true);
      setNotice(apiError(error, 'Could not save the group.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('Remove this janitorial group?')) return;
    try {
      const res = await janitorialGroupService.remove(id);
      setNoticeError(false);
      setNotice(res.message || 'Removed.');
      await load();
      if (editingId === id) resetForm();
    } catch (error) {
      setNoticeError(true);
      setNotice(apiError(error, 'Could not remove the group.'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" {...bindPopup(onClose)}>
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Janitorial groups</h2>
            <p className="text-sm text-slate-500 mt-1">
              Up to 5 groups per department. Each group has 1 student supervisor and up to 5 members, with a cleaning area.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800 text-sm font-bold">Close</button>
        </div>

        <div className="p-6 space-y-5">
          {notice && (
            <p className={`text-sm font-medium ${noticeError ? 'text-rose-600' : 'text-emerald-700'}`}>{notice}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startCreate}
              className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold"
            >
              New group
            </button>
          </div>

          {creating && (
            <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Department</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold"
                  >
                    <option value="">Select…</option>
                    {departments.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Group name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Area</label>
                  <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. East wing hallways" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Search students</label>
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Supervisor (1)</p>
                  <ul className="max-h-48 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-2">
                    {pool.map((student) => (
                      <li key={`sup-${student.id}`}>
                        <label className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-slate-50">
                          <input
                            type="radio"
                            name="janitorial-supervisor"
                            checked={supervisorId === student.id}
                            onChange={() => {
                              setSupervisorId(student.id);
                              setMemberIds((current) => current.filter((id) => id !== student.id));
                            }}
                          />
                          <span className="font-medium text-slate-800">{student.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Members (up to 5)</p>
                  <ul className="max-h-48 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-2">
                    {pool.filter((student) => student.id !== supervisorId).map((student) => (
                      <li key={`mem-${student.id}`}>
                        <label className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={memberIds.includes(student.id)}
                            disabled={!memberIds.includes(student.id) && memberIds.length >= 5}
                            onChange={() => toggleMember(student.id)}
                          />
                          <span className="font-medium text-slate-800">{student.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={save} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
                  {saving ? 'Saving…' : (editingId ? 'Update group' : 'Create group')}
                </button>
                <button type="button" onClick={resetForm} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <ul className="space-y-3">
            {groups.length === 0 ? (
              <li className="text-sm text-slate-500">No janitorial groups yet.</li>
            ) : groups.map((group) => (
              <li key={group.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{group.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {group.department} · Area: {group.area} · Supervisor: {group.supervisor?.name || '—'}
                    </p>
                    <p className="text-xs text-slate-600 mt-2">
                      Members: {group.members.map((member) => member.name).join(', ') || 'None'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEdit(group)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold">Edit</button>
                    <button type="button" onClick={() => remove(group.id)} className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold inline-flex items-center gap-1">
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
