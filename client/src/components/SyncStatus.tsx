import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
    AlertTriangle,
    Clock,
    CloudUpload,
    RefreshCw,
    Wifi,
    WifiOff,
    X,
} from 'lucide-react';
import {
    formatLastSynced,
    syncNow,
    useSyncStatus,
    type SyncSnapshot,
    type SyncState,
} from '../utils/syncStatus';

interface StatusVisual {
    label: string;
    badge: string;
    dotClass: string;
    pingClass?: string;
    buttonClass: string;
    headerIconClass: string;
    headerBadgeClass: string;
    headerGlowClass: string;
    summaryBannerClass: string;
    legendDotClass: string;
    legendLabel: string;
    legendHint: string;
}

const STATUS_VISUALS: Record<SyncState, StatusVisual> = {
    connected: {
        label: 'Connected',
        badge: 'Connected',
        dotClass: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]',
        buttonClass:
            'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/45 hover:bg-emerald-500/15',
        headerIconClass: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30',
        headerBadgeClass: 'border-emerald-400/35 bg-emerald-500/20 text-emerald-200',
        headerGlowClass: 'bg-emerald-500/25',
        summaryBannerClass: 'border-emerald-200/80 bg-emerald-50/70 text-emerald-900',
        legendDotClass: 'bg-emerald-500',
        legendLabel: 'Connected',
        legendHint: 'Online & synced',
    },
    syncing: {
        label: 'Syncing',
        badge: 'Syncing',
        dotClass: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.65)]',
        pingClass: 'bg-amber-400',
        buttonClass:
            'border-amber-500/35 bg-amber-500/10 text-amber-700 hover:border-amber-500/55 hover:bg-amber-500/15',
        headerIconClass: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30',
        headerBadgeClass: 'border-amber-400/35 bg-amber-500/20 text-amber-200',
        headerGlowClass: 'bg-amber-500/25',
        summaryBannerClass: 'border-amber-200/80 bg-amber-50/70 text-amber-900',
        legendDotClass: 'bg-amber-400',
        legendLabel: 'Syncing',
        legendHint: 'Updating server',
    },
    error: {
        label: 'Not connected',
        badge: 'Not synced',
        dotClass: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
        pingClass: 'bg-red-400',
        buttonClass:
            'border-red-500/35 bg-red-500/10 text-red-700 hover:border-red-500/55 hover:bg-red-500/15',
        headerIconClass: 'bg-red-500/20 text-red-300 ring-1 ring-red-400/30',
        headerBadgeClass: 'border-red-400/35 bg-red-500/20 text-red-200',
        headerGlowClass: 'bg-red-500/25',
        summaryBannerClass: 'border-red-200/80 bg-red-50/70 text-red-900',
        legendDotClass: 'bg-red-500',
        legendLabel: 'Not connected',
        legendHint: 'Connection / sync issue',
    },
    offline: {
        label: 'Offline',
        badge: 'Offline',
        dotClass: 'bg-slate-400',
        buttonClass:
            'border-slate-400/35 bg-slate-500/10 text-slate-600 hover:border-slate-400/55 hover:bg-slate-500/15',
        headerIconClass: 'bg-slate-500/25 text-slate-300 ring-1 ring-slate-400/30',
        headerBadgeClass: 'border-slate-400/35 bg-slate-500/20 text-slate-200',
        headerGlowClass: 'bg-slate-500/20',
        summaryBannerClass: 'border-slate-200/90 bg-slate-100/80 text-slate-700',
        legendDotClass: 'bg-slate-400',
        legendLabel: 'Offline',
        legendHint: 'No network on device',
    },
};

const LEGEND_ORDER: SyncState[] = ['connected', 'syncing', 'error', 'offline'];

function renderStatusIcon(state: SyncState, className: string) {
    if (state === 'connected') return <Wifi className={className} />;
    if (state === 'syncing') return <RefreshCw className={`${className} animate-spin`} />;
    if (state === 'error') return <AlertTriangle className={className} />;
    return <WifiOff className={className} />;
}

