import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { financialService } from '../../services/financialService';
import { bindPopup } from '../../utils/popupDismiss';

interface StudentOption {
  id: number;
  name: string;
  student_id_number?: string | null;
  year_level?: number | null;
  year_label: string;
}

interface HourEntry {
  user_id: number;
  name: string;
  student_id_number?: string | null;
  year_level?: number | null;
  status?: string | null;
  scanned_at?: string | null;
  hours_delta: number;
}

interface HourEvent {
  id: number;
  kind: string;
  kind_label: string;
  title: string;
  event_date: string;
  hours: number;
  direction?: string | null;
  year_level?: number | null;
  year_label?: string | null;
  group_name?: string | null;
  starts_at?: string | null;
  window_minutes?: number;
  valid_until?: string | null;
  notes?: string | null;
  uses_attendance: boolean;
  eligible_count: number;
  marked_count: number;
  entries: HourEntry[];
}

const KINDS = [
  { id: 'special_request', label: 'Special request', hours: '', hint: 'Enter the hours of the event, then add or deduct them.' },
  { id: 'daily_cleaning', label: 'Daily cleaning', hours: '1', hint: 'Mixed groups, once a week. Cleaning usually runs 5:00–7:00. A clock-in during the first hour after the official time in adds 1 hour. After that hour is late and adds nothing.' },
  { id: 'general_cleaning', label: 'General cleaning', hours: '5', hint: '5 hours for the chosen year level. The QR adds those hours only during the first hour after the official time in.' },
  { id: 'devotional', label: 'Devotional meeting', hours: '1', hint: '1 hour for every working student, added only if they scan within 1 hour of the official time in.' },
  { id: 'meeting_assembly', label: 'Meeting assembly', hours: '5', hint: '5 hours per student, added only if they scan within 1 hour of the official time in.' },
] as const;

const emptyForm = {
  kind: 'daily_cleaning',
  title: 'Daily cleaning',
  event_date: '',
  hours: '1',
  direction: 'add',
  year_level: '1',
  group_name: '',
  starts_at: '05:00',
  notes: '',
  user_ids: [] as number[],
};

const canIssueActivity = () => {
  const role = localStorage.getItem('user_role') || '';
  const office = localStorage.getItem('assigned_office') || '';
  return role === 'WSPO Staff' && ['', 'WSPO', 'WSPO Coordinator', 'WSPO Secretary', 'WSPO President'].includes(office);
};

const apiError = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : '';
  return first || data?.message || fallback;
};

const statusLabel: Record<string, string> = {
  on_time: 'On time',
  late: 'Late',
  absent: 'Absent',
  applied: 'Applied',
};

