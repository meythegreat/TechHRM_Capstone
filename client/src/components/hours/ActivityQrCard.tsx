import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { motion } from 'framer-motion';
import { AlertCircle, KeyRound, Maximize2, QrCode, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { formatClockTime } from '../../utils/scheduleTime';
import { HelpDisclosure } from '../HelpDisclosure';

interface QrSession {
  payload: string;
  expires_at: string;
  seconds_remaining: number;
  title?: string;
  type?: string;
  hours?: number;
  starts_at?: string;
  valid_until?: string;
  window_minutes?: number;
}

const formatCountdown = (seconds: number) => `0:${String(seconds % 60).padStart(2, '0')}`;

export function ActivityQrCard({ eventId }: { eventId: number }) {
  const [session, setSession] = useState<QrSession | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [passcode, setPasscode] = useState('');
  const [passcodeSeconds, setPasscodeSeconds] = useState(0);
  const [passcodeExpires, setPasscodeExpires] = useState('');
  const [error, setError] = useState('');
  const [forbiddenNotice, setForbiddenNotice] = useState('');
  const [expanded, setExpanded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const expandedRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout>;
    setForbiddenNotice('');
    setError('');
    setSession(null);
    setPasscode('');

    const loadPasscode = async () => {
      try {
        const res = await axios.get('/api/attendance/activity-passcode', { params: { event_id: eventId } });
        if (cancelled) return;
        setPasscode(res.data.token_code || '');
        setPasscodeExpires(res.data.expires_at || '');
        setPasscodeSeconds(Number(res.data.seconds_remaining) || 0);
      } catch (err) {
        if (cancelled) return;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const message = axios.isAxiosError(err) ? err.response?.data?.message : '';
        if (status === 403) {
          setForbiddenNotice(message || 'Only the assigned assembly representative can issue this code.');
          return;
        }
        setError(message || 'Unable to show the passcode.');
      }
    };

    const load = async () => {
      void loadPasscode();
      try {
        const res = await axios.get('/api/attendance/activity-qr', { params: { event_id: eventId } });
        if (cancelled) return;
        setSession(res.data);
        setSeconds(Number(res.data.seconds_remaining) || 0);
        setError('');
        setForbiddenNotice('');
        const waitMs = Math.max(1000, (Number(res.data.seconds_remaining) || 3) * 1000 - 400);
        refreshTimer = setTimeout(load, waitMs);
      } catch (err) {
        if (cancelled) return;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const message = axios.isAxiosError(err) ? err.response?.data?.message : '';
        if (status === 403) {
          setForbiddenNotice(message || 'Only the assigned assembly representative can issue these QR codes.');
          return;
        }
        setError(message || 'Unable to show the QR code.');
        refreshTimer = setTimeout(load, 5000);
      }
    };

    void load();
    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
    };
  }, [eventId]);

  useEffect(() => {
    if (!session) return undefined;
    const timer = setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((new Date(session.expires_at).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (!passcodeExpires) return undefined;
    const timer = setInterval(() => {
      setPasscodeSeconds(Math.max(0, Math.ceil((new Date(passcodeExpires).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [passcodeExpires]);

  useEffect(() => {
    if (!session?.payload) return undefined;
    const draw = (canvas: HTMLCanvasElement | null, width: number) => {
      if (!canvas) return;
      QRCode.toCanvas(canvas, session.payload, { width, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {
        setError('Unable to draw the QR code.');
      });
    };
    draw(canvasRef.current, 220);
    if (expanded) {
      const size = Math.max(280, Math.min(480, window.innerWidth - 64, window.innerHeight - 320));
      draw(expandedRef.current, size);
    }
    return undefined;
  }, [session?.payload, expanded]);

  if (forbiddenNotice) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-3.5 text-xs font-bold text-indigo-900">
        <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <div>
          <p>{forbiddenNotice}</p>
          <p className="mt-1 font-medium text-indigo-700">
            Assigned Assembly Year Representatives view and display their rotating QR codes and passcodes from Year Activities.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-3">
        <p className="text-xs font-bold text-slate-600">
          On-time clock-in until{' '}
          <span className="font-mono font-extrabold text-slate-900">
            {session?.valid_until ? formatClockTime(session.valid_until) : 'the cutoff'}
          </span>{' '}
          ·{' '}
          <span className="font-mono font-extrabold text-emerald-700">
            {Number(session?.hours ?? 0).toFixed(2)} hrs
          </span>{' '}
          credited at time-out.
        </p>
        <HelpDisclosure
          variant="inline"
          title="How activity QR works"
          items={[
            'Students clock in using this rotating QR code or passcode, then time out the same way using the active code.',
            `${Number(session?.hours ?? 0).toFixed(2)} hours are credited only at time-out and only if the clock-in was on time; clock-ins after ${session?.valid_until ? formatClockTime(session.valid_until) : 'the cutoff window'} are late and earn no credit.`,
            'Codes are screen-only — they cannot be saved, copied, or downloaded, and photos stop working once refreshed.',
          ]}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2 select-none"
        onContextMenu={(event) => event.preventDefault()}
        onCopy={(event) => event.preventDefault()}
        onCut={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
      >
        {/* LIVE QR CARD */}
        <div className="flex flex-col items-center justify-between rounded-[1.5rem] border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                <QrCode className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Live QR Code</p>
                <p className="text-xs font-bold text-slate-900">Screen-only scan</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs font-extrabold tabular-nums text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {session ? formatCountdown(seconds) : '--:--'}
            </span>
          </div>

          <div className="relative my-4 rounded-2xl border-2 border-slate-100 bg-white p-2.5 shadow-2xs">
            <canvas
              ref={canvasRef}
              draggable={false}
              aria-label="Activity attendance QR code"
              className="pointer-events-none rounded-xl select-none"
            />
            <div className="absolute inset-0" aria-hidden="true" onContextMenu={(event) => event.preventDefault()} />
          </div>

          <button
            type="button"
            onClick={() => setExpanded(true)}
            disabled={!session?.payload}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-45"
          >
            <Maximize2 className="h-3.5 w-3.5" /> Expand QR Fullscreen
          </button>
        </div>

        {/* ROTATING PASSCODE CARD */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-xl">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-blue-600/25 blur-3xl" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-300">Activity Passcode</p>
                <p className="text-xs font-bold text-slate-300">Auto-rotating token</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 font-mono text-xs font-extrabold tabular-nums text-white">
              {passcode ? formatCountdown(passcodeSeconds) : '--:--'}
            </span>
          </div>

          <div className="relative z-10 my-6 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-6 text-center backdrop-blur-xl">
            <p className="font-mono text-4xl font-black tracking-[0.28em] text-white sm:text-5xl">
              {passcode || '------'}
            </p>
          </div>

          <p className="relative z-10 text-center text-[11px] font-medium text-slate-400">
            Screen-only scan — expires automatically on refresh.
          </p>
        </div>
      </div>

      {expanded && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/85 p-6 backdrop-blur-md select-none"
          onClick={() => setExpanded(false)}
          onContextMenu={(event) => event.preventDefault()}
          onCopy={(event) => event.preventDefault()}
          onCut={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between gap-3 bg-slate-950 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <QrCode className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-black tracking-tight">
                  {session?.title || 'Activity Attendance QR'}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-xs font-extrabold tabular-nums text-emerald-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  {formatCountdown(seconds)}
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center p-6 sm:p-8">
              <p className="mb-5 text-center text-lg font-extrabold text-slate-900">
                Scan this QR code for attendance
              </p>
              <div className="relative rounded-2xl border-2 border-slate-100 bg-white p-3 shadow-sm">
                <canvas
                  ref={expandedRef}
                  draggable={false}
                  aria-label="Expanded activity attendance QR code"
                  className="pointer-events-none rounded-xl select-none"
                />
                <div className="absolute inset-0" aria-hidden="true" onContextMenu={(event) => event.preventDefault()} />
              </div>
              <p className="mt-5 text-xs font-bold text-slate-500">
                Refreshes automatically in{' '}
                <span className="font-mono text-slate-900">{formatCountdown(seconds)}</span>
              </p>
            </div>
          </motion.div>
        </motion.div>,
        document.body,
      )}
    </div>
  );
}
