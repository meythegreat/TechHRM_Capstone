import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Calendar,
  Clock,
  ChevronDown,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  X,
  Save,
  Lock,
} from 'lucide-react';
import { ActivityQrCard } from './ActivityQrCard';
import { financialService } from '../../services/financialService';
import { formatClockTime } from '../../utils/scheduleTime';
import ClockTimeInput from '../ClockTimeInput';
import { HelpDisclosure } from '../HelpDisclosure';

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
  kind?: string;
  title: string;
  kind_label: string;
  event_date: string;
  year_label?: string | null;
  cohort_year_label?: string | null;
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

const statusBadgeStyle = (status?: string | null) => {
  switch (status) {
    case 'on_time':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'late':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'timed_in':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'absent':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-500';
  }
};

const apiError = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : '';
  return first || data?.message || fallback;
};

export function YearLeaderActivities() {
  const [leader, setLeader] = useState(false);
  const [groupLeader, setGroupLeader] = useState(false);
  const [assemblyRep, setAssemblyRep] = useState(false);
  const [repYearLabel, setRepYearLabel] = useState('');
  const [yearLabel, setYearLabel] = useState('');
  const [groupName, setGroupName] = useState('');
  const [events, setEvents] = useState<LeaderEvent[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [timeInDrafts, setTimeInDrafts] = useState<Record<number, string>>({});
  const [timeOutDrafts, setTimeOutDrafts] = useState<Record<number, string>>({});

  const todayIso = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };

  const load = async () => {
    const response = await axios.get('/api/attendance/my-year-activities');
    const rows: LeaderEvent[] = response.data.events || [];
    setLeader(Boolean(response.data.leader));
    setGroupLeader(Boolean(response.data.group_leader));
    setAssemblyRep(Boolean(response.data.assembly_representative));
    setRepYearLabel(response.data.rep_year_label || '');
    setYearLabel(response.data.year_label || '');
    setGroupName(response.data.group_name || '');
    setEvents(rows);
    setOpenId((current) => {
      if (current && rows.some((row) => row.id === current)) return current;
      const today = todayIso();
      const todayMatch = rows.find((row) => row.event_date === today && row.uses_attendance);
      if (todayMatch) return todayMatch.id;
      return rows.length === 1 ? rows[0].id : null;
    });
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
    return (
      <div className="flex items-center gap-3 rounded-[1.75rem] border border-rose-200 bg-rose-50 px-6 py-5 text-sm font-bold text-rose-800 shadow-xs">
        <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
        <span>{error}</span>
      </div>
    );
  }

  if (!leader) {
    return (
      <div className="rounded-[1.75rem] border border-slate-200/90 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-black tracking-tight text-slate-900">Year Activities</h1>
        <p className="mx-auto mt-2 max-w-md text-sm font-medium text-slate-500">
          Only a designated group leader or assembly year representative can open attendance QR codes and passcodes.
        </p>
      </div>
    );
  }

  const portalBadge = assemblyRep && groupLeader
    ? 'Group Leader & Assembly Rep'
    : assemblyRep
      ? 'Assembly Representative'
      : 'Group Leader Portal';
  const heroTitle = assemblyRep && groupLeader
    ? 'Year & Group Activities'
    : assemblyRep
      ? 'Year Activities'
      : 'Group Activities';
  const heroSubtitle = assemblyRep && !groupLeader
    ? 'Display live attendance QR codes and passcodes or record clock-in and time-out for your year level’s meeting assemblies and devotional meetings.'
    : assemblyRep && groupLeader
      ? 'Display live attendance QR codes and passcodes for your group activities, meeting assemblies, and devotional meetings.'
      : 'Display live attendance codes or record clock-in and time-out for your group’s scheduled activities.';

  return (
    <div className="space-y-6 font-sans">
      {/* OBSIDIAN COMMAND HERO */}
      <motion.header
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
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                {portalBadge}
              </span>
              {groupName && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-200">
                  <Users className="h-3.5 w-3.5 text-indigo-300" />
                  {groupName}
                </span>
              )}
              {(repYearLabel || yearLabel) && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  {repYearLabel || yearLabel}
                </span>
              )}
            </div>

            <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
              {heroTitle}
            </h1>
            <p className="mt-2.5 text-sm font-medium leading-relaxed text-slate-300">
              {heroSubtitle}
            </p>
          </div>

          <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Active Events
            </p>
            <p className="mt-1 font-mono text-3xl font-black tabular-nums text-white">
              {events.length}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-400">
              {events.length === 1 ? 'Scheduled activity' : 'Scheduled activities'}
            </p>
          </div>
        </div>
      </motion.header>

      {/* NOTICE BANNER */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3.5 text-sm font-bold text-blue-900 shadow-xs"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />
              <span>{notice}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded-lg p-1 text-blue-600 transition-colors hover:bg-blue-100"
              aria-label="Dismiss notice"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ACTIVITIES LIST */}
      {events.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Calendar className="h-6 w-6" />
          </div>
          <p className="text-sm font-extrabold text-slate-700">
            {assemblyRep && !groupLeader
              ? 'No meeting assemblies or devotionals scheduled right now'
              : 'No scheduled activities right now'}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            Scheduled activities and live attendance QR sessions will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((item) => {
            const isOpen = openId === item.id;
            return (
              <article
                key={item.id}
                className={`overflow-hidden rounded-[1.75rem] border bg-white shadow-sm transition-all ${
                  isOpen ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-slate-50/70"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                        {item.kind_label}
                      </span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                        {Number(item.hours).toFixed(2)} hrs
                      </span>
                      {item.group_name && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                          {item.group_name}
                        </span>
                      )}
                      {item.year_label && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                          {item.year_label}
                        </span>
                      )}
                      {item.cohort_year_label && !item.year_label && (
                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
                          {item.cohort_year_label} cohort
                        </span>
                      )}
                    </div>

                    <h2 className="mt-2 text-lg font-black tracking-tight text-slate-900">
                      {item.title}
                    </h2>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        {item.event_date}
                      </span>
                      {(item.starts_at || item.ends_at) && (
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {item.starts_at ? `In ${formatClockTime(item.starts_at)}` : ''}
                          {item.starts_at && item.ends_at ? ' · ' : ''}
                          {item.ends_at ? `Ends ${formatClockTime(item.ends_at)}` : ''}
                        </span>
                      )}
                      {item.valid_until && (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          On time until {formatClockTime(item.valid_until)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Users className="h-3.5 w-3.5" />
                        {item.entries.length} {item.entries.length === 1 ? 'student' : 'students'}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all ${
                      isOpen
                        ? 'border-blue-200 bg-blue-50 text-blue-600'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden border-t border-slate-100 bg-slate-50/40"
                    >
                      <div className="space-y-5 px-6 py-5">
                        {item.uses_attendance && <ActivityQrCard eventId={item.id} />}

                        {item.uses_attendance && (
                          <HelpDisclosure
                            variant="inline"
                            title="Manual entry & credit guidelines"
                            items={[
                              item.kind === 'meeting_assembly'
                                ? `Display this live QR code or passcode for ${item.cohort_year_label || 'your year level'}. Students must scan their own year representative’s code.`
                                : item.kind === 'devotional'
                                  ? `Display this live QR code or passcode so ${item.cohort_year_label || 'your year level'} students can clock in and time out.`
                                  : 'Use the live QR code or passcode so every year level in your group can clock in and time out.',
                              `If a student cannot scan, enter their clock-in and time-out manually below; time-out defaults to the activity end${item.ends_at ? ` (${formatClockTime(item.ends_at)})` : ''}.`,
                              'Hours are credited only when a student times out, and only if their clock-in was on time.',
                            ]}
                          />
                        )}

                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                          <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                            Student Attendance Roster ({item.entries.length})
                          </div>

                          {item.entries.length === 0 ? (
                            <p className="px-4 py-8 text-center text-sm font-medium text-slate-400">
                              No students are on this activity yet.
                            </p>
                          ) : (
                            <div className="divide-y divide-slate-100">
                              {item.entries.map((entry) => (
                                <div
                                  key={entry.user_id}
                                  className="flex flex-col justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/70 lg:flex-row lg:items-center"
                                >
                                  <div className="min-w-[200px] flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-extrabold text-slate-900">{entry.name}</p>
                                      <span
                                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${statusBadgeStyle(
                                          entry.status
                                        )}`}
                                      >
                                        {entry.status ? statusLabel[entry.status] || entry.status : 'Not marked'}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                      <span className="font-mono">{entry.student_id_number || 'No ID'}</span>
                                      {entry.status && (
                                        <span className="ml-2 font-mono font-bold text-slate-700">
                                          · {Number(entry.hours_delta).toFixed(2)} hrs
                                        </span>
                                      )}
                                    </p>
                                  </div>

                                  {item.uses_attendance && (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
                                        <ClockTimeInput
                                          value={timeInDrafts[entry.user_id] ?? entry.time_in ?? ''}
                                          onChange={(value) =>
                                            setTimeInDrafts((current) => ({
                                              ...current,
                                              [entry.user_id]: value,
                                            }))
                                          }
                                          className="rounded-lg bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-600/20"
                                          aria-label={`Clock-in time for ${entry.name}`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => correctTime(item, entry.user_id)}
                                          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-blue-600"
                                        >
                                          <Save className="h-3 w-3" />
                                          In
                                        </button>
                                      </div>

                                      <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
                                        <ClockTimeInput
                                          value={timeOutDrafts[entry.user_id] ?? entry.time_out ?? item.ends_at ?? ''}
                                          onChange={(value) =>
                                            setTimeOutDrafts((current) => ({
                                              ...current,
                                              [entry.user_id]: value,
                                            }))
                                          }
                                          className="rounded-lg bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-600/20"
                                          aria-label={`Time-out for ${entry.name}`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => correctTimeout(item, entry.user_id)}
                                          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-emerald-600"
                                        >
                                          <Save className="h-3 w-3" />
                                          Out
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}