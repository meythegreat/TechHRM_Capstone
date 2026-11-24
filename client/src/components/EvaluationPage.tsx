import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    CheckCircle2,
    ClipboardCheck,
    Eye,
    EyeOff,
    FileCheck2,
    FileText,
    Pencil,
    Printer,
    RotateCcw,
    Save,
    Search,
    Send,
    Sparkles,
    Trash2,
    UploadCloud,
    UserCheck,
    X,
    XCircle,
} from 'lucide-react';
import SecureFileViewerModal from './SecureFileViewerModal';
import WsaEvaluationSheet, {
    EvaluationPreviewFrame,
    printEvaluationSheet,
    type EvaluationSheetData,
} from './evaluations/WsaEvaluationSheet';
import {
    evaluationError,
    evaluationService,
    type EvaluationMeta,
    type EvaluationRow,
    type EvaluationStudent,
} from '../services/evaluationService';

const emptyRatings = (standards: EvaluationMeta['standards']) =>
    Object.fromEntries(standards.map((standard) => [standard.id, '']));

const statusTone = (status: string) => {
    if (status === 'Pending' || status === 'Draft')
        return 'bg-amber-50 text-amber-800 border-amber-200';
    if (status === 'Approved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    return 'bg-rose-50 text-rose-800 border-rose-200';
};

const statusAccent = (status: string) => {
    if (status === 'Pending' || status === 'Draft') return 'bg-amber-500';
    if (status === 'Approved') return 'bg-emerald-500';
    return 'bg-rose-500';
};

const EvaluationPage = () => {
    const [meta, setMeta] = useState<EvaluationMeta | null>(null);
    const [rows, setRows] = useState<EvaluationRow[]>([]);
    const [students, setStudents] = useState<EvaluationStudent[]>([]);
    const [department, setDepartment] = useState('');
    const [query, setQuery] = useState('');
    const [studentId, setStudentId] = useState<number | null>(null);
    const [ratings, setRatings] = useState<Record<string, string>>({});
    const [comments, setComments] = useState('');
    const [recommendation, setRecommendation] = useState('');
    const [evaluatedBy, setEvaluatedBy] = useState('');
    const [attestedBy, setAttestedBy] = useState('');
    const [signedForm, setSignedForm] = useState<File | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [proof, setProof] = useState<{ path: string; title: string } | null>(null);
    const [openId, setOpenId] = useState<number | null>(null);
    const [formKey, setFormKey] = useState(0);

    const loadRows = () => evaluationService.list().then(setRows).catch(() => setRows([]));

    useEffect(() => {
        evaluationService
            .meta()
            .then((next) => {
                setMeta(next);
                setRatings(emptyRatings(next.standards));
                if (next.departments.length === 1) setDepartment(next.departments[0]);
            })
            .catch((reason) =>
                setError(evaluationError(reason, 'Evaluation is not available for this account.'))
            );
        loadRows();
    }, []);

    useEffect(() => {
        if (!department || !meta?.can_file) {
            setStudents([]);
            return;
        }
        evaluationService
            .candidates(department)
            .then(setStudents)
            .catch((reason) => {
                setStudents([]);
                setError(
                    evaluationError(reason, 'Could not load student assistants for this office.')
                );
            });
    }, [department, meta?.can_file]);

    const selected = students.find((student) => student.id === studentId) || null;
    const matches = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return students;
        return students.filter((student) =>
            `${student.name} ${student.student_id_number || ''}`.toLowerCase().includes(term)
        );
    }, [students, query]);

    const ratedCount = useMemo(
        () => (meta ? meta.standards.filter((s) => Boolean(ratings[s.id])).length : 0),
        [meta, ratings]
    );
    const pendingCount = useMemo(
        () => rows.filter((row) => row.status === 'Pending').length,
        [rows]
    );

    const sheet = (source?: {
        department: string;
        semesterSchoolYear: string;
        evaluatedOnLabel: string;
        studentName: string;
        ratings: Record<string, string>;
        comments: string;
        recommendation: string;
        evaluatedBy: string;
        attestedBy: string;
    }): EvaluationSheetData | null => {
        if (!meta) return null;
        return {
            department: source?.department || department,
            semesterSchoolYear: source?.semesterSchoolYear || meta.semester_school_year || '',
            evaluatedOnLabel: source?.evaluatedOnLabel || meta.evaluated_on_label,
            studentName: source?.studentName || selected?.name || '',
            standards: meta.standards,
            ratings: source?.ratings || ratings,
            ratingLabels: meta.ratings,
            comments: source?.comments ?? comments,
            recommendation: source?.recommendation || recommendation,
            recommendations: meta.recommendations,
            evaluatedBy: source?.evaluatedBy || evaluatedBy,
            attestedBy: source?.attestedBy || attestedBy,
            intro: meta.intro,
            legend: meta.legend,
        };
    };

    const payload = () => ({
        department,
        studentId: studentId || 0,
        ratings,
        comments,
        recommendation,
        evaluatedBy,
        attestedBy,
        signedForm,
    });

    const formReady = () => {
        if (!meta?.semester_school_year) return 'The semester and school year are not set yet.';
        if (!department) return 'Select one office or department.';
        if (!studentId) return 'Select one student assistant from this office.';
        if (meta.standards.some((standard) => !ratings[standard.id]))
            return 'Choose one rating for every performance standard.';
        if (!recommendation) return 'Choose one recommendation.';
        if (!evaluatedBy.trim() || !attestedBy.trim()) return 'Type both signatory names.';
        return '';
    };

    const resetForm = () => {
        if (!meta) return;
        setStudentId(null);
        setQuery('');
        setRatings(emptyRatings(meta.standards));
        setComments('');
        setRecommendation('');
        setEvaluatedBy('');
        setAttestedBy('');
        setSignedForm(null);
        setEditingId(null);
        setConfirmClear(false);
        setFormKey((current) => current + 1);
        if (meta.departments.length !== 1) setDepartment('');
    };

    const save = async (asDraft: boolean) => {
        const problem = formReady();
        if (problem) {
            setError(problem);
            return;
        }
        if (!asDraft && !signedForm && !editingId) {
            setError('Upload the signed evaluation form before submitting it.');
            return;
        }
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const body = { ...payload(), asDraft };
            const response = editingId
                ? await (asDraft
                      ? evaluationService.saveDraft(editingId, body)
                      : evaluationService.finalize(editingId, body))
                : await evaluationService.create(body);
            setMessage(response.data.message);
            resetForm();
            await loadRows();
        } catch (reason) {
            setError(evaluationError(reason, 'Could not save the evaluation.'));
        } finally {
            setBusy(false);
        }
    };

    const openDraft = (row: EvaluationRow) => {
        setEditingId(row.id);
        setDepartment(row.department);
        setStudentId(row.student?.id ?? null);
        setQuery(row.student?.name || '');
        setRatings(row.ratings || {});
        setComments(row.comments || '');
        setRecommendation(row.recommendation);
        setEvaluatedBy(row.evaluated_by_name.toLocaleUpperCase());
        setAttestedBy(row.attested_by_name.toLocaleUpperCase());
        setSignedForm(null);
        setConfirmClear(false);
        setFormKey((current) => current + 1);
        setMessage(
            `Draft for ${row.student?.name || 'this student'} is open. Print it, then submit with a signature proof.`
        );
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const printCurrent = () => {
        const problem = formReady();
        if (problem) {
            setError(problem);
            return;
        }
        setError('');
        printEvaluationSheet();
    };

    const printRow = (row: EvaluationRow) => {
        printEvaluationSheet(
            document.querySelector(`[data-print-id="${row.id}"] .wsa-eval-print-root`)
        );
    };

    const decide = async (row: EvaluationRow, status: 'Approved' | 'Rejected') => {
        setBusy(true);
        setError('');
        try {
            const response = await evaluationService.decide(row.id, status, note);
            setMessage(response.data.message);
            setNote('');
            await loadRows();
        } catch (reason) {
            setError(evaluationError(reason, 'Could not record the decision.'));
        } finally {
            setBusy(false);
        }
    };

    const preview = sheet();
    const userId = meta?.user_id ?? 0;

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-4 font-sans sm:p-8 print:hidden">
            {/* OBSIDIAN EVALUATION HERO */}
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
                                <ClipboardCheck className="h-3.5 w-3.5 text-blue-400" />
                                FCU-EOMS-WP-002-F
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300">
                                <Sparkles className="h-3 w-3 text-indigo-300" />
                                WSA Performance Review
                            </span>
                        </div>
                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Evaluation
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            WSA Evaluation Form for one student assistant in your office. Department supervisors and secretaries fill it; the WSPO coordinator approves it after a signature proof is attached.
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                pendingCount > 0
                                    ? 'bg-amber-500/20 text-amber-300 ring-amber-400/30'
                                    : 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/30'
                            }`}
                        >
                            <FileCheck2 className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                {meta?.can_decide ? 'Pending Approval' : 'Evaluations'}
                            </p>
                            <p className="mt-0.5 font-mono text-2xl font-black tabular-nums text-white">
                                {meta?.can_decide ? pendingCount : rows.length}
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            {error && (
                <div
                    role="alert"
                    className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm font-bold text-rose-700"
                >
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                </div>
            )}
            {message && (
                <div
                    role="status"
                    className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm font-bold text-emerald-800"
                >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{message}</span>
                </div>
            )}

            {meta?.can_file && (
                <form
                    className="space-y-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        save(false);
                    }}
                >
                    {editingId !== null && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-3">
                            <span className="inline-flex items-center gap-2 text-xs font-extrabold text-amber-900">
                                <Pencil className="h-3.5 w-3.5 text-amber-600" />
                                Editing saved draft #{editingId}
                            </span>
                            <button
                                type="button"
                                onClick={resetForm}
                                className="text-xs font-bold text-amber-800 hover:underline"
                            >
                                Discard &amp; start new
                            </button>
                        </div>
                    )}

                    {/* STEP 1: GENERATED DETAILS */}
                    <section className="rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 font-mono text-[11px] font-black text-white">
                                1
                            </span>
                            <h2 className="text-base font-black tracking-tight text-slate-900">
                                Generated Details
                            </h2>
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                            Pulled automatically from your account and the active semester.
                        </p>
                        <div className="mt-4 grid gap-4 sm:grid-cols-3">
                            <label className="block">
                                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Office / Department
                                </span>
                                {meta.departments.length > 1 ? (
                                    <select
                                        className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                        value={department}
                                        onChange={(event) => {
                                            setDepartment(event.target.value);
                                            setStudentId(null);
                                            setQuery('');
                                        }}
                                    >
                                        <option value="">Select one office</option>
                                        {meta.departments.map((office) => (
                                            <option key={office} value={office}>
                                                {office}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-700"
                                        value={department || 'No office assigned'}
                                        readOnly
                                    />
                                )}
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Semester / School Year
                                </span>
                                <input
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-700"
                                    value={meta.semester_school_year || 'Semester is not set'}
                                    readOnly
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Date of Evaluation
                                </span>
                                <input
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-700"
                                    value={meta.evaluated_on_label}
                                    readOnly
                                />
                            </label>
                        </div>
                    </section>

                    {/* STEP 2: STUDENT ASSISTANT */}
                    <section className="rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 font-mono text-[11px] font-black text-white">
                                    2
                                </span>
                                <h2 className="text-base font-black tracking-tight text-slate-900">
                                    Student Assistant
                                </h2>
                            </div>
                            {selected && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-800">
                                    <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                                    {selected.name}
                                    {selected.student_id_number
                                        ? ` · ${selected.student_id_number}`
                                        : ''}
                                </span>
                            )}
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                            Search this office and select one name. A second student requires a separate form.
                        </p>

                        <div className="relative mt-4">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 disabled:opacity-60"
                                placeholder={
                                    department ? 'Search a student assistant…' : 'Select an office first'
                                }
                                value={query}
                                disabled={!department}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </div>

                        <ul className="custom-scrollbar mt-3 max-h-52 divide-y divide-slate-100 overflow-auto rounded-2xl border border-slate-200 bg-white">
                            {matches.length === 0 && (
                                <li className="px-4 py-6 text-center text-xs font-semibold text-slate-400">
                                    No student assistant matches this office.
                                </li>
                            )}
                            {matches.map((student) => {
                                const isSelected = studentId === student.id;
                                return (
                                    <li key={student.id}>
                                        <button
                                            type="button"
                                            className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition ${
                                                isSelected
                                                    ? 'bg-blue-50/80 font-extrabold text-blue-900'
                                                    : 'font-semibold text-slate-700 hover:bg-slate-50'
                                            }`}
                                            onClick={() => {
                                                setStudentId(student.id);
                                                setQuery(student.name);
                                            }}
                                        >
                                            <span className="flex items-center gap-2.5">
                                                <span
                                                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                                                        isSelected
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-slate-100 text-slate-600'
                                                    }`}
                                                >
                                                    {student.name.charAt(0).toUpperCase()}
                                                </span>
                                                <span>{student.name}</span>
                                            </span>
                                            <span className="font-mono text-xs font-medium text-slate-500">
                                                {student.student_id_number || student.assigned_office}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    {/* STEP 3: PERFORMANCE STANDARDS MATRIX */}
                    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-5 sm:px-6">
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 font-mono text-[11px] font-black text-white">
                                        3
                                    </span>
                                    <h2 className="text-base font-black tracking-tight text-slate-900">
                                        Performance Standards
                                    </h2>
                                </div>
                                <p className="mt-1 text-xs font-medium text-slate-500">
                                    {meta.legend}
                                </p>
                            </div>
                            <span
                                className={`rounded-full border px-3 py-1 font-mono text-[11px] font-extrabold ${
                                    ratedCount === meta.standards.length
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : 'border-slate-200 bg-slate-50 text-slate-600'
                                }`}
                            >
                                {ratedCount}/{meta.standards.length} rated
                            </span>
                        </div>

                        <div className="custom-scrollbar overflow-x-auto">
                            <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
                                <thead>
                                    <tr className="bg-slate-950 text-white">
                                        <th className="w-[40%] px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest">
                                            Standard
                                        </th>
                                        {meta.ratings.map((rating) => (
                                            <th
                                                key={rating}
                                                className="w-[12%] px-2 py-3.5 text-center text-[11px] font-extrabold uppercase tracking-widest"
                                            >
                                                {rating}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {meta.standards.map((standard) => (
                                        <tr
                                            key={standard.id}
                                            className="transition-colors hover:bg-slate-50/80"
                                        >
                                            <td className="px-6 py-3 font-semibold text-slate-800">
                                                {standard.text}
                                            </td>
                                            {meta.ratings.map((rating) => (
                                                <td key={rating} className="px-2 py-3 text-center">
                                                    <input
                                                        type="radio"
                                                        name={`rating-${standard.id}`}
                                                        checked={ratings[standard.id] === rating}
                                                        onChange={() =>
                                                            setRatings((current) => ({
                                                                ...current,
                                                                [standard.id]: rating,
                                                            }))
                                                        }
                                                        aria-label={`${standard.text} ${rating}`}
                                                        className="h-4 w-4 cursor-pointer accent-blue-600"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* STEP 4: COMMENTS & RECOMMENDATION */}
                    <section className="space-y-5 rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 font-mono text-[11px] font-black text-white">
                                4
                            </span>
                            <h2 className="text-base font-black tracking-tight text-slate-900">
                                Comments &amp; Recommendation
                            </h2>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Supervisor’s Comments
                            </label>
                            <textarea
                                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                value={comments}
                                onChange={(event) => setComments(event.target.value)}
                                placeholder="Type the supervisor’s comments…"
                            />
                        </div>

                        <div>
                            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Recommendation (Check one only)
                            </p>
                            <div className="flex flex-wrap gap-2.5">
                                {meta.recommendations.map((item) => {
                                    const active = recommendation === item;
                                    return (
                                        <label
                                            key={item}
                                            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-extrabold transition ${
                                                active
                                                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                                    : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-white'
                                            }`}
                                        >
                                            <input
                                                className="sr-only"
                                                type="radio"
                                                name="recommendation"
                                                checked={active}
                                                onChange={() => setRecommendation(item)}
                                            />
                                            <span>{item}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* STEP 5: SIGNATORIES, SIGNED FORM & PREVIEW */}
                    <section className="space-y-5 rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 font-mono text-[11px] font-black text-white">
                                5
                            </span>
                            <h2 className="text-base font-black tracking-tight text-slate-900">
                                Signatories &amp; Signed Form
                            </h2>
                        </div>
                        <p className="text-xs font-medium leading-relaxed text-slate-500">
                            Type both names. Print the form, collect both signatures on that one copy, then upload the signed form.
                        </p>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Evaluated By
                                </span>
                                <input
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold uppercase text-slate-900 outline-none transition placeholder:normal-case placeholder:font-medium focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                    value={evaluatedBy}
                                    onChange={(event) =>
                                        setEvaluatedBy(event.target.value.toLocaleUpperCase())
                                    }
                                    placeholder="Immediate supervisor"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Attested By
                                </span>
                                <input
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold uppercase text-slate-900 outline-none transition placeholder:normal-case placeholder:font-medium focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                    value={attestedBy}
                                    onChange={(event) =>
                                        setAttestedBy(event.target.value.toLocaleUpperCase())
                                    }
                                    placeholder="Office, unit, or department head"
                                />
                            </label>
                        </div>

                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 sm:p-5">
                            <label className="block cursor-pointer">
                                <div className="flex items-start gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-200">
                                        <UploadCloud className="h-4 w-4" />
                                    </span>
                                    <div>
                                        <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-800">
                                            Signed Form
                                        </span>
                                        <span className="mt-0.5 block text-xs font-medium text-slate-500">
                                            One photo or scan of the printed form, with the signatures on it.
                                        </span>
                                    </div>
                                </div>
                                <input
                                    key={`signed-form-${formKey}`}
                                    className="mt-3 block w-full text-xs font-semibold text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3.5 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-blue-600"
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={(event) =>
                                        setSignedForm(event.target.files?.[0] || null)
                                    }
                                />
                            </label>

                            {signedForm && (
                                <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                                    <span className="max-w-xs truncate">{signedForm.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSignedForm(null);
                                            setFormKey((current) => current + 1);
                                        }}
                                        className="rounded-md p-0.5 text-emerald-700 hover:bg-emerald-200/60"
                                        aria-label="Remove attached file"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {preview && (
                            <div className="border-t border-slate-100 pt-5">
                                <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                                    Document Preview (Long Coupon · 8.5 × 13 in)
                                </h3>
                                <p className="mb-3 mt-1 text-xs font-medium text-slate-500">
                                    Updates live as you fill the form.
                                </p>
                                <EvaluationPreviewFrame>
                                    <WsaEvaluationSheet preview data={preview} />
                                </EvaluationPreviewFrame>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
                            <button
                                type="button"
                                onClick={printCurrent}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-2xs transition hover:bg-slate-50"
                            >
                                <Printer className="h-4 w-4" />
                                Print Long Coupon
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => save(true)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50"
                            >
                                <Save className="h-4 w-4" />
                                Save Draft
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmClear(true)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-bold text-rose-700 shadow-2xs transition hover:bg-rose-50"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Clear
                            </button>

                            {confirmClear && (
                                <span className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-800">
                                    <span>Clear the entire form?</span>
                                    <button
                                        type="button"
                                        className="rounded-lg bg-rose-700 px-2.5 py-1 text-[11px] font-extrabold text-white transition hover:bg-rose-800"
                                        onClick={resetForm}
                                    >
                                        Yes, clear it
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100/50"
                                        onClick={() => setConfirmClear(false)}
                                    >
                                        Cancel
                                    </button>
                                </span>
                            )}

                            <button
                                type="submit"
                                disabled={busy}
                                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
                            >
                                <Send className="h-3.5 w-3.5" />
                                Submit to Coordinator
                            </button>
                        </div>
                    </section>
                </form>
            )}

            {/* EVALUATIONS / FOR APPROVAL QUEUE */}
            <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                    <h2 className="text-base font-black tracking-tight text-slate-900">
                        {meta?.can_decide ? 'For Approval' : 'Evaluations'}
                    </h2>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                        {meta?.can_decide
                            ? 'Open the signature proof, then approve or return the form.'
                            : 'Drafts stay in this office until a signature proof is submitted.'}
                    </p>
                </div>

                <div className="space-y-3.5 p-6">
                    {rows.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
                            <ClipboardCheck className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-extrabold text-slate-700">
                                No evaluations yet
                            </p>
                            <p className="mt-1 text-xs font-medium text-slate-400">
                                Saved drafts and submitted evaluation forms will appear here.
                            </p>
                        </div>
                    )}

                    {rows.map((row) => (
                        <article
                            key={row.id}
                            className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs transition hover:border-slate-300"
                        >
                            <span
                                aria-hidden="true"
                                className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${statusAccent(
                                    row.status
                                )}`}
                            />

                            <div className="pl-2">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-black text-slate-900">
                                            {row.student?.name || 'Student assistant'}
                                        </p>
                                        <p className="mt-0.5 text-xs font-medium text-slate-500">
                                            {row.department} · {row.semester_school_year} ·{' '}
                                            {row.evaluated_on_label}
                                        </p>
                                    </div>
                                    <span
                                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${statusTone(
                                            row.status
                                        )}`}
                                    >
                                        {row.status}
                                    </span>
                                </div>

                                <div className="mt-3.5 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                                        onClick={() =>
                                            setOpenId(openId === row.id ? null : row.id)
                                        }
                                    >
                                        {openId === row.id ? (
                                            <>
                                                <EyeOff className="h-3.5 w-3.5" />
                                                Hide Preview
                                            </>
                                        ) : (
                                            <>
                                                <Eye className="h-3.5 w-3.5" />
                                                Preview
                                            </>
                                        )}
                                    </button>

                                    {row.status === 'Draft' && row.submitted_by_id === userId && (
                                        <>
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                                                onClick={() => openDraft(row)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                                Continue Draft
                                            </button>
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
                                                onClick={async () => {
                                                    await evaluationService.remove(row.id);
                                                    if (editingId === row.id) resetForm();
                                                    loadRows();
                                                }}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Delete
                                            </button>
                                        </>
                                    )}

                                    {(row.evaluated_signature_path || row.attested_signature_path) && (
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                                            onClick={() =>
                                                setProof({
                                                    path:
                                                        row.evaluated_signature_path ||
                                                        row.attested_signature_path ||
                                                        '',
                                                    title: 'Signed evaluation form',
                                                })
                                            }
                                        >
                                            <FileText className="h-3.5 w-3.5" />
                                            Signed form
                                        </button>
                                    )}
                                </div>

                                {openId === row.id && meta && (
                                    <div
                                        className="mt-4 border-t border-slate-100 pt-4"
                                        data-print-id={row.id}
                                    >
                                        <EvaluationPreviewFrame>
                                            <WsaEvaluationSheet
                                                preview
                                                data={{
                                                    department: row.department,
                                                    semesterSchoolYear: row.semester_school_year,
                                                    evaluatedOnLabel: row.evaluated_on_label,
                                                    studentName: row.student?.name || '',
                                                    standards: meta.standards,
                                                    ratings: row.ratings,
                                                    ratingLabels: meta.ratings,
                                                    comments: row.comments || '',
                                                    recommendation: row.recommendation,
                                                    recommendations: meta.recommendations,
                                                    evaluatedBy: row.evaluated_by_name,
                                                    attestedBy: row.attested_by_name,
                                                    intro: meta.intro,
                                                    legend: meta.legend,
                                                }}
                                            />
                                        </EvaluationPreviewFrame>
                                        <button
                                            type="button"
                                            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                                            onClick={() => printRow(row)}
                                        >
                                            <Printer className="h-3.5 w-3.5" />
                                            Print This Form
                                        </button>
                                    </div>
                                )}

                                {meta?.can_decide && row.status === 'Pending' && openId === row.id && (
                                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                                        <textarea
                                            className="min-h-20 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                            placeholder="Note for the office (optional)"
                                            value={note}
                                            onChange={(event) => setNote(event.target.value)}
                                        />
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                                                onClick={() => decide(row, 'Approved')}
                                            >
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Approve
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                                                onClick={() => decide(row, 'Rejected')}
                                            >
                                                <XCircle className="h-3.5 w-3.5" />
                                                Return
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {row.decision_note && (
                                    <p className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700">
                                        <span className="font-extrabold text-slate-900">
                                            Coordinator note:{' '}
                                        </span>
                                        {row.decision_note}
                                    </p>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            {preview && <WsaEvaluationSheet data={preview} />}
            <SecureFileViewerModal
                filePath={proof?.path || null}
                title={proof?.title || 'Signature proof'}
                onClose={() => setProof(null)}
            />
        </div>
    );
};

export default EvaluationPage;