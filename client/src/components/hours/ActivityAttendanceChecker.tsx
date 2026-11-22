import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Search, Users } from 'lucide-react';
import { financialService } from '../../services/financialService';
import ClockTimeInput from '../ClockTimeInput';
import { HelpDisclosure } from '../HelpDisclosure';

interface HourEntry {
  user_id: number;
  name: string;
  student_id_number?: string | null;
  year_level?: number | null;
  status?: string | null;
  time_in?: string | null;
  time_out?: string | null;
  hours_delta: number;
}

interface HourEvent {
  id: number;
  title: string;
  kind_label?: string;
  event_date: string;
  ends_at?: string | null;
  uses_attendance: boolean;
  eligible_count: number;
  marked_count: number;
  entries: HourEntry[];
}

const statusLabel: Record<string, string> = {
  on_time: 'On time',
  late: 'Late',
  timed_in: 'Timed in',
  absent: 'Absent',
  applied: 'Applied',
  selected: 'Included',
};

const apiError = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : '';
  return first || data?.message || fallback;
};

const localIsoDate = (value = new Date()) => {
  const stamp = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return stamp.toISOString().slice(0, 10);
};

const shiftIsoDate = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return localIsoDate(new Date(y, (m || 1) - 1, (d || 1) + days));
};

/** Roster tools for WSPO Secretary (and other activity checkers) to verify/correct activity attendance. */
export function ActivityAttendanceChecker({
  eventId,
  eventDate,
  onChanged,
}: {
  eventId: number;
  eventDate?: string | null;
  onChanged?: () => void;
}) {
  const [event, setEvent] = useState<HourEvent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [timeInDrafts, setTimeInDrafts] = useState<Record<number, string>>({});
  const [timeOutDrafts, setTimeOutDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const anchor = (eventDate || localIsoDate()).slice(0, 10);
    const res = await financialService.getHourEvents(shiftIsoDate(anchor, -14), shiftIsoDate(anchor, 14));
    const rows = (res.events || []) as HourEvent[];
    const match = rows.find((row) => row.id === eventId) || null;
    setEvent(match);
  };

  useEffect(() => {
    setNotice(null);
    load().catch(() => setNotice('Could not load this activity roster.'));
  }, [eventId, eventDate]);

  const roster = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = event?.entries || [];
    if (!needle) return rows;
    return rows.filter((entry) => {
      const hay = `${entry.name} ${entry.student_id_number || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [event, search]);

  const mark = async (userId: number, status: string) => {
    if (!event) return;
    setBusy(true);
    try {
      const res = await financialService.markHourEvent(event.id, [{ user_id: userId, status }]);
      setEvent(res.event);
      setNotice('Attendance saved.');
      onChanged?.();
    } catch (error) {
      setNotice(apiError(error, 'Could not save that mark.'));
    } finally {
      setBusy(false);
    }
  };

  const markAbsent = async () => {
    if (!event) return;
    setBusy(true);
    try {
      const res = await financialService.markHourEventAbsent(event.id);
      setEvent(res.event);
      setNotice(res.message || 'Unmarked students marked absent.');
      onChanged?.();
    } catch (error) {
      setNotice(apiError(error, 'Could not mark unmarked students absent.'));
    } finally {
      setBusy(false);
    }
  };

  const correctTime = async (userId: number) => {
    if (!event) return;
    const saved = event.entries.find((entry) => entry.user_id === userId)?.time_in || '';
    const time = timeInDrafts[userId] || saved;
    if (!time) {
      setNotice('Enter the clock-in time first.');
      return;
    }
    setBusy(true);
    try {
      const res = await financialService.correctHourTime(event.id, userId, time);
      setEvent(res.event);
      setNotice(res.message || 'Clock-in saved.');
      onChanged?.();
    } catch (error) {
      setNotice(apiError(error, 'Could not save clock-in.'));
    } finally {
      setBusy(false);
    }
  };

  const correctTimeout = async (userId: number) => {
    if (!event) return;
    const saved = event.entries.find((entry) => entry.user_id === userId)?.time_out || '';
    const time = timeOutDrafts[userId] || saved || event.ends_at || '';
    if (!time) {
      setNotice('Enter the time-out first.');
      return;
    }
    setBusy(true);
    try {
      const res = await financialService.correctHourTimeout(event.id, userId, time);
      setEvent(res.event);
      setNotice(res.message || 'Time-out saved.');
      onChanged?.();
    } catch (error) {
      setNotice(apiError(error, 'Could not save time-out.'));
    } finally {
      setBusy(false);
    }
  };

  if (!event) {
    return (
      <div className="flex items-center gap-2.5 rounded-[1.5rem] border border-slate-200/90 bg-white p-5 text-xs font-bold text-slate-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
        <span>{notice || 'Loading activity roster…'}</span>
      </div>
    );
  }

  if (!event.uses_attendance) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200/90 bg-white shadow-xs">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <ClipboardCheck className="h-4 w-4" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black tracking-tight text-slate-900">Check Attendance</p>
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 font-mono text-[10px] font-extrabold text-blue-700">
                <Users className="h-3 w-3" /> {event.marked_count}/{event.eligible_count} marked
              </span>
            </div>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              Correct missed scans or mark unmarked students absent.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={markAbsent}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-rose-600 disabled:opacity-45"
        >
          Mark Unmarked Absent
        </button>
      </div>

      <div className="space-y-4 p-5">
        <HelpDisclosure
          variant="inline"
          title="Guidelines"
          items={[
            'Use these WSPO Secretary tools to fix clock-in/time-out when a scanner fails, mark absent, or close unmarked students.',
            'Hours are credited only at time-out and only when the clock-in was on time.',
          ]}
        />

        {notice && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-800">
            {notice}
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(input) => setSearch(input.target.value)}
            placeholder="Search this roster…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200/80 px-4">
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
              <div className="flex flex-wrap items-center gap-2">
                <ClockTimeInput
                  value={timeInDrafts[entry.user_id] ?? entry.time_in ?? ''}
                  onChange={(value) => setTimeInDrafts((current) => ({ ...current, [entry.user_id]: value }))}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-bold"
                  aria-label={`Clock-in time for ${entry.name}`}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => correctTime(entry.user_id)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-45"
                >
                  Save In
                </button>
                <ClockTimeInput
                  value={timeOutDrafts[entry.user_id] ?? entry.time_out ?? event.ends_at ?? ''}
                  onChange={(value) => setTimeOutDrafts((current) => ({ ...current, [entry.user_id]: value }))}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-bold"
                  aria-label={`Time-out for ${entry.name}`}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => correctTimeout(entry.user_id)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-45"
                >
                  Save Out
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => mark(entry.user_id, 'absent')}
                  className={`rounded-xl border px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider transition disabled:opacity-45 ${
                    entry.status === 'absent'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700'
                  }`}
                >
                  Absent
                </button>
              </div>
            </div>
          ))}
          {roster.length === 0 && (
            <p className="py-6 text-center text-xs font-medium text-slate-500">No students match.</p>
          )}
        </div>
      </div>
    </div>
  );
}
