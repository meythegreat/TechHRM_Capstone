import { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertCircle, Check, WifiOff, X } from 'lucide-react';
import { CleaningProofPhotos } from '../CleaningProofPhotos';
import { HelpDisclosure } from '../HelpDisclosure';
import { formatClockTime } from '../../utils/scheduleTime';

type Shift = {
  id?: number;
  date?: string;
  time_in?: string;
  time_out?: string;
  janitorial_area?: string | null;
  before_photo_path?: string | null;
  after_photo_path?: string | null;
  before_captured_at?: string | null;
  after_captured_at?: string | null;
};

type OfflineRequest = {
  id: number;
  student_name?: string | null;
  student_id_number?: string | null;
  assigned_office?: string | null;
  status?: string | null;
  reason?: string | null;
  leader_remarks?: string | null;
  deducted_hours?: number;
  shifts?: Shift[];
};

const apiError = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) return fallback;
  const message = error.response?.data?.message;
  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
};

export function JanitorialOfflineReview() {
  const [rows, setRows] = useState<OfflineRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deductions, setDeductions] = useState<Record<number, string>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});

  const load = () => {
    setLoading(true);
    axios.get('/api/attendance/janitorial-offline-requests')
      .then((response) => {
        setRows(Array.isArray(response.data?.requests) ? response.data.requests : []);
        setError('');
      })
      .catch((err) => setError(apiError(err, 'Could not load offline requests.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (id: number, status: 'Approved' | 'Rejected') => {
    const deducted = Math.min(4, Math.max(0, Number(deductions[id] || 0) || 0));
    const note = (remarks[id] || '').trim();
    const confirmed = window.confirm(
      status === 'Approved'
        ? `Record your approval${deducted > 0 ? ` and deduct ${deducted} hours` : ''}? The immediate supervisor still has the final say.`
        : 'Record a decline? The immediate supervisor still has the final say.',
    );
    if (!confirmed) return;
    setBusyId(id);
    setError('');
    try {
      await axios.patch(`/api/attendance/janitorial-offline-requests/${id}`, {
        status,
        deducted_hours: status === 'Approved' ? deducted : 0,
        remarks: note,
      });
      await load();
    } catch (err) {
      setError(apiError(err, 'Could not update this request.'));
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter((row) => row.status === 'Pending');
  if (!loading && pending.length === 0 && !error) return null;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-slate-950 px-6 py-5 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-amber-500/25 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30">
              <WifiOff className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-white">Offline Requests</h2>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-300">
                Review offline janitorial attendance requests and their before/after photos.
              </p>
            </div>
          </div>
          {pending.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              {pending.length} Pending
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5 p-6">
        <HelpDisclosure
          variant="inline"
          title="Review guidelines"
          items={[
            'Each submission includes stamped before and after surroundings photos.',
            'You may deduct duty hours and add remarks with your recommendation.',
            'Your decision is not final — the immediate supervisor records the credited hours.',
          ]}
        />

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2.5 py-6 text-xs font-bold text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500" />
            Loading requests…
          </div>
        )}

        <div className="space-y-4">
          {pending.map((row) => (
            <article
              key={row.id}
              className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 shadow-2xs"
            >
              <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-amber-500" />
              <div className="pl-2">
                <h3 className="text-base font-black tracking-tight text-slate-900">{row.student_name || 'Student'}</h3>
                <p className="mt-0.5 font-mono text-xs font-medium text-slate-500">
                  {[row.student_id_number, row.assigned_office].filter(Boolean).join(' · ')}
                </p>
                {row.reason && (
                  <p className="mt-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-medium leading-relaxed text-slate-700">
                    {row.reason}
                  </p>
                )}
                <ul className="mt-3 space-y-3">
                  {(row.shifts || []).map((shift) => (
                    <li key={shift.id || `${shift.date}-${shift.time_in}`} className="rounded-xl border border-slate-200/80 bg-white p-3.5">
                      <p className="font-mono text-xs font-bold text-slate-700">
                        {shift.date} · {formatClockTime(shift.time_in)}–{formatClockTime(shift.time_out)}
                        {shift.janitorial_area ? ` · ${shift.janitorial_area}` : ''}
                      </p>
                      <div className="mt-2">
                        <CleaningProofPhotos
                          beforePath={shift.before_photo_path}
                          beforeCapturedAt={shift.before_captured_at}
                          afterPath={shift.after_photo_path}
                          afterCapturedAt={shift.after_captured_at}
                          studentName={row.student_name || 'Student'}
                          layout="compact"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Deduct Duty Hours
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={4}
                        step={0.5}
                        value={deductions[row.id] ?? ''}
                        onChange={(event) => setDeductions((current) => ({ ...current, [row.id]: event.target.value }))}
                        placeholder="0"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Remarks
                      </span>
                      <input
                        value={remarks[row.id] ?? ''}
                        onChange={(event) => setRemarks((current) => ({ ...current, [row.id]: event.target.value }))}
                        placeholder="Optional note"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void decide(row.id, 'Approved')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-45"
                    >
                      <Check className="h-3.5 w-3.5" /> Accept
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void decide(row.id, 'Rejected')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-rose-700 transition hover:bg-rose-50 disabled:opacity-45"
                    >
                      <X className="h-3.5 w-3.5" /> Decline
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