function statusSummary(snapshot: SyncSnapshot): string {
    if (snapshot.state === 'offline') {
        if (snapshot.pendingCount > 0) {
            const noun = snapshot.pendingCount === 1 ? 'request' : 'requests';
            return `This device is offline. ${snapshot.pendingCount} saved ${noun} will upload automatically once you reconnect.`;
        }
        return 'This device is currently offline. Reconnect to the internet to sync updates.';
    }

    if (snapshot.state === 'syncing') {
        if (snapshot.outboxSyncing && snapshot.pendingCount > 0) {
            const noun = snapshot.pendingCount === 1 ? 'request' : 'requests';
            return `Uploading ${snapshot.pendingCount} saved offline ${noun} to the server…`;
        }
        return 'Syncing device status and updates with the server…';
    }

    if (snapshot.state === 'error') {
        if (snapshot.outboxErrorMessage) {
            return snapshot.outboxErrorMessage;
        }
        if (snapshot.lastError) {
            return snapshot.lastError;
        }
        if (snapshot.pendingCount > 0) {
            const noun = snapshot.pendingCount === 1 ? 'request' : 'requests';
            return `${snapshot.pendingCount} saved offline ${noun} could not be synced yet.`;
        }
        return 'Device is not connected to the server. Check your internet connection.';
    }

    return 'Device is connected to the internet and synced with the server.';
}

function shortLabelFor(snapshot: SyncSnapshot): string {
    if (snapshot.state === 'error' && snapshot.serverReachable && snapshot.pendingCount > 0) {
        return 'Not synced';
    }
    return STATUS_VISUALS[snapshot.state].label;
}

