import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { LogOut, RefreshCw } from 'lucide-react';
import { REALTIME_EVENT } from '../utils/realtime';

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
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <LogOut className="w-4 h-4 text-rose-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-rose-700">Super Admin only</span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Force clock-out</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Close forgotten open regular-duty and group-activity sessions. Use selected for specific rows, or bulk for everyone still open. Hours follow the normal close path.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || busy}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void runForce('selected')}
            disabled={busy || selected.size === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-900 bg-slate-900 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Clock out selected ({selected.size})
          </button>
          <button
            type="button"
            onClick={() => void runForce('bulk')}
            disabled={busy || sessions.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-xs font-bold uppercase tracking-wider text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          >
            Bulk clock out all ({sessions.length})
          </button>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
        <span>{sessions.length} open</span>
        <span>·</span>
        <span>{counts.regular} regular / janitorial</span>
        <span>·</span>
        <span>{counts.activity} activity</span>
      </div>

      {(error || status) && (
        <div className="px-6 py-3 border-b border-slate-100">
          {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
          {status ? <p className="text-sm font-semibold text-emerald-700">{status}</p> : null}
        </div>
      )}

      <div className="overflow-x-auto relative min-h-[160px]">
        {loading && (
          <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
          </div>
        )}
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-3.5 w-12">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={sessions.length === 0 || busy}
                  aria-label="Select all open sessions"
                  className="rounded border-slate-300"
                />
              </th>
              <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Student</th>
              <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Office</th>
              <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Timed in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loading && sessions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm font-medium text-slate-500">
                  No open sessions. Students who forgot to clock out will appear here.
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr key={session.id} className="hover:bg-slate-50/80">
                  <td className="px-6 py-3.5">
                    <input
                      type="checkbox"
                      checked={selected.has(session.id)}
                      onChange={() => toggleOne(session.id)}
                      disabled={busy}
                      aria-label={`Select ${session.student_name}`}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-6 py-3.5">
                    <p className="font-bold text-slate-900 text-sm">{session.student_name}</p>
                    <p className="text-xs text-slate-500">{session.student_id_number || 'No ID'}</p>
                  </td>
                  <td className="px-6 py-3.5 text-sm font-semibold text-slate-700">{session.office}</td>
                  <td className="px-6 py-3.5">
                    <span
                      className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                        session.session_kind === 'activity'
                          ? 'bg-violet-50 text-violet-700 border-violet-200'
                          : session.session_kind === 'janitorial'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {kindLabel(session)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-sm font-medium text-slate-700">{formatWhen(session.time_in)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SuperAdminForceClockOut;
