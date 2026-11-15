import { useEffect, useState } from 'react';
import { Plus, QrCode, Users } from 'lucide-react';
import { financialService } from '../../services/financialService';
import { canManageActivityGroups } from '../../utils/wspoActivityAccess';
import { ActivityAttendanceChecker } from './ActivityAttendanceChecker';
import { ActivityQrCard } from './ActivityQrCard';
import { AddActivityHoursDialog } from './AddActivityHoursDialog';
import { CleaningGroupsDialog } from './CleaningGroupsDialog';
import { HoursActivityBoard } from './HoursActivityBoard';
import { JanitorialGroupsDialog } from './JanitorialGroupsDialog';

/** Campus activity tools for Student accounts that hold WSPO Secretary / President. */
export function StudentOfficerActivityHub() {
  const [activityEvents, setActivityEvents] = useState<any[]>([]);
  const [activityEventId, setActivityEventId] = useState('');
  const [activityFormOpen, setActivityFormOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [janitorialGroupsOpen, setJanitorialGroupsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const canManageGroups = canManageActivityGroups();
  const canManageJanitorial = canManageGroups;

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
    return financialService.getHourEvents(day, day)
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

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <QrCode className="h-5 w-5 text-blue-400" />
          <span className="text-sm font-medium text-slate-500">WSPO Secretary tools</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Campus activities
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Add and edit group activities, then check attendance campus-wide. Your own duty hours stay on Attendance / DTR with your department supervisor&apos;s passcode or QR.
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
              <QrCode className="h-5 w-5 text-blue-600" />
              Today&apos;s activity attendance
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create an activity for a group, show the QR/passcode, and correct times when needed.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {canManageGroups && (
              <button
                type="button"
                onClick={() => setGroupsOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:border-blue-300"
              >
                <Users className="h-4 w-4" /> Groups
              </button>
            )}
            {canManageJanitorial && (
              <button
                type="button"
                onClick={() => setJanitorialGroupsOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:border-blue-300"
              >
                <Users className="h-4 w-4" /> Janitorial groups
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setNotice('');
                setActivityFormOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" /> Add activity
            </button>
          </div>
        </div>

        {notice && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-800">
            {notice}
          </div>
        )}

        {activityEvents.length === 0 ? (
          <p className="text-sm text-slate-500">No activity attendance is scheduled for today.</p>
        ) : (
          <div className="space-y-4">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Today&apos;s activity
              <select
                value={activityEventId}
                onChange={(event) => setActivityEventId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800"
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
            {activityEventId && (
              <div className="space-y-4">
                <ActivityQrCard eventId={Number(activityEventId)} />
                <ActivityAttendanceChecker
                  eventId={Number(activityEventId)}
                  eventDate={activityEvents.find((event) => String(event.id) === String(activityEventId))?.event_date}
                  onChanged={() => loadActivityEvents(Number(activityEventId))}
                />
              </div>
            )}
          </div>
        )}
      </section>

      <HoursActivityBoard
        readOnly={false}
        periodStart={monthBounds().start}
        periodEnd={monthBounds().end}
        onChanged={() => loadActivityEvents()}
      />

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
