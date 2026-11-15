import { useCallback, useEffect, useState } from 'react';
import { Check, WifiOff, X } from 'lucide-react';
import {
  manualAttendanceRequestService,
  type ManualAttendanceRequestRow,
} from '../services/manualAttendanceRequestService';
import { REALTIME_EVENT } from '../utils/realtime';

const statusTone = (status: string) => {
  if (status === 'Pending') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
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
  return `${label} · ${shift.time_in}–${shift.time_out}`;
};

type Props = {
  readOnly?: boolean;
  onToast?: (message: string, type?: 'success' | 'error') => void;
  onChanged?: () => void;
};

/** Supervisor / WSPO queue for student offline manual attendance requests. */
const ManualAttendanceRequestsPanel = ({ readOnly = false, onToast, onChanged }: Props) => {
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
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Could not update that request.';
      onToast?.(message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter((row) => row.status === 'Pending');
  const others = rows.filter((row) => row.status !== 'Pending');

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-start gap-3">
        <WifiOff className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-base font-semibold text-slate-900">Offline attendance requests</h3>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            Students submit these when the office had no internet. Approving credits closed shifts on their DTR.
          </p>
        </div>
        {pending.length > 0 && (
          <span className="ml-auto inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
            {pending.length} pending
          </span>
        )}
      </div>

      <div className="p-6">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No offline attendance requests.</p>
        ) : (
          <ul className="space-y-4">
            {[...pending, ...others].map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{row.student_name || 'Student'}</p>
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${statusTone(row.status)}`}>
                        {row.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {[row.student_id_number, row.assigned_office].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <p className="text-sm text-slate-700 mt-2">{row.reason}</p>
                    <ul className="mt-2 space-y-1">
                      {(row.shifts || []).map((shift) => (
                        <li key={shift.id} className="text-xs font-mono text-slate-600">
                          {formatShift(shift)}
                          {shift.attendance_id ? ` · DTR #${shift.attendance_id}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {!readOnly && row.status === 'Pending' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => decide(row.id, 'Approved')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => decide(row.id, 'Rejected')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-bold"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ManualAttendanceRequestsPanel;
