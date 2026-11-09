import { useEffect, useMemo, useState } from 'react';
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

export interface EditableHourEvent {
  id: number;
  kind: string;
  title: string;
  event_date: string;
  hours?: number;
  direction?: string | null;
  year_level?: number | null;
  group_id?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  notes?: string | null;
  uses_attendance?: boolean;
  entries?: { user_id: number }[];
}

const KINDS = [
  { id: 'special_request', label: 'Special request', hours: '', hint: 'Enter the hours of the event, then add or deduct them.' },
  { id: 'daily_cleaning', label: 'Daily cleaning', hours: '1', hint: 'Choose a group. Every year level in that group can use the same QR code and passcode. Students clock in, then time out the same way any time after they clock in. 1 hour is added only when they time out, and only if the clock-in was within the first hour after the official time in. A later clock-in is late and adds nothing. The recorded time out is the moment they time out.' },
  { id: 'general_cleaning', label: 'General cleaning', hours: '5', hint: '5 hours are added to the selected year in the group as soon as this is saved. Choose 4th year to credit only those students. Absent or late later removes the hours. An on-time scan keeps them.' },
  { id: 'devotional', label: 'Devotional meeting', hours: '1', hint: '1 hour is added to the selected year in the group as soon as this is saved. Absent or late later removes the hour. An on-time scan keeps it.' },
  { id: 'meeting_assembly', label: 'Meeting assembly', hours: '5', hint: '5 hours are added to the selected year in the group as soon as this is saved. Choose 4th year to credit only those students. Absent or late later removes the hours. An on-time scan keeps them.' },
] as const;

const today = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const addHours = (time: string, hours: number) => {
  const [hourText, minuteText] = time.split(':');
  const start = Number(hourText) * 60 + Number(minuteText || 0);
  const end = start + Math.max(60, Math.round(hours * 60));
  const hh = String(Math.floor(end / 60) % 24).padStart(2, '0');
  const mm = String(end % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};

const emptyForm = () => ({
  kind: 'daily_cleaning',
  title: 'Daily cleaning',
  event_date: today(),
  hours: '1',
  direction: 'add',
  group_id: '',
  year_level: '',
  starts_at: '05:00',
  ends_at: '06:00',
  notes: '',
  user_ids: [] as number[],
});

const formFromEvent = (event: EditableHourEvent) => {
  const starts = event.starts_at || '05:00';
  const hours = Number(event.hours || 1);
  return {
    kind: event.kind,
    title: event.title,
    event_date: event.event_date,
    hours: String(event.hours ?? ''),
    direction: event.direction || 'add',
    group_id: event.group_id ? String(event.group_id) : '',
    year_level: event.year_level ? String(event.year_level) : '',
    starts_at: starts,
    ends_at: event.ends_at || addHours(starts, hours || 1),
    notes: event.notes || '',
    user_ids: (event.entries || []).map((entry) => entry.user_id),
  };
};

const apiError = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : '';
  return first || data?.message || fallback;
};

