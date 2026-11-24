import { useEffect, useState } from 'react';
import axios from 'axios';
import {
    AlertTriangle,
    CalendarCheck2,
    CheckCircle2,
    Clock,
    FileText,
    GraduationCap,
    X,
    XCircle,
    ZoomIn,
} from 'lucide-react';
import UserAvatar from './UserAvatar';
import { formatScheduleRange } from '../utils/scheduleTime';
import { fetchSecureFile, type SecureFilePayload } from '../utils/secureFile';
import { REALTIME_EVENT, emitRealtimeRefresh } from '../utils/realtime';

interface SubmissionEntry {
    id: number;
    day: string;
    time: string;
    duty_type?: string | null;
    subject?: string | null;
    room?: string | null;
    instructor?: string | null;
    kept?: boolean | null;
}

interface Submission {
    id: number;
    kind: 'class' | 'work' | string;
    status: string;
    proof_path: string;
    proof_name?: string | null;
    review_note?: string | null;
    reviewer_name?: string | null;
    student_name?: string;
    profile_picture?: string | null;
    office?: string;
    student_id_number?: string | null;
    current_count?: number;
    approved?: SubmissionEntry[];
    entries: SubmissionEntry[];
}

function errorMessage(error: unknown, fallback: string) {
    if (!axios.isAxiosError(error)) return fallback;
    const message = error.response?.data?.message;
    return typeof message === 'string' && message !== '' ? message : fallback;
}

function ProofPreview({
    path,
    title,
    fileName,
    onOpen,
}: {
    path: string;
    title: string;
    fileName?: string | null;
    onOpen: () => void;
}) {
    const [payload, setPayload] = useState<SecureFilePayload | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | null = null;
        setPayload(null);
        setError('');
        fetchSecureFile(path)
            .then((next) => {
                if (cancelled) {
                    URL.revokeObjectURL(next.url);
                    return;
                }
                objectUrl = next.url;
                setPayload(next);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    const message = axios.isAxiosError(err) ? err.response?.data?.message : null;
                    setError(typeof message === 'string' && message !== '' ? message : 'Could not load this document.');
                }
            });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [path]);

    return (
        <button
            type="button"
            onClick={onOpen}
            className="group flex h-full min-h-44 w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xs transition hover:border-blue-300 hover:shadow-md"
        >
            <span className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-600">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span className="truncate">{title}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                    <ZoomIn className="h-3.5 w-3.5" />
                    Open
                </span>
            </span>
            <span className="flex flex-1 items-center justify-center bg-slate-100/80 p-2">
                {!payload && !error && <span className="h-28 w-full animate-pulse rounded-lg bg-slate-200" />}
                {error && <span className="px-3 text-center text-xs font-semibold text-rose-700">{error}</span>}
                {payload?.kind === 'image' && (
                    <img src={payload.url} alt={title} className="max-h-56 w-full object-contain" />
                )}
                {payload && payload.kind !== 'image' && (
                    <span className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                        <FileText className="h-10 w-10 text-blue-600" />
                        <span className="text-sm font-black text-slate-900">{title}</span>
                        <span className="max-w-full truncate text-xs font-medium text-slate-500">
                            {fileName || 'PDF document'}
                        </span>
                    </span>
                )}
            </span>
        </button>
    );
}

interface ScheduleSubmissionReviewProps {
    onToast: (text: string, type: 'success' | 'error') => void;
    onViewProof: (path: string, title: string) => void;
}

