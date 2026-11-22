import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GraduationCap,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  XCircle,
  BookOpen,
  MapPin,
  User,
} from 'lucide-react';
import { classClockInRequestService } from '../services/classClockInRequestService';
import { REALTIME_EVENT } from '../utils/realtime';
import { formatScheduleRange } from '../utils/scheduleTime';
import { HelpDisclosure } from './HelpDisclosure';

const statusTone = (status) => {
  if (status === 'Pending') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const statusAccent = (status) => {
  if (status === 'Pending') return 'bg-amber-500';
  if (status === 'Approved') return 'bg-emerald-500';
  return 'bg-slate-300';
};

const blank = (value) => {
  const text = String(value || '').trim();
  return text || '—';
};

const formatWhen = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Student request to start duty during a class whose teacher is not meeting.
 * Approval opens a normal clock-in. Hours land on the DTR when the student clocks out.
 */
const ClassClockInRequestForm = ({ clockedIn = false, onClockedIn, onToast }) => {
  const [classes, setClasses] = useState([]);
  const [rows, setRows] = useState([]);
  const [scheduleId, setScheduleId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const onClockedInRef = useRef(onClockedIn);
  const onToastRef = useRef(onToast);
  const knownOpenRef = useRef(null);

  useEffect(() => {
    onClockedInRef.current = onClockedIn;
    onToastRef.current = onToast;
  }, [onClockedIn, onToast]);

  const load = useCallback(async () => {
    try {
      const [options, mine] = await Promise.all([
        classClockInRequestService.classes(),
        classClockInRequestService.mine(),
      ]);
      setClasses(options);
      setRows(mine);
      setScheduleId((current) => {
        if (current && options.some((row) => String(row.id) === current)) return current;
        const live = options.find((row) => row.in_session);
        return live ? String(live.id) : options[0] ? String(options[0].id) : '';
      });
      return mine;
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const refresh = async () => {
      const mine = await load();
      const openIds = mine
        .filter((row) => row.status === 'Approved' && row.attendance && !row.attendance.time_out)
        .map((row) => row.id);
      if (knownOpenRef.current) {
        const fresh = openIds.filter((id) => !knownOpenRef.current.has(id));
        if (fresh.length > 0) {
          onToastRef.current?.(
            'Your supervisor approved the class-hours clock-in. You are clocked in. Clock out when the duty ends.',
            'success'
          );
          onClockedInRef.current?.();
        }
      }
      knownOpenRef.current = new Set(openIds);
    };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener(REALTIME_EVENT, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(REALTIME_EVENT, refresh);
    };
  }, [load]);

  const selected = useMemo(
    () => classes.find((row) => String(row.id) === String(scheduleId)) || null,
    [classes, scheduleId]
  );
  const pending = rows.some((row) => row.status === 'Pending');
  const canSubmit =
    Boolean(selected?.in_session) && reason.trim() !== '' && !pending && !clockedIn && !saving;

  const submit = async (event) => {
    event.preventDefault();
    if (!selected) return;
    if (!selected.in_session) {
      onToast?.('You can request this clock-in only while that class is meeting.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await classClockInRequestService.submit({
        schedule_id: selected.id,
        reason: reason.trim(),
      });
      onToast?.(res.message || 'Request submitted.', 'success');
      setReason('');
      await load();
    } catch (err) {
      onToast?.(
        err?.response?.data?.message || 'Could not submit the class-hours clock-in.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (id) => {
    try {
      const res = await classClockInRequestService.cancel(id);
      onToast?.(res.message || 'Request cancelled.', 'success');
      await load();
    } catch (err) {
      onToast?.(err?.response?.data?.message || 'Could not cancel that request.', 'error');
    }
  };

  return (
    <section
      id="class-clock-in"
      className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm"
    >
      {/* OBSIDIAN HEADER */}
      <div className="relative overflow-hidden bg-slate-950 px-6 py-5 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-600/25 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-black tracking-tight text-white">
                Class-Hours Clock-In
              </h3>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-300">
                Request supervisor approval to clock in for duty when a scheduled class does not meet.
              </p>
            </div>
          </div>

          {selected?.in_session && (
            <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              In Session
            </span>
          )}
        </div>
      </div>

      {/* REQUEST FORM */}
      <form onSubmit={submit} className="space-y-5 p-6">
        <HelpDisclosure
          variant="inline"
          title="How class-hours clock-in works"
          items={[
            'Submit a request only while the selected class is scheduled to meet and the instructor is not holding class.',
            'Your department supervisor reviews and approves the request, which clocks you in automatically.',
            'Clock out normally when your duty ends so the rendered hours are recorded on your DTR.',
          ]}
        />

        {loading ? (
          <div className="flex items-center gap-2.5 text-xs font-bold text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600" />
            Loading your class schedule…
          </div>
        ) : classes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-center">
            <p className="text-sm font-extrabold text-slate-700">No class schedule on file</p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Ask WSPO staff to add your class schedule before requesting class-hours duty.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor="class-clock-in-schedule"
                className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400"
              >
                Class Schedule
              </label>
              <select
                id="class-clock-in-schedule"
                value={scheduleId}
                onChange={(event) => setScheduleId(event.target.value)}
                className="w-full max-w-xl cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
              >
                {classes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.subject ? `${row.subject} · ` : ''}
                    {row.label || `${row.day || ''} ${formatScheduleRange(row.time || '')}`}
                    {row.in_session ? ' · in session' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div className="grid grid-cols-1 gap-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:grid-cols-2">
                <div className="flex items-start gap-2.5">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                      Subject
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">
                      {blank(selected.subject)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                      Schedule
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">
                      {blank(selected.label || `${selected.day || ''} ${formatScheduleRange(selected.time || '')}`)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                      Room
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">
                      {blank(selected.room)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                      Instructor
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">
                      {blank(selected.instructor)}
                    </p>
                  </div>
                </div>
                <div className="border-t border-slate-200/70 pt-3 sm:col-span-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                      selected.in_session
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {selected.in_session && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    )}
                    {selected.in_session
                      ? 'This class is meeting now'
                      : 'This class is not meeting right now'}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="class-clock-in-reason"
                className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400"
              >
                Reason
              </label>
              <textarea
                id="class-clock-in-reason"
                required
                rows={3}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Example: The instructor did not meet, so I am rendering duty instead."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            {clockedIn && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-600">
                <AlertCircle className="h-4 w-4 shrink-0 text-slate-400" />
                <span>You are already clocked in. Clock out before sending another request.</span>
              </div>
            )}
            {pending && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-800">
                <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                <span>A request is already waiting for your supervisor.</span>
              </div>
            )}
            {selected && !selected.in_session && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-500">
                <AlertCircle className="h-4 w-4 shrink-0 text-slate-400" />
                <span>Submit is available only while the selected class is meeting.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Send className="h-3.5 w-3.5" />
              {saving ? 'Submitting…' : 'Submit Request'}
            </button>
          </>
        )}
      </form>

      {/* REQUEST HISTORY */}
      <div className="border-t border-slate-100 bg-slate-50/40 px-6 py-5">
        <h4 className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
          Your Requests
        </h4>
        {rows.length === 0 ? (
          <p className="text-xs font-medium text-slate-500">
            No class-hours clock-in requests yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-2xs"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${statusAccent(
                    row.status
                  )}`}
                />
                <div className="flex flex-wrap items-start justify-between gap-3 pl-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-extrabold text-slate-900">
                        {row.class?.subject || row.class?.label || 'Class'}
                      </p>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${statusTone(
                          row.status
                        )}`}
                      >
                        {row.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {[row.class?.label, row.class?.room, row.class?.instructor]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="mt-2 text-xs font-medium leading-relaxed text-slate-700">
                      {row.reason}
                    </p>
                    {row.created_at && (
                      <p className="mt-1.5 text-[11px] font-semibold text-slate-400">
                        Submitted {formatWhen(row.created_at)}
                      </p>
                    )}
                    {row.status === 'Approved' && row.attendance && (
                      <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>
                          Clocked in
                          {row.attendance.time_in ? ` at ${formatWhen(row.attendance.time_in)}` : ''}.
                          {row.attendance.time_out
                            ? ` Timed out ${formatWhen(row.attendance.time_out)}. Hours: ${Number(
                                row.attendance.computed_hours ||
                                  row.attendance.rendered_hours ||
                                  0
                              ).toFixed(2)}.`
                            : ' Clock out when the duty ends. Hours are added then.'}
                        </span>
                      </div>
                    )}
                  </div>

                  {row.status === 'Pending' && (
                    <button
                      type="button"
                      onClick={() => cancel(row.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default ClassClockInRequestForm;