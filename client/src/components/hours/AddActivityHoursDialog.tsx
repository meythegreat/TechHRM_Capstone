import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CalendarPlus, X } from 'lucide-react';
import { financialService } from '../../services/financialService';
import { bindPopup } from '../../utils/popupDismiss';
import ClockTimeInput from '../ClockTimeInput';
import { HelpDisclosure } from '../HelpDisclosure';

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
  {
    id: 'special_request',
    label: 'Special request',
    hours: '',
    summary: 'Add or deduct custom event hours for selected students.',
    rules: ['Enter the event hours, choose whether to add or deduct them, and select the participating students.'],
  },
  {
    id: 'daily_cleaning',
    label: 'Daily cleaning',
    hours: '1',
    summary: 'Group activity crediting 1 hour upon time-out after an on-time clock-in.',
    rules: [
      'Every year level in the selected group shares the same QR code and passcode.',
      'Students clock in and time out using the live code at any time after clocking in; the recorded time-out is the exact moment they time out.',
      '1 hour is credited only upon time-out and only if the clock-in occurred within 1 hour of the official time in; later clock-ins are marked late and add no credit.',
    ],
  },
  {
    id: 'general_cleaning',
    label: 'General cleaning',
    hours: '5',
    summary: 'Group activity crediting 5 hours for on-time attendance.',
    rules: [
      '5 hours are applied to the selected year level in the group when saved (choose a specific year level to credit only that cohort).',
      'An on-time scan retains the credited hours; marking a student absent or late removes them.',
    ],
  },
  {
    id: 'devotional',
    label: 'Devotional meeting',
    hours: '1',
    summary: 'Required for every student. Credits 1 hour for on-time attendance.',
    rules: [
      'Every student is included. A group cannot be selected.',
      'Choose a year level only when this meeting is for that cohort; otherwise every year level is included.',
      'An on-time scan retains the hour; marking a student absent or late removes it.',
    ],
  },
  {
    id: 'meeting_assembly',
    label: 'Meeting assembly',
    hours: '5',
    summary: 'Required for every student. Credits 5 hours for on-time attendance.',
    rules: [
      'Every student is included. A group cannot be selected.',
      'Choose a year level only when this assembly is for that cohort; otherwise every year level is included.',
      'An on-time scan retains the credited hours; marking a student absent or late removes them.',
    ],
  },
] as const;

