import { useEffect, useMemo, useState } from 'react';
import { financialService } from '../services/financialService';
import { REALTIME_EVENT } from '../utils/realtime';
import {
  DEFAULT_HOURLY_RATE,
  hoursText,
  pesoText,
  type HourStudentRow,
} from './hours/HoursRenderedTables';

interface StudentActivity {
  id: number;
  title: string;
  kind_label: string;
  event_date: string;
  status?: string | null;
  hours_delta: number;
}

const statusLabel: Record<string, string> = {
  on_time: 'On time',
  late: 'Late',
  absent: 'Absent',
  applied: 'Applied',
};

const meetingHours = (student: HourStudentRow) =>
  Math.round((student.general_cleaning + student.devotional + student.meeting_assembly) * 100) / 100;

const formatDay = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function StudentCompensationView() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [student, setStudent] = useState<HourStudentRow | null>(null);
  const [activities, setActivities] = useState<StudentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const period = useMemo(() => {
    const [year, mon] = month.split('-').map(Number);
    const last = new Date(year, mon, 0).getDate();
    return {
      start: `${month}-01`,
      end: `${month}-${String(last).padStart(2, '0')}`,
    };
  }, [month]);

  useEffect(() => {
    let active = true;
    const load = (silent = false) => {
      if (!silent) setLoading(true);
      financialService
        .getMyHours(period.start, period.end)
        .then((res) => {
          if (!active) return;
          setStudent(res.student || null);
          setActivities(res.activities || []);
          setFailed(false);
        })
        .catch(() => {
          if (!active) return;
          setFailed(true);
        })
        .finally(() => {
          if (active && !silent) setLoading(false);
        });
    };
    load();
    const refresh = () => load(true);
    const interval = setInterval(refresh, 5000);
    window.addEventListener(REALTIME_EVENT, refresh);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener(REALTIME_EVENT, refresh);
    };
  }, [period.start, period.end]);

  if (loading && !student) {
    return <div className="p-8 text-center text-slate-400">Loading hours rendered...</div>;
  }

  if (failed || !student) {
    return <div className="p-8 text-center text-slate-500">Hours rendered could not be loaded.</div>;
  }

  const generalMeeting = meetingHours(student);
  const cells = [
    { label: 'DTR', value: student.dtr_hours },
    { label: 'Duty deduction', value: student.duty_deduction === 0 ? 0 : -student.duty_deduction },
    { label: 'Special', value: student.special_request },
    { label: 'Daily cleaning', value: student.daily_cleaning },
    { label: 'General meeting', value: generalMeeting },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Period breakdown</h2>
          <p className="text-sm text-slate-500 mt-1">Grand total = DTR hours − duty deductions + activity hours.</p>
        </div>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Month
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="mt-1 block px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
          />
        </label>
      </div>

      <div className="bg-slate-900 text-white rounded-2xl px-6 py-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Grand total hours</p>
          <p className="text-4xl font-semibold mt-1">{hoursText(student.grand_total)}</p>
          <p className="text-sm text-emerald-300 mt-1">{pesoText(student.grand_total, DEFAULT_HOURLY_RATE)} at ₱{hoursText(DEFAULT_HOURLY_RATE)}/hr</p>
        </div>
        <p className="text-sm text-slate-300">{student.year_level ? `Year ${student.year_level}` : 'Year not set'}</p>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {cells.map((cell) => {
            const tone = cell.value < 0 ? 'text-rose-600' : cell.value > 0 ? 'text-emerald-700' : 'text-slate-400';
            return (
              <div key={cell.label} className="px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{cell.label}</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{hoursText(cell.value)}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900">Activity hours</h3>
          <p className="text-sm text-slate-500 mt-1">On time adds the activity hours. Late adds nothing. Absent deducts the same hours.</p>
        </div>
        {activities.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No activity hours in this month.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activities.map((activity) => (
              <li key={activity.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">{activity.title}</p>
                  <p className="text-sm text-slate-500">{activity.kind_label} · {formatDay(activity.event_date)} · {statusLabel[activity.status || ''] || activity.status || 'Recorded'}</p>
                </div>
                <p className={`text-sm font-semibold tabular-nums ${activity.hours_delta < 0 ? 'text-rose-600' : activity.hours_delta > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {hoursText(activity.hours_delta)} hrs
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
