import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { financialService } from '../../services/financialService';

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
  timed_in: 'Timed in',
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
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
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

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Activity hours</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Create these activities in the Attendance Hub for a group. Students clock in, then time out the same way they clocked in. Hours are added only when they time out, and only if that clock-in was on time. Late adds nothing and deducts nothing. Absent deducts the same hours.
            The group leader can show that activity&apos;s QR code and passcode, which works for every year level in the group. Every activity stays on time for 1 hour after the official time in.
          </p>
        </div>
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
                          The QR code for this activity is issued in the Attendance Hub. If the scanner fails, correct the clock-in time below. Hours are added only when the student times out, and only if that clock-in was on time.
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

    </section>
  );
}
