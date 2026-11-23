import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Clock, Megaphone, Sparkles, User, X } from 'lucide-react';

export interface BulletinItem {
    id: number;
    title: string;
    message: string;
    priority: 'normal' | 'urgent' | 'special' | string;
    audience: string;
    expires_at?: string | null;
    created_at?: string | null;
    author?: string;
    dismissed?: boolean;
}

export function formatBulletinWhen(iso?: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function bulletinPriorityLabel(priority: string): string {
    if (priority === 'urgent') return 'Urgent';
    if (priority === 'special') return 'Special';
    return 'Announcement';
}

function priorityStyle(priority: string) {
    if (priority === 'urgent') {
        return {
            border: 'border-rose-200/90',
            accent: 'bg-rose-500',
            glow: 'bg-rose-500/25',
            badge: 'border-rose-400/35 bg-rose-500/20 text-rose-200',
            iconWrap: 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30',
        };
    }
    if (priority === 'special') {
        return {
            border: 'border-violet-200/90',
            accent: 'bg-violet-500',
            glow: 'bg-violet-500/25',
            badge: 'border-violet-400/35 bg-violet-500/20 text-violet-200',
            iconWrap: 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30',
        };
    }
    return {
        border: 'border-slate-200/90',
        accent: 'bg-blue-600',
        glow: 'bg-blue-500/20',
        badge: 'border-blue-400/30 bg-blue-500/15 text-blue-200',
        iconWrap: 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30',
    };
}

function PriorityIcon({ priority, className }: { priority: string; className: string }) {
    if (priority === 'urgent') return <AlertTriangle className={className} />;
    if (priority === 'special') return <Sparkles className={className} />;
    return <Megaphone className={className} />;
}

export function useMyBulletins() {
    const [bulletins, setBulletins] = useState<BulletinItem[]>([]);

    const reload = useCallback(async () => {
        try {
            const response = await axios.get('/api/bulletins/mine');
            const rows = Array.isArray(response.data?.bulletins) ? response.data.bulletins : [];
            setBulletins(rows);
        } catch (error) {
            console.error('Failed to load bulletins', error);
        }
    }, []);

    useEffect(() => {
        reload();
        const interval = window.setInterval(reload, 15000);
        const onVisible = () => {
            if (document.visibilityState === 'visible') reload();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [reload]);

    const dismiss = async (id: number) => {
        setBulletins((current) =>
            current.map((item) => (item.id === id ? { ...item, dismissed: true } : item))
        );
        try {
            await axios.post(`/api/bulletins/${id}/dismiss`);
        } catch (error) {
            console.error('Failed to dismiss bulletin', error);
            reload();
        }
    };

    return { bulletins, dismiss };
}

export function BulletinBoard() {
    const { bulletins } = useMyBulletins();
    if (bulletins.length === 0) return null;

    return (
        <section className="space-y-4" aria-label="Announcements">
            {bulletins.map((bulletin) => {
                const style = priorityStyle(bulletin.priority);
                return (
                    <article
                        key={bulletin.id}
                        className={`relative overflow-hidden rounded-[1.75rem] border bg-white shadow-sm ${style.border}`}
                    >
                        {/* OBSIDIAN HEADER STRIP */}
                        <div className="relative overflow-hidden bg-slate-950 px-5 py-3.5 text-white">
                            <div
                                className="pointer-events-none absolute inset-0 opacity-20"
                                style={{
                                    backgroundImage:
                                        'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                                    backgroundSize: '16px 16px',
                                }}
                                aria-hidden="true"
                            />
                            <div
                                className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl ${style.glow}`}
                                aria-hidden="true"
                            />

                            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
                                <span
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${style.badge}`}
                                >
                                    <PriorityIcon priority={bulletin.priority} className="h-3 w-3" />
                                    {bulletinPriorityLabel(bulletin.priority)}
                                </span>
                                {bulletin.expires_at && (
                                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-slate-300">
                                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                                        Until {formatBulletinWhen(bulletin.expires_at)}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* BODY WITH SEMANTIC ACCENT */}
                        <div className="relative px-6 py-5">
                            <span
                                aria-hidden="true"
                                className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${style.accent}`}
                            />
                            <div className="pl-1">
                                <h2 className="text-base font-black tracking-tight text-slate-950">
                                    {bulletin.title}
                                </h2>
                                <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-600">
                                    {bulletin.message}
                                </p>
                                <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] font-bold text-slate-400">
                                    <User className="h-3.5 w-3.5" />
                                    <span>From {bulletin.author || 'Super Admin'}</span>
                                </div>
                            </div>
                        </div>
                    </article>
                );
            })}
        </section>
    );
}

export function BulletinPopup() {
    const { bulletins, dismiss } = useMyBulletins();
    const reduceMotion = useReducedMotion();
    const popups = bulletins.filter(
        (bulletin) =>
            (bulletin.priority === 'urgent' || bulletin.priority === 'special') &&
            !bulletin.dismissed
    );

    if (typeof document === 'undefined' || popups.length === 0) return null;

    return createPortal(
        <div className="pointer-events-none fixed bottom-4 left-4 z-[65] flex w-[min(23rem,calc(100vw-2rem))] flex-col gap-3 print:hidden sm:bottom-6 sm:left-6">
            <AnimatePresence initial={false}>
                {popups.map((bulletin) => {
                    const style = priorityStyle(bulletin.priority);
                    return (
                        <motion.aside
                            key={bulletin.id}
                            role="status"
                            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
                            transition={{
                                duration: reduceMotion ? 0 : 0.22,
                                ease: [0.22, 1, 0.36, 1],
                            }}
                            className="pointer-events-auto overflow-hidden rounded-[1.5rem] border border-slate-200/90 bg-white shadow-2xl shadow-slate-950/25"
                        >
                            {/* OBSIDIAN POPUP HEADER */}
                            <div className="relative overflow-hidden bg-slate-950 px-4 py-3 text-white">
                                <div
                                    className="pointer-events-none absolute inset-0 opacity-20"
                                    style={{
                                        backgroundImage:
                                            'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                                        backgroundSize: '14px 14px',
                                    }}
                                    aria-hidden="true"
                                />
                                <div
                                    className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${style.glow}`}
                                    aria-hidden="true"
                                />

                                <div className="relative z-10 flex items-center justify-between gap-3">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${style.badge}`}
                                    >
                                        <PriorityIcon
                                            priority={bulletin.priority}
                                            className="h-3 w-3"
                                        />
                                        {bulletinPriorityLabel(bulletin.priority)}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => dismiss(bulletin.id)}
                                        className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                        aria-label="Dismiss announcement"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* POPUP BODY */}
                            <div className="relative px-4 py-3.5">
                                <span
                                    aria-hidden="true"
                                    className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${style.accent}`}
                                />
                                <div className="pl-1.5">
                                    <h2 className="text-sm font-black tracking-tight text-slate-950">
                                        {bulletin.title}
                                    </h2>
                                    <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs font-medium leading-relaxed text-slate-600">
                                        {bulletin.message}
                                    </p>
                                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] font-bold text-slate-400">
                                        <span className="inline-flex items-center gap-1 font-mono">
                                            <Clock className="h-3 w-3" />
                                            Until {formatBulletinWhen(bulletin.expires_at)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => dismiss(bulletin.id)}
                                            className="uppercase tracking-wider text-slate-500 transition hover:text-slate-900"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.aside>
                    );
                })}
            </AnimatePresence>
        </div>,
        document.body
    );
}