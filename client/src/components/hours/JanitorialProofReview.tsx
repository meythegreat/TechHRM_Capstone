import { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertCircle, Camera, Check, CheckCircle2, X } from 'lucide-react';
import { CleaningProofPhotos } from '../CleaningProofPhotos';
import { HelpDisclosure } from '../HelpDisclosure';

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
  leader_decision?: string | null;
  deducted_hours?: number;
  leader_remarks?: string | null;
  credited_if_accepted?: number;
  immediate_supervisor_name?: string | null;
  supervision?: boolean;
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
    hour12: true,
  });
};

const statusLabel = (status?: string | null) => {
  const value = (status || '').toLowerCase();
  if (value === 'accepted' || value === 'approved') return 'Accepted';
  if (value === 'rejected') return 'Declined';
  if (value === 'recommended') return 'Waiting for immediate supervisor';
  if (value === 'leader_declined') return 'Declined — waiting for final say';
  return 'Pending review';
};

export function JanitorialProofReview() {
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deductions, setDeductions] = useState<Record<number, string>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});

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
    const deducted = Math.min(4, Math.max(0, Number(deductions[id] || 0) || 0));
    const note = (remarks[id] || '').trim();
    const confirmed = window.confirm(
      status === 'accepted'
        ? `Record your approval${deducted > 0 ? ` and deduct ${deducted} hours` : ''}? The immediate supervisor still has the final say.`
        : 'Record a decline? The immediate supervisor still has the final say.',
    );
    if (!confirmed) return;
    setBusyId(id);
    setError('');
    try {
      const response = await axios.patch(`/api/attendance/janitorial-reviews/${id}`, {
        status,
        deducted_hours: status === 'accepted' ? deducted : 0,
        remarks: note,
      });
      const next = response.data?.entry as ReviewEntry | undefined;
      setEntries((current) => current.map((entry) => (entry.id === id && next ? next : entry)));
    } catch (err) {
      setError(apiError(err, 'Could not update this entry.'));
    } finally {
      setBusyId(null);
    }
  };

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
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-blue-600/25 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
              <Camera className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-white">Photo Review</h2>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-300">
                Review member cleaning photos and submit your approval recommendation.
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 font-mono text-[10px] font-extrabold uppercase tracking-wider text-slate-200">
            {entries.length} {entries.length === 1 ? 'Entry' : 'Entries'}
          </span>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <HelpDisclosure
          variant="inline"
          title="Review guidelines"
          items={[
            "Verify each photo's stamped date and time before recording your approval or decline after the student clocks out.",
            'You may deduct duty hours and include remarks with your recommendation.',
            'Your decision is forwarded to the immediate supervisor, who has the final say before hours are credited.',
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
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
            Loading entries…
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
            <Camera className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
            <p className="text-sm font-extrabold text-slate-700">No janitorial photo entries yet</p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Member cleaning submissions will appear here once they clock in with surroundings photos.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {entries.map((entry) => {
            const status = (entry.status || '').toLowerCase();
            const accepted = status === 'accepted' || status === 'approved';
            const declined = status === 'rejected';
            const recorded = status === 'recommended' || status === 'leader_declined';
            const accentBar = !entry.time_out && !accepted && !declined
              ? 'bg-sky-500'
              : accepted
                ? 'bg-emerald-500'
                : declined
                  ? 'bg-rose-500'
                  : 'bg-amber-500';
            return (
              <article
                key={entry.id}
                className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 shadow-2xs"
              >
                <span aria-hidden="true" className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${accentBar}`} />
                <div className="pl-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-black tracking-tight text-slate-900">
                        {entry.student_name || 'Student'}
                      </h3>
                      <p className="mt-0.5 font-mono text-xs font-medium text-slate-500">
                        {[entry.student_id_number, entry.department, entry.group_name, entry.area].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-1.5 text-xs font-bold text-slate-700">
                        {entry.time_out
                          ? `${formatWhen(entry.time_in)} – ${formatWhen(entry.time_out)}`
                          : `Clocked in ${formatWhen(entry.time_in)} · still on duty`}
                        {entry.time_out && typeof entry.rendered_hours === 'number' && accepted ? ` · ${entry.rendered_hours} hrs` : ''}
                        {entry.time_out && !accepted && !declined && !recorded ? ' · up to 4 hrs if accepted' : ''}
                      </p>
                    </div>
                    <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
                      !entry.time_out && !accepted && !declined
                        ? 'border-sky-200 bg-sky-50 text-sky-800'
                        : accepted
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : declined
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}>
                      {!entry.time_out && !accepted && !declined && !recorded ? 'Still clocked in' : statusLabel(entry.status)}
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

                  {!accepted && !declined && !recorded ? (
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
                            value={deductions[entry.id] ?? ''}
                            onChange={(event) => setDeductions((current) => ({ ...current, [entry.id]: event.target.value }))}
                            placeholder="0"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Remarks
                          </span>
                          <input
                            value={remarks[entry.id] ?? ''}
                            onChange={(event) => setRemarks((current) => ({ ...current, [entry.id]: event.target.value }))}
                            placeholder="Optional note"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === entry.id || !entry.time_out}
                          onClick={() => void decide(entry.id, 'accepted')}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-45"
                        >
                          <Check className="h-3.5 w-3.5" /> Accept
                        </button>
                        <button
                          type="button"
                          disabled={busyId === entry.id}
                          onClick={() => void decide(entry.id, 'rejected')}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-rose-700 transition hover:bg-rose-50 disabled:opacity-45"
                        >
                          <X className="h-3.5 w-3.5" /> Decline
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>
                        {recorded
                          ? `Your decision is with ${entry.immediate_supervisor_name || 'the immediate supervisor'}${entry.leader_remarks ? `. Note: ${entry.leader_remarks}` : ''}${entry.deducted_hours ? `. Deducted ${entry.deducted_hours} hrs` : ''}.`
                          : 'The immediate supervisor has given the final say.'}
                      </span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
