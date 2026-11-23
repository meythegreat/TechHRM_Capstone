import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
    AlertTriangle,
    Building2,
    Calendar,
    Check,
    Clock,
    FileText,
    Globe,
    GraduationCap,
    Megaphone,
    Radio,
    Search,
    Send,
    Sparkles,
    Trash2,
    UserCheck,
    Users,
    X,
} from 'lucide-react';
import Toast from './Toast';
import { formatBulletinWhen } from './Bulletins';

type Audience = 'everyone' | 'year_level' | 'office' | 'students';
type Priority = 'normal' | 'urgent' | 'special';

interface StudentOption {
    id: number;
    name: string;
    student_id_number?: string | null;
    year_level?: number | null;
    office?: string | null;
    created_at?: string | null;
}

interface SentBulletin {
    id: number;
    title: string;
    message: string;
    priority: Priority | string;
    audience: Audience | string;
    year_levels?: number[];
    offices?: string[];
    delivered_count: number;
    expires_at?: string | null;
    created_at?: string | null;
    author?: string;
    active: boolean;
}

const YEAR_OPTIONS = [
    { value: 1, label: '1st Year' },
    { value: 2, label: '2nd Year' },
    { value: 3, label: '3rd Year' },
    { value: 4, label: '4th Year' },
];

const PRIORITY_CARDS: {
    value: Priority;
    label: string;
    hint: string;
    icon: typeof Megaphone;
    activeClass: string;
    iconClass: string;
}[] = [
    {
        value: 'normal',
        label: 'Normal',
        hint: 'Dashboard & notifications',
        icon: Megaphone,
        activeClass: 'border-slate-900 bg-slate-900 text-white shadow-sm',
        iconClass: 'bg-white/15 text-white',
    },
    {
        value: 'urgent',
        label: 'Urgent Popup',
        hint: 'Pinned lower-left alert',
        icon: AlertTriangle,
        activeClass: 'border-rose-600 bg-rose-600 text-white shadow-sm shadow-rose-600/20',
        iconClass: 'bg-white/15 text-white',
    },
    {
        value: 'special',
        label: 'Special Popup',
        hint: 'Highlighted notice popup',
        icon: Sparkles,
        activeClass: 'border-violet-600 bg-violet-600 text-white shadow-sm shadow-violet-600/20',
        iconClass: 'bg-white/15 text-white',
    },
];

const AUDIENCE_CARDS: {
    value: Audience;
    label: string;
    hint: string;
    icon: typeof Globe;
}[] = [
    { value: 'everyone', label: 'Everyone', hint: 'All active accounts', icon: Globe },
    { value: 'year_level', label: 'Year Level', hint: 'By academic year', icon: GraduationCap },
    { value: 'office', label: 'Office / Dept', hint: 'By assigned office', icon: Building2 },
    { value: 'students', label: 'Specific Students', hint: 'Search & hand-pick', icon: UserCheck },
];

