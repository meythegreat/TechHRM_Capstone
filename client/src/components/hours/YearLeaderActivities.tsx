import { useEffect, useState } from 'react';
import axios from 'axios';
import { ActivityQrCard } from './ActivityQrCard';
import { financialService } from '../../services/financialService';

interface LeaderEntry {
  user_id: number;
  name: string;
  student_id_number?: string | null;
  status?: string | null;
  time_in?: string | null;
  time_out?: string | null;
  hours_delta: number;
}

interface LeaderEvent {
  id: number;
  title: string;
  kind_label: string;
  event_date: string;
  year_label?: string | null;
  group_name?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  valid_until?: string | null;
  hours: number;
  uses_attendance: boolean;
  entries: LeaderEntry[];
}

const statusLabel: Record<string, string> = {
  on_time: 'On time',
  late: 'Late',
  timed_in: 'Timed in',
  absent: 'Absent',
};

const apiError = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : '';
  return first || data?.message || fallback;
};

export function YearLeaderActivities() {
  const [leader, setLeader] = useState(false);
  const [yearLabel, setYearLabel] = useState('');
  const [groupName, setGroupName] = useState('');
  const [events, setEvents] = useState<LeaderEvent[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [timeInDrafts, setTimeInDrafts] = useState<Record<number, string>>({});
  const [timeOutDrafts, setTimeOutDrafts] = useState<Record<number, string>>({});

  const load = async () => {
    const response = await axios.get('/api/attendance/my-year-activities');
    setLeader(Boolean(response.data.leader));
    setYearLabel(response.data.year_label || '');
    setGroupName(response.data.group_name || '');
    setEvents(response.data.events || []);
  };

  useEffect(() => {
    load().catch((err) => {
      setError(err?.response?.data?.message || 'Could not load your group activities.');
    });
  }, []);

  const correctTime = async (item: LeaderEvent, userId: number) => {
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
    } catch (err) {
      setNotice(apiError(err, 'Could not save that time in.'));
    }
  };

  const correctTimeout = async (item: LeaderEvent, userId: number) => {
    const saved = item.entries.find((entry) => entry.user_id === userId)?.time_out || '';
    const time = timeOutDrafts[userId] || saved || item.ends_at || '';
    if (!time) {
      setNotice('Enter the time-out first, or ask WSPO to set an activity end time.');
      return;
    }
    try {
      const res = await financialService.correctHourTimeout(item.id, userId, time);
      setEvents((current) => current.map((row) => (row.id === item.id ? res.event : row)));
      setNotice(res.message);
    } catch (err) {
      setNotice(apiError(err, 'Could not save that time out.'));
    }
  };

  if (error) {
    return <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl px-5 py-4 text-sm font-semibold">{error}</div>;
  }

  if (!leader) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Group activities</h1>
        <p className="mt-2 text-sm text-slate-500">Only a group leader can open attendance QR codes and passcodes for their group.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Group activities</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          You are the group leader{groupName ? ` for ${groupName}` : ''}{yearLabel ? ` (${yearLabel})` : ''}. Use the QR code or passcode so every year level in the group can clock in and time out, or enter clock-in and time-out manually below. Hours are added only when a student times out.
        </p>
      </div>
      {notice && <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold rounded-2xl px-5 py-3">{notice}</div>}
      {events.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 px-6 py-8 text-sm text-slate-500">
          No activities for your group right now.
        </div>
      ) : events.map((item) => (
        <article key={item.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <button type="button" onClick={() => setOpenId(openId === item.id ? null : item.id)} className="w-full px-5 py-4 text-left hover:bg-slate-50">
            <p className="font-bold text-slate-900">{item.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {item.kind_label}
              {item.group_name ? ` · ${item.group_name}` : ''}
              {item.year_label ? ` · ${item.year_label}` : ''}
              {item.starts_at ? ` · time in ${item.starts_at}` : ''}
              {item.ends_at ? ` · ends ${item.ends_at}` : ''}
              {item.valid_until ? ` · on time until ${item.valid_until}` : ''}
              {' · '}{item.event_date}
              {' · '}{Number(item.hours).toFixed(2)} hrs
            </p>
          </button>
          {openId === item.id && (
            <div className="border-t border-slate-100 px-5 py-4 space-y-4">
              {item.uses_attendance && <ActivityQrCard eventId={item.id} />}
              {item.uses_attendance && (
                <p className="text-sm text-slate-600">
                  If a student cannot scan, enter their clock-in and time-out here. Time out defaults to the activity end{item.ends_at ? ` (${item.ends_at})` : ''}. Hours are added only at time out, and only if that clock-in was on time.
                </p>
              )}
              <div className="divide-y divide-slate-100">
                {item.entries.map((entry) => (
                  <div key={entry.user_id} className="py-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-[180px] flex-1">
                      <p className="font-bold text-sm text-slate-900">{entry.name}</p>
                      <p className="text-xs text-slate-500">
                        {entry.student_id_number || 'No ID'}
                        {entry.status ? ` · ${statusLabel[entry.status] || entry.status}` : ' · Not marked'}
                        {entry.status ? ` · ${Number(entry.hours_delta).toFixed(2)} hrs` : ''}
                      </p>
                    </div>
                    {item.uses_attendance && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          value={timeInDrafts[entry.user_id] ?? entry.time_in ?? ''}
                          onChange={(input) => setTimeInDrafts((current) => ({ ...current, [entry.user_id]: input.target.value }))}
                          className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold"
                          aria-label={`Clock-in time for ${entry.name}`}
                        />
                        <button type="button" onClick={() => correctTime(item, entry.user_id)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white text-slate-700 border-slate-200">Save time in</button>
                        <input
                          type="time"
                          value={timeOutDrafts[entry.user_id] ?? entry.time_out ?? item.ends_at ?? ''}
                          onChange={(input) => setTimeOutDrafts((current) => ({ ...current, [entry.user_id]: input.target.value }))}
                          className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold"
                          aria-label={`Time-out for ${entry.name}`}
                        />
                        <button type="button" onClick={() => correctTimeout(item, entry.user_id)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white text-slate-700 border-slate-200">Save time out</button>
                      </div>
                    )}
                  </div>
                ))}
                {item.entries.length === 0 && <p className="py-3 text-sm text-slate-500">No students are on this activity yet.</p>}
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