export function HoursActivityBoard({
  readOnly,
  periodStart,
  periodEnd,
  onChanged,
}: {
  readOnly: boolean;
  periodStart: string;
  periodEnd: string;
  onChanged: () => void;
}) {
  const [events, setEvents] = useState<HourEvent[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');
  const [timeDrafts, setTimeDrafts] = useState<Record<number, string>>({});
  const issuer = canIssueActivity();

  const load = async () => {
    const res = await financialService.getHourEvents(periodStart, periodEnd);
    setEvents(res.events || []);
  };

  useEffect(() => {
    load().catch(() => setNotice('Could not load activities for this period.'));
  }, [periodStart, periodEnd]);

  useEffect(() => {
    financialService.getHourStudents()
      .then((res) => setStudents(res.students || []))
      .catch(() => setStudents([]));
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
    setForm((current) => ({
      ...current,
      kind,
      title: meta.label,
      hours: meta.hours,
      starts_at: kind === 'daily_cleaning' ? '05:00' : current.starts_at,
      user_ids: kind === 'special_request' || kind === 'daily_cleaning' ? current.user_ids : [],
    }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await financialService.saveHourEvent({
        kind: form.kind,
        title: form.title,
        event_date: form.event_date,
        hours: form.kind === 'special_request' ? Number(form.hours) : undefined,
        direction: form.kind === 'special_request' ? form.direction : undefined,
        year_level: form.kind === 'general_cleaning' ? Number(form.year_level) : undefined,
        group_name: form.kind === 'daily_cleaning' ? form.group_name : undefined,
        starts_at: form.kind === 'special_request' ? undefined : form.starts_at,
        notes: form.notes || undefined,
        user_ids: form.kind === 'special_request' || form.kind === 'daily_cleaning' ? form.user_ids : undefined,
      });
      setOpen(false);
      setForm({ ...emptyForm, event_date: periodStart });
      setNotice('Activity saved.');
      await load();
      onChanged();
    } catch (error) {
      setNotice(apiError(error, 'Could not save that activity.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: HourEvent) => {
    if (!window.confirm(`Remove ${item.title}? Its hours will leave the period total.`)) return;
    try {
      await financialService.deleteHourEvent(item.id);
      setNotice('Activity removed.');
      await load();
      onChanged();
    } catch (error) {
      setNotice(apiError(error, 'Could not remove that activity.'));
    }
  };

  const mark = async (item: HourEvent, userId: number, status: string) => {
    try {
      const res = await financialService.markHourEvent(item.id, [{ user_id: userId, status }]);
      setEvents((current) => current.map((row) => (row.id === item.id ? res.event : row)));
      onChanged();
    } catch (error) {
      setNotice(apiError(error, 'Could not save that mark.'));
    }
  };

  const correctTime = async (item: HourEvent, userId: number) => {
    const time = timeDrafts[userId];
    if (!time) {
      setNotice('Enter the clock-in time first.');
      return;
    }
    try {
      const res = await financialService.correctHourTime(item.id, userId, time);
      setEvents((current) => current.map((row) => (row.id === item.id ? res.event : row)));
      setNotice(res.message);
      onChanged();
    } catch (error) {
      setNotice(apiError(error, 'Could not save that time.'));
    }
  };

  const markAbsent = async (item: HourEvent) => {
    try {
      const res = await financialService.markHourEventAbsent(item.id);
      setEvents((current) => current.map((row) => (row.id === item.id ? res.event : row)));
      setNotice(res.message);
      onChanged();
    } catch (error) {
      setNotice(apiError(error, 'Could not mark the remaining students absent.'));
    }
  };

  const toggleStudent = (id: number) => {
    setForm((current) => ({
      ...current,
      user_ids: current.user_ids.includes(id)
        ? current.user_ids.filter((userId) => userId !== id)
        : [...current.user_ids, id],
    }));
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Activity hours</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Issue the QR code from the Attendance Hub. On time adds the activity hours. Late adds nothing and deducts nothing. Absent deducts the same hours.
            Daily cleaning counts as 1 hour when the student clocks in during the first hour after the official time in. General cleaning and assembly are 5 hours. Devotional is 1 hour. Every activity stays on time for 1 hour after the official time in.
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              setForm({ ...emptyForm, event_date: periodStart });
              setOpen(true);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add activity
          </button>
        )}
      </div>

      {notice && <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold rounded-2xl px-5 py-3">{notice}</div>}

      {events.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 px-6 py-8 text-sm text-slate-500">
          No special requests, cleaning, devotionals, or assemblies in this period.
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((item) => {
            const roster = item.entries.filter((entry) => {
              const term = rosterSearch.trim().toLowerCase();
              if (expanded !== item.id || !term) return true;
              return entry.name.toLowerCase().includes(term) || (entry.student_id_number || '').toLowerCase().includes(term);
            });
            return (
              <article key={item.id} className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  onKeyDown={(key) => {
                    if (key.key === 'Enter') setExpanded(expanded === item.id ? null : item.id);
                  }}
                  className="w-full px-5 py-4 flex flex-wrap items-center gap-3 text-left hover:bg-slate-50 cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.kind_label}
                      {item.group_name ? ` · ${item.group_name}` : ''}
                      {item.year_label ? ` · ${item.year_label}` : ''}
                      {item.direction ? ` · ${item.direction === 'deduct' ? 'Deduct' : 'Add'} ${item.hours} hrs` : ` · ${item.hours} hrs`}
                      {item.starts_at ? ` · time in ${item.starts_at}` : ''}
                      {item.valid_until ? ` · on time until ${item.valid_until}` : ''}
                      {' · '}{item.event_date}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-500">{item.marked_count}/{item.eligible_count} marked</span>
                  {!readOnly && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(click) => {
                        click.stopPropagation();
                        remove(item);
                      }}
                      onKeyDown={(key) => {
                        if (key.key === 'Enter') {
                          key.stopPropagation();
                          remove(item);
                        }
                      }}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </span>
                  )}
                </div>

                {expanded === item.id && (
                  <div className="border-t border-slate-100 px-5 py-4 space-y-4">
                    {item.uses_attendance && !readOnly && issuer && (
                      <div className="space-y-3">
                        <p className="text-sm text-slate-600">
                          The QR code for this activity is issued in the Attendance Hub. If the scanner fails, correct the clock-in time below. That time decides whether the hours are added.
                        </p>
                        <button type="button" onClick={() => markAbsent(item)} className="px-4 py-3 bg-white border border-slate-200 text-sm font-bold rounded-xl text-slate-700">Mark unmarked absent</button>
                      </div>
                    )}
                    <input
                      value={expanded === item.id ? rosterSearch : ''}
                      onChange={(input) => setRosterSearch(input.target.value)}
                      placeholder="Search this list"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold"
                    />
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {roster.map((entry) => (
                        <div key={entry.user_id} className="py-3 flex flex-wrap items-center gap-3">
                          <div className="min-w-[180px] flex-1">
                            <p className="font-bold text-slate-900 text-sm">{entry.name}</p>
                            <p className="text-xs text-slate-500">
                              {entry.student_id_number || 'No ID'}
                              {entry.year_level ? ` · Yr ${entry.year_level}` : ''}
                              {entry.status ? ` · ${statusLabel[entry.status] || entry.status}` : ' · Not marked'}
                              {entry.status ? ` · ${Number(entry.hours_delta).toFixed(2)} hrs` : ''}
                            </p>
                          </div>
                          {item.uses_attendance && !readOnly && issuer && (
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="time"
                                value={timeDrafts[entry.user_id] || ''}
                                onChange={(input) => setTimeDrafts((current) => ({ ...current, [entry.user_id]: input.target.value }))}
                                className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold"
                                aria-label={`Corrected time for ${entry.name}`}
                              />
                              <button type="button" onClick={() => correctTime(item, entry.user_id)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white text-slate-700 border-slate-200">Save time</button>
                              <button
                                type="button"
                                onClick={() => mark(item, entry.user_id, 'absent')}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${entry.status === 'absent' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
                              >
                                Absent
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {roster.length === 0 && <p className="py-4 text-sm text-slate-500">No students match.</p>}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" {...bindPopup(() => setOpen(false))}>
          <form onSubmit={save} className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-5">
            <h3 className="text-xl font-semibold text-slate-900">Add activity hours</h3>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Activity
              <select value={form.kind} onChange={(input) => setKind(input.target.value)} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900">
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
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Official time in
                <input required type="time" value={form.starts_at} onChange={(input) => setForm({ ...form, starts_at: input.target.value })} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
              </label>
            )}

            {form.kind === 'daily_cleaning' && (
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Group name
                <input required value={form.group_name} onChange={(input) => setForm({ ...form, group_name: input.target.value })} placeholder="Group A" className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
              </label>
            )}

            {form.kind === 'general_cleaning' && (
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Year level
                <select value={form.year_level} onChange={(input) => setForm({ ...form, year_level: input.target.value })} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold">
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </select>
              </label>
            )}

            {(form.kind === 'special_request' || form.kind === 'daily_cleaning') && (
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
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2.5 font-bold text-slate-500">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50">{saving ? 'Saving...' : 'Save activity'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
