import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Users, X } from 'lucide-react';
import { financialService } from '../../services/financialService';
import { bindPopup } from '../../utils/popupDismiss';
import { HelpDisclosure } from '../HelpDisclosure';

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

  const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20';

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
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 bg-slate-950 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-base font-black tracking-tight text-white">Activity Groups</h3>
              <p className="text-[11px] font-medium text-slate-400">
                Manage campus activity groups, group leaders, and member rosters
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-500"
            >
              <Plus className="h-3.5 w-3.5" /> New Group
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
            title="How activity groups work"
            items={[
              'These rosters apply across campus activities and can only be assigned by the WSPO coordinator.',
              'Select one group leader from any year level first, then add members across any mix of year levels.',
              'The leader can open activity attendance and display a shared QR code and passcode for every year level in the group.',
            ]}
          />

          {notice && (
            <div className={`rounded-xl border px-4 py-3 text-xs font-bold ${noticeError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
              {notice}
            </div>
          )}

          {groups.length === 0 && !editorOpen ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
              <Users className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
              <p className="text-sm font-extrabold text-slate-700">No groups yet</p>
              <p className="mt-1 text-xs font-medium text-slate-400">Click New Group above to create your first roster.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition ${
                    editingId === group.id ? 'border-blue-300 bg-blue-50/60 ring-1 ring-blue-100' : 'border-slate-200/90 bg-white hover:border-slate-300'
                  }`}
                >
                  <button type="button" onClick={() => startEdit(group)} className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-black tracking-tight text-slate-900">{group.name}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">{groupSummary(group)}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(group)}
                    className="rounded-xl p-2 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Remove ${group.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {editorOpen && (
            <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-5">
              <h4 className="text-sm font-black tracking-tight text-slate-900">
                {editingId ? 'Edit Group' : 'Create New Group'}
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Group Name
                  <input required value={name} onChange={(input) => setName(input.target.value)} placeholder="Group A" className={inputClass} />
                </label>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Search Students
                  <input value={search} onChange={(input) => setSearch(input.target.value)} placeholder="Name, ID, or year…" className={inputClass} />
                </label>
              </div>

              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Leader · One Student, Any Year
                </p>
                <p className="mt-1 text-xs font-bold text-slate-600">
                  {leader ? `${leader.name} · ${leader.year_label}` : 'Select the leader first.'}
                </p>
                <div className="mt-2 max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                  {visibleStudents.length === 0 ? (
                    <p className="px-3.5 py-3 text-xs font-medium text-slate-500">No students match that search.</p>
                  ) : visibleStudents.map((student) => (
                    <label key={student.id} className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-xs transition hover:bg-slate-50">
                      <input type="radio" name="group-leader" checked={leaderId === student.id} onChange={() => chooseLeader(student.id)} className="h-4 w-4 accent-blue-600" />
                      <span className="font-bold text-slate-900">{student.name}</span>
                      <span className="font-mono text-slate-500">{student.student_id_number || 'No ID'} · {student.year_label}{placementNote(student)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Members by Year Level · {memberIds.length} Selected
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Select members from any year level (excluding the group leader).
                </p>
                <div className="mt-2 space-y-3">
                  {memberSections.length === 0 ? (
                    <p className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs font-medium text-slate-500">
                      No members match that search.
                    </p>
                  ) : memberSections.map((section) => {
                    const selected = section.students.filter((student) => memberIds.includes(student.id)).length;
                    return (
                      <div key={section.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3.5 py-2">
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">{section.label}</p>
                          <p className="font-mono text-[11px] font-extrabold text-blue-700">{selected} selected</p>
                        </div>
                        <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
                          {section.students.map((student) => (
                            <label key={student.id} className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-xs transition hover:bg-slate-50">
                              <input type="checkbox" checked={memberIds.includes(student.id)} onChange={() => toggleMember(student.id)} className="h-4 w-4 accent-blue-600" />
                              <span className="font-bold text-slate-900">{student.name}</span>
                              <span className="font-mono text-slate-500">{student.student_id_number || 'No ID'}{placementNote(student)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={resetEditor}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !leaderId}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-45"
                >
                  {saving ? 'Saving…' : 'Save Group'}
                </button>
              </div>
            </form>
          )}
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