export default function ScheduleSubmissionReview({
    onToast,
    onViewProof,
}: ScheduleSubmissionReviewProps) {
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [canReview, setCanReview] = useState(false);
    const [canDecide, setCanDecide] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [filter, setFilter] = useState<'pending' | 'all'>('pending');
    const [noteFor, setNoteFor] = useState<number | null>(null);
    const [note, setNote] = useState('');
    const [busyId, setBusyId] = useState<number | null>(null);
    const [omitted, setOmitted] = useState<Record<number, number[]>>({});

    const load = async () => {
        try {
            const response = await axios.get('/api/schedule-submissions/review');
            setCanReview(Boolean(response.data?.can_review));
            setCanDecide(Boolean(response.data?.can_decide));
            setSubmissions(Array.isArray(response.data?.submissions) ? response.data.submissions : []);
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 403) {
                setCanReview(false);
                setSubmissions([]);
            }
        } finally {
            setLoaded(true);
        }
    };

    useEffect(() => {
        load();
        const timer = window.setInterval(load, 8000);
        window.addEventListener(REALTIME_EVENT, load);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener(REALTIME_EVENT, load);
        };
    }, []);

    if (!loaded || !canReview) return null;

    const visible = submissions.filter((row) =>
        filter === 'pending' ? row.status === 'Pending' : true
    );
    const pendingCount = submissions.filter((row) => row.status === 'Pending').length;

    const omittedIds = (submissionId: number) => omitted[submissionId] ?? [];

    const toggleOmitted = (submissionId: number, entryId: number) => {
        setOmitted((current) => {
            const ids = current[submissionId] ?? [];
            const next = ids.includes(entryId) ? ids.filter((id) => id !== entryId) : [...ids, entryId];
            return { ...current, [submissionId]: next };
        });
    };

    const decide = async (submission: Submission, action: 'approve' | 'reject') => {
        const leftOut = action === 'approve' ? omittedIds(submission.id) : [];
        if (action === 'approve' && leftOut.length >= submission.entries.length) {
            onToast('Leave at least one block, or decline the whole submission.', 'error');
            return;
        }
        if (action === 'reject' && note.trim() === '') {
            onToast('Add a short note so the student knows what to fix.', 'error');
            return;
        }
        if (action === 'approve' && leftOut.length > 0 && note.trim() === '') {
            setNoteFor(submission.id);
            onToast('Add a short note explaining the blocks you are leaving out.', 'error');
            return;
        }
        setBusyId(submission.id);
        try {
            const response = await axios.patch(`/api/schedule-submissions/${submission.id}`, {
                action,
                note: note.trim(),
                omit_entry_ids: leftOut,
            });
            onToast(response.data?.message || 'Decision saved.', 'success');
            setNote('');
            setNoteFor(null);
            setOmitted((current) => ({ ...current, [submission.id]: [] }));
            emitRealtimeRefresh();
            await load();
        } catch (error) {
            onToast(errorMessage(error, 'Could not save this decision.'), 'error');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
            {/* OBSIDIAN REVIEW HEADER */}
            <div className="relative overflow-hidden bg-slate-950 px-6 py-5 text-white">
                <div
                    className="pointer-events-none absolute inset-0 opacity-20"
                    style={{
                        backgroundImage:
                            'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                        backgroundSize: '18px 18px',
                    }}
                    aria-hidden="true"
                />
                <div
                    className={`pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full blur-3xl ${
                        pendingCount > 0 ? 'bg-amber-500/25' : 'bg-emerald-500/20'
                    }`}
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-3.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                            <CalendarCheck2 className="h-5 w-5" />
                        </span>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-black tracking-tight text-white">
                                    Student Schedule Submissions
                                </h2>
                                {pendingCount > 0 ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                                        {pendingCount} Waiting
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
                                        <CheckCircle2 className="h-3 w-3" />
                                        All Caught Up
                                    </span>
                                )}
                                {!canDecide && (
                                    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-300">
                                        Read-Only
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-300">
                                Class schedules are approved by the office supervisor; duty schedules are approved by the WSPO coordinator. Open the proof, then leave out any block the student entered by mistake.
                            </p>
                        </div>
                    </div>

                    {/* FROSTED FILTER TOGGLE */}
                    <div className="inline-flex shrink-0 self-start rounded-xl border border-white/10 bg-white/[0.06] p-1 backdrop-blur-md sm:self-auto">
                        <button
                            type="button"
                            onClick={() => setFilter('pending')}
                            className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition ${
                                filter === 'pending'
                                    ? 'bg-white text-slate-950 shadow-sm'
                                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            Waiting
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilter('all')}
                            className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition ${
                                filter === 'all'
                                    ? 'bg-white text-slate-950 shadow-sm'
                                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            Recent
                        </button>
                    </div>
                </div>
            </div>

            {/* SUBMISSIONS LIST */}
            <div className="space-y-4 p-6">
                {visible.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
                        <CalendarCheck2 className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
                        <p className="text-sm font-extrabold text-slate-700">
                            {filter === 'pending'
                                ? 'No schedules are waiting for review'
                                : 'No submissions yet'}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            Submitted student class and duty schedules will appear here.
                        </p>
                    </div>
                ) : (
                    visible.map((submission) => {
                        const classKind = submission.kind === 'class';
                        const proofTitle = classKind ? 'Registration form' : 'Duty schedule';
                        const pending = submission.status === 'Pending';
                        const leftOut = omittedIds(submission.id);
                        const keptCount = submission.entries.length - leftOut.length;
                        const approved = submission.approved ?? [];
                        const approvedOn = (day: string) => approved.filter((block) => block.day === day);
                        const accent =
                            submission.status === 'Approved'
                                ? 'bg-emerald-500'
                                : submission.status === 'Rejected'
                                  ? 'bg-rose-500'
                                  : 'bg-amber-500';

                        return (
                            <article
                                key={submission.id}
                                className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs transition hover:border-slate-300"
                            >
                                <span
                                    aria-hidden="true"
                                    className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${accent}`}
                                />

                                <div className="pl-2">
                                    {/* STUDENT & PROOF HEADER */}
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <UserAvatar
                                                name={submission.student_name || 'Student'}
                                                picture={submission.profile_picture}
                                                className="h-10 w-10 shrink-0 rounded-full border border-slate-200"
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-black text-slate-900">
                                                    {submission.student_name}
                                                </p>
                                                <p className="font-mono text-xs font-medium text-slate-500">
                                                    {[submission.student_id_number, submission.office]
                                                        .filter(Boolean)
                                                        .join(' · ') || 'Working student'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                    classKind
                                                        ? 'border-violet-200 bg-violet-50 text-violet-800'
                                                        : 'border-blue-200 bg-blue-50 text-blue-800'
                                                }`}
                                            >
                                                {classKind ? (
                                                    <GraduationCap className="h-3 w-3" />
                                                ) : (
                                                    <Clock className="h-3 w-3" />
                                                )}
                                                {classKind ? 'Class' : 'Duty'}
                                            </span>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onViewProof(
                                                        submission.proof_path,
                                                        `${proofTitle} · ${submission.student_name}`
                                                    )
                                                }
                                                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-500"
                                            >
                                                <ZoomIn className="h-3.5 w-3.5" />
                                                Open {proofTitle.toLowerCase()}
                                            </button>
                                        </div>
                                    </div>

                                    <div className={`mt-3.5 grid grid-cols-1 gap-3 ${pending ? 'lg:grid-cols-2' : ''}`}>
                                        <ProofPreview
                                            path={submission.proof_path}
                                            title={proofTitle}
                                            fileName={submission.proof_name}
                                            onOpen={() =>
                                                onViewProof(
                                                    submission.proof_path,
                                                    `${proofTitle} · ${submission.student_name}`
                                                )
                                            }
                                        />
                                        {pending && (
                                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
                                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-800">
                                                Already approved
                                            </p>
                                            {approved.length === 0 ? (
                                                <p className="mt-1 text-xs font-semibold text-emerald-900">
                                                    No {classKind ? 'class' : 'duty'} times are approved yet.
                                                </p>
                                            ) : (
                                                <ul className="mt-1.5 space-y-1">
                                                    {approved.map((block, index) => (
                                                        <li key={`${block.day}-${block.time}-${index}`} className="text-xs font-semibold text-emerald-950">
                                                            <span className="font-black">{block.day.slice(0, 3)}</span>{' '}
                                                            {formatScheduleRange(block.time)}
                                                            <span className="ml-1.5 font-bold text-emerald-800">
                                                                {block.subject || block.duty_type || (classKind ? 'Class' : 'Duty')}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        )}
                                    </div>

                                    {/* SCHEDULE ENTRIES */}
                                    <ul className="mt-3.5 space-y-2">
                                        {submission.entries.map((entry) => {
                                            const mistaken = pending
                                                ? leftOut.includes(entry.id)
                                                : entry.kept === false;
                                            const already = approvedOn(entry.day);
                                            return (
                                                <li
                                                    key={entry.id}
                                                    className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                                                        mistaken
                                                            ? 'border-rose-200 bg-rose-50/70 text-rose-800'
                                                            : 'border-slate-100 bg-slate-50/70'
                                                    }`}
                                                >
                                                    {pending && canDecide && (
                                                        <label className="inline-flex cursor-pointer items-center gap-1.5 font-extrabold text-rose-700">
                                                            <input
                                                                type="checkbox"
                                                                checked={mistaken}
                                                                onChange={() => toggleOmitted(submission.id, entry.id)}
                                                                className="h-3.5 w-3.5 accent-rose-600"
                                                            />
                                                            Leave out
                                                        </label>
                                                    )}
                                                    <span
                                                        className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-black uppercase text-white ${
                                                            mistaken ? 'bg-rose-700 line-through' : 'bg-slate-900'
                                                        }`}
                                                    >
                                                        {entry.day.slice(0, 3)}
                                                    </span>
                                                    <span
                                                        className={`font-mono font-bold ${
                                                            mistaken ? 'text-rose-800 line-through' : 'text-slate-800'
                                                        }`}
                                                    >
                                                        {formatScheduleRange(entry.time)}
                                                    </span>
                                                    <span
                                                        className={`font-semibold ${
                                                            mistaken ? 'text-rose-700 line-through' : 'text-slate-500'
                                                        }`}
                                                    >
                                                        {entry.subject ||
                                                            entry.duty_type ||
                                                            (classKind ? 'Class' : 'Duty')}
                                                        {entry.room ? ` · ${entry.room}` : ''}
                                                        {entry.instructor ? ` · ${entry.instructor}` : ''}
                                                    </span>
                                                    {mistaken && (
                                                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-800">
                                                            {pending ? 'Will be left out' : 'Left out'}
                                                        </span>
                                                    )}
                                                    {pending && !mistaken && already.length > 0 && (
                                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                                                            Updates {already.map((block) => formatScheduleRange(block.time)).join(', ')}
                                                        </span>
                                                    )}
                                                    {pending && !mistaken && already.length === 0 && (
                                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                                                            New day
                                                        </span>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>

                                    {/* REPLACEMENT NOTICE */}
                                    {pending && (submission.current_count ?? 0) > 0 && (
                                        <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2 text-xs font-bold text-amber-800">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                            <span>
                                                This student already has {submission.current_count}{' '}
                                                {classKind ? 'class block' : 'duty shift'}
                                                {submission.current_count === 1 ? '' : 's'}. Approving
                                                updates only the days in this submission. The other days stay.
                                            </span>
                                        </div>
                                    )}

                                    {/* DECISION SUMMARY */}
                                    {!pending && (
                                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                    submission.status === 'Approved'
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                        : 'border-rose-200 bg-rose-50 text-rose-700'
                                                }`}
                                            >
                                                {submission.status === 'Approved' ? (
                                                    <CheckCircle2 className="h-3 w-3" />
                                                ) : (
                                                    <XCircle className="h-3 w-3" />
                                                )}
                                                {submission.status}
                                            </span>
                                            <span>
                                                {submission.reviewer_name
                                                    ? `by ${submission.reviewer_name}`
                                                    : ''}
                                                {submission.review_note
                                                    ? ` — ${submission.review_note}`
                                                    : ''}
                                            </span>
                                        </div>
                                    )}

                                    {/* REVIEWER ACTIONS */}
                                    {pending && canDecide && (
                                        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                                            {noteFor === submission.id && (
                                                <textarea
                                                    value={note}
                                                    onChange={(event) =>
                                                        setNote(event.target.value)
                                                    }
                                                    rows={2}
                                                    maxLength={500}
                                                    autoFocus
                                                    placeholder="Note for the student. Required if you decline."
                                                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20"
                                                />
                                            )}

                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    disabled={busyId === submission.id}
                                                    onClick={() => decide(submission, 'approve')}
                                                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                                                >
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    {leftOut.length > 0
                                                        ? `Approve ${keptCount} of ${submission.entries.length}`
                                                        : 'Approve'}
                                                </button>

                                                {noteFor === submission.id ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            disabled={busyId === submission.id}
                                                            onClick={() =>
                                                                decide(submission, 'reject')
                                                            }
                                                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-rose-600/20 transition hover:bg-rose-700 disabled:opacity-50"
                                                        >
                                                            <XCircle className="h-3.5 w-3.5" />
                                                            Confirm Decline
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setNoteFor(null);
                                                                setNote('');
                                                            }}
                                                            className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100"
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                            Cancel
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setNoteFor(submission.id);
                                                            setNote('');
                                                        }}
                                                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
                                                    >
                                                        <XCircle className="h-3.5 w-3.5" />
                                                        Decline
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </article>
                        );
                    })
                )}
            </div>
        </section>
    );
}