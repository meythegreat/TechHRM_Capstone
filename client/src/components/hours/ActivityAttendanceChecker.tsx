import { useEffect, useMemo, useState } from 'react';
import { financialService } from '../../services/financialService';

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
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">{notice || 'Loading activity roster…'}</p>
      </div>
    );
  }

  if (!event.uses_attendance) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Check attendance</p>
          <p className="text-sm text-slate-600 mt-1">
            WSPO Secretary tools: correct clock-in / time-out when the scanner fails, mark absent, or close unmarked students.
            Hours credit only at time-out when the clock-in was on time.
          </p>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            {event.marked_count}/{event.eligible_count} marked
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={markAbsent}
          className="px-4 py-2.5 bg-white border border-slate-200 text-sm font-bold rounded-xl text-slate-700 disabled:opacity-50"
        >
          Mark unmarked absent
        </button>
      </div>
      {notice && <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold rounded-xl px-4 py-2">{notice}</div>}
      <input
        value={search}
        onChange={(input) => setSearch(input.target.value)}
        placeholder="Search this roster"
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
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={timeInDrafts[entry.user_id] ?? entry.time_in ?? ''}
                onChange={(input) => setTimeInDrafts((current) => ({ ...current, [entry.user_id]: input.target.value }))}
                className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold"
                aria-label={`Clock-in time for ${entry.name}`}
              />
              <button type="button" disabled={busy} onClick={() => correctTime(entry.user_id)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white text-slate-700 border-slate-200 disabled:opacity-50">Save time in</button>
              <input
                type="time"
                value={timeOutDrafts[entry.user_id] ?? entry.time_out ?? event.ends_at ?? ''}
                onChange={(input) => setTimeOutDrafts((current) => ({ ...current, [entry.user_id]: input.target.value }))}
                className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold"
                aria-label={`Time-out for ${entry.name}`}
              />
              <button type="button" disabled={busy} onClick={() => correctTimeout(entry.user_id)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white text-slate-700 border-slate-200 disabled:opacity-50">Save time out</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => mark(entry.user_id, 'absent')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border disabled:opacity-50 ${entry.status === 'absent' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
              >
                Absent
              </button>
            </div>
          </div>
        ))}
        {roster.length === 0 && <p className="py-4 text-sm text-slate-500">No students match.</p>}
      </div>
    </div>
  );
}
