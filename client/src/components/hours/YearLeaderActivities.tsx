import { useEffect, useState } from 'react';
import axios from 'axios';
import { ActivityQrCard } from './ActivityQrCard';

interface LeaderEntry {
  user_id: number;
  name: string;
  student_id_number?: string | null;
  status?: string | null;
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
  valid_until?: string | null;
  hours: number;
  uses_attendance: boolean;
  entries: LeaderEntry[];
}

const statusLabel: Record<string, string> = {
  on_time: 'On time',
  late: 'Late',
  absent: 'Absent',
};

export function YearLeaderActivities() {
  const [leader, setLeader] = useState(false);
  const [yearLabel, setYearLabel] = useState('');
  const [groupName, setGroupName] = useState('');
  const [events, setEvents] = useState<LeaderEvent[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/api/attendance/my-year-activities')
      .then((response) => {
        setLeader(Boolean(response.data.leader));
        setYearLabel(response.data.year_label || '');
        setGroupName(response.data.group_name || '');
        setEvents(response.data.events || []);
      })
      .catch((err) => {
        setError(err?.response?.data?.message || 'Could not load your group activities.');
      });
  }, []);

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
          You are the group leader{groupName ? ` for ${groupName}` : ''}{yearLabel ? ` (${yearLabel})` : ''}. Use the QR code or passcode so every year level in the group can record attendance.
        </p>
      </div>
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
              {item.valid_until ? ` · on time until ${item.valid_until}` : ''}
              {' · '}{item.event_date}
              {' · '}{Number(item.hours).toFixed(2)} hrs
            </p>
          </button>
          {openId === item.id && (
            <div className="border-t border-slate-100 px-5 py-4 space-y-4">
              {item.uses_attendance && <ActivityQrCard eventId={item.id} />}
              <div className="divide-y divide-slate-100">
                {item.entries.map((entry) => (
                  <div key={entry.user_id} className="py-3">
                    <p className="font-bold text-sm text-slate-900">{entry.name}</p>
                    <p className="text-xs text-slate-500">
                      {entry.student_id_number || 'No ID'}
                      {entry.status ? ` · ${statusLabel[entry.status] || entry.status}` : ' · Not marked'}
                      {entry.status ? ` · ${Number(entry.hours_delta).toFixed(2)} hrs` : ''}
                    </p>
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
