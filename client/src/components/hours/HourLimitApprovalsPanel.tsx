import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Printer,
  RotateCcw,
  Send,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  extraHoursService,
  type ExtraHoursMeta,
  type ExtraHoursRequestRow,
  type ExtraHoursStudent,
} from '../../services/extraHoursService';
import { REALTIME_EVENT } from '../../utils/realtime';
import SecureFileViewerModal from '../SecureFileViewerModal';
import { HelpDisclosure } from '../HelpDisclosure';
import FeatureSection from '../FeatureSection';
import ExtraHoursLetter, { printExtraHoursLetter } from './ExtraHoursLetter';

const statusTone = (status: string) => {
  if (status === 'Pending' || status === 'Draft')
    return 'bg-amber-50 text-amber-800 border-amber-200';
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const statusAccent = (status: string) => {
  if (status === 'Pending' || status === 'Draft') return 'bg-amber-500';
  if (status === 'Approved') return 'bg-emerald-500';
  return 'bg-slate-300';
};

const honorific = (gender?: string | null) => {
  const value = String(gender || '').toLowerCase();
  if (value.startsWith('f')) return 'MS.';
  if (value.startsWith('m')) return 'MR.';
  return '';
};

/** Strip any existing Mr/Ms/Mrs/Miss so we never print "MR. MR. …". */
const bareName = (value: string) =>
  value
    .trim()
    .replace(/^(mr|ms|mrs|miss)\.?\s+/i, '')
    .trim();

const letterStudentName = (student: ExtraHoursStudent) => {
  const title = honorific(student.gender);
  const name = bareName(student.name).toUpperCase();
  return title ? `${title} ${name}` : name;
};

const formatLetterDate = (iso = new Date().toISOString().slice(0, 10)) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const periodRange = (start: string, end: string) => {
  const format = (value: string) => {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  return `${format(start)} – ${format(end)}`;
};

type FormState = {
  student_ids: number[];
  duty_description: string;
  period_label: string;
  period_start: string;
  period_end: string;
  requester_title: string;
};

const emptyForm = (): FormState => ({
  student_ids: [],
  duty_description: 'clerical tasks and maintain office cleanliness',
  period_label: '',
  period_start: '',
  period_end: '',
  requester_title: '',
});

export function HourLimitApprovalsPanel({
  readOnly,
  userRole,
  defaultOpen = false,
}: {
  readOnly: boolean;
  userRole?: string | null;
  defaultOpen?: boolean;
}) {
  const role = userRole || localStorage.getItem('user_role') || '';
  const userName = localStorage.getItem('user_name') || localStorage.getItem('name') || '';
  const assignedOffice = localStorage.getItem('assigned_office') || '';
  const canCreate = role === 'Supervisor' && !readOnly;
  const canReview = role === 'WSPO Staff' && !readOnly;

  const [rows, setRows] = useState<ExtraHoursRequestRow[]>([]);
  const [candidates, setCandidates] = useState<ExtraHoursStudent[]>([]);
  const [meta, setMeta] = useState<ExtraHoursMeta | null>(null);
  const [coordinatorName, setCoordinatorName] = useState('');
  const [presidentName, setPresidentName] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [viewerPath, setViewerPath] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState('Signed Extra Hours letter');

  const selectedStudents = useMemo(
    () => candidates.filter((student) => form.student_ids.includes(student.id)),
    [candidates, form.student_ids]
  );

  const load = async (silent = false) => {
    try {
      const [listRes, metaRes, sigRes] = await Promise.all([
        extraHoursService.list(),
        extraHoursService.meta().catch(() => null),
        extraHoursService.signatories().catch(() => null),
      ]);
      setRows(listRes.requests || []);
      if (metaRes) {
        setMeta(metaRes);
        setForm((current) => {
          if (current.period_label || current.period_start) return current;
          return {
            ...current,
            period_label: metaRes.period_label || '',
            period_start: metaRes.semester?.starts_on || '',
            period_end: metaRes.semester?.ends_on || '',
          };
        });
      }
      if (sigRes) {
        setCoordinatorName(sigRes.coordinator || '');
        setPresidentName(sigRes.president || '');
      }
      if (!silent) setNotice('');
    } catch {
      if (!silent) setNotice('Could not load Extra Hours requests.');
    }
  };

  const loadCandidates = async () => {
    if (!canCreate) return;
    try {
      const res = await extraHoursService.candidates();
      setCandidates(res.students || []);
    } catch {
      setCandidates([]);
    }
  };

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) void load(true);
    };
    void load();
    void loadCandidates();
    const interval = setInterval(refresh, 8000);
    window.addEventListener(REALTIME_EVENT, refresh);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener(REALTIME_EVENT, refresh);
    };
  }, []);

  const toggleStudent = (studentId: number) => {
    setForm((current) => {
      const exists = current.student_ids.includes(studentId);
      return {
        ...current,
        student_ids: exists
          ? current.student_ids.filter((id) => id !== studentId)
          : [...current.student_ids, studentId],
      };
    });
  };

  const validateForm = () => {
    if (form.student_ids.length === 0) {
      setNotice('Select at least one working student for the Extra Hours letter.');
      return false;
    }
    if (
      !form.duty_description.trim() ||
      !form.period_label.trim() ||
      !form.period_start ||
      !form.period_end
    ) {
      setNotice('Extra Hours needs duty description, period label, and start/end dates.');
      return false;
    }
    if (form.period_end < form.period_start) {
      setNotice('Period end date must be on or after the start date.');
      return false;
    }
    return true;
  };

  const buildJsonBody = () => ({
    student_ids: form.student_ids,
    duty_description: form.duty_description.trim(),
    period_label: form.period_label.trim(),
    period_start: form.period_start,
    period_end: form.period_end,
    requester_title: form.requester_title.trim() || undefined,
  });

  const appendFormData = (body: FormData) => {
    form.student_ids.forEach((id, index) => body.append(`student_ids[${index}]`, String(id)));
    body.append('duty_description', form.duty_description.trim());
    body.append('period_label', form.period_label.trim());
    body.append('period_start', form.period_start);
    body.append('period_end', form.period_end);
    if (form.requester_title.trim()) {
      body.append('requester_title', form.requester_title.trim());
    }
  };

  const handlePrint = async () => {
    if (!canCreate || !validateForm()) return;
    setBusy(true);
    setNotice('');
    try {
      const res = await extraHoursService.saveDraft(buildJsonBody(), draftId);
      setDraftId(res.request.id);
      setNotice(
        res.message ||
          'Draft saved. Print the letter, collect signatures, then attach the signed scan.'
      );
      await load(true);
      printExtraHoursLetter();
    } catch (error: any) {
      const validation = error?.response?.data?.errors;
      const firstValidation = validation ? Object.values(validation).flat()[0] : null;
      setNotice(
        (typeof firstValidation === 'string' ? firstValidation : null) ||
          error?.response?.data?.message ||
          'Could not save the Extra Hours draft.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreate || !validateForm()) return;
    if (!letterFile) {
      setNotice('Attach the signed Extra Hours approval letter before submitting.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const body = new FormData();
      appendFormData(body);
      body.append('approval_letter', letterFile);
      const res = await extraHoursService.finalize(draftId, body);
      setNotice(res.message || 'Extra Hours request sent to WSPO.');
      setForm({
        ...emptyForm(),
        period_label: meta?.period_label || '',
        period_start: meta?.semester?.starts_on || '',
        period_end: meta?.semester?.ends_on || '',
      });
      setDraftId(null);
      setLetterFile(null);
      await load(true);
    } catch (error: any) {
      const validation = error?.response?.data?.errors;
      const firstValidation = validation ? Object.values(validation).flat()[0] : null;
      setNotice(
        (typeof firstValidation === 'string' ? firstValidation : null) ||
          error?.response?.data?.message ||
          'Could not submit the Extra Hours request.'
      );
    } finally {
      setBusy(false);
    }
  };

  const resumeDraft = (row: ExtraHoursRequestRow) => {
    if (row.status !== 'Draft' || !canCreate) return;
    setDraftId(row.id);
    setForm({
      student_ids: row.students.map((student) => student.id),
      duty_description: row.duty_description || '',
      period_label: row.period_label || '',
      period_start: row.period_start || '',
      period_end: row.period_end || '',
      requester_title: row.requester_title || '',
    });
    setLetterFile(null);
    setNotice(
      'Draft loaded. Print the letter again if needed, then attach the signed scan to send it.'
    );
  };

  const deleteDraft = async (row: ExtraHoursRequestRow) => {
    if (!canCreate || row.status !== 'Draft') return;
    if (!window.confirm('Delete this Extra Hours draft? This cannot be undone.')) return;
    setBusyId(row.id);
    setNotice('');
    try {
      const res = await extraHoursService.deleteDraft(row.id);
      if (draftId === row.id) {
        setDraftId(null);
        setLetterFile(null);
        setForm({
          ...emptyForm(),
          period_label: meta?.period_label || '',
          period_start: meta?.semester?.starts_on || '',
          period_end: meta?.semester?.ends_on || '',
        });
      }
      setNotice(res.message || 'Extra Hours draft deleted.');
      await load(true);
    } catch (error: any) {
      setNotice(error?.response?.data?.message || 'Could not delete that draft.');
    } finally {
      setBusyId(null);
    }
  };

  const viewLetter = (row: ExtraHoursRequestRow) => {
    if (!row.approval_letter_path) return;
    const names = row.students
      .map((student) => student.name)
      .filter(Boolean)
      .join(', ');
    setViewerTitle(names ? `Extra Hours letter · ${names}` : 'Signed Extra Hours letter');
    setViewerPath(row.approval_letter_path);
  };

  const decide = async (row: ExtraHoursRequestRow, status: 'Approved' | 'Rejected') => {
    if (!canReview) {
      setNotice('Only WSPO staff can approve or decline Extra Hours letters.');
      return;
    }
    setBusyId(row.id);
    setNotice('');
    try {
      const res = await extraHoursService.decide(row.id, { status });
      setNotice(
        res.message || (status === 'Approved' ? 'Extra Hours approved.' : 'Extra Hours declined.')
      );
      await load(true);
    } catch (error: any) {
      const validation = error?.response?.data?.errors;
      const firstValidation = validation ? Object.values(validation).flat()[0] : null;
      setNotice(
        (typeof firstValidation === 'string' ? firstValidation : null) ||
          error?.response?.data?.message ||
          'Could not update that Extra Hours request.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter((row) => row.status === 'Pending');
  const drafts = rows.filter((row) => row.status === 'Draft');
  const recent = rows
    .filter((row) => row.status === 'Approved' || row.status === 'Rejected')
    .slice(0, 8);
  const weeklyExtended = meta?.weekly_extended ?? 25;

  return (
    <FeatureSection
      defaultOpen={defaultOpen}
      className="print:hidden"
      title={`Extra Hrs (20 → ${weeklyExtended})`}
      icon={
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
          <Clock className="h-4 w-4" />
        </span>
      }
      badge={
        pending.length > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
            {pending.length} Pending
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
            <CheckCircle2 className="h-3 w-3" />
            Clear
          </span>
        )
      }
    >
      <SecureFileViewerModal
        filePath={viewerPath}
        title={viewerTitle}
        onClose={() => setViewerPath(null)}
      />

      {notice && (
        <div className="mx-6 mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-indigo-600" />
          <span>{notice}</span>
        </div>
      )}

      <div className="space-y-6 p-6">
        <p className="text-xs font-medium text-slate-500">
          Request or review extended weekly limits up to {weeklyExtended} hours per week.
        </p>
        <HelpDisclosure
          variant="inline"
          title="How Extra Hours work"
          items={[
            `Grants approved working students permission to render up to ${weeklyExtended} hours per week instead of the standard 20-hour weekly cap.`,
            'Supervisors save and print the Extra Hours letter, collect wet signatures, and upload the signed scan for WSPO approval.',
            `The monthly maximum remains ${meta?.monthly_max ?? 100} hours; Extra Hours is separate from date-specific Extra Service staffing requests.`,
          ]}
        />

        {/* SUPERVISOR LETTER BUILDER */}
        {canCreate && (
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-black tracking-tight text-slate-900">
                    New Extra Hours Letter
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    {assignedOffice || 'Your office'} ·{' '}
                    {draftId ? `Draft #${draftId}` : 'Unsaved draft'}
                  </p>
                </div>
              </div>
              {form.student_ids.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                  <Users className="h-3 w-3" />
                  {form.student_ids.length} Selected
                </span>
              )}
            </div>

            <div>
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Working Students
              </p>
              {candidates.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4 text-xs font-medium text-slate-500">
                  No students are assigned to your office yet.
                </p>
              ) : (
                <ul className="custom-scrollbar max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                  {candidates.map((student) => {
                    const checked = form.student_ids.includes(student.id);
                    return (
                      <li key={student.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStudent(student.id)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                          />
                          <span className="min-w-0">
                            <span className="font-bold text-slate-900">{student.name}</span>
                            {student.student_id_number && (
                              <span className="font-mono text-xs text-slate-500">
                                {' '}
                                · {student.student_id_number}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Duty Description
                </span>
                <input
                  value={form.duty_description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, duty_description: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                  placeholder="clerical tasks and maintain office cleanliness"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Period Label
                </span>
                <input
                  value={form.period_label}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, period_label: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                  placeholder="1st Semester of Academic Year 2026-2027"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Period Start
                </span>
                <input
                  type="date"
                  value={form.period_start}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, period_start: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Period End
                </span>
                <input
                  type="date"
                  value={form.period_end}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, period_end: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Your Title on the Letter
                </span>
                <input
                  value={form.requester_title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, requester_title: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                  placeholder="Department Supervisor"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  <Upload className="h-3.5 w-3.5 text-slate-400" />
                  Signed Letter Scan (PDF, JPG, PNG)
                </span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event) => setLetterFile(event.target.files?.[0] || null)}
                  className="w-full rounded-xl border border-dashed border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-indigo-600"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePrint()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-2xs transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                {busy ? 'Saving…' : 'Save & Print Letter'}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-indigo-600 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {busy ? 'Sending…' : 'Submit Signed Letter to WSPO'}
              </button>
            </div>

            <ExtraHoursLetter
              preview
              data={{
                date: formatLetterDate(),
                department: assignedOffice,
                supervisorName: userName,
                supervisorTitle: form.requester_title || 'Department Supervisor',
                coordinatorName,
                presidentName,
                studentNames: selectedStudents.map(letterStudentName),
                periodLabel: form.period_label,
                dutyDescription: form.duty_description,
                weeklyHours: weeklyExtended,
              }}
            />
          </form>
        )}

        {/* SAVED DRAFTS */}
        {canCreate && drafts.length > 0 && (
          <div>
            <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Your Drafts ({drafts.length})
            </p>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {drafts.map((row) => (
                <li
                  key={row.id}
                  className="relative flex flex-col justify-between gap-3 overflow-hidden rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-2xs sm:flex-row sm:items-center"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-amber-400"
                  />
                  <div className="min-w-0 pl-2">
                    <p className="truncate text-sm font-extrabold text-slate-900">
                      {row.students.map((student) => student.name).join(', ') || 'No students'}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">{row.period_label}</p>
                  </div>
                  <div className="flex shrink-0 gap-2 pl-2 sm:pl-0">
                    <button
                      type="button"
                      onClick={() => resumeDraft(row)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Resume
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void deleteDraft(row)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {busyId === row.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* PENDING WSPO REVIEW */}
        <div>
          <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            Pending WSPO Review ({pending.length})
          </p>
          {pending.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-8 text-center">
              <p className="text-xs font-semibold text-slate-500">
                No Extra Hours letters waiting for review.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {pending.map((row) => (
                <li
                  key={row.id}
                  className="relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-2xs transition hover:border-slate-300 sm:flex-row sm:items-center"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-amber-500"
                  />
                  <div className="min-w-0 pl-2">
                    <p className="truncate text-sm font-extrabold text-slate-900">
                      {row.students.map((student) => student.name).join(', ')}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {row.department} · {row.period_label} ·{' '}
                      {periodRange(row.period_start, row.period_end)}
                      {row.requested_by ? ` · from ${row.requested_by}` : ''}
                    </p>
                    <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-700">
                      {row.duty_description}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 pl-2 sm:pl-0">
                    {row.approval_letter_path && (
                      <button
                        type="button"
                        onClick={() => viewLetter(row)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Letter
                      </button>
                    )}
                    {canReview && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void decide(row, 'Approved')}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {busyId === row.id ? 'Saving…' : `Approve ${weeklyExtended}`}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void decide(row, 'Rejected')}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          Decline
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* RECENT DECISIONS */}
        {recent.length > 0 && (
          <div className="border-t border-slate-100 pt-5">
            <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Recent Decisions
            </p>
            <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {recent.map((row) => (
                <li
                  key={row.id}
                  className="relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-2.5 left-0 w-1 rounded-r-full ${statusAccent(
                      row.status
                    )}`}
                  />
                  <div className="min-w-0 pl-2 text-xs">
                    <span className="font-extrabold text-slate-900">
                      {row.students.map((student) => student.name).join(', ')}
                    </span>
                    <span className="font-medium text-slate-500"> · {row.period_label}</span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${statusTone(
                      row.status
                    )}`}
                  >
                    {row.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </FeatureSection>
  );
}