export default function SyncStatus() {
    const snapshot = useSyncStatus();
    const [isOpen, setIsOpen] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const containerRef = useRef<HTMLDivElement>(null);
    const reduceMotion = useReducedMotion();

    const visual = STATUS_VISUALS[snapshot.state];
    const shortLabel = shortLabelFor(snapshot);

    useEffect(() => {
        if (!isOpen) return;
        const tick = window.setInterval(() => setNow(Date.now()), 15000);
        return () => window.clearInterval(tick);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onClickOutside);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen]);

    const handleSyncClick = () => {
        if (snapshot.state === 'offline' || snapshot.state === 'syncing') return;
        void syncNow();
    };

    const serverLabel =
        snapshot.state === 'offline'
            ? 'Offline'
            : snapshot.state === 'syncing'
              ? 'Syncing…'
              : snapshot.serverReachable
                ? 'Reachable'
                : 'Unreachable';

    const serverValueClass =
        snapshot.state === 'offline'
            ? 'text-slate-500'
            : snapshot.state === 'syncing'
              ? 'text-amber-700'
              : snapshot.serverReachable
                ? 'text-emerald-700'
                : 'text-red-600';

    return (
        <div className="relative" ref={containerRef}>
            {/* SYNC STATUS TRIGGER BUTTON */}
            <button
                type="button"
                onClick={() => {
                    setNow(Date.now());
                    setIsOpen((prev) => !prev);
                }}
                aria-label={`Sync status: ${shortLabel}`}
                aria-expanded={isOpen}
                title={`Sync status: ${shortLabel}`}
                data-sync-state={snapshot.state}
                className={`relative inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-2.5 text-xs font-extrabold tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-slate-900/15 sm:px-3 ${visual.buttonClass}`}
            >
                <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                    {visual.pingClass && (
                        <span
                            aria-hidden="true"
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${visual.pingClass}`}
                        />
                    )}
                    <span
                        aria-hidden="true"
                        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${visual.dotClass}`}
                    />
                </span>

                {renderStatusIcon(snapshot.state, 'h-4 w-4 shrink-0')}

                <span className="hidden whitespace-nowrap sm:inline">{shortLabel}</span>

                {snapshot.pendingCount > 0 && (
                    <span
                        aria-label={`${snapshot.pendingCount} pending offline`}
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[10px] font-black tabular-nums text-white"
                    >
                        {snapshot.pendingCount > 9 ? '9+' : snapshot.pendingCount}
                    </span>
                )}
            </button>

            {/* MOBILE BACKDROP */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] sm:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* DROPDOWN PANEL */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="sync-status-menu"
                        role="dialog"
                        aria-label="Sync status details"
                        initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
                        transition={{
                            duration: reduceMotion ? 0 : 0.18,
                            ease: [0.22, 1, 0.36, 1],
                        }}
                        className="fixed left-4 right-4 top-20 z-50 origin-top-right overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/15 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2.5 sm:w-[21rem]"
                    >
                        {/* OBSIDIAN HEADER */}
                        <div className="relative overflow-hidden bg-slate-950 px-5 py-4 text-white">
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
                                className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl ${visual.headerGlowClass}`}
                                aria-hidden="true"
                            />

                            <div className="relative z-10 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <span
                                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${visual.headerIconClass}`}
                                    >
                                        {renderStatusIcon(snapshot.state, 'h-4 w-4')}
                                    </span>
                                    <div>
                                        <h3 className="text-sm font-black tracking-tight text-white">
                                            Sync Status
                                        </h3>
                                        <p className="text-[10px] font-semibold text-slate-400">
                                            Device connectivity monitor
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${visual.headerBadgeClass}`}
                                    >
                                        <span
                                            className={`h-1.5 w-1.5 rounded-full ${visual.legendDotClass}`}
                                        />
                                        {shortLabel}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label="Close sync status"
                                        onClick={() => setIsOpen(false)}
                                        className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* BODY */}
                        <div className="space-y-4 p-5">
                            {/* SEMANTIC STATUS CALLOUT */}
                            <div
                                aria-live="polite"
                                className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold leading-relaxed ${visual.summaryBannerClass}`}
                            >
                                {statusSummary(snapshot)}
                            </div>

                            {/* LIVE METRICS */}
                            <div className="grid grid-cols-2 gap-2.5">
                                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5">
                                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                        Device Network
                                    </p>
                                    <p
                                        className={`mt-0.5 text-xs font-extrabold ${
                                            snapshot.browserOnline
                                                ? 'text-emerald-700'
                                                : 'text-slate-500'
                                        }`}
                                    >
                                        {snapshot.browserOnline ? 'Online' : 'Offline'}
                                    </p>
                                </div>

                                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5">
                                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                        Server
                                    </p>
                                    <p className={`mt-0.5 text-xs font-extrabold ${serverValueClass}`}>
                                        {serverLabel}
                                    </p>
                                </div>

                                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5">
                                    <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                        <CloudUpload className="h-3 w-3" />
                                        Offline Queue
                                    </p>
                                    <p
                                        className={`mt-0.5 text-xs font-extrabold tabular-nums ${
                                            snapshot.pendingCount === 0
                                                ? 'text-emerald-700'
                                                : 'text-amber-700'
                                        }`}
                                    >
                                        {snapshot.pendingCount === 0
                                            ? 'All synced'
                                            : `${snapshot.pendingCount} pending`}
                                    </p>
                                </div>

                                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5">
                                    <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                        <Clock className="h-3 w-3" />
                                        Last Synced
                                    </p>
                                    <p className="mt-0.5 text-xs font-extrabold tabular-nums text-slate-800">
                                        {formatLastSynced(snapshot.lastSyncedAt, now)}
                                    </p>
                                </div>
                            </div>

                            {/* STATUS COLOR KEY */}
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                    Status Guide
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {LEGEND_ORDER.map((key) => {
                                        const item = STATUS_VISUALS[key];
                                        const isCurrent = snapshot.state === key;
                                        return (
                                            <div
                                                key={key}
                                                className={`flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                                                    isCurrent
                                                        ? 'bg-white shadow-2xs ring-1 ring-slate-200'
                                                        : 'opacity-80'
                                                }`}
                                            >
                                                <span
                                                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.legendDotClass}`}
                                                />
                                                <div className="min-w-0">
                                                    <p
                                                        className={`truncate text-[11px] leading-tight ${
                                                            isCurrent
                                                                ? 'font-extrabold text-slate-900'
                                                                : 'font-bold text-slate-600'
                                                        }`}
                                                    >
                                                        {item.legendLabel}
                                                    </p>
                                                    <p className="truncate text-[10px] font-medium text-slate-400">
                                                        {item.legendHint}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ACTION BUTTON */}
                            <button
                                type="button"
                                onClick={handleSyncClick}
                                disabled={
                                    snapshot.state === 'offline' || snapshot.state === 'syncing'
                                }
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                <RefreshCw
                                    className={`h-3.5 w-3.5 ${
                                        snapshot.state === 'syncing' ? 'animate-spin' : ''
                                    }`}
                                />
                                {snapshot.state === 'syncing'
                                    ? 'Syncing…'
                                    : snapshot.state === 'error'
                                      ? 'Retry Sync'
                                      : snapshot.state === 'offline'
                                        ? 'Waiting for Network'
                                        : 'Sync Now'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}