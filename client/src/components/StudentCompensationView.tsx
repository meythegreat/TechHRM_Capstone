import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Calendar,
  AlertCircle,
  Sparkles,
  GraduationCap,
  Activity,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import { HelpDisclosure } from './HelpDisclosure';
import { financialService } from '../services/financialService';
import { hourLimitService, type HourLimitStatus } from '../services/hourLimitService';
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
  timed_in: 'Timed in',
  on_time: 'On time',
  late: 'Late',
  absent: 'Absent',
  applied: 'Applied',
};

const statusBadgeClass = (status?: string | null) => {
  switch (status) {
    case 'on_time':
    case 'applied':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'timed_in':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'late':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'absent':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-600';
  }
};

const meetingHours = (student: HourStudentRow) =>
  Math.round((student.general_cleaning + student.devotional + student.meeting_assembly) * 100) / 100;

const formatDay = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const boundsForMonth = (monthValue: string) => {
  const [year, mon] = monthValue.split('-').map(Number);
  const last = new Date(year, mon, 0).getDate();
  return {
    start: `${monthValue}-01`,
    end: `${monthValue}-${String(last).padStart(2, '0')}`,
  };
};

export function StudentCompensationView() {
  const now = new Date();
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const initialBounds = boundsForMonth(initialMonth);
  const [month, setMonth] = useState(initialMonth);
  const [startDate, setStartDate] = useState(initialBounds.start);
  const [endDate, setEndDate] = useState(initialBounds.end);
  const [student, setStudent] = useState<HourStudentRow | null>(null);
  const [activities, setActivities] = useState<StudentActivity[]>([]);
  const [hourlyRate, setHourlyRate] = useState(DEFAULT_HOURLY_RATE);
  const [limits, setLimits] = useState<HourLimitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const rangeInvalid = Boolean(startDate && endDate && endDate < startDate);
  const period = useMemo(() => ({ start: startDate, end: endDate }), [startDate, endDate]);

  const applyMonth = (nextMonth: string) => {
    setMonth(nextMonth);
    if (!nextMonth) return;
    const bounds = boundsForMonth(nextMonth);
    setStartDate(bounds.start);
    setEndDate(bounds.end);
  };

  useEffect(() => {
    if (!period.start || !period.end || period.end < period.start) return undefined;
    let active = true;
    const load = (silent = false) => {
      if (!silent) setLoading(true);
      Promise.all([
        financialService.getMyHours(period.start, period.end),
        hourLimitService.getMine().catch(() => null),
      ])
        .then(([res, hourLimits]) => {
          if (!active) return;
          setStudent(res.student || null);
          setActivities(res.activities || []);
          if (typeof res.hourly_rate === 'number' && Number.isFinite(res.hourly_rate)) {
            setHourlyRate(res.hourly_rate);
          }
          if (hourLimits) setLimits(hourLimits);
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
    return (
      <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Loading hours rendered">
        <div className="h-48 rounded-[2rem] bg-slate-900/90" />
        <div className="h-24 rounded-[1.75rem] bg-slate-200/80" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, idx) => (
            <div key={idx} className="h-24 rounded-2xl bg-slate-200/80" />
          ))}
        </div>
        <div className="h-56 rounded-[1.75rem] bg-slate-200/80" />
      </div>
    );
  }

  if (failed || !student) {
    return (
      <div className="flex items-center gap-3 rounded-[1.75rem] border border-rose-200 bg-rose-50 px-6 py-5 text-sm font-bold text-rose-800 shadow-xs">
        <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
        <span>Hours rendered could not be loaded.</span>
      </div>
    );
  }

  const generalMeeting = meetingHours(student);
  const cells = [
    { label: 'DTR Hours', value: student.dtr_hours },
    { label: 'Duty Deduction', value: student.duty_deduction === 0 ? 0 : -student.duty_deduction },
    { label: 'Special', value: student.special_request },
    { label: 'Daily Cleaning', value: student.daily_cleaning },
    { label: 'General Meeting', value: generalMeeting },
  ];

  const weeklyPct =
    limits && limits.weekly_cap > 0
      ? Math.min((limits.weekly_hours / limits.weekly_cap) * 100, 100)
      : 0;
  const monthlyPct =
    limits && limits.monthly_cap > 0
      ? Math.min((limits.monthly_hours / limits.monthly_cap) * 100, 100)
      : 0;

  return (
    <div className="space-y-6 font-sans">
      {/* OBSIDIAN GRAND TOTAL HERO */}
      <motion.section
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
          {/* Left: Grand Total Hours & Peso Equivalent */}
          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-300">
                <TrendingUp className="h-3.5 w-3.5" />
                Period Breakdown
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300">
                <GraduationCap className="h-3.5 w-3.5 text-blue-400" />
                {student.year_level ? `Year ${student.year_level}` : 'Year not set'}
              </span>
            </div>

            <p className="mt-5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
              Grand Total Hours
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-5xl font-black tracking-tight tabular-nums text-white sm:text-6xl">
                {hoursText(student.grand_total)}
              </span>
              <span className="text-sm font-bold text-slate-400">hrs rendered</span>
            </div>

            <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-2 text-sm font-bold text-emerald-300">
              <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{pesoText(student.grand_total, hourlyRate)}</span>
              <span className="text-xs font-medium text-emerald-200/80">
                at ₱{hoursText(hourlyRate)}/hr
              </span>
            </div>
          </div>

          {/* Right: Frosted Hour Limits Panel */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  <Clock className="h-3.5 w-3.5 text-blue-400" />
                  Active Hour Caps
                </span>
                {limits?.extension_approved && (
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
                    Extended
                  </span>
                )}
              </div>

              {limits ? (
                <div className="mt-4 space-y-3.5">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300">This week</span>
                      <span className="font-mono font-bold tabular-nums text-white">
                        {limits.weekly_hours.toFixed(1)} / {limits.weekly_cap} hrs
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          weeklyPct >= 100
                            ? 'bg-rose-400'
                            : weeklyPct >= 80
                              ? 'bg-amber-400'
                              : 'bg-blue-400'
                        }`}
                        style={{ width: `${weeklyPct}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300">This month</span>
                      <span className="font-mono font-bold tabular-nums text-white">
                        {limits.monthly_hours.toFixed(1)} / {limits.monthly_cap} hrs
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          monthlyPct >= 100
                            ? 'bg-rose-400'
                            : monthlyPct >= 80
                              ? 'bg-amber-400'
                              : 'bg-emerald-400'
                        }`}
                        style={{ width: `${monthlyPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs font-medium leading-relaxed text-slate-400">
                  Grand total = DTR hours − duty deductions + activity hours for the selected date range.
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.section>

      {/* DATE RANGE FILTER DECK */}
      <section className="rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-slate-400">
              <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
              Date Range Filter
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Filter your rendered hours and activity credits by period.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Month
              <input
                type="month"
                value={month}
                onChange={(event) => applyMonth(event.target.value)}
                title="Fills the from and to dates with that calendar month"
                className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
              />
            </label>
            <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              From
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => {
                  const next = event.target.value;
                  setStartDate(next);
                  if (next) setMonth(next.slice(0, 7));
                }}
                className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
              />
            </label>
            <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              To
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
              />
            </label>
          </div>
        </div>

        {rangeInvalid && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>The end date must be on or after the start date.</span>
          </div>
        )}
      </section>

      {/* 5-TILE BREAKDOWN BENTO */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cells.map((cell) => {
          const isNegative = cell.value < 0;
          const isPositive = cell.value > 0;
          const tone = isNegative
            ? 'text-rose-600'
            : isPositive
              ? 'text-emerald-600'
              : 'text-slate-400';
          const borderAccent = isNegative
            ? 'border-rose-200/80 hover:border-rose-300'
            : isPositive
              ? 'border-slate-200/90 hover:border-emerald-200'
              : 'border-slate-200/80';

          return (
            <div
              key={cell.label}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${borderAccent}`}
            >
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                {cell.label}
              </p>
              <p className={`mt-2 font-mono text-2xl font-black tracking-tight tabular-nums ${tone}`}>
                {hoursText(cell.value)}
                <span className="ml-1 font-sans text-xs font-bold text-slate-400">hrs</span>
              </p>
            </div>
          );
        })}
      </section>

      {/* ACTIVITY HOURS LEDGER */}
      <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-black tracking-tight text-slate-900">Activity Hours</h3>
              <p className="text-xs font-medium text-slate-500">
                Credited campus activities, cleaning duties, and general meetings
              </p>
            </div>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold tabular-nums text-slate-600 sm:self-auto">
            {activities.length} {activities.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/40 px-6 py-3">
          <HelpDisclosure
            variant="inline"
            title="How hours are calculated"
            items={[
              'Grand total = DTR hours − duty deductions + activity hours for the selected date range.',
              'Activity hours are added only when you time out after an on-time clock-in; late clock-ins add nothing and absences deduct the equivalent hours.',
            ]}
          />
        </div>

        {activities.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Calendar className="h-6 w-6" />
            </div>
            <p className="text-sm font-extrabold text-slate-700">No activity hours in this date range</p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Adjust the month or custom dates above to view other periods.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activities.map((activity) => (
              <li
                key={activity.id}
                className="flex flex-col justify-between gap-3 px-6 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-extrabold text-slate-900">{activity.title}</p>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${statusBadgeClass(
                        activity.status
                      )}`}
                    >
                      {statusLabel[activity.status || ''] || activity.status || 'Recorded'}
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                    <span>{activity.kind_label}</span>
                    <span className="text-slate-300">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      {formatDay(activity.event_date)}
                    </span>
                  </p>
                </div>

                <span
                  className={`shrink-0 font-mono text-base font-black tabular-nums ${
                    activity.hours_delta < 0
                      ? 'text-rose-600'
                      : activity.hours_delta > 0
                        ? 'text-emerald-600'
                        : 'text-slate-400'
                  }`}
                >
                  {activity.hours_delta > 0 ? '+' : ''}
                  {hoursText(activity.hours_delta)}{' '}
                  <span className="font-sans text-xs font-bold text-slate-400">hrs</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}