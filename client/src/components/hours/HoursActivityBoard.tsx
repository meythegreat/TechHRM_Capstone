import { useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, ClipboardCheck, Pencil, Search, Trash2, Users } from 'lucide-react';
import { financialService } from '../../services/financialService';
import { canCheckActivityAttendance } from '../../utils/wspoActivityAccess';
import { AddActivityHoursDialog, type EditableHourEvent } from './AddActivityHoursDialog';
import { formatClockTime } from '../../utils/scheduleTime';
import ClockTimeInput from '../ClockTimeInput';
import { HelpDisclosure } from '../HelpDisclosure';

interface HourEntry {
  user_id: number;
  name: string;
  student_id_number?: string | null;
  year_level?: number | null;
  status?: string | null;
  scanned_at?: string | null;
  time_in?: string | null;
  time_out?: string | null;
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
  group_id?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  window_minutes?: number;
  valid_until?: string | null;
  notes?: string | null;
  uses_attendance: boolean;
  eligible_count: number;
  marked_count: number;
  entries: HourEntry[];
}

const canIssueActivity = () => canCheckActivityAttendance();

const apiError = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : '';
  return first || data?.message || fallback;
};

const statusLabel: Record<string, string> = {
  on_time: 'On time',
  late: 'Late',
  timed_in: 'Timed in',
  absent: 'Absent',
  applied: 'Applied',
  selected: 'Included',
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
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [rosterSearch, setRosterSearch] = useState('');
  const [timeInDrafts, setTimeInDrafts] = useState<Record<number, string>>({});
  const [timeOutDrafts, setTimeOutDrafts] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<EditableHourEvent | null>(null);
  const issuer = canIssueActivity();

  const load = async () => {
    const res = await financialService.getHourEvents(periodStart, periodEnd);
    setEvents(res.events || []);
  };

  useEffect(() => {
    load().catch(() => setNotice('Could not load activities for this period.'));
  }, [periodStart, periodEnd]);

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
    const saved = item.entries.find((entry) => entry.user_id === userId)?.time_in || '';
    const time = timeInDrafts[userId] || saved;
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
      setNotice(apiError(error, 'Could not save that time in.'));
    }
  };

  const correctTimeout = async (item: HourEvent, userId: number) => {
    const saved = item.entries.find((entry) => entry.user_id === userId)?.time_out || '';
    const time = timeOutDrafts[userId] || saved || item.ends_at || '';
    if (!time) {
      setNotice('Enter the time-out first, or set an activity end time.');
      return;
    }
    try {
      const res = await financialService.correctHourTimeout(item.id, userId, time);
      setEvents((current) => current.map((row) => (row.id === item.id ? res.event : row)));
      setNotice(res.message);
      onChanged();
    } catch (error) {
      setNotice(apiError(error, 'Could not save that time out.'));
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

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-slate-950 px-6 py-5 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-indigo-500/25 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-white">Activity Hours</h2>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-300">
                Review scheduled campus activities and manage student attendance marks.
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 font-mono text-[10px] font-extrabold uppercase tracking-wider text-slate-200">
            {events.length} {events.length === 1 ? 'Activity' : 'Activities'}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-6">
        <HelpDisclosure
          variant="inline"
          title="How activity hours work"
          items={[
            'Create cleaning activities for a group. Devotional meetings and meeting assemblies include every student, with an optional year level.',
            'The WSPO Secretary is the primary campus checker for activity attendance, with Coordinator and President sharing the same tools.',
            'Every activity remains on time for 1 hour after the official time in; marking a student absent removes credited hours while an on-time scan keeps them.',
            'The group leader can display the activity QR code and passcode for all year levels in the group and correct missed scans from Group Activities.',
          ]}
        />

        {notice && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
            {notice}
          </div>
        )}

        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
            <CalendarDays className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
            <p className="text-sm font-extrabold text-slate-700">No activities in this period</p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Special requests, cleaning, devotionals, and assemblies will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((item) => {
              const isOpen = expanded === item.id;
              const roster = item.entries.filter((entry) => {
                const term = rosterSearch.trim().toLowerCase();
                if (!isOpen || !term) return true;
                return entry.name.toLowerCase().includes(term) || (entry.student_id_number || '').toLowerCase().includes(term);
              });
              return (
                <article
                  key={item.id}
                  className={`overflow-hidden rounded-2xl border bg-white transition ${
                    isOpen ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    onKeyDown={(key) => {
                      if (key.key === 'Enter') setExpanded(isOpen ? null : item.id);
                    }}
                    className="flex w-full cursor-pointer flex-wrap items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/70"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black tracking-tight text-slate-900">{item.title}</p>
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                          {item.kind_label}
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-mono text-[10px] font-extrabold text-emerald-700">
                          {item.direction ? `${item.direction === 'deduct' ? '−' : '+'}${item.hours} hrs` : `${item.hours} hrs`}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs font-medium text-slate-500">
                        {item.event_date}
                        {item.group_name ? ` · ${item.group_name}` : ''}
                        {item.year_label ? ` · ${item.year_label}` : ''}
                        {item.starts_at ? ` · in ${formatClockTime(item.starts_at)}` : ''}
                        {item.ends_at ? ` · out ${formatClockTime(item.ends_at)}` : ''}
                        {item.valid_until ? ` · on time until ${formatClockTime(item.valid_until)}` : ''}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-[11px] font-extrabold text-slate-600">
                      <Users className="h-3 w-3 text-slate-400" />
                      {item.marked_count}/{item.eligible_count}
                    </span>
                    {!readOnly && issuer && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(click) => {
                          click.stopPropagation();
                          setEditing(item);
                        }}
                        onKeyDown={(key) => {
                          if (key.key === 'Enter') {
                            key.stopPropagation();
                            setEditing(item);
                          }
                        }}
                        className="rounded-xl p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-600"
                        aria-label={`Edit ${item.title}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </span>
                    )}
                    {!readOnly && issuer && (
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
                        className="rounded-xl p-2 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
                        aria-label={`Remove ${item.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </span>
                    )}
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-blue-600' : ''
                      }`}
                    />
                  </div>

                  {isOpen && (
                    <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 px-5 py-4">
                      {item.uses_attendance && !readOnly && issuer && (
                        <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs font-medium text-slate-600">
                              Correct missed scans below{item.ends_at ? ` (time-out defaults to ${formatClockTime(item.ends_at)})` : ''}.
                            </p>
                            <button
                              type="button"
                              onClick={() => markAbsent(item)}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider text-white transition hover:bg-rose-600"
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" /> Mark Unmarked Absent
                            </button>
                          </div>
                          <HelpDisclosure
                            variant="inline"
                            title="Attendance correction rules"
                            items={[
                              'Live QR codes for this activity are issued from the Attendance Hub.',
                              `If a scanner fails, enter clock-in and time-out manually below; time-out defaults to the activity end time${item.ends_at ? ` (${formatClockTime(item.ends_at)})` : ''}.`,
                              'Hours are credited only upon time-out, and only when the clock-in was on time.',
                            ]}
                          />
                        </div>
                      )}
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          value={isOpen ? rosterSearch : ''}
                          onChange={(input) => setRosterSearch(input.target.value)}
                          placeholder="Search this roster…"
                          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                        />
                      </div>
                      <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white px-4">
                        {roster.map((entry) => (
                          <div key={entry.user_id} className="flex flex-wrap items-center gap-3 py-3">
                            <div className="min-w-[180px] flex-1">
                              <p className="text-sm font-extrabold text-slate-900">{entry.name}</p>
                              <p className="font-mono text-xs font-medium text-slate-500">
                                {entry.student_id_number || 'No ID'}
                                {entry.year_level ? ` · Yr ${entry.year_level}` : ''}
                                {entry.status ? ` · ${statusLabel[entry.status] || entry.status}` : ' · Not marked'}
                                {entry.status ? ` · ${Number(entry.hours_delta).toFixed(2)} hrs` : ''}
                              </p>
                            </div>
                            {item.uses_attendance && !readOnly && issuer && (
                              <div className="flex flex-wrap items-center gap-2">
                                <ClockTimeInput
                                  value={timeInDrafts[entry.user_id] ?? entry.time_in ?? ''}
                                  onChange={(value) => setTimeInDrafts((current) => ({ ...current, [entry.user_id]: value }))}
                                  className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-bold"
                                  aria-label={`Clock-in time for ${entry.name}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => correctTime(item, entry.user_id)}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                                >
                                  Save In
                                </button>
                                <ClockTimeInput
                                  value={timeOutDrafts[entry.user_id] ?? entry.time_out ?? item.ends_at ?? ''}
                                  onChange={(value) => setTimeOutDrafts((current) => ({ ...current, [entry.user_id]: value }))}
                                  className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-bold"
                                  aria-label={`Time-out for ${entry.name}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => correctTimeout(item, entry.user_id)}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                                >
                                  Save Out
                                </button>
                                <button
                                  type="button"
                                  onClick={() => mark(item, entry.user_id, 'absent')}
                                  className={`rounded-xl border px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider transition ${
                                    entry.status === 'absent'
                                      ? 'border-slate-900 bg-slate-900 text-white'
                                      : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700'
                                  }`}
                                >
                                  Absent
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                        {roster.length === 0 && (
                          <p className="py-6 text-center text-xs font-medium text-slate-500">No students match.</p>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <AddActivityHoursDialog
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice('Activity updated.');
            await load();
            onChanged();
          }}
        />
      )}
    </section>
  );
}
