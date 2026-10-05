import React, { useEffect, useMemo, useState } from 'react';
import { Award, GraduationCap, Send } from 'lucide-react';
import { getAwards, getConductCatalog, getPerformanceReviews, saveAward, savePerformanceReview } from '../services/disciplinaryService';
import { withHomeDepartmentNote } from '../utils/studentAssignment';

const apiError = (err, fallback) => {
    const errors = err?.response?.data?.errors;
    if (errors) {
        const first = Object.values(errors)[0];
        if (Array.isArray(first) && first[0]) return first[0];
    }
    return err?.response?.data?.message || fallback;
};

const fieldClass = 'w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all';

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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <form onSubmit={saveReview} className="lg:col-span-1 bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 space-y-5">
                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <GraduationCap className="w-5 h-5 text-red-600" /> Record Performance
                    </h3>
                    <p className="text-xs font-medium text-slate-500">
                        Ok performance is retainment. Quite ok but needing training is retraining. Bad performance is reassignment. Supervisors and the coordinator are the only people who use this record.
                    </p>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Student Worker</label>
                        <select required className={fieldClass} value={performanceForm.student_id} onChange={(e) => setPerformanceForm({ ...performanceForm, student_id: e.target.value })}>
                            <option value="" disabled>Select a student</option>
                            {students.map((student) => (
                                <option key={student.id} value={student.id}>{studentLabel(student)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">School Year</label>
                        <input required className={fieldClass} value={performanceForm.school_year} onChange={(e) => setPerformanceForm({ ...performanceForm, school_year: e.target.value })} placeholder="2026-2027" />
                    </div>
                    <div className="space-y-2">
                        {ratingEntries.map(([value, rating]) => (
                            <label key={value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${performanceForm.rating === value ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                                <input type="radio" name="rating" className="mt-1" checked={performanceForm.rating === value} onChange={() => setPerformanceForm({ ...performanceForm, rating: value })} />
                                <span>
                                    <span className="block text-sm font-black text-slate-900">{rating.label}</span>
                                    <span className="block text-xs font-bold text-slate-500">{rating.outcome_label}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                    {performanceForm.rating === 'bad' && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Reassign To</label>
                            <select required className={fieldClass} value={performanceForm.target_department} onChange={(e) => setPerformanceForm({ ...performanceForm, target_department: e.target.value })}>
                                <option value="" disabled>Choose a department</option>
                                {(catalog.departments || []).map((office) => (
                                    <option key={office} value={office}>{office}</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                                {isCoordinator ? 'Saving this moves the student to that department.' : 'The coordinator confirms the move.'}
                            </p>
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Notes</label>
                        <textarea className={`${fieldClass} h-24 font-medium`} value={performanceForm.notes} onChange={(e) => setPerformanceForm({ ...performanceForm, notes: e.target.value })} placeholder="What stood out this year..." />
                    </div>
                    {error && <p className="text-sm font-bold text-red-600">{error}</p>}
                    <button type="submit" disabled={isSubmitting || !performanceForm.student_id} className="w-full py-3.5 bg-slate-900 hover:bg-red-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                        <Send className="w-5 h-5" /> {isSubmitting ? 'Saving...' : 'Save Review'}
                    </button>
                </form>
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
                    {reviews.length === 0 && (
                        <div className="md:col-span-2 bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-500 font-medium">No performance reviews yet.</div>
                    )}
                    {reviews.map((review) => {
                        const rating = catalog.ratings?.[review.rating];
                        const counts = offenseCount[review.student_id] || { minor: 0, major: 0 };
                        return (
                            <article key={review.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{review.school_year}</p>
                                <h4 className="font-black text-slate-900 text-lg mt-1">{review.student?.name || 'Student'}</h4>
                                <p className="text-sm font-bold text-slate-700 mt-2">{rating?.label || review.rating}</p>
                                <p className="text-sm font-black text-red-700">{rating?.outcome_label || review.outcome}</p>
                                {review.target_department && <p className="text-xs font-medium text-slate-500 mt-2">Reassign to {review.target_department}</p>}
                                <p className="text-xs font-bold text-slate-400 mt-3">{counts.minor} minor · {counts.major} major offense{counts.major === 1 ? '' : 's'}</p>
                                {review.notes && <p className="text-sm text-slate-600 mt-3">{review.notes}</p>}
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-4">Recorded by {review.recorder?.name || 'Staff'}</p>
                            </article>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <form onSubmit={saveYearEndAward} className="lg:col-span-1 bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 space-y-5">
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-500" /> Year-end Award
                </h3>
                <p className="text-xs font-medium text-slate-500">
                    The organization awards the best performing students at the end of the year. The coordinator records it. Supervisors can read the list for their students.
                </p>
                {isCoordinator ? (
                    <>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Student Worker</label>
                            <select required className={fieldClass} value={awardForm.student_id} onChange={(e) => setAwardForm({ ...awardForm, student_id: e.target.value })}>
                                <option value="" disabled>Select a student</option>
                                {students.map((student) => (
                                    <option key={student.id} value={student.id}>{studentLabel(student)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">School Year</label>
                            <input required className={fieldClass} value={awardForm.school_year} onChange={(e) => setAwardForm({ ...awardForm, school_year: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Award</label>
                            <input required className={fieldClass} value={awardForm.title} onChange={(e) => setAwardForm({ ...awardForm, title: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Citation</label>
                            <textarea className={`${fieldClass} h-24 font-medium`} value={awardForm.citation} onChange={(e) => setAwardForm({ ...awardForm, citation: e.target.value })} placeholder="Why this student was recognized..." />
                        </div>
                        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
                        <button type="submit" disabled={isSubmitting || !awardForm.student_id} className="w-full py-3.5 bg-slate-900 hover:bg-amber-500 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                            <Award className="w-5 h-5" /> {isSubmitting ? 'Saving...' : 'Record Award'}
                        </button>
                    </>
                ) : (
                    <p className="text-sm font-medium text-slate-600 bg-amber-50 border border-amber-100 rounded-xl p-4">The WSPO coordinator records the organization's year-end awards. You can review the students in your department here.</p>
                )}
            </form>
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
                {awards.length === 0 && (
                    <div className="md:col-span-2 bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-500 font-medium">No year-end awards recorded yet.</div>
                )}
                {awards.map((award) => (
                    <article key={award.id} className="bg-white p-6 rounded-3xl border border-amber-100 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">{award.school_year}</p>
                        <h4 className="font-black text-slate-900 text-lg mt-1">{award.title}</h4>
                        <p className="text-sm font-bold text-slate-700 mt-2">{award.student?.name || 'Student'}</p>
                        {award.citation && <p className="text-sm text-slate-600 mt-3">{award.citation}</p>}
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-4">Recorded by {award.awarder?.name || 'Coordinator'}</p>
                    </article>
                ))}
            </div>
        </div>
    );
};
