import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Copy, Maximize2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import axios from 'axios';

interface AccessSession {
  payload?: string;
  token_code?: string;
  expires_at: string;
  seconds_remaining: number;
  title?: string;
  type?: string;
  hours?: number;
  starts_at?: string;
  valid_until?: string;
  window_minutes?: number;
  channel?: 'qr' | 'passcode';
}

const formatCountdown = (seconds: number) => `0:${String(seconds % 60).padStart(2, '0')}`;

export function ActivityQrCard({ eventId }: { eventId: number }) {
  const [mode, setMode] = useState<'passcode' | 'qr'>('qr');
  const [session, setSession] = useState<AccessSession | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const expandedRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setSession(null);
    setExpanded(false);
    setCopied(false);
  }, [eventId, mode]);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout>;
    const endpoint = mode === 'qr' ? '/api/attendance/activity-qr' : '/api/attendance/activity-passcode';

    const load = async () => {
      try {
        const res = await axios.get(endpoint, { params: { event_id: eventId } });
        if (cancelled) return;
        setSession(res.data);
        setSeconds(Number(res.data.seconds_remaining) || 0);
        setError('');
        const waitMs = Math.max(1000, (Number(res.data.seconds_remaining) || 3) * 1000 - 400);
        refreshTimer = setTimeout(load, waitMs);
      } catch (err) {
        if (cancelled) return;
        const message = axios.isAxiosError(err) ? err.response?.data?.message : '';
        setError(message || (mode === 'qr' ? 'Unable to show the QR code.' : 'Unable to show the passcode.'));
        refreshTimer = setTimeout(load, 5000);
      }
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
    };
  }, [eventId, mode]);

  useEffect(() => {
    if (!session) return undefined;
    const timer = setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((new Date(session.expires_at).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (mode !== 'qr' || !session?.payload) return undefined;
    const draw = (canvas: HTMLCanvasElement | null, width: number) => {
      if (!canvas) return;
      QRCode.toCanvas(canvas, session.payload!, { width, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {
        setError('Unable to draw the QR code.');
      });
    };
    draw(canvasRef.current, 220);
    if (expanded) {
      const size = Math.max(280, Math.min(480, window.innerWidth - 64, window.innerHeight - 320));
      draw(expandedRef.current, size);
    }
    return undefined;
  }, [mode, session?.payload, expanded]);

  const copyPasscode = async () => {
    if (!session?.token_code) return;
    try {
      await navigator.clipboard.writeText(session.token_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy the passcode.');
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Activity access</p>
        <p className="text-sm text-slate-600 mt-1">
          Students use the passcode or scan the QR. On time adds {Number(session?.hours ?? 0).toFixed(2)} hours. After {session?.valid_until || 'the window'}, a clock-in is late and changes nothing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 p-1 bg-white border border-slate-200 rounded-xl">
        <button
          type="button"
          onClick={() => setMode('passcode')}
          className={`py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'passcode' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Passcode
        </button>
        <button
          type="button"
          onClick={() => setMode('qr')}
          className={`py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'qr' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
        >
          QR code
        </button>
      </div>

      {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}

      {mode === 'passcode' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-3xl font-semibold tracking-widest font-mono text-slate-900 select-all">
              {session?.token_code || '······'}
            </span>
            <button
              type="button"
              onClick={copyPasscode}
              disabled={!session?.token_code}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-500 transition-colors hover:text-blue-600 disabled:opacity-50"
              title="Copy passcode"
            >
              {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold tabular-nums text-slate-900">
            {session ? `Refreshes in ${formatCountdown(seconds)}` : 'Preparing passcode…'}
          </p>
          <p className="mt-2 text-xs font-medium text-slate-500">
            A new passcode replaces this one every 30 seconds. Students must use the code on screen.
          </p>
        </div>
      ) : (
        <div
          className="flex flex-col items-center select-none"
          onContextMenu={(event) => event.preventDefault()}
          onCopy={(event) => event.preventDefault()}
          onCut={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
        >
          <div className="relative rounded-xl bg-white">
            <canvas
              ref={canvasRef}
              draggable={false}
              aria-label="Activity attendance QR code"
              className="pointer-events-none rounded-xl select-none"
            />
            <div className="absolute inset-0" aria-hidden="true" onContextMenu={(event) => event.preventDefault()} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            {session ? `Refreshes in ${formatCountdown(seconds)}` : 'Preparing QR…'}
          </p>
          <p className="mt-2 text-center text-xs font-medium text-slate-500">
            Students scan this on the screen. It cannot be saved, copied, or downloaded, and a photo stops working when it refreshes.
          </p>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            disabled={!session?.payload}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 disabled:opacity-50"
          >
            <Maximize2 className="w-4 h-4" /> Expand QR
          </button>
        </div>
      )}

      {expanded && mode === 'qr' && createPortal(
        <div
          className="fixed inset-0 z-[90] bg-slate-950/80 flex items-center justify-center p-6 select-none"
          onClick={() => setExpanded(false)}
          onContextMenu={(event) => event.preventDefault()}
          onCopy={(event) => event.preventDefault()}
          onCut={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
        >
          <div className="bg-white rounded-3xl p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-end mb-3">
              <button type="button" onClick={() => setExpanded(false)} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="mb-4 text-center text-2xl font-semibold text-slate-900">Scan this QR code for attendance.</p>
            <div className="relative rounded-xl bg-white">
              <canvas
                ref={expandedRef}
                draggable={false}
                aria-label="Expanded activity attendance QR code"
                className="pointer-events-none rounded-xl select-none"
              />
              <div className="absolute inset-0" aria-hidden="true" onContextMenu={(event) => event.preventDefault()} />
            </div>
            <p className="mt-4 text-center text-sm font-semibold text-slate-700">Refreshes in {formatCountdown(seconds)}</p>
            <p className="mt-2 text-center text-sm font-medium text-slate-500 max-w-sm">
              Hold this up for students to scan. It still cannot be saved, copied, or downloaded.
            </p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