function localDateTimeValue(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function expiryOffsetDays(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(17, 0, 0, 0);
    return localDateTimeValue(date);
}

function defaultExpiry(): string {
    return expiryOffsetDays(7);
}

function audienceLabel(bulletin: SentBulletin): string {
    if (bulletin.audience === 'everyone') return 'Everyone';
    if (bulletin.audience === 'year_level') {
        const years = (bulletin.year_levels ?? [])
            .map((year) => YEAR_OPTIONS.find((option) => option.value === year)?.label ?? `Year ${year}`)
            .join(', ');
        return years ? `Year level · ${years}` : 'Year level';
    }
    if (bulletin.audience === 'office') {
        return `Office · ${(bulletin.offices ?? []).join(', ')}`;
    }
    return 'Specific students';
}

function priorityBadge(priority: string) {
    if (priority === 'urgent') {
        return 'border-rose-200 bg-rose-50 text-rose-700';
    }
    if (priority === 'special') {
        return 'border-violet-200 bg-violet-50 text-violet-700';
    }
    return 'border-slate-200 bg-slate-100 text-slate-600';
}

function errorText(error: unknown): string {
    const response = (
        error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
    )?.response;
    const first = response?.data?.errors ? Object.values(response.data.errors)[0]?.[0] : null;
    return first || response?.data?.message || 'The bulletin could not be sent.';
}

export default function BulletinManagement() {
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [priority, setPriority] = useState<Priority>('normal');
    const [audience, setAudience] = useState<Audience>('students');
    const [yearLevels, setYearLevels] = useState<number[]>([]);
    const [offices, setOffices] = useState<string[]>([]);
    const [officeChoices, setOfficeChoices] = useState<string[]>([]);
    const [expiresAt, setExpiresAt] = useState(defaultExpiry);
    const [selected, setSelected] = useState<StudentOption[]>([]);
    const [results, setResults] = useState<StudentOption[]>([]);
    const [search, setSearch] = useState('');
    const [filterYear, setFilterYear] = useState('');
    const [filterOffice, setFilterOffice] = useState('');
    const [createdFrom, setCreatedFrom] = useState('');
    const [createdUntil, setCreatedUntil] = useState('');
    const [searching, setSearching] = useState(false);
    const [truncated, setTruncated] = useState(false);
    const [sent, setSent] = useState<SentBulletin[]>([]);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [toastType, setToastType] = useState<'success' | 'error'>('success');

    const selectedIds = useMemo(() => new Set(selected.map((student) => student.id)), [selected]);
    const activeCount = useMemo(() => sent.filter((item) => item.active).length, [sent]);

    const audienceSummary = useMemo(() => {
        if (audience === 'everyone') return 'Everyone';
        if (audience === 'year_level') {
            return yearLevels.length > 0
                ? `${yearLevels.length} year level${yearLevels.length === 1 ? '' : 's'}`
                : 'No year level selected';
        }
        if (audience === 'office') {
            return offices.length > 0
                ? `${offices.length} office${offices.length === 1 ? '' : 's'}`
                : 'No office selected';
        }
        return selected.length > 0
            ? `${selected.length} student${selected.length === 1 ? '' : 's'}`
            : 'No students selected';
    }, [audience, yearLevels.length, offices.length, selected.length]);

    const loadSent = async () => {
        const response = await axios.get('/api/admin/bulletins');
        setSent(Array.isArray(response.data?.bulletins) ? response.data.bulletins : []);
    };

    useEffect(() => {
        axios
            .get('/api/admin/bulletins/offices')
            .then((response) =>
                setOfficeChoices(Array.isArray(response.data?.offices) ? response.data.offices : [])
            )
            .catch(() => setOfficeChoices([]));
        loadSent().catch(() => setSent([]));
    }, []);

    useEffect(() => {
        if (audience !== 'students') return;
        const handle = window.setTimeout(async () => {
            setSearching(true);
            try {
                const response = await axios.get('/api/admin/bulletins/students', {
                    params: {
                        q: search || undefined,
                        year_level: filterYear || undefined,
                        office: filterOffice || undefined,
                        created_from: createdFrom || undefined,
                        created_until: createdUntil || undefined,
                    },
                });
                setResults(Array.isArray(response.data?.students) ? response.data.students : []);
                setTruncated(Boolean(response.data?.truncated));
            } catch (error) {
                console.error('Failed to search students', error);
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 250);
        return () => window.clearTimeout(handle);
    }, [audience, search, filterYear, filterOffice, createdFrom, createdUntil]);

    const toggleYear = (year: number) => {
        setYearLevels((current) =>
            current.includes(year) ? current.filter((item) => item !== year) : [...current, year]
        );
    };

    const toggleOffice = (office: string) => {
        setOffices((current) =>
            current.includes(office)
                ? current.filter((item) => item !== office)
                : [...current, office]
        );
    };

    const toggleStudent = (student: StudentOption) => {
        setSelected((current) =>
            current.some((item) => item.id === student.id)
                ? current.filter((item) => item.id !== student.id)
                : [...current, student]
        );
    };

    const selectMatching = async () => {
        const unfiltered =
            !search && !filterYear && !filterOffice && !createdFrom && !createdUntil;
        if (unfiltered && !window.confirm('Select every student account, up to 500?')) return;
        try {
            const response = await axios.get('/api/admin/bulletins/students', {
                params: {
                    q: search || undefined,
                    year_level: filterYear || undefined,
                    office: filterOffice || undefined,
                    created_from: createdFrom || undefined,
                    created_until: createdUntil || undefined,
                    ids_only: 1,
                },
            });
            const matches: StudentOption[] = Array.isArray(response.data?.students)
                ? response.data.students
                : [];
            setSelected((current) => {
                const merged = new Map(current.map((student) => [student.id, student]));
                matches.forEach((student) => merged.set(student.id, student));
                return Array.from(merged.values());
            });
            if (response.data?.truncated) {
                setToastType('error');
                setToast(
                    'Only the first 500 matches were selected. Narrow the office or the account dates.'
                );
            }
        } catch (error) {
            setToastType('error');
            setToast(errorText(error));
        }
    };

    const publish = async () => {
        setSaving(true);
        try {
            await axios.post('/api/admin/bulletins', {
                title,
                message,
                priority,
                audience,
                year_levels: audience === 'year_level' ? yearLevels : undefined,
                offices: audience === 'office' ? offices : undefined,
                user_ids: audience === 'students' ? selected.map((student) => student.id) : undefined,
                expires_at: expiresAt,
            });
            setTitle('');
            setMessage('');
            setPriority('normal');
            setYearLevels([]);
            setOffices([]);
            setSelected([]);
            setExpiresAt(defaultExpiry());
            setToastType('success');
            setToast(
                'Bulletin sent. Recipients will see it on the dashboard, in notifications, and as a lower-left popup when it is urgent or special.'
            );
            await loadSent();
        } catch (error) {
            setToastType('error');
            setToast(errorText(error));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (bulletin: SentBulletin) => {
        if (
            !window.confirm(
                `Remove “${bulletin.title}”? Recipients will stop seeing it immediately.`
            )
        ) {
            return;
        }
        setSent((current) => current.filter((item) => item.id !== bulletin.id));
        try {
            await axios.delete(`/api/admin/bulletins/${bulletin.id}`);
        } catch (error) {
            setToastType('error');
            setToast(errorText(error));
            loadSent().catch(() => undefined);
        }
    };

    const previewAccent =
        priority === 'urgent'
            ? {
                  strip: 'bg-rose-500',
                  badge: 'border-rose-400/35 bg-rose-500/20 text-rose-200',
                  label: 'Urgent',
              }
            : priority === 'special'
              ? {
                    strip: 'bg-violet-500',
                    badge: 'border-violet-400/35 bg-violet-500/20 text-violet-200',
                    label: 'Special',
                }
              : {
                    strip: 'bg-blue-600',
                    badge: 'border-blue-400/30 bg-blue-500/15 text-blue-200',
                    label: 'Announcement',
                };

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-4 font-sans sm:p-8">
            <Toast message={toast} type={toastType} onClose={() => setToast(null)} />

            {/* OBSIDIAN BROADCAST HERO */}
            <motion.header
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
            >
                <div
                    className="pointer-events-none absolute inset-0 opacity-20"
                    style={{
                        backgroundImage:
                            'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
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
                                <Megaphone className="h-3.5 w-3.5 text-blue-400" />
                                Super Admin
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300">
                                <Sparkles className="h-3 w-3 text-indigo-300" />
                                Campus Broadcasts
                            </span>
                        </div>

                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Bulletins
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            Send an announcement to everyone, a year level, an office, or specific students. It stays on their dashboard and in notifications until expiry. Urgent and special bulletins also appear at the lower left until dismissed.
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
                            <Radio className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Active Bulletins
                            </p>
                            <p className="mt-0.5 font-mono text-2xl font-black tabular-nums text-white">
                                {activeCount}
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            {/* BEAUTIFIED COMPOSE BULLETIN STUDIO */}
            <motion.form
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm"
                onSubmit={(event) => {
                    event.preventDefault();
                    publish();
                }}
            >
                {/* Studio Top Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                            <Send className="h-4 w-4" />
                        </span>
                        <div>
                            <h2 className="text-base font-black tracking-tight text-slate-900">
                                Compose Bulletin
                            </h2>
                            <p className="text-xs font-medium text-slate-500">
                                Draft your announcement, choose delivery priority, and target recipients.
                            </p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                        <FileText className="h-3 w-3 text-blue-600" />
                        Live Draft
                    </span>
                </div>

                <div className="divide-y divide-slate-100">
                    {/* STEP 1: CONTENT + LIVE PREVIEW */}
                    <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 font-mono text-[11px] font-black text-white">
                                    1
                                </span>
                                <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-700">
                                    Announcement Content
                                </h3>
                            </div>

                            <label className="block">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Title
                                    </span>
                                    <span className="font-mono text-[10px] font-bold text-slate-400">
                                        {title.length}/120
                                    </span>
                                </div>
                                <input
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    maxLength={120}
                                    required
                                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                                    placeholder="Title here..."
                                />
                            </label>

                            <label className="block">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Message
                                    </span>
                                    <span className="font-mono text-[10px] font-bold text-slate-400">
                                        {message.length}/2000
                                    </span>
                                </div>
                                <textarea
                                    value={message}
                                    onChange={(event) => setMessage(event.target.value)}
                                    maxLength={2000}
                                    required
                                    rows={5}
                                    className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-medium leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                                    placeholder="Enter your message here..."
                                />
                            </label>
                        </div>

                        {/* LIVE RECIPIENT PREVIEW */}
                        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                            <div>
                                <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Recipient Preview
                                </p>
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    <div className="flex items-center justify-between bg-slate-950 px-3.5 py-2.5 text-white">
                                        <span
                                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest ${previewAccent.badge}`}
                                        >
                                            {previewAccent.label}
                                        </span>
                                        <span className="font-mono text-[10px] text-slate-400">
                                            {expiresAt ? formatBulletinWhen(expiresAt) : '—'}
                                        </span>
                                    </div>
                                    <div className="relative px-4 py-3.5">
                                        <span
                                            aria-hidden="true"
                                            className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${previewAccent.strip}`}
                                        />
                                        <div className="pl-1.5">
                                            <p className="truncate text-sm font-black text-slate-900">
                                                {title.trim() || 'Bulletin title preview'}
                                            </p>
                                            <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-xs font-medium leading-relaxed text-slate-500">
                                                {message.trim() ||
                                                    'Your announcement message will appear here exactly as recipients see it.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <p className="mt-3 text-[11px] font-medium text-slate-400">
                                {priority === 'normal'
                                    ? 'Appears on the dashboard and notification bell.'
                                    : 'Also pinned at the lower-left corner until dismissed.'}
                            </p>
                        </div>
                    </div>

                    {/* STEP 2: DISPLAY PRIORITY & EXPIRY */}
                    <div className="space-y-4 p-6">
                        <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 font-mono text-[11px] font-black text-white">
                                2
                            </span>
                            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-700">
                                Display &amp; Schedule
                            </h3>
                        </div>

                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                            <fieldset>
                                <legend className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Display Priority
                                </legend>
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                                    {PRIORITY_CARDS.map((card) => {
                                        const Icon = card.icon;
                                        const active = priority === card.value;
                                        return (
                                            <button
                                                key={card.value}
                                                type="button"
                                                onClick={() => setPriority(card.value)}
                                                className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
                                                    active
                                                        ? card.activeClass
                                                        : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:border-slate-300 hover:bg-white'
                                                }`}
                                            >
                                                <span
                                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                                                        active
                                                            ? card.iconClass
                                                            : 'bg-white text-slate-500 ring-1 ring-slate-200'
                                                    }`}
                                                >
                                                    <Icon className="h-4 w-4" />
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block text-xs font-extrabold">
                                                        {card.label}
                                                    </span>
                                                    <span
                                                        className={`mt-0.5 block text-[11px] font-medium ${
                                                            active ? 'text-white/80' : 'text-slate-400'
                                                        }`}
                                                    >
                                                        {card.hint}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            <div className="space-y-2">
                                <label className="block">
                                    <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                        Expires At
                                    </span>
                                    <input
                                        type="datetime-local"
                                        value={expiresAt}
                                        min={localDateTimeValue(new Date())}
                                        onChange={(event) => setExpiresAt(event.target.value)}
                                        required
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                                    />
                                </label>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Quick set:
                                    </span>
                                    {[
                                        [1, '+24h'],
                                        [3, '+3d'],
                                        [7, '+7d'],
                                        [14, '+14d'],
                                    ].map(([days, label]) => (
                                        <button
                                            key={days}
                                            type="button"
                                            onClick={() => setExpiresAt(expiryOffsetDays(days as number))}
                                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* STEP 3: TARGET AUDIENCE */}
                    <div className="space-y-4 p-6">
                        <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 font-mono text-[11px] font-black text-white">
                                3
                            </span>
                            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-700">
                                Target Audience
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                            {AUDIENCE_CARDS.map((card) => {
                                const Icon = card.icon;
                                const active = audience === card.value;
                                return (
                                    <button
                                        key={card.value}
                                        type="button"
                                        onClick={() => setAudience(card.value)}
                                        className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                                            active
                                                ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                                                : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:border-slate-300 hover:bg-white'
                                        }`}
                                    >
                                        <span
                                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                                active
                                                    ? 'bg-white/15 text-white'
                                                    : 'bg-white text-slate-500 ring-1 ring-slate-200'
                                            }`}
                                        >
                                            <Icon className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-xs font-extrabold">
                                                {card.label}
                                            </span>
                                            <span
                                                className={`block truncate text-[11px] font-medium ${
                                                    active ? 'text-blue-100' : 'text-slate-400'
                                                }`}
                                            >
                                                {card.hint}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {audience === 'year_level' && (
                            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                                {YEAR_OPTIONS.map((option) => {
                                    const active = yearLevels.includes(option.value);
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => toggleYear(option.value)}
                                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                                                active
                                                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {active && <Check className="h-3.5 w-3.5" />}
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {audience === 'office' && (
                            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                                {officeChoices.length === 0 && (
                                    <p className="text-xs font-semibold text-slate-500">
                                        No offices are on file yet.
                                    </p>
                                )}
                                {officeChoices.map((office) => {
                                    const active = offices.includes(office);
                                    return (
                                        <button
                                            key={office}
                                            type="button"
                                            onClick={() => toggleOffice(office)}
                                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                                                active
                                                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {active && <Check className="h-3.5 w-3.5" />}
                                            {office}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {audience === 'students' && (
                            <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 sm:p-5">
                                <p className="text-xs font-medium leading-relaxed text-slate-500">
                                    Search by name or student number, or filter by year level, office, and account creation dates.
                                </p>

                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <label className="relative block sm:col-span-2">
                                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <input
                                            value={search}
                                            onChange={(event) => setSearch(event.target.value)}
                                            placeholder="Name or student number…"
                                            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                                        />
                                    </label>
                                    <select
                                        value={filterYear}
                                        onChange={(event) => setFilterYear(event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-600"
                                    >
                                        <option value="">All year levels</option>
                                        {YEAR_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={filterOffice}
                                        onChange={(event) => setFilterOffice(event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-600"
                                    >
                                        <option value="">All offices</option>
                                        {officeChoices.map((office) => (
                                            <option key={office} value={office}>
                                                {office}
                                            </option>
                                        ))}
                                    </select>
                                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Created From
                                        <input
                                            type="date"
                                            value={createdFrom}
                                            onChange={(event) => setCreatedFrom(event.target.value)}
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none focus:border-blue-600"
                                        />
                                    </label>
                                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Created Until
                                        <input
                                            type="date"
                                            value={createdUntil}
                                            onChange={(event) => setCreatedUntil(event.target.value)}
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none focus:border-blue-600"
                                        />
                                    </label>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-3">
                                    <p className="text-xs font-bold text-slate-600">
                                        {selected.length} selected
                                        {searching ? ' · searching…' : ''}
                                        {truncated ? ' · showing first 30 matches' : ''}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        {selected.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setSelected([])}
                                                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                                            >
                                                Clear selected
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={selectMatching}
                                            className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-600"
                                        >
                                            Select all matches
                                        </button>
                                    </div>
                                </div>

                                {selected.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 rounded-xl border border-blue-100 bg-white p-2.5">
                                        {selected.map((student) => (
                                            <button
                                                key={student.id}
                                                type="button"
                                                onClick={() => toggleStudent(student)}
                                                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800 transition hover:bg-blue-100"
                                            >
                                                {student.name}
                                                <X className="h-3 w-3" />
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <ul className="custom-scrollbar max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                                    {results.map((student) => {
                                        const checked = selectedIds.has(student.id);
                                        return (
                                            <li key={student.id}>
                                                <label
                                                    className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition ${
                                                        checked ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleStudent(student)}
                                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                                                    />
                                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">
                                                        {student.name.charAt(0).toUpperCase()}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-bold text-slate-900">
                                                            {student.name}
                                                        </span>
                                                        <span className="block truncate text-[11px] font-medium text-slate-500">
                                                            {[
                                                                student.student_id_number,
                                                                student.year_level
                                                                    ? `Year ${student.year_level}`
                                                                    : null,
                                                                student.office,
                                                                student.created_at
                                                                    ? `Created ${formatBulletinWhen(student.created_at)}`
                                                                    : null,
                                                            ]
                                                                .filter(Boolean)
                                                                .join(' · ')}
                                                        </span>
                                                    </span>
                                                </label>
                                            </li>
                                        );
                                    })}
                                    {!searching && results.length === 0 && (
                                        <li className="px-4 py-8 text-center text-xs font-semibold text-slate-400">
                                            No students match.
                                        </li>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* FOOTER ACTION BAR */}
                    <div className="flex flex-col justify-between gap-4 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-700">
                                <Users className="h-3.5 w-3.5 text-blue-600" />
                                {audienceSummary}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold capitalize text-slate-700">
                                {priority}
                            </span>
                        </div>

                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-slate-950/15 transition hover:bg-blue-600 disabled:opacity-50"
                        >
                            <Send className="h-3.5 w-3.5" />
                            {saving ? 'Sending…' : 'Send Bulletin'}
                        </button>
                    </div>
                </div>
            </motion.form>

            {/* SENT BULLETINS FEED */}
            <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                    <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                        Sent Bulletins ({sent.length})
                    </h2>
                </div>

                {sent.length === 0 && (
                    <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
                        <Megaphone className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
                        <p className="text-sm font-extrabold text-slate-700">No bulletins yet</p>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            Announcements you send will appear here with recipient counts and expiry dates.
                        </p>
                    </div>
                )}

                {sent.map((bulletin) => (
                    <article
                        key={bulletin.id}
                        className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:border-slate-300"
                    >
                        <span
                            aria-hidden="true"
                            className={`absolute inset-y-3 left-0 w-1.5 rounded-r-full ${
                                bulletin.active ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                        />

                        <div className="flex items-start justify-between gap-4 pl-2">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-black text-slate-950">
                                        {bulletin.title}
                                    </h3>
                                    <span
                                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                            bulletin.active
                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                : 'border-slate-200 bg-slate-100 text-slate-500'
                                        }`}
                                    >
                                        {bulletin.active ? 'Active' : 'Expired'}
                                    </span>
                                    {bulletin.priority && bulletin.priority !== 'normal' && (
                                        <span
                                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${priorityBadge(
                                                bulletin.priority
                                            )}`}
                                        >
                                            {bulletin.priority === 'urgent' && (
                                                <AlertTriangle className="h-3 w-3" />
                                            )}
                                            {bulletin.priority}
                                        </span>
                                    )}
                                </div>

                                <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-relaxed text-slate-600 sm:text-sm">
                                    {bulletin.message}
                                </p>

                                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-400">
                                    <span className="inline-flex items-center gap-1">
                                        <Users className="h-3.5 w-3.5" />
                                        {audienceLabel(bulletin)} · {bulletin.delivered_count}{' '}
                                        recipients
                                    </span>
                                    <span className="inline-flex items-center gap-1 font-mono">
                                        <Clock className="h-3.5 w-3.5" />
                                        until {formatBulletinWhen(bulletin.expires_at)}
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => remove(bulletin)}
                                className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                aria-label={`Remove ${bulletin.title}`}
                                title="Remove bulletin"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </article>
                ))}
            </section>
        </div>
    );
}