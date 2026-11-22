import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  QrCode,
  Users,
  ShieldCheck,
  Calendar,
  Clock,
  CheckCircle2,
  X,
  Sparkles,
  Brush,
} from 'lucide-react';
import { financialService } from '../../services/financialService';
import { canManageActivityGroups, canManageJanitorialGroups } from '../../utils/wspoActivityAccess';
import { ActivityAttendanceChecker } from './ActivityAttendanceChecker';
import { ActivityQrCard } from './ActivityQrCard';
import { AddActivityHoursDialog } from './AddActivityHoursDialog';
import { CleaningGroupsDialog } from './CleaningGroupsDialog';
import { HoursActivityBoard } from './HoursActivityBoard';
import { JanitorialGroupsDialog } from './JanitorialGroupsDialog';
import { HelpDisclosure } from '../HelpDisclosure';

/** Campus activity tools for Student accounts that hold WSPO Secretary / President. */
export function StudentOfficerActivityHub() {
  const [activityEvents, setActivityEvents] = useState<any[]>([]);
  const [activityEventId, setActivityEventId] = useState('');
  const [activityFormOpen, setActivityFormOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [janitorialGroupsOpen, setJanitorialGroupsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const canManageGroups = canManageActivityGroups();
  const canManageJanitorial = canManageJanitorialGroups();

  const today = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };

  const monthBounds = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const start = `${local.toISOString().slice(0, 8)}01`;
    const endDate = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0));
    const end = endDate.toISOString().slice(0, 10);
    return { start, end };
  };

  const loadActivityEvents = (preferId?: number | string) => {
    const day = today();
    return financialService
      .getHourEvents(day, day)
      .then((res: any) => {
        const rows = (res.events || []).filter((event: any) => event.uses_attendance);
        setActivityEvents(rows);
        setActivityEventId((current) => {
          if (preferId && rows.some((event: any) => String(event.id) === String(preferId))) {
            return String(preferId);
          }
          if (current && rows.some((event: any) => String(event.id) === String(current))) {
            return current;
          }
          return rows[0] ? String(rows[0].id) : '';
        });
      })
      .catch(() => setActivityEvents([]));
  };

  useEffect(() => {
    loadActivityEvents();
  }, []);

  const selectedEvent = activityEvents.find((event) => String(event.id) === String(activityEventId)) ?? null;
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6 font-sans">
      {/* OBSIDIAN OFFICER COMMAND HERO */}
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
                WSPO Secretary Tools
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300">
                <Calendar className="h-3.5 w-3.5 text-indigo-300" />
                {todayLabel}
              </span>
            </div>

            <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Campus Activities
            </h1>
            <p className="mt-2.5 text-sm font-medium leading-relaxed text-slate-300">
              Create campus activities and manage group attendance across all year levels.
            </p>
          </div>

          {/* Quick Actions & Today Counter */}
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              {canManageGroups && (
                <button
                  type="button"
                  onClick={() => setGroupsOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md transition-all hover:bg-white/20"
                >
                  <Users className="h-4 w-4 text-blue-300" />
                  Groups
                </button>
              )}
              {canManageJanitorial && (
                <button
                  type="button"
                  onClick={() => setJanitorialGroupsOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md transition-all hover:bg-white/20"
                >
                  <Brush className="h-4 w-4 text-emerald-300" />
                  Janitorial Groups
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setNotice('');
                  setActivityFormOpen(true);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-blue-600/30 transition-all hover:from-blue-500 hover:to-indigo-500"
              >
                <Plus className="h-4 w-4" />
                Add Activity
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* DISMISSIBLE NOTICE */}
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
              onClick={() => setNotice('')}
              className="rounded-lg p-1 text-blue-600 transition-colors hover:bg-blue-100"
              aria-label="Dismiss notice"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TODAY'S ACTIVITY ATTENDANCE CONSOLE */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm"
      >
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-6 py-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
              <QrCode className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900">
                Today&apos;s Activity Attendance
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Display the live QR/passcode for today&apos;s scheduled activities and manage attendance entries.
              </p>
            </div>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold tabular-nums text-slate-700 sm:self-auto">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            {activityEvents.length === 0
              ? 'No events today'
              : `${activityEvents.length} ${activityEvents.length === 1 ? 'event' : 'events'} today`}
          </span>
        </div>

        <div className="p-6 sm:p-7">
          {activityEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-14 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-xs ring-1 ring-slate-200/70">
                <QrCode className="h-6 w-6" />
              </div>
              <p className="text-sm font-extrabold text-slate-700">
                No activity attendance is scheduled for today
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs font-medium text-slate-400">
                Create a new campus activity to generate a live QR code and passcode for student check-ins.
              </p>
              <button
                type="button"
                onClick={() => {
                  setNotice('');
                  setActivityFormOpen(true);
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-600"
              >
                <Plus className="h-4 w-4" />
                Add Today&apos;s Activity
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Activity Selector Bar */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <label className="min-w-0 flex-1">
                    <span className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                      Active Session
                    </span>
                    <select
                      value={activityEventId}
                      onChange={(event) => setActivityEventId(event.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 shadow-xs outline-none transition-all focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                    >
                      {activityEvents.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.title}
                          {event.group_name ? ` · ${event.group_name}` : ''}
                          {event.year_label ? ` · ${event.year_label}` : ''}
                          {' · '}
                          {event.hours} hrs
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedEvent && (
                    <div className="flex flex-wrap items-center gap-2 lg:pt-4">
                      {selectedEvent.group_name && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          {selectedEvent.group_name}
                        </span>
                      )}
                      {selectedEvent.year_label && (
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                          {selectedEvent.year_label}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">
                        <Clock className="h-3.5 w-3.5" />
                        {selectedEvent.hours} hrs
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {activityEventId && (
                <div className="space-y-5">
                  <ActivityQrCard eventId={Number(activityEventId)} />
                  <ActivityAttendanceChecker
                    eventId={Number(activityEventId)}
                    eventDate={selectedEvent?.event_date}
                    onChanged={() => loadActivityEvents(Number(activityEventId))}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </motion.section>

      {/* MONTHLY ACTIVITY BOARD */}
      <HelpDisclosure
        title="Officer attendance guidelines"
        items={[
          'Use this hub to schedule group activities, display live QR codes/passcodes, and verify campus-wide attendance.',
          'Your own personal duty shifts are still logged on Attendance / DTR using your department supervisor’s passcode or QR code.',
        ]}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
      >
        <HoursActivityBoard
          readOnly={false}
          periodStart={monthBounds().start}
          periodEnd={monthBounds().end}
          onChanged={() => loadActivityEvents()}
        />
      </motion.div>

      {/* DIALOGS */}
      {groupsOpen && <CleaningGroupsDialog onClose={() => setGroupsOpen(false)} />}
      {janitorialGroupsOpen && <JanitorialGroupsDialog onClose={() => setJanitorialGroupsOpen(false)} />}
      {activityFormOpen && (
        <AddActivityHoursDialog
          onClose={() => setActivityFormOpen(false)}
          onSaved={(event: any) => {
            setActivityFormOpen(false);
            const showsToday = event?.uses_attendance && event?.event_date === today();
            setNotice(
              showsToday
                ? 'Activity saved. Its QR is ready above.'
                : 'Activity saved. It appears on the board below when you filter that date.',
            );
            loadActivityEvents(showsToday ? event.id : undefined);
          }}
        />
      )}
    </div>
  );
}