const coversEveryStudent = (kind: string) => kind === 'devotional' || kind === 'meeting_assembly';

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
    group_id: coversEveryStudent(event.kind) || !event.group_id ? '' : String(event.group_id),
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
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [form, setForm] = useState(() => (event ? formFromEvent(event) : emptyForm()));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    financialService.getHourStudents()
      .then((res) => setStudents(res.students || []))
      .catch(() => setStudents([]))
      .finally(() => setStudentsLoaded(true));
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
        group_id: coversEveryStudent(kind) ? '' : current.group_id,
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
        group_id: form.kind === 'special_request' || coversEveryStudent(form.kind) ? undefined : Number(form.group_id),
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

  const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 disabled:cursor-not-allowed disabled:opacity-65';
  const campusWide = coversEveryStudent(form.kind);
  const previewStudents = (campusWide
    ? students
    : (groups.find((group) => String(group.id) === String(form.group_id))?.students || [])
  ).filter((student) => form.year_level === '' || String(student.year_level || '') === form.year_level);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      {...bindPopup(onClose)}
    >
      <motion.form
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onSubmit={save}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 bg-slate-950 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
              <CalendarPlus className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-base font-black tracking-tight text-white">
                {editing ? 'Edit Activity Hours' : 'Add Activity Hours'}
              </h3>
              <p className="text-[11px] font-medium text-slate-400">
                Schedule campus activities, cleaning, devotionals, or hour adjustments
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          {notice && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            Activity Type
            <select value={form.kind} onChange={(input) => setKind(input.target.value)} disabled={editing} className={inputClass}>
              {KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}{kind.hours ? ` · ${kind.hours} hrs` : ''}</option>)}
            </select>
          </label>

          <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold text-slate-600">{KINDS.find((kind) => kind.id === form.kind)?.summary}</p>
            {(() => {
              const activeKind = KINDS.find((kind) => kind.id === form.kind);
              if (!activeKind || activeKind.rules.length <= 1) return null;
              return (
                <HelpDisclosure
                  variant="inline"
                  title="Credit & timing rules"
                  items={[...activeKind.rules]}
                />
              );
            })()}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Title
              <input required value={form.title} onChange={(input) => setForm({ ...form, title: input.target.value })} className={inputClass} />
            </label>
            <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Date
              <input required type="date" value={form.event_date} onChange={(input) => setForm({ ...form, event_date: input.target.value })} className={inputClass} />
            </label>
          </div>

          {form.kind === 'special_request' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Hours of the Event
                <input required type="number" min="0.5" step="0.5" value={form.hours} onChange={(input) => setForm({ ...form, hours: input.target.value })} className={inputClass} />
              </label>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Effect
                <select value={form.direction} onChange={(input) => setForm({ ...form, direction: input.target.value })} className={inputClass}>
                  <option value="add">Add hours</option>
                  <option value="deduct">Deduct hours</option>
                </select>
              </label>
            </div>
          )}

          {form.kind !== 'special_request' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Official Time In
                <ClockTimeInput
                  required
                  value={form.starts_at}
                  onChange={(startsAt) => {
                    const hoursValue = Number(form.hours || 1);
                    setForm((current) => ({
                      ...current,
                      starts_at: startsAt,
                      ends_at: current.ends_at && current.ends_at > startsAt ? current.ends_at : addHours(startsAt, hoursValue || 1),
                    }));
                  }}
                  className={inputClass}
                />
              </label>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Activity End / Time Out
                <ClockTimeInput required value={form.ends_at} onChange={(value) => setForm({ ...form, ends_at: value })} className={inputClass} />
              </label>
            </div>
          )}

          {form.kind !== 'special_request' && (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Group
                  <select
                    required={!campusWide}
                    disabled={campusWide}
                    value={campusWide ? '' : form.group_id}
                    onChange={(input) => setForm({ ...form, group_id: input.target.value })}
                    className={inputClass}
                  >
                    <option value="">{campusWide ? 'Everyone is required to attend' : 'Choose a group'}</option>
                    {!campusWide && groups.map((group) => (
                      <option key={group.id} value={group.id}>{group.name} · {group.students.length} student{group.students.length === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                  {campusWide && (
                    <span className="mt-1.5 block text-[11px] font-medium normal-case tracking-normal text-slate-500">
                      A group cannot be chosen because every student must attend.
                    </span>
                  )}
                </label>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Year Level
                  <select value={form.year_level} onChange={(input) => setForm({ ...form, year_level: input.target.value })} className={inputClass}>
                    <option value="">{campusWide ? 'All year levels' : 'All year levels in the group'}</option>
                    <option value="1">1st year</option>
                    <option value="2">2nd year</option>
                    <option value="3">3rd year</option>
                    <option value="4">4th year</option>
                  </select>
                </label>
              </div>
              {!campusWide && groupsLoaded && groups.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
                  No groups yet — create one under Groups in the Attendance Hub first.
                </p>
              ) : ((campusWide && studentsLoaded) || form.group_id) && (
                <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/50">
                  {previewStudents.length === 0 ? (
                    <p className="px-3.5 py-2 text-xs font-medium text-slate-500">No students in that year level.</p>
                  ) : previewStudents.map((student) => (
                    <p key={student.id} className="px-3.5 py-2 text-xs">
                      <span className="font-bold text-slate-900">{student.name}</span>
                      <span className="font-mono text-slate-500"> · {student.student_id_number || 'No ID'} · {student.year_label}{student.is_leader ? ' · Leader' : ''}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {form.kind === 'special_request' && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Students · {form.user_ids.length} selected
                </p>
                <input
                  value={search}
                  onChange={(input) => setSearch(input.target.value)}
                  placeholder="Search name, ID, or year…"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
              <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                {visibleStudents.map((student) => (
                  <label key={student.id} className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-xs transition hover:bg-slate-50">
                    <input type="checkbox" checked={form.user_ids.includes(student.id)} onChange={() => toggleStudent(student.id)} className="h-4 w-4 accent-blue-600" />
                    <span className="font-bold text-slate-900">{student.name}</span>
                    <span className="font-mono text-slate-500">{student.student_id_number || 'No ID'} · {student.year_label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-45"
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Save Activity'}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
