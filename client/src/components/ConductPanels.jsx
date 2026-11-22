import React, { useEffect, useMemo, useState } from 'react';
import { Award, GraduationCap, Send, AlertCircle, Sparkles, UserCheck } from 'lucide-react';
import { getAwards, getConductCatalog, getPerformanceReviews, saveAward, savePerformanceReview } from '../services/disciplinaryService';
import { withHomeDepartmentNote } from '../utils/studentAssignment';
import { HelpDisclosure } from './HelpDisclosure';

const apiError = (err, fallback) => {
    const errors = err?.response?.data?.errors;
    if (errors) {
        const first = Object.values(errors)[0];
        if (Array.isArray(first) && first[0]) return first[0];
    }
    return err?.response?.data?.message || fallback;
};

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20';

const studentLabel = (student) => withHomeDepartmentNote(
    `${student.name} (${student.profile?.student_id_number || 'No ID'})`,
    student.profile?.course,
    student.profile?.assigned_office,
    student.profile?.year_level
);

export const ConductPanels = ({ section, students, records, isCoordinator }) => {
    const [catalog, setCatalog] = useState({ ratings: {}, school_year: '', departments: [] });
    const [reviews, setReviews] = useState([]);
    const [awards, setAwards] = useState([]);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [performanceForm, setPerformanceForm] = useState({
        student_id: '',
        school_year: '',
        rating: 'ok',
        target_department: '',
        notes: '',
    });
    const [awardForm, setAwardForm] = useState({
        student_id: '',
        school_year: '',
        title: 'Best Performing Student',
        citation: '',
    });

    useEffect(() => {
        getConductCatalog()
            .then((res) => {
                setCatalog(res.data);
                setPerformanceForm((form) => ({ ...form, school_year: form.school_year || res.data.school_year }));
                setAwardForm((form) => ({ ...form, school_year: form.school_year || res.data.school_year }));
            })
            .catch(() => setError('Could not load the conduct list.'));
        getPerformanceReviews().then((res) => setReviews(res.data)).catch(() => {});
        getAwards().then((res) => setAwards(res.data)).catch(() => {});
    }, []);

    const offenseCount = useMemo(() => {
        const counts = {};
        records.forEach((record) => {
            if (!record.student_id && !record.student?.id) return;
            const id = record.student_id || record.student.id;
            if (record.status === 'Dismissed') return;
            counts[id] = counts[id] || { minor: 0, major: 0 };
            if (record.offense_level === 'major') counts[id].major += 1;
            else counts[id].minor += 1;
        });
        return counts;
    }, [records]);

    const saveReview = async (event) => {
        event.preventDefault();
        setError('');
        setIsSubmitting(true);
        try {
            await savePerformanceReview({
                ...performanceForm,
                target_department: performanceForm.rating === 'bad' ? performanceForm.target_department : undefined,
            });
            setReviews((await getPerformanceReviews()).data);
            setPerformanceForm((form) => ({ ...form, student_id: '', notes: '', target_department: '', rating: 'ok' }));
        } catch (err) {
            setError(apiError(err, 'Could not save this performance review.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const saveYearEndAward = async (event) => {
        event.preventDefault();
        setError('');
        setIsSubmitting(true);
        try {
            await saveAward(awardForm);
            setAwards((await getAwards()).data);
            setAwardForm((form) => ({ ...form, student_id: '', citation: '' }));
        } catch (err) {
            setError(apiError(err, 'Could not record this award.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const ratingEntries = Object.entries(catalog.ratings || {});

    if (section === 'performance') {
        return (
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
                <form
                    onSubmit={saveReview}
                    className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm lg:col-span-1"
                >
                    <div className="relative overflow-hidden bg-slate-950 px-6 py-5 text-white">
                        <div
                            className="pointer-events-none absolute inset-0 opacity-20"
                            style={{
                                backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                                backgroundSize: '18px 18px',
                            }}
                            aria-hidden="true"
                        />
                        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-rose-500/25 blur-2xl" aria-hidden="true" />
                        <div className="relative z-10 flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30">
                                <GraduationCap className="h-5 w-5" />
                            </span>
                            <div>
                                <h3 className="text-base font-black tracking-tight text-white">Record Performance</h3>
                                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-300">
                                    Ok = retainment · Quite ok = retraining · Bad = reassignment.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 p-6">
                        <HelpDisclosure
                            variant="inline"
                            title="Rating & access guidelines"
                            items={[
                                'Ok performance corresponds to retainment; quite ok needing training corresponds to retraining; bad performance corresponds to department reassignment.',
                                'Only department supervisors and the WSPO coordinator can record and review annual performance outcomes.',
                            ]}
                        />
                        <div>
                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Student Worker
                            </label>
                            <select
                                required
                                className={fieldClass}
                                value={performanceForm.student_id}
                                onChange={(e) => setPerformanceForm({ ...performanceForm, student_id: e.target.value })}
                            >
                                <option value="" disabled>Select a student</option>
                                {students.map((student) => (
                                    <option key={student.id} value={student.id}>{studentLabel(student)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                School Year
                            </label>
                            <input
                                required
                                className={fieldClass}
                                value={performanceForm.school_year}
                                onChange={(e) => setPerformanceForm({ ...performanceForm, school_year: e.target.value })}
                                placeholder="2026-2027"
                            />
                        </div>
                        <div className="space-y-2">
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Rating</p>
                            {ratingEntries.map(([value, rating]) => (
                                <label
                                    key={value}
                                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                                        performanceForm.rating === value
                                            ? 'border-rose-300 bg-rose-50/80 ring-1 ring-rose-200'
                                            : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="rating"
                                        className="mt-1 accent-rose-600"
                                        checked={performanceForm.rating === value}
                                        onChange={() => setPerformanceForm({ ...performanceForm, rating: value })}
                                    />
                                    <span>
                                        <span className="block text-sm font-extrabold text-slate-900">{rating.label}</span>
                                        <span className="block text-xs font-semibold text-slate-500">{rating.outcome_label}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        {performanceForm.rating === 'bad' && (
                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Reassign To
                                </label>
                                <select
                                    required
                                    className={fieldClass}
                                    value={performanceForm.target_department}
                                    onChange={(e) => setPerformanceForm({ ...performanceForm, target_department: e.target.value })}
                                >
                                    <option value="" disabled>Choose a department</option>
                                    {(catalog.departments || []).map((office) => (
                                        <option key={office} value={office}>{office}</option>
                                    ))}
                                </select>
                                <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                                    {isCoordinator ? 'Saving this moves the student to that department.' : 'The coordinator confirms the move.'}
                                </p>
                            </div>
                        )}
                        <div>
                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Notes
                            </label>
                            <textarea
                                className={`${fieldClass} h-24 font-medium`}
                                value={performanceForm.notes}
                                onChange={(e) => setPerformanceForm({ ...performanceForm, notes: e.target.value })}
                                placeholder="What stood out this year..."
                            />
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={isSubmitting || !performanceForm.student_id}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-rose-600 disabled:opacity-45"
                        >
                            <Send className="h-4 w-4" /> {isSubmitting ? 'Saving…' : 'Save Review'}
                        </button>
                    </div>
                </form>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-2">
                    {reviews.length === 0 && (
                        <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white px-6 py-14 text-center md:col-span-2">
                            <GraduationCap className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-extrabold text-slate-700">No performance reviews yet</p>
                            <p className="mt-1 text-xs font-medium text-slate-400">
                                Recorded annual evaluations for student workers will appear here.
                            </p>
                        </div>
                    )}
                    {reviews.map((review) => {
                        const rating = catalog.ratings?.[review.rating];
                        const counts = offenseCount[review.student_id] || { minor: 0, major: 0 };
                        const accentBar =
                            review.rating === 'bad'
                                ? 'bg-rose-500'
                                : review.rating === 'ok'
                                    ? 'bg-emerald-500'
                                    : 'bg-amber-500';
                        const badgeClass =
                            review.rating === 'bad'
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : review.rating === 'ok'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-700';
                        return (
                            <article
                                key={review.id}
                                className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                            >
                                <span
                                    aria-hidden="true"
                                    className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${accentBar}`}
                                />
                                <div className="pl-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-mono text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            SY {review.school_year}
                                        </span>
                                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${badgeClass}`}>
                                            {rating?.outcome_label || review.outcome}
                                        </span>
                                    </div>
                                    <h4 className="mt-2 text-lg font-black tracking-tight text-slate-900">
                                        {review.student?.name || 'Student'}
                                    </h4>
                                    <p className="mt-1 text-xs font-bold text-slate-600">{rating?.label || review.rating}</p>
                                    {review.target_department && (
                                        <p className="mt-2 inline-flex rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                                            Reassign to {review.target_department}
                                        </p>
                                    )}
                                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5">
                                            {counts.minor} minor
                                        </span>
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5">
                                            {counts.major} major offense{counts.major === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    {review.notes && (
                                        <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs font-medium leading-relaxed text-slate-600">
                                            {review.notes}
                                        </p>
                                    )}
                                    <p className="mt-4 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        <UserCheck className="h-3 w-3" /> Recorded by {review.recorder?.name || 'Staff'}
                                    </p>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
            <form
                onSubmit={saveYearEndAward}
                className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm lg:col-span-1"
            >
                <div className="relative overflow-hidden bg-slate-950 px-6 py-5 text-white">
                    <div
                        className="pointer-events-none absolute inset-0 opacity-20"
                        style={{
                            backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                            backgroundSize: '18px 18px',
                        }}
                        aria-hidden="true"
                    />
                    <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-500/25 blur-2xl" aria-hidden="true" />
                    <div className="relative z-10 flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30">
                            <Award className="h-5 w-5" />
                        </span>
                        <div>
                            <h3 className="text-base font-black tracking-tight text-white">Year-End Award</h3>
                            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-300">
                                Recognize the organization&apos;s best performing student workers.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 p-6">
                    {isCoordinator ? (
                        <>
                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Student Worker
                                </label>
                                <select
                                    required
                                    className={fieldClass}
                                    value={awardForm.student_id}
                                    onChange={(e) => setAwardForm({ ...awardForm, student_id: e.target.value })}
                                >
                                    <option value="" disabled>Select a student</option>
                                    {students.map((student) => (
                                        <option key={student.id} value={student.id}>{studentLabel(student)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    School Year
                                </label>
                                <input
                                    required
                                    className={fieldClass}
                                    value={awardForm.school_year}
                                    onChange={(e) => setAwardForm({ ...awardForm, school_year: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Award Title
                                </label>
                                <input
                                    required
                                    className={fieldClass}
                                    value={awardForm.title}
                                    onChange={(e) => setAwardForm({ ...awardForm, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Citation
                                </label>
                                <textarea
                                    className={`${fieldClass} h-24 font-medium`}
                                    value={awardForm.citation}
                                    onChange={(e) => setAwardForm({ ...awardForm, citation: e.target.value })}
                                    placeholder="Why this student was recognized..."
                                />
                            </div>
                            {error && (
                                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}
                            <button
                                type="submit"
                                disabled={isSubmitting || !awardForm.student_id}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-45"
                            >
                                <Award className="h-4 w-4" /> {isSubmitting ? 'Saving…' : 'Record Award'}
                            </button>
                        </>
                    ) : (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs font-semibold leading-relaxed text-amber-900">
                            The WSPO coordinator records the organization&apos;s year-end awards. You can review recognized students in your department here.
                        </div>
                    )}
                </div>
            </form>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-2">
                {awards.length === 0 && (
                    <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white px-6 py-14 text-center md:col-span-2">
                        <Award className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
                        <p className="text-sm font-extrabold text-slate-700">No year-end awards recorded yet</p>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            Recognized students and their citations will be showcased here.
                        </p>
                    </div>
                )}
                {awards.map((award) => (
                    <article
                        key={award.id}
                        className="relative overflow-hidden rounded-[1.75rem] border border-amber-200/80 bg-white p-6 shadow-sm transition hover:border-amber-300 hover:shadow-md"
                    >
                        <span
                            aria-hidden="true"
                            className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-amber-500"
                        />
                        <div className="pl-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-widest text-amber-700">
                                    <Sparkles className="h-3 w-3" /> SY {award.school_year}
                                </span>
                            </div>
                            <h4 className="mt-2.5 text-lg font-black tracking-tight text-slate-900">{award.title}</h4>
                            <p className="mt-1 text-sm font-bold text-slate-700">{award.student?.name || 'Student'}</p>
                            {award.citation && (
                                <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-xs font-medium leading-relaxed text-slate-700">
                                    {award.citation}
                                </p>
                            )}
                            <p className="mt-4 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                <UserCheck className="h-3 w-3" /> Recorded by {award.awarder?.name || 'Coordinator'}
                            </p>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
};
