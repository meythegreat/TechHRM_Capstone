import { useEffect, useState } from 'react';
import axios from 'axios';
import { Check, X } from 'lucide-react';
import { CleaningProofPhotos } from '../CleaningProofPhotos';

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
    setBusyId(id);
    setError('');
    try {
      await axios.patch(`/api/attendance/janitorial-offline-requests/${id}`, { status });
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
    <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8">
      <h2 className="text-xl font-semibold text-slate-900">Offline requests</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Each request includes the before and after surroundings photos. Accepting records exactly 4 hours from the time in they entered.
      </p>
      {error && <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading requests…</p>}
      <div className="mt-6 space-y-4">
        {pending.map((row) => (
          <article key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-lg font-semibold text-slate-900">{row.student_name || 'Student'}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {[row.student_id_number, row.assigned_office].filter(Boolean).join(' · ')}
            </p>
            {row.reason && <p className="mt-2 text-sm text-slate-700">{row.reason}</p>}
            <ul className="mt-2 space-y-3">
              {(row.shifts || []).map((shift) => (
                <li key={shift.id || `${shift.date}-${shift.time_in}`}>
                  <p className="text-xs font-mono text-slate-600">
                    {shift.date} · {shift.time_in}–{shift.time_out}
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
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => void decide(row.id, 'Approved')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> Accept
              </button>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => void decide(row.id, 'Rejected')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50"
              >
                <X className="h-4 w-4" /> Decline
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
