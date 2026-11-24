import { useEffect, useState } from 'react';
import axios from 'axios';
import {
    AlertTriangle,
    CalendarPlus,
    CheckCircle2,
    Clock,
    FileText,
    GraduationCap,
    Plus,
    Send,
    Trash2,
    UploadCloud,
    X,
    XCircle,
} from 'lucide-react';
import ClockTimeInput from './ClockTimeInput';
import { workShiftDutyOptions } from '../constants/workShiftDutyTypes';
import { formatClockTime, formatScheduleRange } from '../utils/scheduleTime';
import { REALTIME_EVENT } from '../utils/realtime';

type Kind = 'class' | 'work';

interface Block {
    key: string;
    days: string[];
    start: string;
    end: string;
    duty_type: string;
    subject: string;
    room: string;
    instructor: string;
}

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
    kind: Kind;
    status: 'Pending' | 'Approved' | 'Rejected' | string;
    proof_path: string;
    proof_name?: string | null;
    review_note?: string | null;
    reviewer_name?: string | null;
    entries: SubmissionEntry[];
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

let blockSerial = 0;

function blankBlock(): Block {
    blockSerial += 1;
    return {
        key: `block-${blockSerial}`,
        days: ['Monday'],
        start: '',
        end: '',
        duty_type: 'Clerical Work',
        subject: '',
        room: '',
        instructor: '',
    };
}

function errorMessage(error: unknown, fallback: string) {
    if (!axios.isAxiosError(error)) return fallback;
    const data = error.response?.data;
    if (typeof data?.message === 'string' && data.message !== '') return data.message;
    const errors = data?.errors;
    if (errors && typeof errors === 'object') {
        const first = Object.values(errors).flat()[0];
        if (typeof first === 'string') return first;
    }
    return fallback;
}

interface StudentScheduleSubmissionProps {
    hasWork: boolean;
    hasClass: boolean;
    onMessage: (text: string, type: 'success' | 'error') => void;
    onViewProof: (path: string, title: string) => void;
}

