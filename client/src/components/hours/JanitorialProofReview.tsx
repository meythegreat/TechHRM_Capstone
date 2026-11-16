import { useEffect, useState } from 'react';
import axios from 'axios';
import { Check, X } from 'lucide-react';
import { CleaningProofPhotos } from '../CleaningProofPhotos';

type ReviewEntry = {
  id: number;
  student_name?: string | null;
  student_id_number?: string | null;
  group_name?: string | null;
  department?: string | null;
  area?: string | null;
  time_in?: string | null;
  time_out?: string | null;
  status?: string | null;
  rendered_hours?: number;
  before_path?: string | null;
  after_path?: string | null;
  before_captured_at?: string | null;
  after_captured_at?: string | null;
};

const apiError = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) return fallback;
  const message = error.response?.data?.message;
  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
};

const formatWhen = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const statusLabel = (status?: string | null) => {
  const value = (status || '').toLowerCase();
  if (value === 'accepted' || value === 'approved') return 'Accepted';
  if (value === 'rejected') return 'Declined';
  return 'Pending review';
};

export function JanitorialProofReview() {
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    axios.get('/api/attendance/janitorial-reviews')
      .then((response) => {
        setEntries(Array.isArray(response.data?.entries) ? response.data.entries : []);
        setError('');
      })
      .catch((err) => setError(apiError(err, 'Could not load janitorial entries.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (id: number, status: 'accepted' | 'rejected') => {
    const confirmed = window.confirm(
      status === 'accepted'
        ? 'Accept this entry? 4 hours will be recorded from the clock-in. This decision is final.'
        : 'Decline this entry? No hours will be recorded. This decision is final.',
    );
    if (!confirmed) return;
    setBusyId(id);
    setError('');
    try {
      const response = await axios.patch(`/api/attendance/janitorial-reviews/${id}`, { status });
      const next = response.data?.entry as ReviewEntry | undefined;
      setEntries((current) => current.map((entry) => (entry.id === id && next ? next : entry)));
    } catch (err) {
      setError(apiError(err, 'Could not update this entry.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8">
      <h2 className="text-xl font-semibold text-slate-900">Photo review</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Entries appear as soon as a student submits a surroundings photo, even if they are still clocked in. Check each photo’s date and time, then accept or decline after they clock out. Accepting records exactly 4 hours on their DTR, starting at clock-in. The decision is final.
      </p>
      {error && <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading entries…</p>}
      {!loading && entries.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No janitorial photo entries yet.</p>
      )}
      <div className="mt-6 space-y-6">
        {entries.map((entry) => {
          const status = (entry.status || '').toLowerCase();
          const accepted = status === 'accepted' || status === 'approved';
          const declined = status === 'rejected';
          return (
            <article key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{entry.student_name || 'Student'}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {[entry.student_id_number, entry.department, entry.group_name, entry.area].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {entry.time_out
                      ? `${formatWhen(entry.time_in)} – ${formatWhen(entry.time_out)}`
                      : `Clocked in ${formatWhen(entry.time_in)} · still on duty`}
                    {entry.time_out && typeof entry.rendered_hours === 'number' && accepted ? ` · ${entry.rendered_hours} hrs` : ''}
                    {entry.time_out && !accepted && !declined ? ' · 4 hrs if accepted' : ''}
                  </p>
                </div>
                <span className={`inline-flex w-fit rounded-lg border px-3 py-1.5 text-xs font-bold ${
                  !entry.time_out && !accepted && !declined
                    ? 'border-sky-200 bg-sky-50 text-sky-800'
                    : accepted
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : declined
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}>
                  {!entry.time_out && !accepted && !declined ? 'Still clocked in' : statusLabel(entry.status)}
                </span>
              </div>
              <div className="mt-4">
                <CleaningProofPhotos
                  beforePath={entry.before_path}
                  beforeCapturedAt={entry.before_captured_at}
                  afterPath={entry.after_path}
                  afterCapturedAt={entry.after_captured_at}
                  studentName={entry.student_name || 'Student'}
                />
              </div>
              {!accepted && !declined ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === entry.id || !entry.time_out}
                    onClick={() => void decide(entry.id, 'accepted')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" /> Accept
                  </button>
                  <button
                    type="button"
                    disabled={busyId === entry.id}
                    onClick={() => void decide(entry.id, 'rejected')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" /> Decline
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-sm font-medium text-slate-600">This decision is final.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
