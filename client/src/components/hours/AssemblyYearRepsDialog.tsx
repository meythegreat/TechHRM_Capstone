import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" {...bindPopup(onClose)}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Assembly year representatives</h2>
            <p className="text-sm text-slate-500 mt-1">
              One representative per year level. Students scan general assembly passcode/QR only to their year representative.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800 text-sm font-bold">Close</button>
        </div>

        <div className="p-6 space-y-4">
          {notice && (
            <p className={`text-sm font-medium ${noticeError ? 'text-rose-600' : 'text-emerald-700'}`}>{notice}</p>
          )}

          {YEARS.map((year) => {
            const current = reps.find((row) => row.year_level === year);
            const pool = byYear.get(year) || [];
            return (
              <div key={year} className="rounded-xl border border-slate-200 px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{current?.year_label || `Year ${year}`}</p>
                  <p className="text-xs text-slate-500">
                    Current: {current?.student?.name || 'Not set'}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={selections[year] || ''}
                    onChange={(e) => setSelections((prev) => ({
                      ...prev,
                      [year]: e.target.value ? Number(e.target.value) : '',
                    }))}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold"
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
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-50"
                  >
                    Save
                  </button>
                  {current && (
                    <button
                      type="button"
                      disabled={savingYear === year}
                      onClick={() => clearYear(year)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
