import { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertCircle, Calendar, Check, CheckCircle2, ShieldCheck, Trash2, X } from 'lucide-react';
import { CleaningProofPhotos } from '../CleaningProofPhotos';
import { HelpDisclosure } from '../HelpDisclosure';
import { formatClockTime } from '../../utils/scheduleTime';

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
  supervision?: boolean;
  leader_decision?: string | null;
  deducted_hours?: number;
  leader_remarks?: string | null;
  credited_if_accepted?: number;
  immediate_supervisor_name?: string | null;
  final_on_behalf?: boolean;
  decision_role?: 'immediate' | 'cover';
};

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
  status?: string | null;
  reason?: string | null;
  leader_decision?: string | null;
  deducted_hours?: number;
  leader_remarks?: string | null;
  credited_if_accepted?: number;
  decision_role?: 'immediate' | 'cover';
  final_on_behalf?: boolean;
  shifts?: Shift[];
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

const tomorrowKey = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const awaiting = (status?: string | null) => {
  const value = (status || '').toLowerCase();
  return value === 'recommended' || value === 'leader_declined' || value === 'awaiting_final';
};

export function JanitorialFinalReview() {
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [requests, setRequests] = useState<OfflineRequest[]>([]);
  const [absences, setAbsences] = useState<{ date: string; reason: string }[]>([]);
  const [absenceMode, setAbsenceMode] = useState<'single' | 'multiple'>('single');
  const [extraDates, setExtraDates] = useState<string[]>(['', '']);
  const [absenceReason, setAbsenceReason] = useState('');
  const [isImmediate, setIsImmediate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [absentOn, setAbsentOn] = useState(tomorrowKey);

  const load = () => {
    setLoading(true);
    axios.get('/api/attendance/janitorial-final-reviews')
      .then((response) => {
        const nextEntries = Array.isArray(response.data?.entries) ? response.data.entries : [];
        const nextRequests = Array.isArray(response.data?.requests) ? response.data.requests : [];
        const immediate = Boolean(response.data?.is_immediate_supervisor);
        setEntries(nextEntries);
        setRequests(nextRequests);
        const reports = Array.isArray(response.data?.reports)
          ? response.data.reports
          : (Array.isArray(response.data?.absences) ? response.data.absences.map((date: string) => ({ date, reason: '' })) : []);
        setAbsences(reports);
        setIsImmediate(immediate);
        setHidden(!immediate && nextEntries.length === 0 && nextRequests.length === 0);
        setError('');
      })
      .catch((err) => setError(apiError(err, 'Could not load janitorial decisions.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const decideEntry = async (id: number, status: 'accepted' | 'rejected') => {
    setBusyId(`entry-${id}`);
    setError('');
    setNotice('');
    try {
      const response = await axios.patch(`/api/attendance/janitorial-reviews/${id}`, { status });
      setNotice(response.data?.message || 'Saved.');
      await load();
    } catch (err) {
      setError(apiError(err, 'Could not record the final decision.'));
    } finally {
      setBusyId(null);
    }
  };

  const decideRequest = async (id: number, status: 'Approved' | 'Rejected') => {
    setBusyId(`request-${id}`);
    setError('');
    setNotice('');
    try {
      const response = await axios.patch(`/api/attendance/janitorial-offline-requests/${id}`, { status });
      setNotice(response.data?.message || 'Saved.');
      await load();
    } catch (err) {
      setError(apiError(err, 'Could not record the final decision.'));
    } finally {
      setBusyId(null);
    }
  };

  const applyReports = (data: { reports?: { date: string; reason?: string }[]; absences?: string[] }) => {
    const reports = Array.isArray(data?.reports)
      ? data.reports.map((row) => ({ date: row.date, reason: row.reason || '' }))
      : (Array.isArray(data?.absences) ? data.absences.map((date) => ({ date, reason: '' })) : []);
    setAbsences(reports);
  };

  const reportAbsence = async (absent: boolean, dates: string[]) => {
    const chosen = dates.map((date) => date.trim()).filter(Boolean);
    setBusyId(absent ? 'absence-save' : `absence-${chosen[0] || 'remove'}`);
    setError('');
    setNotice('');
    try {
      const response = await axios.post('/api/attendance/janitorial-immediate-absence', {
        dates: chosen,
        absent,
        reason: absent ? absenceReason.trim() : undefined,
      });
      applyReports(response.data || {});
      setNotice(response.data?.message || 'Saved.');
      if (absent) setAbsenceReason('');
    } catch (err) {
      setError(apiError(err, 'Could not update the absence report.'));
    } finally {
      setBusyId(null);
    }
  };

  if (hidden || (loading && entries.length === 0 && !isImmediate)) {
    return loading ? null : null;
  }

  const openEntries = entries.filter((entry) => awaiting(entry.status));
  const openRequests = requests.filter((request) => request.status === 'Recommended');

  const totalPending = openEntries.length + openRequests.length;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
      {/* OBSIDIAN FINAL APPROVAL HEADER */}
      <div className="relative overflow-hidden bg-slate-950 px-6 py-5 text-white sm:px-7">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
          aria-hidden="true"
        />
        <div
          className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl ${
            totalPending > 0 ? 'bg-amber-500/25' : 'bg-emerald-500/20'
          }`}
          aria-hidden="true"
        />
        <div className="relative z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-white">Janitorial Final Say</h2>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-300">
                Give final approval to credit verified janitorial duty hours on student DTRs.
              </p>
            </div>
          </div>

          {totalPending > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              {totalPending} Pending
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              All Caught Up
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5 p-6 sm:p-7">
        <HelpDisclosure
          variant="inline"
          title="How final approval works"
          items={[
            'The janitorial supervisor records an initial recommendation, optional hour deduction, and notes.',
            'You decide whether the recommended hours are officially recorded on the student DTR.',
            'Report one future date or several, with a reason. The department supervisor can give the final say only on those dates.',
            'That report is for janitorial coverage. Leave is still filed on the department’s manual application and is not approved inside this screen.',
          ]}
        />

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {isImmediate && (
          <div className="rounded-2xl border border-amber-200/90 bg-amber-50/70 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Calendar className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black tracking-tight text-amber-950">Report an Absence in Advance</p>
                <p className="mt-0.5 text-xs font-medium text-amber-900/90">
                  Choose one future date or several, and add a reason. The department supervisor can give the janitorial final say on those days. Leave stays on the department’s manual application.
                </p>
                <div className="mt-3 inline-flex rounded-xl border border-amber-200 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setAbsenceMode('single')}
                    className={`rounded-lg px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider ${absenceMode === 'single' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                  >
                    Single date
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbsenceMode('multiple')}
                    className={`rounded-lg px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider ${absenceMode === 'multiple' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                  >
                    Multiple dates
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {absenceMode === 'single' ? (
                    <input
                      type="date"
                      min={tomorrowKey()}
                      value={absentOn}
                      onChange={(event) => setAbsentOn(event.target.value)}
                      className="rounded-xl border border-amber-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  ) : (
                    <div className="space-y-2">
                      {extraDates.map((date, index) => (
                        <input
                          key={`absence-date-${index}`}
                          type="date"
                          min={tomorrowKey()}
                          value={date}
                          onChange={(event) => setExtraDates((current) => current.map((value, item) => (item === index ? event.target.value : value)))}
                          className="rounded-xl border border-amber-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => setExtraDates((current) => [...current, ''].slice(0, 31))}
                        className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800"
                      >
                        Add another date
                      </button>
                    </div>
                  )}
                  <input
                    value={absenceReason}
                    onChange={(event) => setAbsenceReason(event.target.value)}
                    maxLength={500}
                    placeholder="Reason for the absence"
                    className="w-full rounded-xl border border-amber-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                  <button
                    type="button"
                    disabled={busyId === 'absence-save' || !absenceReason.trim()}
                    onClick={() => void reportAbsence(true, absenceMode === 'single' ? [absentOn] : extraDates)}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-45"
                  >
                    Report Absence
                  </button>
                </div>
                {absences.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {absences.map((row) => (
                      <li
                        key={row.date}
                        className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-white/90 px-3.5 py-2 text-xs font-bold text-amber-950"
                      >
                        <span>
                          <span className="font-mono">{row.date}</span>
                          {row.reason ? <span className="mt-0.5 block font-medium text-amber-800">{row.reason}</span> : null}
                        </span>
                        <button
                          type="button"
                          onClick={() => void reportAbsence(false, [row.date])}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2.5 py-6 text-xs font-bold text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" />
            Loading decisions…
          </div>
        )}

        {!loading && totalPending === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
            <ShieldCheck className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
            <p className="text-sm font-extrabold text-slate-700">No entries waiting for a final decision</p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Janitorial supervisor recommendations and offline requests will appear here.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {openEntries.map((entry) => {
            const cover = entry.decision_role === 'cover';
            const hours = entry.credited_if_accepted ?? 4;
            return (
              <article
                key={entry.id}
                className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 shadow-2xs"
              >
                <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-amber-500" />
                <div className="pl-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-black tracking-tight text-slate-900">
                        {entry.supervision ? 'Supervising Hours' : (entry.student_name || 'Student')}
                      </h3>
                      <p className="mt-0.5 font-mono text-xs font-medium text-slate-500">
                        {[entry.student_id_number, entry.department, entry.area, entry.group_name].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                      {hours} hrs if accepted
                    </span>
                  </div>

                  <p className="mt-1.5 text-xs font-bold text-slate-700">
                    {formatWhen(entry.time_in)}
                    {entry.supervision ? ' · presence photo' : ''}
                  </p>

                  {entry.leader_decision && (
                    <div className="mt-2.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700">
                      Janitorial supervisor <span className="font-extrabold">{entry.leader_decision === 'approved' ? 'approved' : 'declined'}</span>
                      {entry.deducted_hours ? ` and deducted ${entry.deducted_hours} hrs` : ''}.
                      {entry.leader_remarks ? ` Note: ${entry.leader_remarks}` : ''}
                    </div>
                  )}

                  {cover && (
                    <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-900">
                      You are deciding for {entry.immediate_supervisor_name || 'the immediate supervisor'}, who reported an absence.
                    </div>
                  )}

                  <div className="mt-4">
                    <CleaningProofPhotos
                      beforePath={entry.before_path}
                      beforeCapturedAt={entry.before_captured_at}
                      afterPath={entry.after_path}
                      afterCapturedAt={entry.after_captured_at}
                      studentName={entry.student_name || 'Student'}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === `entry-${entry.id}`}
                      onClick={() => void decideEntry(entry.id, 'accepted')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-45"
                    >
                      <Check className="h-3.5 w-3.5" /> Accept
                    </button>
                    <button
                      type="button"
                      disabled={busyId === `entry-${entry.id}`}
                      onClick={() => void decideEntry(entry.id, 'rejected')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-rose-700 transition hover:bg-rose-50 disabled:opacity-45"
                    >
                      <X className="h-3.5 w-3.5" /> Decline
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {openRequests.map((request) => (
            <article
              key={`offline-${request.id}`}
              className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 shadow-2xs"
            >
              <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-indigo-500" />
              <div className="pl-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black tracking-tight text-slate-900">
                        {request.student_name || 'Student'}
                      </h3>
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                        Offline Request
                      </span>
                    </div>
                    {request.student_id_number && (
                      <p className="mt-0.5 font-mono text-xs font-medium text-slate-500">{request.student_id_number}</p>
                    )}
                  </div>
                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                    {request.credited_if_accepted ?? 4} hrs if accepted
                  </span>
                </div>

                {request.reason && (
                  <p className="mt-2.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700">
                    {request.reason}
                  </p>
                )}

                <div className="mt-2.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700">
                  Janitorial supervisor <span className="font-extrabold">{request.leader_decision === 'approved' ? 'approved' : 'declined'}</span>
                  {request.deducted_hours ? ` and deducted ${request.deducted_hours} hrs` : ''}.
                  {request.leader_remarks ? ` Note: ${request.leader_remarks}` : ''}
                </div>

                <ul className="mt-3 space-y-3">
                  {(request.shifts || []).map((shift) => (
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
                          studentName={request.student_name || 'Student'}
                          layout="compact"
                        />
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === `request-${request.id}`}
                    onClick={() => void decideRequest(request.id, 'Approved')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-45"
                  >
                    <Check className="h-3.5 w-3.5" /> Accept
                  </button>
                  <button
                    type="button"
                    disabled={busyId === `request-${request.id}`}
                    onClick={() => void decideRequest(request.id, 'Rejected')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-rose-700 transition hover:bg-rose-50 disabled:opacity-45"
                  >
                    <X className="h-3.5 w-3.5" /> Decline
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
