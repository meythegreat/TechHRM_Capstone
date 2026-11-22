import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  GraduationCap,
  MapPin,
  User,
  X,
} from 'lucide-react';
import {
  classClockInRequestService,
  type ClassClockInRequestRow,
} from '../services/classClockInRequestService';
import { REALTIME_EVENT } from '../utils/realtime';
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

const formatWhen = (value?: string | null) => {
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

const blank = (value?: string | null) => {
  const text = String(value || '').trim();
  return text || '—';
};

type Props = {
  defaultOpen?: boolean;
  readOnly?: boolean;
  onToast?: (message: string, type?: 'success' | 'error') => void;
  onChanged?: () => void;
};

/** Supervisor queue: class-hours clock-in requests from students in assigned departments. */
const ClassClockInRequestsPanel = ({
  defaultOpen = false,
  readOnly = false,
  onToast,
  onChanged,
}: Props) => {
  const [rows, setRows] = useState<ClassClockInRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await classClockInRequestService.list();
      setRows(list);
    } catch (err) {
      console.error(err);
      onToast?.('Could not load class-hours clock-in requests.', 'error');
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

  const tell = (message: string, type: 'success' | 'error' = 'success') => {
    if (onToast) onToast(message, type);
    else setNotice(message);
  };

  const decide = async (id: number, status: 'Approved' | 'Rejected') => {
    if (readOnly) return;
    setBusyId(id);
    setNotice('');
    try {
      const res = await classClockInRequestService.decide(id, status);
      tell(res.message || `Request ${status.toLowerCase()}.`, 'success');
      await load();
      onChanged?.();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Could not update that request.';
      tell(message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter((row) => row.status === 'Pending');
  const others = rows.filter((row) => row.status !== 'Pending');

  return (
    <FeatureSection
      defaultOpen={defaultOpen}
      title="Class Hrs Requests"
      icon={
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <GraduationCap className="h-4 w-4" />
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
          Review student requests to render duty during non-meeting classes.
        </p>
        <HelpDisclosure
          variant="inline"
          title="How approvals work"
          items={[
            'Requests come from students in your assigned departments whose scheduled class did not meet.',
            'Approving immediately clocks the student in; hours are credited on their DTR when they clock out.',
          ]}
        />

        {notice && !onToast && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2.5 py-6 text-xs font-bold text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600" />
            Loading requests…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
            <GraduationCap className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
            <p className="text-sm font-extrabold text-slate-700">No class-hours clock-in requests</p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Requests from students in your assigned departments will appear here.
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
                    </div>

                    <p className="mt-0.5 font-mono text-xs font-medium text-slate-500">
                      {[row.student_id_number, row.assigned_office].filter(Boolean).join(' · ') ||
                        '—'}
                    </p>

                    <div className="mt-3 grid grid-cols-1 gap-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:grid-cols-2">
                      <div className="flex items-start gap-2">
                        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <p className="text-xs font-bold text-slate-800">
                          <span className="font-semibold text-slate-400">Subject · </span>
                          {blank(row.class?.subject)}
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <p className="text-xs font-bold text-slate-800">
                          <span className="font-semibold text-slate-400">Schedule · </span>
                          {blank(row.class?.label)}
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <p className="text-xs font-bold text-slate-800">
                          <span className="font-semibold text-slate-400">Room · </span>
                          {blank(row.class?.room)}
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <p className="text-xs font-bold text-slate-800">
                          <span className="font-semibold text-slate-400">Instructor · </span>
                          {blank(row.class?.instructor)}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs font-medium leading-relaxed text-slate-700">
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
                          {row.attendance.time_in ? ` ${formatWhen(row.attendance.time_in)}` : ''}.
                          {row.attendance.time_out
                            ? ` Timed out ${formatWhen(row.attendance.time_out)}. Hours: ${Number(
                                row.attendance.computed_hours ||
                                  row.attendance.rendered_hours ||
                                  0
                              ).toFixed(2)}.`
                            : ' Still on duty until they clock out.'}
                        </span>
                      </div>
                    )}
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

export default ClassClockInRequestsPanel;