export default function StudentScheduleSubmission({
    hasWork,
    hasClass,
    onMessage,
    onViewProof,
}: StudentScheduleSubmissionProps) {
    const [kind, setKind] = useState<Kind>('class');
    const [drafts, setDrafts] = useState<Record<Kind, Block[]>>({
        class: [blankBlock()],
        work: [blankBlock()],
    });
    const [proofs, setProofs] = useState<Record<Kind, File | null>>({ class: null, work: null });
    const [formVersion, setFormVersion] = useState(0);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const response = await axios.get('/api/schedule-submissions');
            setSubmissions(Array.isArray(response.data?.submissions) ? response.data.submissions : []);
        } catch {
            // The schedule list still works if this request fails.
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

    const blocks = drafts[kind];
    const proof = proofs[kind];
    const pending = submissions.find((row) => row.kind === kind && row.status === 'Pending');
    const history = submissions.filter((row) => row.status !== 'Pending').slice(0, 4);
    const proofLabel = kind === 'class' ? 'registration form' : 'duty schedule';
    const replaces = kind === 'class' ? hasClass : hasWork;
    const isClass = kind === 'class';

    const setBlocks = (update: Block[] | ((current: Block[]) => Block[])) => {
        setDrafts((current) => ({
            ...current,
            [kind]: typeof update === 'function' ? update(current[kind]) : update,
        }));
    };

    const updateBlock = (key: string, patch: Partial<Block>) => {
        setBlocks((current) =>
            current.map((block) => (block.key === key ? { ...block, ...patch } : block))
        );
    };

    const toggleDay = (key: string, day: string) => {
        setBlocks((current) =>
            current.map((block) => {
                if (block.key !== key) return block;
                const days = block.days.includes(day)
                    ? block.days.filter((item) => item !== day)
                    : [...block.days, day];
                return { ...block, days };
            })
        );
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (pending) {
            onMessage(
                'Withdraw the schedule that is still waiting before sending another.',
                'error'
            );
            return;
        }
        for (const [index, block] of blocks.entries()) {
            const label = blocks.length > 1 ? `Block ${index + 1}` : 'This block';
            if (block.days.length === 0) {
                onMessage(`${label} needs at least one day.`, 'error');
                return;
            }
            if (!block.start || !block.end) {
                onMessage(`${label} needs a start and end time.`, 'error');
                return;
            }
            if (block.start === block.end) {
                onMessage(`${label} needs an end time after the start time.`, 'error');
                return;
            }
            if (kind === 'work' && !block.duty_type.trim()) {
                onMessage(`${label} needs a duty type.`, 'error');
                return;
            }
        }
        if (!proof) {
            onMessage(`Attach a photo or PDF of your ${proofLabel}.`, 'error');
            return;
        }
        if (proof.size > MAX_PROOF_BYTES) {
            onMessage('The proof must be 5 MB or smaller.', 'error');
            return;
        }

        const entries = blocks.map((block) => ({
            days: block.days,
            time: `${formatClockTime(block.start)} - ${formatClockTime(block.end)}`,
            duty_type: kind === 'work' ? block.duty_type : undefined,
            subject: kind === 'class' ? block.subject.trim() : undefined,
            room: kind === 'class' ? block.room.trim() : undefined,
            instructor: kind === 'class' ? block.instructor.trim() : undefined,
        }));

        const body = new FormData();
        body.append('kind', kind);
        body.append('entries', JSON.stringify(entries));
        body.append('proof', proof);

        setBusy(true);
        try {
            const response = await axios.post('/api/schedule-submissions', body);
            onMessage(response.data?.message || 'Schedule submitted.', 'success');
            setBlocks([blankBlock()]);
            setProofs((current) => ({ ...current, [kind]: null }));
            setFormVersion((current) => current + 1);
            await load();
        } catch (error) {
            onMessage(errorMessage(error, 'Could not submit this schedule.'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const withdraw = async (id: number) => {
        setBusy(true);
        try {
            const response = await axios.delete(`/api/schedule-submissions/${id}`);
            onMessage(response.data?.message || 'Submission withdrawn.', 'success');
            await load();
        } catch (error) {
            onMessage(errorMessage(error, 'Could not withdraw this submission.'), 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
            {/* OBSIDIAN HEADER */}
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
                    className={`pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full blur-3xl transition-colors duration-300 ${
                        isClass ? 'bg-violet-600/30' : 'bg-blue-600/30'
                    }`}
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-3.5">
                        <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                isClass
                                    ? 'bg-violet-500/20 text-violet-300 ring-violet-400/30'
                                    : 'bg-blue-500/20 text-blue-300 ring-blue-400/30'
                            }`}
                        >
                            {isClass ? (
                                <GraduationCap className="h-5 w-5" />
                            ) : (
                                <CalendarPlus className="h-5 w-5" />
                            )}
                        </span>
                        <div>
                            <h2 className="text-base font-black tracking-tight text-white">
                                Submit a Schedule
                            </h2>
                            <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-300">
                                Class schedules go to your office supervisor; duty schedules go to the WSPO coordinator. Attach a photo or PDF of your registration form for classes, or your duty schedule for work.
                            </p>
                        </div>
                    </div>

                    {/* FROSTED KIND SWITCHER */}
                    <div className="inline-flex shrink-0 self-start rounded-xl border border-white/10 bg-white/[0.06] p-1 backdrop-blur-md sm:self-auto">
                        <button
                            type="button"
                            onClick={() => setKind('class')}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
                                isClass
                                    ? 'bg-violet-600 text-white shadow-sm'
                                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <GraduationCap className="h-3.5 w-3.5" />
                            Class
                        </button>
                        <button
                            type="button"
                            onClick={() => setKind('work')}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
                                !isClass
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <Clock className="h-3.5 w-3.5" />
                            Duty
                        </button>
                    </div>
                </div>
            </div>

            {/* BODY */}
            <div className="space-y-6 p-6">
                {pending ? (
                    <SubmissionCard
                        submission={pending}
                        busy={busy}
                        onWithdraw={() => withdraw(pending.id)}
                        onViewProof={onViewProof}
                    />
                ) : (
                    <form onSubmit={submit} className="space-y-5">
                        {replaces && (
                            <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                                <span>
                                    Approval updates the days in this submission. Other approved{' '}
                                    {isClass ? 'class days' : 'duty days'} stay on your schedule.
                                </span>
                            </div>
                        )}

                        <div className="space-y-4">
                            {blocks.map((block, index) => (
                                <div
                                    key={block.key}
                                    className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 sm:p-5"
                                >
                                    <div className="mb-3.5 flex items-center justify-between gap-2">
                                        <span className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                                            <span
                                                className={`flex h-5 w-5 items-center justify-center rounded-md font-mono text-[10px] font-black text-white ${
                                                    isClass ? 'bg-violet-600' : 'bg-blue-600'
                                                }`}
                                            >
                                                {index + 1}
                                            </span>
                                            {blocks.length > 1
                                                ? `Block ${index + 1}`
                                                : isClass
                                                  ? 'Class Block'
                                                  : 'Duty Shift'}
                                        </span>
                                        {blocks.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setBlocks((current) =>
                                                        current.filter(
                                                            (item) => item.key !== block.key
                                                        )
                                                    )
                                                }
                                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Remove
                                            </button>
                                        )}
                                    </div>

                                    {/* WEEKDAY PILLS */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {WEEKDAYS.map((day) => {
                                            const selected = block.days.includes(day);
                                            return (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    onClick={() => toggleDay(block.key, day)}
                                                    className={`rounded-xl px-3 py-1.5 text-[11px] font-extrabold transition ${
                                                        selected
                                                            ? isClass
                                                                ? 'bg-violet-600 text-white shadow-sm'
                                                                : 'bg-blue-600 text-white shadow-sm'
                                                            : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {day.slice(0, 3)}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* TIME RANGE */}
                                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <label className="block">
                                            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                Starts
                                            </span>
                                            <ClockTimeInput
                                                value={block.start}
                                                onChange={(start) =>
                                                    updateBlock(block.key, { start })
                                                }
                                                aria-label="Start time"
                                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                Ends
                                            </span>
                                            <ClockTimeInput
                                                value={block.end}
                                                onChange={(end) => updateBlock(block.key, { end })}
                                                aria-label="End time"
                                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                                            />
                                        </label>
                                    </div>

                                    {/* CLASS OR DUTY DETAILS */}
                                    {isClass ? (
                                        <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            <label className="block">
                                                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                    Subject
                                                </span>
                                                <input
                                                    value={block.subject}
                                                    onChange={(event) =>
                                                        updateBlock(block.key, {
                                                            subject: event.target.value,
                                                        })
                                                    }
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                                                    maxLength={160}
                                                    placeholder="Optional"
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                    Room
                                                </span>
                                                <input
                                                    value={block.room}
                                                    onChange={(event) =>
                                                        updateBlock(block.key, {
                                                            room: event.target.value,
                                                        })
                                                    }
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                                                    maxLength={120}
                                                    placeholder="e.g. Rm 204"
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                    Instructor
                                                </span>
                                                <input
                                                    value={block.instructor}
                                                    onChange={(event) =>
                                                        updateBlock(block.key, {
                                                            instructor: event.target.value,
                                                        })
                                                    }
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                                                    maxLength={120}
                                                    placeholder="Optional"
                                                />
                                            </label>
                                        </div>
                                    ) : (
                                        <label className="mt-3.5 block">
                                            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                Duty Type
                                            </span>
                                            <select
                                                value={block.duty_type}
                                                onChange={(event) =>
                                                    updateBlock(block.key, {
                                                        duty_type: event.target.value,
                                                    })
                                                }
                                                className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                                            >
                                                {workShiftDutyOptions(block.duty_type).map(
                                                    (duty) => (
                                                        <option key={duty} value={duty}>
                                                            {duty}
                                                        </option>
                                                    )
                                                )}
                                            </select>
                                        </label>
                                    )}
                                </div>
                            ))}
                        </div>

                        {blocks.length < 12 && (
                            <button
                                type="button"
                                onClick={() => setBlocks((current) => [...current, blankBlock()])}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2 text-xs font-extrabold text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Add another block
                            </button>
                        )}

                        {/* PROOF UPLOAD ZONE */}
                        <label className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5 transition hover:border-slate-400 hover:bg-slate-50">
                            <div className="flex items-start gap-3">
                                <span
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                        isClass
                                            ? 'bg-violet-50 text-violet-600 ring-violet-200'
                                            : 'bg-blue-50 text-blue-600 ring-blue-200'
                                    }`}
                                >
                                    <UploadCloud className="h-5 w-5" />
                                </span>
                                <div>
                                    <span className="block text-sm font-extrabold text-slate-900">
                                        Photo or PDF of your {proofLabel}
                                    </span>
                                    <span className="mt-0.5 block text-xs font-medium text-slate-500">
                                        JPG, PNG, or PDF · 5 MB maximum.
                                    </span>
                                </div>
                            </div>

                            <input
                                key={`${kind}-${formVersion}`}
                                type="file"
                                accept="image/jpeg,image/png,application/pdf"
                                className="text-xs font-semibold text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-blue-600"
                                onChange={(event) =>
                                    setProofs((current) => ({
                                        ...current,
                                        [kind]: event.target.files?.[0] ?? null,
                                    }))
                                }
                            />

                            {proof && (
                                <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                                    {proof.name}
                                </span>
                            )}
                        </label>

                        <div className="border-t border-slate-100 pt-4">
                            <button
                                type="submit"
                                disabled={busy}
                                className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition disabled:opacity-50 ${
                                    isClass
                                        ? 'bg-violet-600 hover:bg-violet-700'
                                        : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                            >
                                <Send className="h-3.5 w-3.5" />
                                {busy
                                    ? 'Sending…'
                                    : isClass
                                      ? 'Submit Class Schedule'
                                      : 'Submit Duty Schedule'}
                            </button>
                        </div>
                    </form>
                )}

                {/* RECENT DECISIONS */}
                {history.length > 0 && (
                    <div className="space-y-3 border-t border-slate-100 pt-5">
                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Recent Decisions
                        </p>
                        {history.map((submission) => (
                            <SubmissionCard
                                key={submission.id}
                                submission={submission}
                                onViewProof={onViewProof}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

function SubmissionCard({
    submission,
    busy = false,
    onWithdraw,
    onViewProof,
}: {
    submission: Submission;
    busy?: boolean;
    onWithdraw?: () => void;
    onViewProof: (path: string, title: string) => void;
}) {
    const classKind = submission.kind === 'class';
    const proofTitle = classKind ? 'Registration form' : 'Duty schedule';
    const status = submission.status;

    const accent =
        status === 'Approved'
            ? 'bg-emerald-500'
            : status === 'Rejected'
              ? 'bg-rose-500'
              : 'bg-amber-500';

    return (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs sm:p-5">
            <span
                aria-hidden="true"
                className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${accent}`}
            />

            <div className="pl-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                classKind
                                    ? 'border-violet-200 bg-violet-50 text-violet-800'
                                    : 'border-blue-200 bg-blue-50 text-blue-800'
                            }`}
                        >
                            {classKind ? 'Class' : 'Duty'}
                        </span>
                        {status === 'Pending' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                                <Clock className="h-3 w-3" />
                                Waiting
                            </span>
                        )}
                        {status === 'Approved' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
                                <CheckCircle2 className="h-3 w-3" />
                                Approved
                            </span>
                        )}
                        {status === 'Rejected' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-800">
                                <XCircle className="h-3 w-3" />
                                Declined
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onViewProof(submission.proof_path, proofTitle)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                        >
                            <FileText className="h-3.5 w-3.5 text-slate-500" />
                            View {proofTitle.toLowerCase()}
                        </button>
                        {onWithdraw && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onWithdraw}
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                            >
                                <X className="h-3.5 w-3.5" />
                                Withdraw
                            </button>
                        )}
                    </div>
                </div>

                <ul className="mt-3.5 space-y-2">
                    {submission.entries.map((entry) => {
                        const leftOut = entry.kept === false;
                        return (
                        <li
                            key={entry.id}
                            className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                                leftOut ? 'border-rose-200 bg-rose-50/70' : 'border-slate-100 bg-slate-50/70'
                            }`}
                        >
                            <span className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-black uppercase text-white ${leftOut ? 'bg-rose-700 line-through' : 'bg-slate-900'}`}>
                                {entry.day.slice(0, 3)}
                            </span>
                            <span className={`font-mono font-bold ${leftOut ? 'text-rose-800 line-through' : 'text-slate-800'}`}>
                                {formatScheduleRange(entry.time)}
                            </span>
                            <span className={`font-semibold ${leftOut ? 'text-rose-700 line-through' : 'text-slate-500'}`}>
                                {entry.subject || entry.duty_type || (classKind ? 'Class' : 'Duty')}
                                {entry.room ? ` · ${entry.room}` : ''}
                                {entry.instructor ? ` · ${entry.instructor}` : ''}
                            </span>
                            {leftOut && (
                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-800">
                                    Left out
                                </span>
                            )}
                        </li>
                        );
                    })}
                </ul>

                {submission.review_note && (
                    <p className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700">
                        {submission.reviewer_name && (
                            <span className="font-extrabold text-slate-900">
                                {submission.reviewer_name}:{' '}
                            </span>
                        )}
                        {submission.review_note}
                    </p>
                )}

                {status === 'Pending' && (
                    <p className="mt-2.5 text-xs font-medium text-slate-500">
                        {classKind
                            ? 'Your office supervisor has to approve this before it becomes your class schedule.'
                            : 'The WSPO coordinator has to approve this before it becomes your duty schedule.'}
                    </p>
                )}
            </div>
        </div>
    );
}