import { useEffect, useMemo, useState } from 'react';
import {
  extraHoursService,
  type ExtraHoursMeta,
  type ExtraHoursRequestRow,
  type ExtraHoursStudent,
} from '../../services/extraHoursService';
import { REALTIME_EVENT } from '../../utils/realtime';
import SecureFileViewerModal from '../SecureFileViewerModal';
import ExtraHoursLetter, { printExtraHoursLetter } from './ExtraHoursLetter';

const statusTone = (status: string) => {
  if (status === 'Pending' || status === 'Draft') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
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
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
}: {
  readOnly: boolean;
  userRole?: string | null;
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
    [candidates, form.student_ids],
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
    if (!form.duty_description.trim() || !form.period_label.trim() || !form.period_start || !form.period_end) {
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
      setNotice(res.message || 'Draft saved. Print the letter, collect signatures, then attach the signed scan.');
      await load(true);
      printExtraHoursLetter();
    } catch (error: any) {
      const validation = error?.response?.data?.errors;
      const firstValidation = validation ? Object.values(validation).flat()[0] : null;
      setNotice(
        (typeof firstValidation === 'string' ? firstValidation : null)
          || error?.response?.data?.message
          || 'Could not save the Extra Hours draft.',
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
        (typeof firstValidation === 'string' ? firstValidation : null)
          || error?.response?.data?.message
          || 'Could not submit the Extra Hours request.',
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
    setNotice('Draft loaded. Print the letter again if needed, then attach the signed scan to send it.');
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
    const names = row.students.map((student) => student.name).filter(Boolean).join(', ');
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
      setNotice(res.message || (status === 'Approved' ? 'Extra Hours approved.' : 'Extra Hours declined.'));
      await load(true);
    } catch (error: any) {
      const validation = error?.response?.data?.errors;
      const firstValidation = validation ? Object.values(validation).flat()[0] : null;
      setNotice(
        (typeof firstValidation === 'string' ? firstValidation : null)
          || error?.response?.data?.message
          || 'Could not update that Extra Hours request.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter((row) => row.status === 'Pending');
  const drafts = rows.filter((row) => row.status === 'Draft');
  const recent = rows.filter((row) => row.status === 'Approved' || row.status === 'Rejected').slice(0, 8);
  const weeklyExtended = meta?.weekly_extended ?? 25;

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden print:hidden">
      <SecureFileViewerModal
        filePath={viewerPath}
        title={viewerTitle}
        onClose={() => setViewerPath(null)}
      />
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Extra Hours (20 → {weeklyExtended})</h3>
        <p className="text-sm text-slate-500 mt-1">
          Permission to work up to {weeklyExtended} hours per week. Supervisors print the Extra Hours letter,
          collect wet signatures, then upload the signed scan for WSPO to record. Monthly maximum remains{' '}
          {meta?.monthly_max ?? 100} hours. This is separate from Extra Service (date-specific duty).
        </p>
      </div>

      {notice && (
        <div className="mx-6 mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
          {notice}
        </div>
      )}

      <div className="px-6 py-5 space-y-6">
        {canCreate && (
          <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">New Extra Hours letter</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {assignedOffice || 'Your office'} · {draftId ? `Draft #${draftId}` : 'Unsaved draft'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Working students</p>
              {candidates.length === 0 ? (
                <p className="text-sm text-slate-500">No students are assigned to your office yet.</p>
              ) : (
                <ul className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {candidates.map((student) => {
                    const checked = form.student_ids.includes(student.id);
                    return (
                      <li key={student.id}>
                        <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStudent(student.id)}
                            className="rounded border-slate-300"
                          />
                          <span className="min-w-0">
                            <span className="font-semibold text-slate-800">{student.name}</span>
                            {student.student_id_number && (
                              <span className="text-slate-500"> · {student.student_id_number}</span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Duty description</span>
                <input
                  value={form.duty_description}
                  onChange={(event) => setForm((current) => ({ ...current, duty_description: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="clerical tasks and maintain office cleanliness"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Period label</span>
                <input
                  value={form.period_label}
                  onChange={(event) => setForm((current) => ({ ...current, period_label: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="1st Semester of Academic Year 2026-2027"
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Period start</span>
                <input
                  type="date"
                  value={form.period_start}
                  onChange={(event) => setForm((current) => ({ ...current, period_start: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Period end</span>
                <input
                  type="date"
                  value={form.period_end}
                  onChange={(event) => setForm((current) => ({ ...current, period_end: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Your title on the letter</span>
                <input
                  value={form.requester_title}
                  onChange={(event) => setForm((current) => ({ ...current, requester_title: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="Department Supervisor"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Signed letter scan</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event) => setLetterFile(event.target.files?.[0] || null)}
                  className="w-full text-sm"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePrint()}
                className="px-3 py-2 rounded-xl border border-slate-200 text-slate-800 text-sm font-bold disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Save & Print Letter'}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Submit signed letter to WSPO'}
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

        {canCreate && drafts.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Your drafts ({drafts.length})</p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
              {drafts.map((row) => (
                <li key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {row.students.map((student) => student.name).join(', ') || 'No students'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{row.period_label}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => resumeDraft(row)}
                      className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void deleteDraft(row)}
                      className="px-3 py-2 rounded-xl border border-rose-200 text-rose-700 text-sm font-bold disabled:opacity-60"
                    >
                      {busyId === row.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
            Pending WSPO review ({pending.length})
          </p>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-500">No Extra Hours letters waiting for review.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
              {pending.map((row) => (
                <li key={row.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 bg-white">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {row.students.map((student) => student.name).join(', ')}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {row.department} · {row.period_label} · {periodRange(row.period_start, row.period_end)}
                      {row.requested_by ? ` · from ${row.requested_by}` : ''}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">{row.duty_description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {row.approval_letter_path && (
                      <button
                        type="button"
                        onClick={() => viewLetter(row)}
                        className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold"
                      >
                        View letter
                      </button>
                    )}
                    {canReview ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void decide(row, 'Approved')}
                          className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-60"
                        >
                          {busyId === row.id ? 'Saving…' : `Approve ${weeklyExtended}`}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void decide(row, 'Rejected')}
                          className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold disabled:opacity-60"
                        >
                          Decline
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {recent.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Recent decisions</p>
            <ul className="space-y-2">
              {recent.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800">
                      {row.students.map((student) => student.name).join(', ')}
                    </span>
                    <span className="text-slate-500"> · {row.period_label}</span>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold capitalize ${statusTone(row.status)}`}>
                    {row.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
