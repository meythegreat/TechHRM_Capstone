import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { ConductPanels } from './ConductPanels';
import ComboFilter from './ComboFilter';
import { HelpDisclosure } from './HelpDisclosure';
import CoverageHoldNotice from './CoverageHoldNotice';
import { secretaryCoverageLocked } from '../utils/coverageHold';
import {
    decideViolation,
    getAllViolations,
    getConductCatalog,
    issueViolation,
    resolveViolation,
} from '../services/disciplinaryService';
import { withHomeDepartmentNote } from '../utils/studentAssignment';
import UserAvatar from './UserAvatar';
import { REALTIME_EVENT } from '../utils/realtime';
import { bindPopup } from '../utils/popupDismiss';
import {
    Scale,
    ShieldAlert,
    ShieldCheck,
    CheckCircle2,
    AlertTriangle,
    Clock,
    FileWarning,
    X,
    Gavel,
    Send,
    Search,
    AlertCircle,
} from 'lucide-react';

const DisciplinaryManager = () => {
    const currentUserRole = localStorage.getItem('user_role') || '';
    const isAudit = currentUserRole === 'Super Admin';
    const isCoordinator = currentUserRole === 'WSPO Staff';
    const [auditFilters, setAuditFilters] = useState({ name: '', department: '', offense: '' });
    const [departments, setDepartments] = useState([]);
    const [records, setRecords] = useState([]);
    const [students, setStudents] = useState([]);
    const [studentQuery, setStudentQuery] = useState('');
    const emptyForm = () => ({
        student_id: '',
        violation_type: 'Late',
        incident_date: new Date().toISOString().split('T')[0],
        description: '',
        penalty: '',
        penalty_hours: '',
        resolution_remarks: '',
        suspension_span: '',
        suspension_days: '1',
        suspension_reason: '',
    });
    const [formData, setFormData] = useState(emptyForm);
    const [formError, setFormError] = useState('');
    const [resolveModal, setResolveModal] = useState(null);
    const [resolveData, setResolveData] = useState({ status: 'Resolved', resolution_remarks: '' });
    const [decideModal, setDecideModal] = useState(null);
    const [decideData, setDecideData] = useState({
        penalty: 'Suspension',
        penalty_hours: '',
        resolution_remarks: '',
        suspension_span: '',
        suspension_days: '1',
        suspension_reason: '',
    });
    const [decideError, setDecideError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [section, setSection] = useState('offenses');
    const [coverageHold, setCoverageHold] = useState(secretaryCoverageLocked);
    const [offenseCatalog, setOffenseCatalog] = useState({
        minor: [],
        major: [],
        escalation_rules: [],
    });

    useEffect(() => {
        if (secretaryCoverageLocked()) {
            setCoverageHold(true);
            setIsLoading(false);
            return;
        }
        if (isAudit) {
            axios
                .get('/api/offices')
                .then((res) => {
                    const names = (Array.isArray(res.data) ? res.data : [])
                        .map((office) => office.name)
                        .filter(Boolean);
                    setDepartments(names);
                })
                .catch(() => setDepartments([]));
        }
        fetchRecords();
        const refresh = () => fetchRecords(true);
        const interval = setInterval(refresh, 5000);
        window.addEventListener(REALTIME_EVENT, refresh);
        getConductCatalog()
            .then((res) =>
                setOffenseCatalog({
                    minor: res.data.minor || [],
                    major: res.data.major || [],
                    escalation_rules: res.data.escalation_rules || [],
                })
            )
            .catch(() => {});

        if (!secretaryCoverageLocked()) axios
            .get('/api/personnel')
            .then((res) => {
                const usersArray = Array.isArray(res.data) ? res.data : res.data?.data;
                if (!Array.isArray(usersArray)) {
                    console.error('Could not find an array of users in the response', res.data);
                    setStudents([]);
                    return;
                }
                const studentUsers = usersArray.filter(
                    (user) => user.role && user.role.toLowerCase() === 'student'
                );
                setStudents(studentUsers);
            })
            .catch((err) => console.error('Failed to load students', err));

        return () => {
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, refresh);
        };
    }, []);

    const fetchRecords = async (silent = false) => {
        if (secretaryCoverageLocked()) {
            setCoverageHold(true);
            if (!silent) setIsLoading(false);
            return;
        }
        setCoverageHold(false);
        if (!silent) setIsLoading(true);
        try {
            const res = await getAllViolations();
            setRecords(res.data);
        } catch (err) {
            if (secretaryCoverageLocked()) {
                setCoverageHold(true);
                return;
            }
            console.error('Failed to fetch records', err);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const apiError = (err, fallback) => {
        const errors = err?.response?.data?.errors;
        if (errors) {
            const first = Object.values(errors)[0];
            if (Array.isArray(first) && first[0]) return first[0];
        }
        return err?.response?.data?.message || fallback;
    };

    const suspensionProblem = (data) => {
        if (data.penalty !== 'Suspension') return '';
        if (!data.suspension_span) return 'Choose how long the suspension lasts.';
        if (
            data.suspension_span === 'days' &&
            (Number(data.suspension_days) < 1 || Number(data.suspension_days) > 7)
        ) {
            return 'Choose 1 to 7 days.';
        }
        if (!String(data.suspension_reason || '').trim()) {
            return 'Explain why the student is suspended.';
        }
        return '';
    };

    const suspensionPayload = (data) =>
        data.penalty === 'Suspension'
            ? {
                  suspension_span: data.suspension_span,
                  suspension_days:
                      data.suspension_span === 'days' ? Number(data.suspension_days) : undefined,
                  suspension_reason: data.suspension_reason,
              }
            : {};

    const handleIssue = async (e) => {
        e.preventDefault();
        setFormError('');
        if (
            isCoordinator &&
            formData.penalty === 'DTR Deduction' &&
            Number(formData.penalty_hours) < 0.5
        ) {
            setFormError('Enter the number of duty hours to deduct.');
            return;
        }
        const suspensionError = suspensionProblem(formData);
        if (isCoordinator && suspensionError) {
            setFormError(suspensionError);
            return;
        }
        setIsSubmitting(true);
        try {
            const payload = isCoordinator
                ? {
                      student_id: formData.student_id,
                      violation_type: formData.violation_type,
                      incident_date: formData.incident_date,
                      description: formData.description,
                      penalty: formData.penalty,
                      penalty_hours:
                          formData.penalty === 'DTR Deduction'
                              ? Number(formData.penalty_hours)
                              : undefined,
                      resolution_remarks:
                          formData.penalty === 'Dismissed'
                              ? formData.resolution_remarks
                              : undefined,
                      ...suspensionPayload(formData),
                  }
                : {
                      student_id: formData.student_id,
                      violation_type: formData.violation_type,
                      incident_date: formData.incident_date,
                      description: formData.description,
                  };
            await issueViolation(payload);
            setFormData(emptyForm());
            fetchRecords();
        } catch (err) {
            console.error('Failed to issue violation', err);
            setFormError(apiError(err, 'Could not issue this infraction.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const openDecide = (record) => {
        setDecideError('');
        setDecideData({
            penalty: 'Suspension',
            penalty_hours: '',
            resolution_remarks: '',
            suspension_span: '',
            suspension_days: '1',
            suspension_reason: '',
        });
        setDecideModal(record);
    };

    const handleDecide = async () => {
        if (!decideModal) return;
        if (decideData.penalty === 'DTR Deduction' && Number(decideData.penalty_hours) < 0.5) {
            setDecideError('Enter the number of duty hours to deduct.');
            return;
        }
        const suspensionError = suspensionProblem(decideData);
        if (suspensionError) {
            setDecideError(suspensionError);
            return;
        }
        setIsSubmitting(true);
        setDecideError('');
        try {
            await decideViolation(decideModal.id, {
                penalty: decideData.penalty,
                penalty_hours:
                    decideData.penalty === 'DTR Deduction'
                        ? Number(decideData.penalty_hours)
                        : undefined,
                resolution_remarks:
                    decideData.penalty === 'Dismissed' ? decideData.resolution_remarks : undefined,
                ...suspensionPayload(decideData),
            });
            setDecideModal(null);
            fetchRecords();
        } catch (err) {
            console.error('Failed to decide infraction', err);
            setDecideError(apiError(err, 'Could not save this decision.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResolve = async (status = 'Resolved') => {
        if (!resolveData.resolution_remarks.trim() || !resolveModal) return;

        const recordId = resolveModal.id || resolveModal;
        const payload = { status, resolution_remarks: resolveData.resolution_remarks };
        setRecords((prev) =>
            prev.map((r) =>
                r.id === recordId
                    ? {
                          ...r,
                          status,
                          resolution_remarks: resolveData.resolution_remarks,
                          penalty_hours: status === 'Dismissed' ? 0 : r.penalty_hours,
                          penalty: status === 'Dismissed' ? 'Dismissed' : r.penalty,
                      }
                    : r
            )
        );

        setResolveModal(null);
        setResolveData({ status: 'Resolved', resolution_remarks: '' });

        try {
            await resolveViolation(recordId, payload);
            fetchRecords();
        } catch (err) {
            console.error('Failed to resolve violation', err);
            fetchRecords();
        }
    };

    const needsDecision = (record) =>
        isCoordinator &&
        record.penalty === 'Pending' &&
        !['Resolved', 'Dismissed'].includes(record.status);

    const activeCasesCount = records.filter((r) => r.status !== 'Resolved').length;

    const visibleRecords = useMemo(() => {
        if (!isAudit) return records;
        const name = auditFilters.name.trim().toLowerCase();
        const department = auditFilters.department.trim();
        const offense = auditFilters.offense.trim().toLowerCase();
        return records.filter((record) => {
            if (name && !String(record.student?.name || '').toLowerCase().includes(name))
                return false;
            const office = String(record.student?.profile?.assigned_office || '');
            if (department && office !== department) return false;
            if (
                offense &&
                !`${record.violation_type || ''} ${record.offense_level || ''}`
                    .toLowerCase()
                    .includes(offense)
            ) {
                return false;
            }
            return true;
        });
    }, [records, isAudit, auditFilters]);

    const recordAccent = (record) => {
        if (record.status === 'Resolved') return 'bg-emerald-500';
        if (record.status === 'Dismissed') return 'bg-slate-300';
        if (record.penalty === 'Pending') return 'bg-amber-500';
        return 'bg-rose-500';
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.06 } },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 14 },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
        },
    };

    if (coverageHold) {
        return <CoverageHoldNotice />;
    }

    if (isLoading) {
        return (
            <div
                className="mx-auto max-w-7xl space-y-6 p-4 animate-pulse sm:p-8"
                aria-busy="true"
                aria-label="Loading compliance data"
            >
                <div className="h-44 rounded-[2rem] bg-slate-900/90" />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="h-96 rounded-[1.75rem] bg-slate-200/80 lg:col-span-1" />
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:col-span-2">
                        <div className="h-56 rounded-[1.75rem] bg-slate-200/80" />
                        <div className="h-56 rounded-[1.75rem] bg-slate-200/80" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
            {/* OBSIDIAN CONDUCT COMMAND HERO */}
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
                    className={`pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl ${
                        activeCasesCount > 0 ? 'bg-rose-500/25' : 'bg-emerald-500/20'
                    }`}
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
                                activeCasesCount > 0
                                    ? 'border-rose-400/25 bg-rose-500/15 text-rose-300'
                                    : 'border-emerald-400/25 bg-emerald-500/15 text-emerald-300'
                            }`}
                        >
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Conduct &amp; Compliance
                        </span>
                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Infraction Manager
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            {isAudit
                                ? 'Audit recorded student infractions across departments.'
                                : 'Manage student infractions, performance reviews, and year-end awards.'}
                        </p>
                    </div>

                    {/* Frosted Active Cases Card */}
                    <div className="flex shrink-0 items-center gap-4 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                activeCasesCount > 0
                                    ? 'bg-rose-500/20 text-rose-300 ring-rose-400/30'
                                    : 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/30'
                            }`}
                        >
                            {activeCasesCount > 0 ? (
                                <AlertTriangle className="h-6 w-6 animate-pulse" />
                            ) : (
                                <ShieldCheck className="h-6 w-6" />
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Active Cases
                            </p>
                            <p
                                className={`mt-0.5 text-base font-black ${
                                    activeCasesCount > 0 ? 'text-rose-300' : 'text-emerald-300'
                                }`}
                            >
                                {activeCasesCount > 0
                                    ? `${activeCasesCount} Unresolved Case${activeCasesCount === 1 ? '' : 's'}`
                                    : 'All Cases Resolved'}
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            {/* SEGMENTED SECTION TABS */}
            {!isAudit && (
                <div className="inline-flex flex-wrap rounded-xl border border-slate-200/90 bg-white p-1 shadow-2xs">
                    {[
                        ['offenses', 'Offenses'],
                        ['performance', 'Performance'],
                        ['awards', 'Year-end Awards'],
                    ].map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setSection(id)}
                            className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                                section === id
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {!isAudit && section !== 'offenses' && (
                <ConductPanels
                    section={section}
                    students={students}
                    records={records}
                    isCoordinator={isCoordinator}
                />
            )}

            {(isAudit || section === 'offenses') && (
                <div className="space-y-6">
                    {isAudit && (
                        <div className="grid grid-cols-1 gap-3 rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm md:grid-cols-3">
                            <input
                                value={auditFilters.name}
                                onChange={(event) =>
                                    setAuditFilters({ ...auditFilters, name: event.target.value })
                                }
                                placeholder="Student name…"
                                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                            />
                            <ComboFilter
                                commitOnType={false}
                                value={auditFilters.department}
                                onChange={(department) =>
                                    setAuditFilters({ ...auditFilters, department })
                                }
                                options={departments}
                                placeholder="All departments"
                                emptyLabel="All departments"
                            />
                            <input
                                value={auditFilters.offense}
                                onChange={(event) =>
                                    setAuditFilters({
                                        ...auditFilters,
                                        offense: event.target.value,
                                    })
                                }
                                placeholder="Type of offense…"
                                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
                        {/* LEFT COLUMN: ISSUE / REPORT INFRACTION FORM */}
                        {!isAudit && (
                            <motion.section
                                initial={{ opacity: 0, x: -16 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.08 }}
                                className="sticky top-6 rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-7 lg:col-span-1"
                            >
                                <div className="mb-5 flex items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm shadow-rose-600/25">
                                        <Gavel className="h-5 w-5" />
                                    </span>
                                    <div>
                                        <h3 className="text-base font-black tracking-tight text-slate-900">
                                            {isCoordinator ? 'Issue Infraction' : 'Report Infraction'}
                                        </h3>
                                        <p className="text-xs font-medium text-slate-500">
                                            {isCoordinator
                                                ? 'Log an offense and assign its penalty'
                                                : 'Submit a report for WSPO coordinator review'}
                                        </p>
                                    </div>
                                </div>

                                <form onSubmit={handleIssue} className="space-y-4">
                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Student Worker
                                        </label>
                                        {isCoordinator && (
                                            <p className="mb-2 text-[11px] font-medium text-slate-500">
                                                Every registered working student is listed.
                                            </p>
                                        )}
                                        <div className="relative mb-2">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            <input
                                                value={studentQuery}
                                                onChange={(event) =>
                                                    setStudentQuery(event.target.value)
                                                }
                                                placeholder="Search name, ID, or office…"
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20"
                                            />
                                        </div>
                                        <select
                                            required
                                            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none transition focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20"
                                            value={formData.student_id}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    student_id: e.target.value,
                                                })
                                            }
                                        >
                                            <option value="" disabled>
                                                -- Select a student --
                                            </option>
                                            {students
                                                .filter((student) => {
                                                    const query = studentQuery.trim().toLowerCase();
                                                    if (!query) return true;
                                                    const haystack =
                                                        `${student.name || ''} ${student.profile?.student_id_number || ''} ${student.profile?.assigned_office || ''}`.toLowerCase();
                                                    return haystack.includes(query);
                                                })
                                                .map((s) => (
                                                    <option key={s.id} value={s.id}>
                                                        {withHomeDepartmentNote(
                                                            `${s.name} (${s.profile?.student_id_number || 'No ID'})`,
                                                            s.profile?.course,
                                                            s.profile?.assigned_office,
                                                            s.profile?.year_level
                                                        )}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Violation Type
                                        </label>
                                        <select
                                            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none transition focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20"
                                            value={formData.violation_type}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    violation_type: e.target.value,
                                                })
                                            }
                                        >
                                            <optgroup label="Minor offenses">
                                                {(offenseCatalog.minor.length
                                                    ? offenseCatalog.minor
                                                    : [{ name: 'Late' }]
                                                ).map((offense) => (
                                                    <option key={offense.name} value={offense.name}>
                                                        {offense.name}
                                                    </option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="Major offenses">
                                                {(offenseCatalog.major.length
                                                    ? offenseCatalog.major
                                                    : [{ name: 'Absent' }, { name: 'AWOL' }]
                                                ).map((offense) => (
                                                    <option key={offense.name} value={offense.name}>
                                                        {offense.name}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        </select>
                                        {formData.violation_type === 'Late' && (
                                            <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                                                Minor offense — penalties are decided case by case.
                                            </p>
                                        )}
                                        {(formData.violation_type === 'Absent' ||
                                            formData.violation_type === 'AWOL') && (
                                            <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                                                Major offense — subject to automatic suspension escalation rules.
                                            </p>
                                        )}
                                    </div>

                                    {offenseCatalog.escalation_rules?.length > 0 && (
                                        <HelpDisclosure
                                            variant="inline"
                                            title="Escalation guidelines"
                                            items={[
                                                'Only department supervisors and the WSPO coordinator access and manage these conduct records.',
                                                ...offenseCatalog.escalation_rules.map((rule) => rule.label),
                                            ]}
                                        />
                                    )}

                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Incident Description
                                        </label>
                                        <textarea
                                            required
                                            className="h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20"
                                            placeholder="Describe the incident in detail…"
                                            value={formData.description}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    description: e.target.value,
                                                })
                                            }
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Incident Date
                                        </label>
                                        <input
                                            required
                                            type="date"
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none transition focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20"
                                            value={formData.incident_date}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    incident_date: e.target.value,
                                                })
                                            }
                                        />
                                    </div>

                                    {isCoordinator ? (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                    Penalty Decision
                                                </label>
                                                <select
                                                    required
                                                    className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none transition focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20"
                                                    value={formData.penalty}
                                                    onChange={(e) =>
                                                        setFormData({
                                                            ...formData,
                                                            penalty: e.target.value,
                                                        })
                                                    }
                                                >
                                                    <option value="" disabled>
                                                        Choose a penalty
                                                    </option>
                                                    <option value="Suspension">Suspension</option>
                                                    <option value="DTR Deduction">
                                                        DTR deduction of duty
                                                    </option>
                                                    <option value="Dismissed">
                                                        Dismiss infraction
                                                    </option>
                                                </select>
                                                <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                                                    {formData.penalty === 'Suspension' &&
                                                        'The student cannot clock in until the suspension ends.'}
                                                    {formData.penalty === 'DTR Deduction' &&
                                                        "These hours are removed from the student's official DTR."}
                                                    {formData.penalty === 'Dismissed' &&
                                                        'No penalty is applied. The infraction is closed as dismissed.'}
                                                    {!formData.penalty &&
                                                        'Suspension, a duty-hour deduction, or dismissal.'}
                                                </p>
                                            </div>

                                            {formData.penalty === 'Suspension' && (
                                                <>
                                                    <div>
                                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                            Suspension Length
                                                        </label>
                                                        <select
                                                            required
                                                            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none transition focus:border-rose-500 focus:bg-white"
                                                            value={formData.suspension_span}
                                                            onChange={(e) =>
                                                                setFormData({
                                                                    ...formData,
                                                                    suspension_span: e.target.value,
                                                                })
                                                            }
                                                        >
                                                            <option value="" disabled>
                                                                Choose a length
                                                            </option>
                                                            <option value="days">1–7 days</option>
                                                            <option value="2 weeks">2 weeks</option>
                                                            <option value="3 weeks">3 weeks</option>
                                                            <option value="1 month">1 month</option>
                                                            <option value="1 semester">
                                                                1 semester
                                                            </option>
                                                        </select>
                                                    </div>

                                                    {formData.suspension_span === 'days' && (
                                                        <div>
                                                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                                Number of Days
                                                            </label>
                                                            <select
                                                                required
                                                                className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none transition focus:border-rose-500 focus:bg-white"
                                                                value={formData.suspension_days}
                                                                onChange={(e) =>
                                                                    setFormData({
                                                                        ...formData,
                                                                        suspension_days:
                                                                            e.target.value,
                                                                    })
                                                                }
                                                            >
                                                                {[1, 2, 3, 4, 5, 6, 7].map(
                                                                    (day) => (
                                                                        <option
                                                                            key={day}
                                                                            value={day}
                                                                        >
                                                                            {day}{' '}
                                                                            {day === 1
                                                                                ? 'day'
                                                                                : 'days'}
                                                                        </option>
                                                                    )
                                                                )}
                                                            </select>
                                                        </div>
                                                    )}

                                                    {formData.suspension_span === '1 semester' && (
                                                        <p className="-mt-1 text-[11px] font-medium text-slate-400">
                                                            Ends on the current semester end date when set; otherwise lasts the configured semester length.
                                                        </p>
                                                    )}

                                                    <div>
                                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                            Reason for Suspension
                                                        </label>
                                                        <textarea
                                                            required
                                                            className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-500 focus:bg-white"
                                                            placeholder="Explain why this student is suspended…"
                                                            value={formData.suspension_reason}
                                                            onChange={(e) =>
                                                                setFormData({
                                                                    ...formData,
                                                                    suspension_reason:
                                                                        e.target.value,
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                </>
                                            )}

                                            {formData.penalty === 'DTR Deduction' && (
                                                <div>
                                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                        Hours to Deduct
                                                    </label>
                                                    <div className="relative">
                                                        <input
                                                            required
                                                            type="number"
                                                            min="0.5"
                                                            step="0.5"
                                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 pr-12 font-mono text-sm font-bold text-slate-900 outline-none transition focus:border-rose-500 focus:bg-white"
                                                            value={formData.penalty_hours}
                                                            onChange={(e) =>
                                                                setFormData({
                                                                    ...formData,
                                                                    penalty_hours: e.target.value,
                                                                })
                                                            }
                                                        />
                                                        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-bold text-slate-400">
                                                            hrs
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {formData.penalty === 'Dismissed' && (
                                                <div>
                                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                        Dismissal Note
                                                    </label>
                                                    <textarea
                                                        className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-500 focus:bg-white"
                                                        placeholder="Why this infraction is dismissed…"
                                                        value={formData.resolution_remarks}
                                                        onChange={(e) =>
                                                            setFormData({
                                                                ...formData,
                                                                resolution_remarks: e.target.value,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 text-xs font-medium text-slate-500">
                                            The WSPO coordinator will choose suspension, a DTR hour deduction, or dismissal.
                                        </p>
                                    )}

                                    {formError && (
                                        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            <span>{formError}</span>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={
                                            isSubmitting ||
                                            !formData.student_id ||
                                            (isCoordinator && !formData.penalty)
                                        }
                                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isSubmitting ? (
                                            'Saving…'
                                        ) : (
                                            <>
                                                <Send className="h-4 w-4" />
                                                {isCoordinator
                                                    ? 'Issue Infraction'
                                                    : 'Report Infraction'}
                                            </>
                                        )}
                                    </button>
                                </form>
                            </motion.section>
                        )}

                        {/* RIGHT COLUMN: CASE CARDS GRID */}
                        <div className={isAudit ? 'lg:col-span-3' : 'lg:col-span-2'}>
                            {visibleRecords.length === 0 ? (
                                <div className="flex flex-col items-center rounded-[1.75rem] border border-emerald-200/80 bg-gradient-to-br from-white via-white to-emerald-50/40 p-16 text-center shadow-sm">
                                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 ring-1 ring-emerald-200">
                                        <ShieldCheck className="h-8 w-8" />
                                    </div>
                                    <h3 className="text-lg font-black text-slate-900">
                                        No Disciplinary Records
                                    </h3>
                                    <p className="mt-1 text-xs font-medium text-slate-500">
                                        All students currently have clean conduct records.
                                    </p>
                                </div>
                            ) : (
                                <motion.div
                                    variants={containerVariants}
                                    initial="hidden"
                                    animate="show"
                                    className="grid grid-cols-1 gap-5 md:grid-cols-2"
                                >
                                    <AnimatePresence>
                                        {visibleRecords.map((record) => (
                                            <motion.article
                                                layout
                                                variants={itemVariants}
                                                key={record.id}
                                                className="group relative flex flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
                                            >
                                                {/* Left Semantic Accent Bar */}
                                                <span
                                                    aria-hidden="true"
                                                    className={`absolute inset-y-4 left-0 w-1.5 rounded-r-full ${recordAccent(
                                                        record
                                                    )}`}
                                                />

                                                <div className="mb-4 flex items-start justify-between gap-3 pl-2">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
                                                            record.status === 'Resolved'
                                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                : record.status === 'Dismissed'
                                                                  ? 'border-slate-200 bg-slate-100 text-slate-600'
                                                                  : record.penalty === 'Pending'
                                                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                                    : 'border-rose-200 bg-rose-50 text-rose-700'
                                                        }`}
                                                    >
                                                        {['Resolved', 'Dismissed'].includes(
                                                            record.status
                                                        ) ? (
                                                            <CheckCircle2 className="h-3 w-3" />
                                                        ) : (
                                                            <AlertTriangle className="h-3 w-3" />
                                                        )}
                                                        {record.penalty === 'Pending' &&
                                                        record.status === 'Active'
                                                            ? 'Awaiting decision'
                                                            : record.status || 'Pending'}
                                                    </span>

                                                    <div className="flex flex-col items-end gap-1">
                                                        {record.penalty &&
                                                            record.penalty !== 'Pending' && (
                                                                <span className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-700">
                                                                    {record.penalty ===
                                                                    'DTR Deduction'
                                                                        ? 'DTR deduction'
                                                                        : record.penalty}
                                                                </span>
                                                            )}
                                                        {record.penalty === 'Suspension' &&
                                                            record.suspension_length && (
                                                                <span className="rounded-lg bg-rose-50 px-2.5 py-0.5 text-[10px] font-extrabold text-rose-700 ring-1 ring-rose-200/70">
                                                                    {record.suspension_length}
                                                                </span>
                                                            )}
                                                        {record.penalty === 'DTR Deduction' &&
                                                            Number(record.penalty_hours) > 0 && (
                                                                <span className="rounded-lg bg-rose-50 px-2.5 py-0.5 font-mono text-[11px] font-black text-rose-700 ring-1 ring-rose-200/70">
                                                                    -{record.penalty_hours} hrs
                                                                </span>
                                                            )}
                                                        {Number(record.deduction_amount || 0) >
                                                            0 && (
                                                            <span className="rounded-lg bg-rose-50 px-2.5 py-0.5 font-mono text-[11px] font-black text-rose-700 ring-1 ring-rose-200/70">
                                                                -₱
                                                                {Number(
                                                                    record.deduction_amount
                                                                ).toFixed(2)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex-1 pl-2">
                                                    <h4 className="mb-1 text-base font-black leading-snug text-slate-900 transition-colors group-hover:text-rose-700">
                                                        {record.violation_type ||
                                                            'Standard Violation'}
                                                    </h4>

                                                    {record.offense_level && (
                                                        <p
                                                            className={`mb-2 text-[10px] font-extrabold uppercase tracking-widest ${
                                                                record.offense_level === 'major'
                                                                    ? 'text-rose-600'
                                                                    : 'text-amber-600'
                                                            }`}
                                                        >
                                                            {record.offense_level} offense
                                                        </p>
                                                    )}

                                                    <p className="mb-3 line-clamp-3 text-xs font-medium leading-relaxed text-slate-600">
                                                        {record.description || (
                                                            <span className="italic opacity-60">
                                                                No description provided.
                                                            </span>
                                                        )}
                                                    </p>

                                                    <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                                                        <Clock className="h-3.5 w-3.5" />
                                                        Incident:{' '}
                                                        {record.incident_date
                                                            ? new Date(
                                                                  record.incident_date
                                                              ).toLocaleDateString()
                                                            : new Date(
                                                                  record.created_at
                                                              ).toLocaleDateString()}
                                                    </p>

                                                    {record.penalty === 'Suspension' &&
                                                        record.suspension_reason && (
                                                            <p className="mb-3 rounded-xl border border-rose-200/70 bg-rose-50/70 p-2.5 text-xs font-medium text-rose-900">
                                                                <strong className="font-extrabold">
                                                                    Suspended
                                                                    {record.suspension_ends_at
                                                                        ? ` until ${new Date(record.suspension_ends_at).toLocaleDateString()}`
                                                                        : ''}
                                                                    :
                                                                </strong>{' '}
                                                                {record.suspension_reason}
                                                            </p>
                                                        )}
                                                </div>

                                                {/* Footer: Student & Actions */}
                                                <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pl-2 pt-4">
                                                    <div className="flex min-w-0 items-center gap-2 text-xs font-bold text-slate-800">
                                                        <UserAvatar
                                                            name={record.student?.name}
                                                            picture={
                                                                record.student?.profile_picture
                                                            }
                                                            className="h-7 w-7 shrink-0 rounded-full border border-slate-200 bg-slate-100 text-[10px] text-slate-600"
                                                        />
                                                        <span className="truncate">
                                                            {record.student?.name ||
                                                                'Unknown Student'}
                                                        </span>
                                                        {record.student?.deleted_at && (
                                                            <span className="shrink-0 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                                                                Deleted
                                                            </span>
                                                        )}
                                                    </div>

                                                    {!isAudit && needsDecision(record) && (
                                                        <button
                                                            onClick={() => openDecide(record)}
                                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rose-600"
                                                        >
                                                            <Gavel className="h-3.5 w-3.5" />
                                                            Decide
                                                        </button>
                                                    )}

                                                    {!isAudit &&
                                                        !needsDecision(record) &&
                                                        record.status !== 'Resolved' &&
                                                        record.status !== 'Dismissed' &&
                                                        (isCoordinator ||
                                                            record.status !== 'Pending Appeal') && (
                                                            <button
                                                                onClick={() =>
                                                                    setResolveModal(record)
                                                                }
                                                                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-emerald-600 hover:bg-emerald-600 hover:text-white"
                                                            >
                                                                <Scale className="h-3.5 w-3.5" />
                                                                {record.status === 'Pending Appeal'
                                                                    ? 'Decide Appeal'
                                                                    : 'Resolve'}
                                                            </button>
                                                        )}

                                                    {!isCoordinator &&
                                                        record.status === 'Pending Appeal' && (
                                                            <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-blue-600">
                                                                Awaiting coordinator
                                                            </span>
                                                        )}
                                                </div>

                                                {record.appeal_notes && (
                                                    <div className="ml-2 mt-3.5 rounded-xl border border-blue-200/80 bg-blue-50/70 p-3">
                                                        <p className="mb-1 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-blue-700">
                                                            <FileWarning className="h-3 w-3" />
                                                            Appeal to Coordinator
                                                        </p>
                                                        <p className="text-xs font-medium italic text-blue-900">
                                                            &ldquo;{record.appeal_notes}&rdquo;
                                                        </p>
                                                    </div>
                                                )}

                                                {['Resolved', 'Dismissed'].includes(
                                                    record.status
                                                ) &&
                                                    record.resolution_remarks && (
                                                        <div className="ml-2 mt-3.5 rounded-xl border border-slate-200/80 bg-slate-50 p-3">
                                                            <p className="mb-1 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                                                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                                                Resolution Note
                                                            </p>
                                                            <p className="text-xs font-medium italic text-slate-700">
                                                                &ldquo;{record.resolution_remarks}
                                                                &rdquo;
                                                            </p>
                                                        </div>
                                                    )}
                                            </motion.article>
                                        ))}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* OBSIDIAN RESOLUTION MODAL */}
            <AnimatePresence>
                {resolveModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(() => setResolveModal(null))}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <h3 className="flex items-center gap-2.5 text-base font-black tracking-tight">
                                    <Scale className="h-5 w-5 text-emerald-400" />
                                    Resolve Case
                                </h3>
                                <button
                                    onClick={() => setResolveModal(null)}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="space-y-4 p-6 sm:p-7">
                                <div>
                                    <p className="mb-3 text-xs font-medium leading-relaxed text-slate-500">
                                        {resolveModal.status === 'Pending Appeal'
                                            ? 'The student appealed this case to the WSPO coordinator. Log the official decision below.'
                                            : 'Log official remarks regarding how this disciplinary issue was handled or dismissed.'}
                                    </p>
                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Resolution Remarks
                                    </label>
                                    <textarea
                                        autoFocus
                                        className="h-32 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/20"
                                        placeholder="State why this was dismissed or resolved…"
                                        value={resolveData.resolution_remarks}
                                        onChange={(e) =>
                                            setResolveData({
                                                ...resolveData,
                                                resolution_remarks: e.target.value,
                                            })
                                        }
                                    />
                                </div>

                                <div className="flex flex-wrap justify-end gap-2.5 border-t border-slate-100 pt-4">
                                    <button
                                        onClick={() => setResolveModal(null)}
                                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    {isCoordinator && (
                                        <button
                                            onClick={() => handleResolve('Dismissed')}
                                            disabled={!resolveData.resolution_remarks.trim()}
                                            className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
                                        >
                                            Dismiss Infraction
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleResolve('Resolved')}
                                        disabled={!resolveData.resolution_remarks.trim()}
                                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                        <CheckCircle2 className="h-4 w-4" />
                                        {resolveModal.status === 'Pending Appeal'
                                            ? 'Keep Penalty'
                                            : 'Close Case'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* OBSIDIAN DECIDE PENALTY MODAL */}
            <AnimatePresence>
                {decideModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(() => setDecideModal(null))}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <h3 className="flex items-center gap-2.5 text-base font-black tracking-tight">
                                    <Gavel className="h-5 w-5 text-rose-400" />
                                    Decide Penalty
                                </h3>
                                <button
                                    onClick={() => setDecideModal(null)}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="custom-scrollbar space-y-4 overflow-y-auto p-6 sm:p-7">
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                    <p className="text-sm font-black text-slate-900">
                                        {decideModal.violation_type}
                                    </p>
                                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                                        {decideModal.student?.name} — choose suspension, a DTR hour deduction, or dismissal.
                                    </p>
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Penalty
                                    </label>
                                    <select
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-rose-500 focus:bg-white"
                                        value={decideData.penalty}
                                        onChange={(e) =>
                                            setDecideData({
                                                ...decideData,
                                                penalty: e.target.value,
                                            })
                                        }
                                    >
                                        <option value="Suspension">Suspension</option>
                                        <option value="DTR Deduction">DTR deduction of duty</option>
                                        <option value="Dismissed">Dismiss infraction</option>
                                    </select>
                                </div>

                                {decideData.penalty === 'Suspension' && (
                                    <>
                                        <div>
                                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                Suspension Length
                                            </label>
                                            <select
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-rose-500 focus:bg-white"
                                                value={decideData.suspension_span}
                                                onChange={(e) =>
                                                    setDecideData({
                                                        ...decideData,
                                                        suspension_span: e.target.value,
                                                    })
                                                }
                                            >
                                                <option value="" disabled>
                                                    Choose a length
                                                </option>
                                                <option value="days">1–7 days</option>
                                                <option value="2 weeks">2 weeks</option>
                                                <option value="3 weeks">3 weeks</option>
                                                <option value="1 month">1 month</option>
                                                <option value="1 semester">1 semester</option>
                                            </select>
                                        </div>

                                        {decideData.suspension_span === 'days' && (
                                            <div>
                                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                    Number of Days
                                                </label>
                                                <select
                                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-rose-500 focus:bg-white"
                                                    value={decideData.suspension_days}
                                                    onChange={(e) =>
                                                        setDecideData({
                                                            ...decideData,
                                                            suspension_days: e.target.value,
                                                        })
                                                    }
                                                >
                                                    {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                                                        <option key={day} value={day}>
                                                            {day} {day === 1 ? 'day' : 'days'}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div>
                                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                Reason for Suspension
                                            </label>
                                            <textarea
                                                className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
                                                placeholder="Explain why this student is suspended…"
                                                value={decideData.suspension_reason}
                                                onChange={(e) =>
                                                    setDecideData({
                                                        ...decideData,
                                                        suspension_reason: e.target.value,
                                                    })
                                                }
                                            />
                                        </div>
                                    </>
                                )}

                                {decideData.penalty === 'DTR Deduction' && (
                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Hours to Deduct
                                        </label>
                                        <input
                                            type="number"
                                            min="0.5"
                                            step="0.5"
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm font-bold text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
                                            value={decideData.penalty_hours}
                                            onChange={(e) =>
                                                setDecideData({
                                                    ...decideData,
                                                    penalty_hours: e.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                )}

                                {decideData.penalty === 'Dismissed' && (
                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Dismissal Note
                                        </label>
                                        <textarea
                                            className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
                                            value={decideData.resolution_remarks}
                                            onChange={(e) =>
                                                setDecideData({
                                                    ...decideData,
                                                    resolution_remarks: e.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                )}

                                {decideError && (
                                    <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>{decideError}</span>
                                    </div>
                                )}

                                <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4">
                                    <button
                                        onClick={() => setDecideModal(null)}
                                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDecide}
                                        disabled={isSubmitting}
                                        className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-rose-600 disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Saving…' : 'Save Decision'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default DisciplinaryManager;