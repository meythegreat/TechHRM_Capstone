import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import axios from 'axios';
import { Check, Copy, KeyRound, Maximize2, QrCode, X } from 'lucide-react';
import {
  janitorialGroupService,
  type JanitorialCodeSession,
  type JanitorialGroup,
} from '../../services/janitorialGroupService';
import { JanitorialOfflineReview } from './JanitorialOfflineReview';
import { JanitorialProofReview } from './JanitorialProofReview';

type PasscodeSession = JanitorialCodeSession & { token_code: string };
type QrSession = JanitorialCodeSession & { payload: string };

const formatCountdown = (seconds: number) => `0:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

const apiError = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) return fallback;
  const message = error.response?.data?.message;
  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
};

export function JanitorialCodeScreen() {
  const [groups, setGroups] = useState<JanitorialGroup[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [passcode, setPasscode] = useState<PasscodeSession | null>(null);
  const [qr, setQr] = useState<QrSession | null>(null);
  const [passcodeSeconds, setPasscodeSeconds] = useState(0);
  const [qrSeconds, setQrSeconds] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const expandedRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([axios.get('/api/user'), janitorialGroupService.list()])
      .then(([userRes, rows]) => {
        if (cancelled) return;
        const userId = Number(userRes.data?.id);
        const mine = rows.filter((group) => group.supervisor?.id === userId);
        setGroups(mine);
        setGroupId(mine[0]?.id ?? null);
        if (mine.length === 0) {
          setError('You are not assigned as a janitorial group supervisor.');
        }
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err, 'Could not load your janitorial groups.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingGroups(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!groupId) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const [nextPasscode, nextQr] = await Promise.all([
          janitorialGroupService.passcode(groupId),
          janitorialGroupService.qr(groupId),
        ]);
        if (cancelled) return;
        setPasscode(nextPasscode);
        setQr(nextQr);
        setPasscodeSeconds(Number(nextPasscode.seconds_remaining) || 0);
        setQrSeconds(Number(nextQr.seconds_remaining) || 0);
        setError('');
        const waitMs = Math.max(1000, (Number(nextQr.seconds_remaining) || 3) * 1000 - 400);
        timer = setTimeout(load, waitMs);
      } catch (err) {
        if (cancelled) return;
        setError(apiError(err, 'Unable to show the janitorial code.'));
        const status = axios.isAxiosError(err) ? err.response?.status : 0;
        if (status !== 403) timer = setTimeout(load, 5000);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [groupId]);

  useEffect(() => {
    if (!passcode?.expires_at) return undefined;
    const timer = setInterval(() => {
      setPasscodeSeconds(Math.max(0, Math.ceil((new Date(passcode.expires_at).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [passcode?.expires_at]);

  useEffect(() => {
    if (!qr?.expires_at) return undefined;
    const timer = setInterval(() => {
      setQrSeconds(Math.max(0, Math.ceil((new Date(qr.expires_at).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [qr?.expires_at]);

  useEffect(() => {
    if (!qr?.payload) return undefined;
    const draw = (canvas: HTMLCanvasElement | null, width: number) => {
      if (!canvas) return;
      QRCode.toCanvas(canvas, qr.payload, { width, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {
        setError('Unable to draw the QR code.');
      });
    };
    draw(canvasRef.current, 220);
    if (expanded) {
      const size = Math.max(280, Math.min(480, window.innerWidth - 64, window.innerHeight - 320));
      draw(expandedRef.current, size);
    }
    return undefined;
  }, [qr?.payload, expanded]);

  const selected = groups.find((group) => group.id === groupId) ?? null;
  const fixedHours = Number(qr?.fixed_hours ?? passcode?.fixed_hours ?? 4);

  const copyPasscode = async () => {
    if (!passcode?.token_code) return;
    try {
      await navigator.clipboard.writeText(passcode.token_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy the passcode.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-blue-400" />
          <span className="text-sm font-medium text-slate-500">Janitorial duty</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Janitorial code</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Members usually clock janitorial duty with photos and no code. The first surroundings photo starts their clock-in, and the last photo ends their clock-out.
          Show this passcode or QR only when you are with the group and they choose Supervisor code. Accept the photos when they finish. An accepted entry is recorded as exactly {fixedHours.toFixed(0)} hours from their clock-in.
        </p>
      </div>

      {loadingGroups && <p className="text-sm text-slate-500">Loading your janitorial groups…</p>}

      {!loadingGroups && groups.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700">
          {error || 'You are not assigned as a janitorial group supervisor.'}
        </p>
      )}

      {selected && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8">
          {groups.length > 1 && (
            <label className="mb-6 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Roster
              <select
                value={groupId ?? ''}
                onChange={(event) => {
                  setGroupId(Number(event.target.value));
                  setPasscode(null);
                  setQr(null);
                  setError('');
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold normal-case tracking-normal text-slate-800"
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.area} · {group.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900">{selected.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {selected.area}{selected.name && selected.name !== selected.area ? ` · ${selected.name}` : ''}
            </p>
          </div>

          {error && groups.length > 0 && (
            <p className="mb-4 text-sm font-semibold text-rose-700">{error}</p>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <KeyRound className="h-4 w-4" /> Passcode
              </p>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                <span className="font-mono text-3xl font-semibold tracking-widest text-slate-900">
                  {passcode?.token_code || '······'}
                </span>
                <button
                  type="button"
                  onClick={() => void copyPasscode()}
                  disabled={!passcode?.token_code}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-slate-500 transition-colors hover:text-blue-600 disabled:opacity-50"
                  title="Copy passcode"
                >
                  {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5" />}
                </button>
              </div>
              <p className="mt-4 text-center text-sm font-semibold text-slate-900">
                {passcode ? `Refreshes in ${formatCountdown(passcodeSeconds)}` : 'Preparing passcode…'}
              </p>
              <p className="mt-2 text-center text-xs text-slate-500">
                Members type this on Attendance / DTR. It stops working when it refreshes.
              </p>
            </div>

            <div
              className="flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 p-5 select-none"
              onContextMenu={(event) => event.preventDefault()}
              onCopy={(event) => event.preventDefault()}
              onCut={(event) => event.preventDefault()}
              onDragStart={(event) => event.preventDefault()}
              style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
            >
              <p className="mb-4 flex items-center gap-2 self-start text-xs font-bold uppercase tracking-wide text-slate-500">
                <QrCode className="h-4 w-4" /> Live QR
              </p>
              <div className="relative rounded-xl bg-white">
                <canvas
                  ref={canvasRef}
                  draggable={false}
                  aria-label="Janitorial attendance QR code"
                  className="pointer-events-none rounded-xl select-none"
                />
                <div className="absolute inset-0" aria-hidden="true" onContextMenu={(event) => event.preventDefault()} />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-900">
                {qr ? `Refreshes in ${formatCountdown(qrSeconds)}` : 'Preparing QR…'}
              </p>
              <p className="mt-2 text-center text-xs font-medium text-slate-500">
                Members scan this on the screen. It cannot be saved or downloaded, and a photo stops working when it refreshes.
              </p>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                disabled={!qr?.payload}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 disabled:opacity-50"
              >
                <Maximize2 className="h-4 w-4" /> Expand QR
              </button>
            </div>
          </div>
        </section>
      )}

      {!loadingGroups && groups.length > 0 && <JanitorialProofReview />}
      {!loadingGroups && groups.length > 0 && <JanitorialOfflineReview />}

      {expanded && qr?.payload && createPortal(
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-6 select-none"
          onClick={() => setExpanded(false)}
          onContextMenu={(event) => event.preventDefault()}
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
        >
          <div className="rounded-3xl bg-white p-6" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={() => setExpanded(false)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-center text-2xl font-semibold text-slate-900">Scan this QR code for janitorial attendance.</p>
            <div className="relative rounded-xl bg-white">
              <canvas
                ref={expandedRef}
                draggable={false}
                aria-label="Expanded janitorial attendance QR code"
                className="pointer-events-none rounded-xl select-none"
              />
              <div className="absolute inset-0" aria-hidden="true" onContextMenu={(event) => event.preventDefault()} />
            </div>
            <p className="mt-4 text-center text-sm font-semibold text-slate-700">Refreshes in {formatCountdown(qrSeconds)}</p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
