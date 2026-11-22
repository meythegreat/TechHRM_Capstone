import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { UserCheck, X } from 'lucide-react';
import { financialService } from '../../services/financialService';
import { bindPopup } from '../../utils/popupDismiss';

type RepRow = {
  year_level: number;
  year_label: string;
  user_id: number;
  student?: { id: number; name: string; student_id_number?: string | null } | null;
};

type StudentOption = {
  id: number;
  name: string;
  year_level?: number | null;
  year_label?: string;
  student_id_number?: string | null;
};

const YEARS = [1, 2, 3, 4] as const;

export function AssemblyYearRepsDialog({ onClose }: { onClose: () => void }) {
  const [reps, setReps] = useState<RepRow[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selections, setSelections] = useState<Record<number, number | ''>>({ 1: '', 2: '', 3: '', 4: '' });
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [savingYear, setSavingYear] = useState<number | null>(null);

  const load = async () => {
    const [repRes, studentRes] = await Promise.all([
      axios.get('/api/attendance/assembly-year-representatives'),
      financialService.getHourStudents(),
    ]);
    const list = Array.isArray(repRes.data?.representatives) ? repRes.data.representatives as RepRow[] : [];
    setReps(list);
    setStudents((studentRes.students || []) as StudentOption[]);
    const next: Record<number, number | ''> = { 1: '', 2: '', 3: '', 4: '' };
    list.forEach((row) => {
      next[row.year_level] = row.user_id;
    });
    setSelections(next);
  };

  useEffect(() => {
    load().catch(() => {
      setNoticeError(true);
      setNotice('Could not load assembly representatives.');
    });
  }, []);

  const byYear = useMemo(() => {
    const map = new Map<number, StudentOption[]>();
    YEARS.forEach((year) => map.set(year, []));
    students.forEach((student) => {
      const year = Number(student.year_level);
      if (year >= 1 && year <= 4) {
        map.get(year)?.push(student);
      }
    });
    return map;
  }, [students]);

  const saveYear = async (year: number) => {
    const userId = selections[year];
    if (!userId) {
      setNoticeError(true);
      setNotice('Choose a student for year '+year+'.');
      return;
    }
    setSavingYear(year);
    try {
      const { data } = await axios.put('/api/attendance/assembly-year-representatives', {
        year_level: year,
        user_id: userId,
      });
      setNoticeError(false);
      setNotice(data.message || 'Saved.');
      await load();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Could not save representative.';
      setNoticeError(true);
      setNotice(message);
    } finally {
      setSavingYear(null);
    }
  };

  const clearYear = async (year: number) => {
    setSavingYear(year);
    try {
      const { data } = await axios.delete(`/api/attendance/assembly-year-representatives/${year}`);
      setNoticeError(false);
      setNotice(data.message || 'Cleared.');
      await load();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Could not clear representative.';
      setNoticeError(true);
      setNotice(message);
    } finally {
      setSavingYear(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      {...bindPopup(onClose)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 bg-slate-950 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30">
              <UserCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-white">Assembly Year Representatives</h2>
              <p className="text-[11px] font-medium text-slate-400">
                Assign one representative per year level to issue general assembly attendance codes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-6">
          {notice && (
            <div className={`rounded-xl border px-4 py-3 text-xs font-bold ${noticeError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              {notice}
            </div>
          )}

          {YEARS.map((year) => {
            const current = reps.find((row) => row.year_level === year);
            const pool = byYear.get(year) || [];
            return (
              <div key={year} className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 pl-5 shadow-2xs space-y-3">
                <span className={`absolute inset-y-3.5 left-0 w-1 rounded-r-full ${current?.student ? 'bg-indigo-500' : 'bg-slate-200'}`} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black tracking-tight text-slate-900">
                    {current?.year_label || `Year ${year}`}
                  </p>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                      current?.student
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {current?.student?.name || 'Not assigned'}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={selections[year] || ''}
                    onChange={(e) => setSelections((prev) => ({
                      ...prev,
                      [year]: e.target.value ? Number(e.target.value) : '',
                    }))}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                  >
                    <option value="">Select student…</option>
                    {pool.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}{student.student_id_number ? ` · ${student.student_id_number}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={savingYear === year}
                    onClick={() => saveYear(year)}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-45"
                  >
                    Save
                  </button>
                  {current && (
                    <button
                      type="button"
                      disabled={savingYear === year}
                      onClick={() => clearYear(year)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-45"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
