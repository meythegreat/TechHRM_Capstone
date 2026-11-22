import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  Copy,
  KeyRound,
  Maximize2,
  QrCode,
  X,
  ShieldCheck,
  Clock,
  MapPin,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  janitorialGroupService,
  type JanitorialCodeSession,
  type JanitorialGroup,
} from '../../services/janitorialGroupService';
import CleaningProofCapture from '../CleaningProofCapture';
import { HelpDisclosure } from '../HelpDisclosure';
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
    <div className="space-y-6 font-sans">
      {/* OBSIDIAN COMMAND HERO */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                Janitorial Duty
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-300">
                <Clock className="h-3.5 w-3.5 text-emerald-400" />
                {fixedHours.toFixed(0)}h Fixed Credit
              </span>
            </div>

            <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Janitorial Code
            </h1>
            <p className="mt-2.5 text-sm font-medium leading-relaxed text-slate-300">
              Generate a rotating passcode or QR code to verify janitorial duty attendance through supervisor approval.
            </p>
          </div>

          {selected && (
            <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl lg:min-w-[280px]">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Active Roster
              </p>
              {groups.length > 1 ? (
                <select
                  value={groupId ?? ''}
                  onChange={(event) => {
                    setGroupId(Number(event.target.value));
                    setPasscode(null);
                    setQr(null);
                    setError('');
                  }}
                  aria-label="Select janitorial roster"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900/90 px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.area} · {group.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-1.5">
                  <p className="text-base font-extrabold text-white">{selected.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-blue-200">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                    <span>{selected.area}</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.header>

      {/* LOADING STATE */}
      {loadingGroups && (
        <div className="grid grid-cols-1 gap-5 animate-pulse lg:grid-cols-2" aria-busy="true">
          <div className="h-64 rounded-[1.75rem] bg-slate-200/80" />
          <div className="h-64 rounded-[1.75rem] bg-slate-200/80" />
        </div>
      )}

      {/* EMPTY / UNASSIGNED STATE */}
      {!loadingGroups && groups.length === 0 && (
        <div className="flex items-center gap-3 rounded-[1.75rem] border border-slate-200/90 bg-white px-6 py-5 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <AlertCircle className="h-5 w-5" />
          </div>
          <p className="text-sm font-bold text-slate-700">
            {error || 'You are not assigned as a janitorial group supervisor.'}
          </p>
        </div>
      )}

      {/* MAIN VERIFICATION DECK */}
      {selected && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          {error && groups.length > 0 && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* PASSCODE CARD */}
            <div className="flex flex-col justify-between rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-7">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                        Rotating Passcode
                      </p>
                      <p className="text-sm font-bold text-slate-900">{selected.area}</p>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-extrabold tabular-nums text-slate-700">
                    <RefreshCw className="h-3 w-3 text-blue-600" />
                    {passcode ? formatCountdown(passcodeSeconds) : '--:--'}
                  </span>
                </div>

                {/* Token Display Box */}
                <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-5 text-white shadow-inner">
                  <span className="font-mono text-3xl font-black tracking-[0.22em] text-white sm:text-4xl">
                    {passcode?.token_code || '······'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyPasscode()}
                    disabled={!passcode?.token_code}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all disabled:opacity-40 ${
                      copied
                        ? 'bg-emerald-500 text-white'
                        : 'border border-white/15 bg-white/10 text-white hover:bg-white/20'
                    }`}
                    title="Copy passcode"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-center">
                <p className="text-xs font-bold text-slate-700">
                  {passcode ? `Refreshes in ${formatCountdown(passcodeSeconds)}` : 'Preparing passcode…'}
                </p>
                <p className="mt-1 text-[11px] font-medium text-slate-500">
                  Expires immediately when refreshed.
                </p>
              </div>
            </div>

            {/* LIVE QR CARD */}
            <div
              className="flex flex-col items-center justify-between rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm select-none sm:p-7"
              onContextMenu={(event) => event.preventDefault()}
              onCopy={(event) => event.preventDefault()}
              onCut={(event) => event.preventDefault()}
              onDragStart={(event) => event.preventDefault()}
              style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                    <QrCode className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                      Live QR Code
                    </p>
                    <p className="text-sm font-bold text-slate-900">Screen-only scan</p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold tabular-nums text-emerald-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {qr ? formatCountdown(qrSeconds) : '--:--'}
                </span>
              </div>

              <div className="relative my-5 rounded-2xl border-2 border-slate-100 bg-white p-3 shadow-sm">
                <canvas
                  ref={canvasRef}
                  draggable={false}
                  aria-label="Janitorial attendance QR code"
                  className="pointer-events-none rounded-xl select-none"
                />
                <div
                  className="absolute inset-0"
                  aria-hidden="true"
                  onContextMenu={(event) => event.preventDefault()}
                />
              </div>

              <div className="w-full space-y-3">
                <p className="text-center text-[11px] font-medium leading-relaxed text-slate-500">
                  Scan directly on screen — expires on refresh.
                </p>
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  disabled={!qr?.payload}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:opacity-50"
                >
                  <Maximize2 className="h-4 w-4" />
                  Expand QR Fullscreen
                </button>
              </div>
            </div>
          </div>
        </motion.section>
      )}

      <HelpDisclosure
        title="How Janitorial Duty Verification Works"
        items={[
          <>
            <strong className="font-bold text-slate-800">Photo-based attendance:</strong> Members normally clock janitorial duty using live surroundings photos with no code required.
          </>,
          <>
            <strong className="font-bold text-slate-800">Code sharing:</strong> Show this rotating passcode or screen-only QR code only when you are physically with the group and they choose <strong className="font-bold text-slate-800">Supervisor code</strong> on Attendance / DTR.
          </>,
          <>
            <strong className="font-bold text-slate-800">Rotating security:</strong> Passcodes and QR codes cannot be saved or downloaded and stop working immediately once refreshed.
          </>,
          <>
            <strong className="font-bold text-slate-800">Hour adjustments &amp; supervisor verification:</strong> You can approve or decline entries, deduct duty hours, and include a note. Your decision is reviewed by the immediate supervisor, who has the final say.
          </>,
          <>
            <strong className="font-bold text-slate-800">{fixedHours.toFixed(0)}-hour credit policy:</strong> Accepted entries record up to {fixedHours.toFixed(0)} hours from clock-in.
          </>,
        ]}
      />

      {!loadingGroups && groups.length > 0 && groupId && (
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
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
            <div className="relative z-10 flex items-start gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
                <Clock className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-black tracking-tight text-white">Supervising Hours</h2>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-300">
                  Submit a live on-site photo as proof of presence for your supervising shift.
                </p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <HelpDisclosure
              variant="inline"
              title="Supervising hours guidelines"
              items={[
                'Take one on-the-spot photo at the assigned area as proof of presence (gallery photos are not accepted).',
                'The immediate supervisor must accept the photo before 4 hours are added to your DTR.',
                'Supervisors receive one credit per day and may cover at most 3 areas.',
              ]}
            />
            <CleaningProofCapture key={groupId} presence janitorial groupId={groupId} />
          </div>
        </section>
      )}

      {!loadingGroups && groups.length > 0 && <JanitorialProofReview />}
      {!loadingGroups && groups.length > 0 && <JanitorialOfflineReview />}

      {/* EXPANDED QR MODAL */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {expanded && qr?.payload && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 p-6 backdrop-blur-md select-none"
                onClick={() => setExpanded(false)}
                onContextMenu={(event) => event.preventDefault()}
                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 12 }}
                  className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-3 bg-slate-950 px-6 py-4 text-white">
                    <div className="flex items-center gap-2.5">
                      <QrCode className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-black tracking-tight">
                        {selected?.area || 'Janitorial Attendance'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-extrabold tabular-nums text-emerald-300">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                        {formatCountdown(qrSeconds)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpanded(false)}
                        className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-center p-6 sm:p-8">
                    <p className="mb-5 text-center text-lg font-extrabold text-slate-900">
                      Scan this QR code for janitorial attendance
                    </p>
                    <div className="relative rounded-2xl border-2 border-slate-100 bg-white p-3 shadow-sm">
                      <canvas
                        ref={expandedRef}
                        draggable={false}
                        aria-label="Expanded janitorial attendance QR code"
                        className="pointer-events-none rounded-xl select-none"
                      />
                      <div
                        className="absolute inset-0"
                        aria-hidden="true"
                        onContextMenu={(event) => event.preventDefault()}
                      />
                    </div>
                    <p className="mt-5 text-xs font-bold text-slate-500">
                      Refreshes automatically in{' '}
                      <span className="font-mono text-slate-900">{formatCountdown(qrSeconds)}</span>
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}