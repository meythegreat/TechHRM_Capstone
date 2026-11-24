import { useCallback, useEffect, useState } from 'react';
import { Check, CheckCircle2, Clock, WifiOff, X } from 'lucide-react';
import {
  manualAttendanceRequestService,
  type ManualAttendanceRequestRow,
} from '../services/manualAttendanceRequestService';
import { REALTIME_EVENT } from '../utils/realtime';
import { formatClockTime } from '../utils/scheduleTime';
import { HelpDisclosure } from './HelpDisclosure';
import FeatureSection from './FeatureSection';

const statusTone = (status: string) => {
  if (status === 'Pending') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const statusAccent = (status: string) => {
  if (status === 'Pending') return 'bg-amber-500';
  if (status === 'Approved') return 'bg-emerald-500';
  return 'bg-slate-300';
};

const formatShift = (shift: { date: string; time_in: string; time_out: string }) => {
  const [y, m, d] = String(shift.date || '').split('-').map(Number);
  const label = y
    ? new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : shift.date;
  return `${label} · ${formatClockTime(shift.time_in)}–${formatClockTime(shift.time_out)}`;
};

type Props = {
  defaultOpen?: boolean;
  readOnly?: boolean;
  onToast?: (message: string, type?: 'success' | 'error') => void;
  onChanged?: () => void;
};

/** Supervisor / WSPO queue for student offline manual attendance requests. */
const ManualAttendanceRequestsPanel = ({
  defaultOpen = false,
  readOnly = false,
  onToast,
  onChanged,
}: Props) => {
  const [rows, setRows] = useState<ManualAttendanceRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await manualAttendanceRequestService.list();
      setRows(list);
    } catch (err) {
      console.error(err);
      onToast?.('Could not load offline attendance requests.', 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener(REALTIME_EVENT, refresh);
    return () => window.removeEventListener(REALTIME_EVENT, refresh);
  }, [load]);

  const decide = async (id: number, status: 'Approved' | 'Rejected') => {
    if (readOnly) return;
    setBusyId(id);
    try {
      const res = await manualAttendanceRequestService.decide(id, status);
      onToast?.(res.message || `Request ${status.toLowerCase()}.`, 'success');
      await load();
      onChanged?.();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Could not update that request.';
      onToast?.(message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter((row) => row.status === 'Pending');
  const others = rows.filter((row) => row.status !== 'Pending');

  return (
    <FeatureSection
      defaultOpen={defaultOpen}
      title="Attendance Approval Requests"
      icon={
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
          <WifiOff className="h-4 w-4" />
        </span>
      }
      badge={
        pending.length > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
            {pending.length} Pending
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
            <CheckCircle2 className="h-3 w-3" />
            Clear
          </span>
        )
      }
    >
      <div className="space-y-4 p-6">
        <p className="text-xs font-medium text-slate-500">
          {readOnly
            ? 'Regular attendance requests are accepted by the department or office supervisor and department secretaries.'
            : 'Accept regular offline attendance and class-hours requests for students in your department or office.'}
        </p>
        <HelpDisclosure
          variant="inline"
          title="Approval guidelines"
          items={[
            'Only the department or office supervisor and department secretaries can accept regular offline attendance.',
            'Approving a request immediately credits the closed shift(s) on the student’s DTR.',
            'Janitorial offline requests are reviewed first by the janitorial supervisor before the immediate supervisor gives the final decision.',
          ]}
        />

        {loading ? (
          <div className="flex items-center gap-2.5 py-6 text-xs font-bold text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
            Loading requests…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
            <WifiOff className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
            <p className="text-sm font-extrabold text-slate-700">No offline attendance requests</p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Submitted offline and class-hours attendance requests will appear here.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[...pending, ...others].map((row) => (
              <li
                key={row.id}
                className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-2xs transition hover:border-slate-300"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${statusAccent(
                    row.status
                  )}`}
                />

                <div className="flex flex-wrap items-start justify-between gap-4 pl-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-extrabold text-slate-900">
                        {row.student_name || 'Student'}
                      </p>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${statusTone(
                          row.status
                        )}`}
                      >
                        {row.status}
                      </span>
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                        {(row.request_type || 'regular').replace('_', ' ')}
                      </span>
                    </div>

                    <p className="mt-0.5 font-mono text-xs font-medium text-slate-500">
                      {[row.student_id_number, row.assigned_office].filter(Boolean).join(' · ') ||
                        '—'}
                    </p>

                    <p className="mt-2.5 text-xs font-medium leading-relaxed text-slate-700">
                      {row.reason}
                    </p>

                    <ul className="mt-3 flex flex-wrap gap-2">
                      {(row.shifts || []).map((shift) => (
                        <li
                          key={shift.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-700"
                        >
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>{formatShift(shift)}</span>
                          {shift.attendance_id && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                              DTR #{shift.attendance_id}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {!readOnly && row.status === 'Pending' && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => decide(row.id, 'Approved')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => decide(row.id, 'Rejected')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FeatureSection>
  );
};

export default ManualAttendanceRequestsPanel;