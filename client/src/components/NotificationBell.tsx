import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import axios from 'axios';
import {
    Bell,
    CheckCheck,
    Clock,
    Sparkles,
    Trash2,
    X,
    CheckCircle2,
} from 'lucide-react';
import { emitRealtimeRefresh } from '../utils/realtime';
import { playNotificationSound } from '../sounds';

interface Notification {
    id: number;
    title: string;
    message: string;
    is_read: number;
    created_at: string;
}

interface NotificationBellProps {
    onNavigate: (tabId: string) => void;
}

export default function NotificationBell({ onNavigate }: NotificationBellProps) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [liveNotice, setLiveNotice] = useState<Notification | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const seenIds = useRef<Set<number> | null>(null);
    const signatureRef = useRef('');

    const userRole = localStorage.getItem('user_role') || 'User';

    const fetchNotifications = async () => {
        try {
            const res = await axios.get('/api/notifications');
            const rows: Notification[] = Array.isArray(res.data) ? res.data : [];
            const signature = rows.map((row) => `${row.id}:${row.is_read}`).join(',');
            const fresh = seenIds.current
                ? rows.filter((row) => !seenIds.current?.has(row.id) && !row.is_read)
                : [];

            if (fresh.length > 0) {
                setLiveNotice(fresh[0]);
                playNotificationSound();
            }
            if (signatureRef.current && signatureRef.current !== signature) {
                emitRealtimeRefresh();
            }

            seenIds.current = new Set(rows.map((row) => row.id));
            signatureRef.current = signature;
            setNotifications(rows);
        } catch (error) {
            console.error('Failed to fetch notifications', error);
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 5000);
        const onVisible = () => {
            if (document.visibilityState === 'visible') fetchNotifications();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    useEffect(() => {
        if (!liveNotice) return;
        const timeout = setTimeout(() => setLiveNotice(null), 8000);
        return () => clearTimeout(timeout);
    }, [liveNotice]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markAsRead = async (notif: Notification) => {
        if (notif.is_read) return;
        setNotifications((current) =>
            current.map((item) => (item.id === notif.id ? { ...item, is_read: 1 } : item))
        );
        setLiveNotice((current) => (current?.id === notif.id ? null : current));
        try {
            await axios.patch(`/api/notifications/${notif.id}/read`);
        } catch (error) {
            console.error('Failed to mark as read', error);
            fetchNotifications();
        }
    };

    const markAllRead = async () => {
        setNotifications((current) => current.map((item) => ({ ...item, is_read: 1 })));
        setLiveNotice(null);
        try {
            await axios.patch('/api/notifications/read-all');
        } catch (error) {
            console.error('Failed to mark all as read', error);
            fetchNotifications();
        }
    };

    const clearAll = async () => {
        if (notifications.length === 0) return;
        if (!window.confirm('Clear all notifications? This deletes every notification.')) return;
        setNotifications([]);
        setLiveNotice(null);
        try {
            await axios.delete('/api/notifications');
        } catch (error) {
            console.error('Failed to clear notifications', error);
            fetchNotifications();
        }
    };

    const handleNotificationClick = async (notif: Notification) => {
        await markAsRead(notif);

        const title = notif.title.toLowerCase();
        if (title.includes('announcement:')) {
            onNavigate('dashboard');
        } else if (
            title.includes('clock in') ||
            title.includes('clock out') ||
            title.includes('overtime') ||
            title.includes('happening now')
        ) {
            onNavigate('attendance');
        } else if (
            userRole === 'Student' &&
            (title.includes('assembly') || title.includes('devotional') || title.includes('cleaning'))
        ) {
            onNavigate('dashboard');
        } else if (userRole === 'Supervisor' && notif.title.includes('Working Student Assigned')) {
            onNavigate('dashboard');
        } else if (notif.title.includes('Message')) {
            onNavigate('messages');
        } else if (
            notif.title.includes('Schedule') ||
            notif.title.includes('Working Student') ||
            notif.title.includes('Office Assignment')
        ) {
            onNavigate(userRole === 'Student' ? 'schedule' : 'schedules');
        } else if (
            notif.title.includes('Timesheet') ||
            notif.title.includes('Signed In') ||
            notif.title.includes('Signed Out') ||
            notif.title.includes('Offline attendance') ||
            notif.title.includes('offline attendance')
        ) {
            onNavigate('attendance');
        } else if (notif.title.includes('Requirement')) {
            onNavigate('requirements');
        } else if (notif.title.includes('Signup') || notif.title.includes('Application')) {
            onNavigate('pipeline');
        } else if (notif.title.includes('Account')) {
            onNavigate('users');
        } else if (notif.title.includes('Appeal') || notif.title.includes('Disciplinary')) {
            onNavigate(userRole === 'Student' ? 'disciplinary' : 'compliance');
        }

        setIsOpen(false);
        setLiveNotice(null);
    };

    const dismissNotification = async (id: number) => {
        setNotifications((current) => current.filter((item) => item.id !== id));
        setLiveNotice((current) => (current?.id === id ? null : current));
        try {
            await axios.delete(`/api/notifications/${id}`);
        } catch (error) {
            console.error('Failed to dismiss notification', error);
            fetchNotifications();
        }
    };

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    return (
        <div className="relative" ref={dropdownRef}>
            {/* LIVE CORNER TOAST */}
            {typeof document !== 'undefined' &&
                createPortal(
                    <AnimatePresence>
                        {liveNotice && (
                            <motion.div
                                key={liveNotice.id}
                                role="status"
                                initial={{ opacity: 0, y: -14, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                className="corner-popup fixed right-4 top-20 z-[70] w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/20"
                            >
                                <div className="flex items-center justify-between gap-3 bg-slate-950 px-4 py-2.5 text-white">
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-blue-300">
                                        <Sparkles className="h-3 w-3 text-blue-400" />
                                        New Notification
                                    </span>
                                    <button
                                        type="button"
                                        aria-label="Dismiss notification"
                                        onClick={() => setLiveNotice(null)}
                                        className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div
                                    onClick={() => void handleNotificationClick(liveNotice)}
                                    className="cursor-pointer p-4 transition-colors hover:bg-slate-50/70"
                                >
                                    <p className="text-sm font-extrabold text-slate-900">{liveNotice.title}</p>
                                    <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                                        {liveNotice.message}
                                    </p>
                                    <div className="mt-3 flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                void markAsRead(liveNotice);
                                            }}
                                            className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 hover:underline"
                                        >
                                            Mark read
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                void dismissNotification(liveNotice.id);
                                            }}
                                            className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 hover:underline"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}

            {/* BELL TRIGGER BUTTON */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Notifications"
                aria-expanded={isOpen}
                className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-all focus:outline-none ${
                    isOpen
                        ? 'border-blue-200 bg-blue-50 text-blue-600 shadow-xs'
                        : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black tabular-nums text-white ring-2 ring-white">
                        <span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-50" />
                        <span className="relative">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    </span>
                )}
            </button>

            {/* MOBILE BACKDROP */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px] sm:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* DROPDOWN PANEL */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="notification-menu"
                        initial={{ opacity: 0, y: -8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.97 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        className="fixed left-4 right-4 top-20 z-50 origin-top-right overflow-hidden rounded-[1.5rem] border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/15 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2.5 sm:w-96"
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
                            <div className="relative z-10 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-blue-300">
                                        <Bell className="h-4 w-4" />
                                    </span>
                                    <div>
                                        <h3 className="text-sm font-black tracking-tight text-white">
                                            Notifications
                                        </h3>
                                        <p className="text-[10px] font-semibold text-slate-400">
                                            {unreadCount > 0 ? `${unreadCount} unread updates` : 'All caught up'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {unreadCount > 0 && (
                                        <span className="rounded-full border border-blue-400/30 bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-200">
                                            {unreadCount} New
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        aria-label="Close notifications"
                                        onClick={() => setIsOpen(false)}
                                        className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ACTION BAR */}
                        {notifications.length > 0 && (
                            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5">
                                <button
                                    type="button"
                                    onClick={markAllRead}
                                    disabled={unreadCount === 0}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-blue-600 transition-colors hover:text-blue-800 disabled:cursor-not-allowed disabled:text-slate-300"
                                >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    Mark all read
                                </button>
                                <button
                                    type="button"
                                    onClick={clearAll}
                                    className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-rose-600 transition-colors hover:text-rose-800"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Clear all
                                </button>
                            </div>
                        )}

                        {/* NOTIFICATION LIST */}
                        <div className="custom-scrollbar max-h-[60vh] overflow-y-auto sm:max-h-96">
                            {notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
                                        <CheckCircle2 className="h-6 w-6" />
                                    </div>
                                    <p className="text-sm font-extrabold text-slate-800">
                                        You&apos;re all caught up!
                                    </p>
                                    <p className="mt-1 text-xs font-medium text-slate-400">
                                        New schedule, DTR, and message alerts will appear here.
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {notifications.map((notif) => {
                                        const isUnread = !notif.is_read;
                                        return (
                                            <div
                                                key={notif.id}
                                                onClick={() => void handleNotificationClick(notif)}
                                                className={`group relative cursor-pointer px-5 py-4 transition-colors ${
                                                    isUnread
                                                        ? 'bg-blue-50/40 hover:bg-blue-50/75'
                                                        : 'bg-white hover:bg-slate-50/80'
                                                }`}
                                            >
                                                {isUnread && (
                                                    <span
                                                        aria-hidden="true"
                                                        className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-blue-600"
                                                    />
                                                )}

                                                <div className="flex items-start justify-between gap-2">
                                                    <h4
                                                        className={`text-sm leading-snug ${
                                                            isUnread
                                                                ? 'font-extrabold text-slate-900'
                                                                : 'font-bold text-slate-600'
                                                        }`}
                                                    >
                                                        {notif.title}
                                                    </h4>
                                                    <button
                                                        type="button"
                                                        aria-label={`Dismiss ${notif.title}`}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            void dismissNotification(notif.id);
                                                        }}
                                                        className="shrink-0 rounded-lg p-1 text-slate-400 opacity-70 transition-colors hover:bg-white hover:text-slate-700 group-hover:opacity-100"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>

                                                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                                                    {notif.message}
                                                </p>

                                                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                                                    <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                        <Clock className="h-3 w-3" />
                                                        {new Date(notif.created_at).toLocaleDateString()} ·{' '}
                                                        {new Date(notif.created_at).toLocaleTimeString('en-US', {
                                                            hour: 'numeric',
                                                            minute: '2-digit',
                                                            hour12: true,
                                                        })}
                                                    </p>

                                                    <div className="flex items-center gap-3">
                                                        {isUnread && (
                                                            <button
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void markAsRead(notif);
                                                                }}
                                                                className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 hover:underline"
                                                            >
                                                                Mark read
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                void dismissNotification(notif.id);
                                                            }}
                                                            className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 hover:underline"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}