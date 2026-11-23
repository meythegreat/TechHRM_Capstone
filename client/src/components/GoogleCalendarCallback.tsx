import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
    AlertCircle,
    ArrowLeft,
    CalendarCheck2,
    CheckCircle2,
    Loader2,
    Mail,
} from 'lucide-react';

type ConnectResult = { email?: string | null };
type CallbackStatus = 'connecting' | 'connected' | 'error';

const GoogleCalendarCallback = () => {
    const navigate = useNavigate();
    const reduceMotion = useReducedMotion();
    const [status, setStatus] = useState<CallbackStatus>('connecting');
    const [message, setMessage] = useState('Adding your schedule to Google Calendar…');
    const [connectedEmail, setConnectedEmail] = useState<string | null>(null);

    const returnToCalendar = () => {
        if (window.localStorage.getItem('auth_token')) {
            navigate('/dashboard', { replace: true });
            return;
        }
        navigate('/', { replace: true });
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const googleError = params.get('error');

        if (googleError || !code || !state) {
            setStatus('error');
            setMessage(
                'Google sign-in was cancelled. Return to the calendar and choose Connect Google again.'
            );
            return;
        }

        const pendingKey = `wospis-google:${code}`;
        const holder = window as Window & {
            __wospisGoogleConnect?: Record<string, Promise<ConnectResult>>;
        };
        holder.__wospisGoogleConnect ??= {};
        const pending =
            holder.__wospisGoogleConnect[pendingKey] ??
            (holder.__wospisGoogleConnect[pendingKey] = axios
                .post('/api/calendar/google/connect', { code, state })
                .then((response) => response.data as ConnectResult));

        let active = true;
        pending
            .then((data) => {
                if (!active) return;
                const email = data?.email ? ` for ${data.email}` : '';
                setConnectedEmail(data?.email || null);
                setStatus('connected');
                setMessage(
                    `Google Calendar is connected${email}. Duty, class, and holiday events are in that account.`
                );
            })
            .catch((error: unknown) => {
                if (!active) return;
                delete holder.__wospisGoogleConnect?.[pendingKey];
                const detail = axios.isAxiosError(error) ? error.response?.data?.message : null;
                setStatus('error');
                setMessage(
                    typeof detail === 'string' && detail.trim() !== ''
                        ? detail
                        : 'Google Calendar could not be connected.'
                );
            });

        return () => {
            active = false;
        };
    }, []);

    const visual =
        status === 'connected'
            ? {
                  glow: 'bg-emerald-500/25',
                  badge: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300',
                  badgeText: 'Connected',
                  iconWrap: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
                  title: 'Calendar Connected',
              }
            : status === 'error'
              ? {
                    glow: 'bg-rose-500/25',
                    badge: 'border-rose-400/30 bg-rose-500/15 text-rose-300',
                    badgeText: 'Not Connected',
                    iconWrap: 'bg-rose-50 text-rose-600 ring-rose-200',
                    title: 'Connection Interrupted',
                }
              : {
                    glow: 'bg-blue-600/25',
                    badge: 'border-blue-400/30 bg-blue-500/15 text-blue-300',
                    badgeText: 'Syncing',
                    iconWrap: 'bg-blue-50 text-blue-600 ring-blue-200',
                    title: 'Connecting Google Calendar',
                };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4 font-sans sm:p-6">
            {/* BACKGROUND TEXTURE & AMBIENT GLOWS */}
            <div
                className="pointer-events-none absolute inset-0 opacity-20"
                style={{
                    backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                }}
                aria-hidden="true"
            />
            <div
                className={`pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full blur-3xl transition-colors duration-500 ${visual.glow}`}
                aria-hidden="true"
            />
            <div
                className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl"
                aria-hidden="true"
            />

            {/* CALLBACK CARD */}
            <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-10 w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-800/80 bg-white shadow-2xl shadow-black/40"
            >
                {/* OBSIDIAN HEADER STRIP */}
                <div className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-blue-300 ring-1 ring-white/10">
                            <CalendarCheck2 className="h-4 w-4" />
                        </span>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                WoSPIS Calendar Sync
                            </p>
                            <p className="text-xs font-black tracking-tight text-white">
                                Google Calendar
                            </p>
                        </div>
                    </div>

                    <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${visual.badge}`}
                    >
                        {status === 'connecting' && (
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                        )}
                        {visual.badgeText}
                    </span>
                </div>

                {/* BODY */}
                <div className="flex flex-col items-center px-6 py-8 text-center sm:px-8">
                    <div
                        className={`mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ring-1 ${visual.iconWrap}`}
                    >
                        {status === 'connected' ? (
                            <CheckCircle2 className="h-8 w-8" />
                        ) : status === 'error' ? (
                            <AlertCircle className="h-8 w-8" />
                        ) : (
                            <Loader2 className="h-8 w-8 animate-spin" />
                        )}
                    </div>

                    <h1 className="text-xl font-black tracking-tight text-slate-900">
                        {visual.title}
                    </h1>

                    <p
                        aria-live="polite"
                        className="mt-2 text-sm font-medium leading-relaxed text-slate-600"
                    >
                        {message}
                    </p>

                    {connectedEmail && (
                        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2 font-mono text-xs font-bold text-emerald-800">
                            <Mail className="h-3.5 w-3.5 text-emerald-600" />
                            <span>{connectedEmail}</span>
                        </div>
                    )}

                    {status !== 'connecting' && (
                        <button
                            type="button"
                            onClick={returnToCalendar}
                            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-md transition hover:bg-blue-600"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Return to Calendar
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default GoogleCalendarCallback;