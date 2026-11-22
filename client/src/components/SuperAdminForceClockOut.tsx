import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { LogOut, RefreshCw, ShieldAlert, AlertCircle, CheckCircle2 } from 'lucide-react';
import { REALTIME_EVENT } from '../utils/realtime';
import { HelpDisclosure } from './HelpDisclosure';

export interface OpenSession {
  id: number;
  user_id: number;
  student_name: string;
  student_id_number?: string | null;
  office: string;
  time_in: string;
  session_kind: 'regular' | 'janitorial' | 'activity';
  duty_type?: string | null;
  activity_label?: string | null;
  rendered_hour_event_id?: number | null;
  account_deleted?: boolean;
}

const formatWhen = (value: string | null | undefined) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const kindLabel = (session: OpenSession) => {
  if (session.session_kind === 'activity') {
    return session.activity_label || 'Activity';
  }
  if (session.session_kind === 'janitorial') {
    return 'Janitorial';
  }
  return session.duty_type || 'Regular duty';
};

type Props = {
  onClosed?: () => void;
};

const SuperAdminForceClockOut = ({ onClosed }: Props) => {
  const [sessions, setSessions] = useState<OpenSession[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/admin/open-sessions');
      const rows: OpenSession[] = Array.isArray(response.data?.sessions) ? response.data.sessions : [];
      setSessions(rows);
      setSelected((current) => {
        const openIds = new Set(rows.map((row) => row.id));
        return new Set([...current].filter((id) => openIds.has(id)));
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not load open sessions.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onRealtime = () => {
      void load();
    };
    window.addEventListener(REALTIME_EVENT, onRealtime);
    const interval = window.setInterval(() => {
      void load();
    }, 15000);
    return () => {
      window.removeEventListener(REALTIME_EVENT, onRealtime);
      window.clearInterval(interval);
    };
  }, [load]);

  const allSelected = sessions.length > 0 && selected.size === sessions.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(sessions.map((row) => row.id)));
  };

  const toggleOne = (id: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runForce = async (mode: 'bulk' | 'selected') => {
    if (mode === 'selected' && selected.size === 0) {
      setError('Select at least one open session.');
      return;
    }

    const confirmText =
      mode === 'bulk'
        ? `Clock out all ${sessions.length} open session${sessions.length === 1 ? '' : 's'} (regular duty and activities)? Hours will be credited with the normal close rules.`
        : `Clock out the ${selected.size} selected open session${selected.size === 1 ? '' : 's'}? Hours will be credited with the normal close rules.`;

    if (!window.confirm(confirmText)) return;

    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const payload =
        mode === 'bulk'
          ? { mode: 'bulk' }
          : { mode: 'selected', attendance_ids: [...selected] };
      const response = await axios.post('/api/admin/force-clock-out', payload);
      setStatus(response.data?.message || 'Sessions closed.');
      setSelected(new Set());
      await load();
      onClosed?.();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Force clock-out failed.');
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const regular = sessions.filter((s) => s.session_kind !== 'activity').length;
    const activity = sessions.filter((s) => s.session_kind === 'activity').length;
    return { regular, activity };
  }, [sessions]);

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
      {/* OBSIDIAN FORCE CLOCK-OUT HEADER */}
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
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-rose-600/25 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30">
              <LogOut className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-rose-300">
                  <ShieldAlert className="h-3 w-3" /> Super Admin Only
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 font-mono text-[10px] font-bold text-slate-300">
                  {sessions.length} Open
                </span>
              </div>
              <h2 className="mt-1.5 text-base font-black tracking-tight text-white">Force Clock-Out</h2>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-300">
                Close forgotten open regular-duty and group-activity sessions.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-bold text-white backdrop-blur-sm transition hover:bg-white/20 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void runForce('selected')}
              disabled={busy || selected.size === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-500 disabled:opacity-45"
            >
              Clock Out Selected ({selected.size})
            </button>
            <button
              type="button"
              onClick={() => void runForce('bulk')}
              disabled={busy || sessions.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-rose-600/30 transition hover:bg-rose-500 disabled:opacity-45"
            >
              Bulk Close All ({sessions.length})
            </button>
          </div>
        </div>
      </div>

      {/* COUNTS STRIP */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-6 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-700">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
          {sessions.length} total open
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
          {counts.regular} regular / janitorial
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-bold text-violet-700">
          {counts.activity} activity
        </span>
        <div className="w-full pt-1">
          <HelpDisclosure
            variant="inline"
            title="How force clock-out works"
            items={[
              'Select specific rows to close individual open sessions, or use Bulk Close All to close every active session at once.',
              'Credited hours are calculated through the standard clock-out close rules.',
            ]}
          />
        </div>
      </div>

      {(error || status) && (
        <div className="space-y-2 border-b border-slate-100 px-6 py-3">
          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
          {status ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{status}</span>
            </div>
          ) : null}
        </div>
      )}

      <div className="relative min-h-[160px] overflow-x-auto">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 backdrop-blur-[1px]">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          </div>
        )}
        <table className="app-data-table w-full text-left">
          <thead>
            <tr className="border-b border-slate-200/80 bg-slate-50/80">
              <th className="w-12 px-6 py-3.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={sessions.length === 0 || busy}
                  aria-label="Select all open sessions"
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
              </th>
              <th className="px-6 py-3.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Student</th>
              <th className="px-6 py-3.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Office</th>
              <th className="px-6 py-3.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Type</th>
              <th className="px-6 py-3.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Timed In</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loading && sessions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <p className="text-sm font-extrabold text-slate-700">No open sessions</p>
                  <p className="mt-1 text-xs font-medium text-slate-400">
                    Students who forgot to clock out will appear here.
                  </p>
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr key={session.id} className="transition-colors hover:bg-slate-50/80">
                  <td className="px-6 py-3.5">
                    <input
                      type="checkbox"
                      checked={selected.has(session.id)}
                      onChange={() => toggleOne(session.id)}
                      disabled={busy}
                      aria-label={`Select ${session.student_name}`}
                      className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    />
                  </td>
                  <td className="px-6 py-3.5">
                    <p className="text-sm font-extrabold text-slate-900">{session.student_name}</p>
                    <p className="font-mono text-xs font-medium text-slate-500">{session.student_id_number || 'No ID'}</p>
                  </td>
                  <td className="px-6 py-3.5 text-sm font-bold text-slate-700">{session.office}</td>
                  <td className="px-6 py-3.5">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                        session.session_kind === 'activity'
                          ? 'border-violet-200 bg-violet-50 text-violet-700'
                          : session.session_kind === 'janitorial'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {kindLabel(session)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 font-mono text-xs font-bold text-slate-700">{formatWhen(session.time_in)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default SuperAdminForceClockOut;