export function AddActivityHoursDialog({
  onClose,
  onSaved,
  event,
}: {
  onClose: () => void;
  onSaved: (event: { id: number; event_date?: string; uses_attendance?: boolean }) => void;
  event?: EditableHourEvent | null;
}) {
  const editing = Boolean(event?.id);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string; students: StudentOption[] }[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [form, setForm] = useState(() => (event ? formFromEvent(event) : emptyForm()));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    financialService.getHourStudents()
      .then((res) => setStudents(res.students || []))
      .catch(() => setStudents([]));
    financialService.getCleaningGroups()
      .then((res) => setGroups(res.groups || []))
      .catch(() => setGroups([]))
      .finally(() => setGroupsLoaded(true));
  }, []);

  const visibleStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) =>
      student.name.toLowerCase().includes(term)
      || (student.student_id_number || '').toLowerCase().includes(term)
      || student.year_label.toLowerCase().includes(term)
    );
  }, [students, search]);

  const setKind = (kind: string) => {
    const meta = KINDS.find((item) => item.id === kind) || KINDS[0];
    setForm((current) => {
      const startsAt = kind === 'daily_cleaning' ? '05:00' : current.starts_at;
      const hoursValue = meta.hours ? Number(meta.hours) : Number(current.hours || 1);
      return {
        ...current,
        kind,
        title: meta.label,
        hours: meta.hours,
        starts_at: startsAt,
        ends_at: meta.hours ? addHours(startsAt, hoursValue) : current.ends_at,
        user_ids: kind === 'special_request' || kind === 'daily_cleaning' ? current.user_ids : [],
      };
    });
  };

  const toggleStudent = (id: number) => {
    setForm((current) => ({
      ...current,
      user_ids: current.user_ids.includes(id)
        ? current.user_ids.filter((userId) => userId !== id)
        : [...current.user_ids, id],
    }));
  };

  const save = async (submit: React.FormEvent) => {
    submit.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await financialService.saveHourEvent({
        kind: form.kind,
        title: form.title,
        event_date: form.event_date,
        hours: form.kind === 'special_request' ? Number(form.hours) : undefined,
        direction: form.kind === 'special_request' ? form.direction : undefined,
        group_id: form.kind === 'special_request' ? undefined : Number(form.group_id),
        year_level: form.kind === 'special_request' || form.year_level === '' ? undefined : Number(form.year_level),
        starts_at: form.kind === 'special_request' ? undefined : form.starts_at,
        ends_at: form.kind === 'special_request' ? undefined : form.ends_at,
        notes: form.notes || undefined,
        user_ids: form.kind === 'special_request' ? form.user_ids : undefined,
      }, event?.id);
      onSaved(res.event || { id: event?.id || 0, event_date: form.event_date, uses_attendance: form.kind !== 'special_request' });
    } catch (error) {
      setNotice(apiError(error, editing ? 'Could not update that activity.' : 'Could not save that activity.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" {...bindPopup(onClose)}>
      <form onSubmit={save} className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-5">
        <h3 className="text-xl font-semibold text-slate-900">{editing ? 'Edit activity hours' : 'Add activity hours'}</h3>
        {notice && <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold rounded-2xl px-5 py-3">{notice}</div>}
        <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
          Activity
          <select value={form.kind} onChange={(input) => setKind(input.target.value)} disabled={editing} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 disabled:opacity-70">
            {KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}{kind.hours ? ` · ${kind.hours} hrs` : ''}</option>)}
          </select>
        </label>
        <p className="text-sm text-slate-500">{KINDS.find((kind) => kind.id === form.kind)?.hint}</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
            Title
            <input required value={form.title} onChange={(input) => setForm({ ...form, title: input.target.value })} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
            Date
            <input required type="date" value={form.event_date} onChange={(input) => setForm({ ...form, event_date: input.target.value })} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
          </label>
        </div>

        {form.kind === 'special_request' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Hours of the event
              <input required type="number" min="0.5" step="0.5" value={form.hours} onChange={(input) => setForm({ ...form, hours: input.target.value })} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Effect
              <select value={form.direction} onChange={(input) => setForm({ ...form, direction: input.target.value })} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold">
                <option value="add">Add hours</option>
                <option value="deduct">Deduct hours</option>
              </select>
            </label>
          </div>
        )}

        {form.kind !== 'special_request' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Official time in
              <input
                required
                type="time"
                value={form.starts_at}
                onChange={(input) => {
                  const startsAt = input.target.value;
                  const hoursValue = Number(form.hours || 1);
                  setForm((current) => ({
                    ...current,
                    starts_at: startsAt,
                    ends_at: current.ends_at && current.ends_at > startsAt ? current.ends_at : addHours(startsAt, hoursValue || 1),
                  }));
                }}
                className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Activity end / time out
              <input required type="time" value={form.ends_at} onChange={(input) => setForm({ ...form, ends_at: input.target.value })} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
            </label>
          </div>
        )}

        {form.kind !== 'special_request' && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Group
                <select required value={form.group_id} onChange={(input) => setForm({ ...form, group_id: input.target.value })} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900">
                  <option value="">Choose a group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name} · {group.students.length} student{group.students.length === 1 ? '' : 's'}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Year level
                <select value={form.year_level} onChange={(input) => setForm({ ...form, year_level: input.target.value })} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900">
                  <option value="">All year levels in the group</option>
                  <option value="1">1st year</option>
                  <option value="2">2nd year</option>
                  <option value="3">3rd year</option>
                  <option value="4">4th year</option>
                </select>
              </label>
            </div>
            {groupsLoaded && groups.length === 0 ? (
              <p className="text-sm text-slate-500">No groups yet. The coordinator can add them from Groups in the Attendance Hub. Assign one group leader, then the members.</p>
            ) : form.group_id && (
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {(groups.find((group) => String(group.id) === String(form.group_id))?.students || [])
                  .filter((student) => form.year_level === '' || String(student.year_level || '') === form.year_level)
                  .map((student) => (
                  <p key={student.id} className="px-3 py-2 text-sm">
                    <span className="font-bold text-slate-900">{student.name}</span>
                    <span className="text-slate-500"> · {student.student_id_number || 'No ID'} · {student.year_label}{student.is_leader ? ' · Leader' : ''}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {form.kind === 'special_request' && (
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Students · {form.user_ids.length} selected</p>
              <input value={search} onChange={(input) => setSearch(input.target.value)} placeholder="Search name, ID, or year" className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold" />
            </div>
            <div className="mt-2 max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {visibleStudents.map((student) => (
                <label key={student.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" checked={form.user_ids.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                  <span className="font-bold text-slate-900">{student.name}</span>
                  <span className="text-slate-500">{student.student_id_number || 'No ID'} · {student.year_label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 font-bold text-slate-500">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save changes' : 'Save activity'}</button>
        </div>
      </form>
    </div>
  );
}
