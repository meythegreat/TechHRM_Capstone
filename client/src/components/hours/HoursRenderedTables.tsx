import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { CAMPUS_LETTERHEAD, CAMPUS_OFFICERS } from '../../constants/campusDocuments';
import { financialService } from '../../services/financialService';
import { REALTIME_EVENT } from '../../utils/realtime';
import { HoursActivityBoard } from './HoursActivityBoard';
import { HourLimitApprovalsPanel } from './HourLimitApprovalsPanel';

export interface HourStudentRow {
  user_id: number;
  name: string;
  student_id_number?: string | null;
  course?: string | null;
  course_abbreviation?: string | null;
  assigned_office?: string | null;
  office_abbreviation?: string | null;
  year_level?: number | null;
  dtr_hours: number;
  duty_deduction: number;
  special_request: number;
  daily_cleaning: number;
  general_cleaning: number;
  devotional: number;
  meeting_assembly: number;
  adjustments: number;
  grand_total: number;
}

export interface YearBreakdownGroup {
  year_level: number | null;
  label: string;
  students: HourStudentRow[];
  totals: {
    student_count: number;
    dtr_hours: number;
    duty_deduction: number;
    adjustments: number;
    grand_total: number;
  };
}

export interface HoursSummaryRow {
  year_level: number | null;
  label: string;
  student_count: number;
  dtr_hours: number;
  adjustments: number;
  grand_total: number;
}

export interface HoursReport {
  period_start: string;
  period_end: string;
  breakdown: YearBreakdownGroup[];
  summary: HoursSummaryRow[];
  grand: {
    student_count: number;
    dtr_hours: number;
    duty_deduction: number;
    adjustments: number;
    grand_total: number;
  };
  signatories?: {
    secretary?: string;
    coordinator?: string;
  };
  hourly_rate?: number;
}

export const hoursText = (value: number) => {
  const amount = Number(value) || 0;
  return `${amount.toFixed(2)}`;
};

export const DEFAULT_HOURLY_RATE = 28;

export const pesoText = (hours: number, rate: number) => {
  const amount = (Number(hours) || 0) * (Number(rate) || 0);
  const sign = amount < 0 ? '-' : '';
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}₱${formatted}`;
};

const dutyMonth = (start?: string) => {
  if (!start) return '';
  const from = new Date(`${start.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(from.getTime())) return '';
  return from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
};

const cell = 'border border-black px-1 py-1 text-[10px] align-middle';

const assignmentArea = (student: HourStudentRow) =>
  student.office_abbreviation?.trim() || student.assigned_office || '—';

const courseYear = (student: HourStudentRow) => {
  const course = student.course_abbreviation?.trim() || student.course;
  const year = student.year_level ? `Year ${student.year_level}` : '';
  return [course, year].filter(Boolean).join(' / ') || '—';
};

const renderedHours = (student: HourStudentRow) => roundHours(student.dtr_hours - student.duty_deduction);

const meetingHours = (student: HourStudentRow) => roundHours(
  student.general_cleaning + student.devotional + student.meeting_assembly,
);

const rowSum = (student: HourStudentRow) => roundHours(
  renderedHours(student) + student.special_request + student.daily_cleaning + meetingHours(student),
);

const roundHours = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function YearLevelBreakdown({ report, rate }: { report: HoursReport | null; rate: number }) {
  if (!report || report.breakdown.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-slate-500">
        <p className="font-semibold text-slate-700">No hours in this period yet</p>
        <p className="text-sm mt-1">Verified DTR logs and activity marks for this period will appear here, grouped by year level.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {report.breakdown.map((group) => (
        <section key={group.label} className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">{group.label}</h3>
            <p className="text-sm font-bold text-slate-500">{group.students.length} student{group.students.length === 1 ? '' : 's'} · {hoursText(group.totals.grand_total)} hrs · {pesoText(group.totals.grand_total, rate)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[980px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-3 py-3 font-semibold text-right">DTR</th>
                  <th className="px-3 py-3 font-semibold text-right">Duty deduction</th>
                  <th className="px-3 py-3 font-semibold text-right">Special</th>
                  <th className="px-3 py-3 font-semibold text-right">Daily cleaning</th>
                  <th className="px-3 py-3 font-semibold text-right">General meeting</th>
                  <th className="px-4 py-3 font-semibold text-right">Grand total</th>
                  <th className="px-4 py-3 font-semibold text-right">At ₱{hoursText(rate)}/hr</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {group.students.map((student) => (
                  <tr key={student.user_id}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{student.name}</p>
                      <p className="text-xs text-slate-500">{student.student_id_number || 'No ID'}</p>
                    </td>
                    <HourCell value={student.dtr_hours} />
                    <HourCell value={student.duty_deduction === 0 ? 0 : -student.duty_deduction} />
                    <HourCell value={student.special_request} />
                    <HourCell value={student.daily_cleaning} />
                    <HourCell value={meetingHours(student)} />
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{hoursText(student.grand_total)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 tabular-nums">{pesoText(student.grand_total, rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function HourCell({ value }: { value: number }) {
  const tone = value < 0 ? 'text-rose-600' : value > 0 ? 'text-emerald-700' : 'text-slate-400';
  return <td className={`px-3 py-3 text-right text-sm font-semibold tabular-nums ${tone}`}>{hoursText(value)}</td>;
}

export function HoursSummarySheet({ report, rate }: { report: HoursReport | null; rate: number }) {
  const dutyMonthLabel = dutyMonth(report?.period_start);
  const groups = useMemo(() => {
    const source = report?.breakdown ?? [];
    return [...source]
      .sort((a, b) => (Number(a.year_level) || 99) - (Number(b.year_level) || 99))
      .map((group) => ({
        ...group,
        students: [...group.students].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [report]);
  const students = useMemo(() => groups.flatMap((group) => group.students), [groups]);
  const columnSum = (pick: (student: HourStudentRow) => number, list = students) => roundHours(
    list.reduce((total, student) => total + pick(student), 0),
  );

  return (
    <section className="hours-summary-sheet">
      <div className="flex items-start justify-between gap-4 mb-4 print:hidden">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Summary for accounting</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">This is the only table that prints. It is passed by hand to the Accounting Office, then to the President&apos;s Office.</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!report || students.length === 0}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center gap-2"
        >
          <Printer className="w-4 h-4" /> Print summary
        </button>
      </div>

      <div
        className="hours-summary-paper rounded-2xl border border-slate-300 bg-white p-5 text-black sm:p-8 print:rounded-none print:border-0 print:p-0"
        style={{ backgroundColor: '#ffffff', color: '#000000' }}
      >
        <div className="mb-4 flex items-center justify-center gap-3">
          <img src={CAMPUS_LETTERHEAD.logoSrc} alt="Filamer Christian University" className="h-14 w-14 shrink-0 object-contain" />
          <div className="text-center font-bold leading-tight">
            <p className="text-[11px]">{CAMPUS_LETTERHEAD.universityName}</p>
            <p className="text-[11px]">{CAMPUS_LETTERHEAD.address.toUpperCase()}</p>
            <p className="text-[11px]">{CAMPUS_LETTERHEAD.wspoOrgName.toUpperCase()}</p>
            <p className="mt-1 text-[12px]">SUMMARY OF DUTY HOURS</p>
            <p className="text-[11px]">FOR THE MONTH OF {dutyMonthLabel || '—'}</p>
          </div>
          <img src={CAMPUS_LETTERHEAD.wspoLogoSrc} alt="Work Study Program Organization" className="h-14 w-14 shrink-0 object-contain" />
        </div>

        <table className="w-full border-collapse" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className={cell}>Name</th>
              <th className={cell}>Area of assignment</th>
              <th className={cell}>Course/Year</th>
              <th className={cell}>Hours rendered for the month</th>
              <th className={cell}>Special request hrs</th>
              <th className={cell}>Daily cleaning hrs</th>
              <th className={cell}>General meeting hrs</th>
              <th className={cell}>Sum (hrs)</th>
              <th className={cell}>Sum (₱)</th>
            </tr>
          </thead>
          <tbody>
            {!report || students.length === 0 ? (
              <tr>
                <td className={cell} colSpan={9}>No hours rendered for this period.</td>
              </tr>
            ) : groups.map((group) => (
              <Fragment key={group.label}>
                <tr>
                  <td className={`${cell} font-bold`} colSpan={9}>{group.label}</td>
                </tr>
                {group.students.map((student) => (
                  <tr key={student.user_id}>
                    <td className={cell}>{student.name}</td>
                    <td className={cell}>{assignmentArea(student)}</td>
                    <td className={cell}>{courseYear(student)}</td>
                    <td className={`${cell} text-right`}>{hoursText(renderedHours(student))}</td>
                    <td className={`${cell} text-right`}>{hoursText(student.special_request)}</td>
                    <td className={`${cell} text-right`}>{hoursText(student.daily_cleaning)}</td>
                    <td className={`${cell} text-right`}>{hoursText(meetingHours(student))}</td>
                    <td className={`${cell} text-right font-bold`}>{hoursText(rowSum(student))}</td>
                    <td className={`${cell} text-right font-bold`}>{pesoText(rowSum(student), rate)}</td>
                  </tr>
                ))}
                <tr>
                  <td className={`${cell} font-bold`} colSpan={3}>{group.label} sum</td>
                  <td className={`${cell} text-right font-bold`}>{hoursText(columnSum(renderedHours, group.students))}</td>
                  <td className={`${cell} text-right font-bold`}>{hoursText(columnSum((student) => student.special_request, group.students))}</td>
                  <td className={`${cell} text-right font-bold`}>{hoursText(columnSum((student) => student.daily_cleaning, group.students))}</td>
                  <td className={`${cell} text-right font-bold`}>{hoursText(columnSum(meetingHours, group.students))}</td>
                  <td className={`${cell} text-right font-bold`}>{hoursText(columnSum(rowSum, group.students))}</td>
                  <td className={`${cell} text-right font-bold`}>{pesoText(columnSum(rowSum, group.students), rate)}</td>
                </tr>
              </Fragment>
            ))}
            {students.length > 0 && (
              <tr>
                <td className={`${cell} font-bold`} colSpan={3}>Sum</td>
                <td className={`${cell} text-right font-bold`}>{hoursText(columnSum(renderedHours))}</td>
                <td className={`${cell} text-right font-bold`}>{hoursText(columnSum((student) => student.special_request))}</td>
                <td className={`${cell} text-right font-bold`}>{hoursText(columnSum((student) => student.daily_cleaning))}</td>
                <td className={`${cell} text-right font-bold`}>{hoursText(columnSum(meetingHours))}</td>
                <td className={`${cell} text-right font-bold`}>{hoursText(columnSum(rowSum))}</td>
                <td className={`${cell} text-right font-bold`}>{pesoText(columnSum(rowSum), rate)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="hours-summary-signoff mt-10">
          <p className="text-[11px] font-bold text-left">Signed:</p>
          <div className="grid grid-cols-2 gap-10 mt-8">
            <Signatory label={CAMPUS_OFFICERS.wspoSecretary.title} name={report?.signatories?.secretary || ''} />
            <Signatory label={CAMPUS_OFFICERS.wspoCoordinator.shortTitle} name={report?.signatories?.coordinator || ''} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function HoursRenderedSection({ readOnly }: { readOnly: boolean }) {
  const canEditHourlyRate = localStorage.getItem('user_role') === 'Super Admin';
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [rate, setRate] = useState(String(DEFAULT_HOURLY_RATE));
  const [savedRate, setSavedRate] = useState(DEFAULT_HOURLY_RATE);
  const [rateStatus, setRateStatus] = useState('');
  const [report, setReport] = useState<HoursReport | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const rateFocused = useRef(false);

  const period = useMemo(() => {
    const [year, mon] = month.split('-').map(Number);
    const last = new Date(year, mon, 0).getDate();
    return {
      start: `${month}-01`,
      end: `${month}-${String(last).padStart(2, '0')}`,
    };
  }, [month]);

  const hourlyRate = Number(rate) > 0 ? Number(rate) : 0;

  const commitRate = async () => {
    rateFocused.current = false;
    if (!canEditHourlyRate) return;
    const next = Number(rate);
    if (!Number.isFinite(next) || next < 0) {
      setRate(String(savedRate));
      setRateStatus('');
      return;
    }
    if (Math.abs(next - savedRate) < 0.001) {
      setRate(String(savedRate));
      setRateStatus('');
      return;
    }
    setRateStatus('Saving...');
    try {
      const saved = await financialService.updateHourlyRate(next);
      setSavedRate(saved.hourly_rate);
      setRate(String(saved.hourly_rate));
      setRateStatus('Saved');
    } catch {
      setRate(String(savedRate));
      setRateStatus('Could not save the hourly rate.');
    }
  };

  useEffect(() => {
    let active = true;
    const load = (silent = false) => {
      financialService.getHoursReport(period.start, period.end)
        .then((res) => {
          if (!active) return;
          setReport(res);
          if (typeof res.hourly_rate === 'number' && Number.isFinite(res.hourly_rate) && !rateFocused.current) {
            setSavedRate(res.hourly_rate);
            setRate(String(res.hourly_rate));
          }
        })
        .catch(() => {
          if (active && !silent) setReport(null);
        });
    };
    load();
    const refresh = () => load(true);
    const interval = setInterval(refresh, 5000);
    window.addEventListener(REALTIME_EVENT, refresh);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener(REALTIME_EVENT, refresh);
    };
  }, [period.start, period.end, reloadKey]);

  return (
    <div className="space-y-8">
      <div className="print:hidden space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Period breakdown</h2>
            <p className="text-sm text-slate-500 mt-1">Grand total = DTR hours − duty deductions + activity hours.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Month
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="mt-1 block px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Hourly rate (₱)
              <input
                type="number"
                min="0"
                step="0.5"
                value={rate}
                readOnly={!canEditHourlyRate}
                onFocus={() => {
                  if (canEditHourlyRate) rateFocused.current = true;
                }}
                onChange={(event) => {
                  if (!canEditHourlyRate) return;
                  setRateStatus('');
                  setRate(event.target.value);
                }}
                onBlur={() => {
                  void commitRate();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    (event.currentTarget as HTMLInputElement).blur();
                  }
                }}
                title={canEditHourlyRate ? 'Campus hourly rate' : 'Only a Super Admin can change the hourly rate'}
                className={`mt-1 block w-28 px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold ${
                  canEditHourlyRate
                    ? 'bg-white text-slate-800'
                    : 'bg-slate-100 text-slate-500 cursor-not-allowed'
                }`}
              />
              <span className="mt-1 block text-[11px] font-medium normal-case tracking-normal text-slate-400">
                {canEditHourlyRate ? rateStatus || 'Leave the field to save.' : 'Only a Super Admin can change this rate.'}
              </span>
            </label>
          </div>
        </div>
        {report && (
          <div className="bg-slate-900 text-white rounded-2xl px-6 py-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Grand total hours</p>
              <p className="text-4xl font-semibold mt-1">{hoursText(report.grand.grand_total)}</p>
              <p className="text-sm text-emerald-300 mt-1">{pesoText(report.grand.grand_total, hourlyRate)} at ₱{hoursText(hourlyRate)}/hr</p>
            </div>
            <p className="text-sm text-slate-300">{report.grand.student_count} student{report.grand.student_count === 1 ? '' : 's'} with hours this period</p>
          </div>
        )}
        <HourLimitApprovalsPanel
          readOnly={readOnly}
          userRole={localStorage.getItem('user_role') || undefined}
        />
        <HoursActivityBoard
          readOnly={readOnly}
          periodStart={period.start}
          periodEnd={period.end}
          onChanged={() => setReloadKey((value) => value + 1)}
        />
        <YearLevelBreakdown report={report} rate={hourlyRate} />
      </div>
      <HoursSummarySheet report={report} rate={hourlyRate} />
    </div>
  );
}

function Signatory({ label, name }: { label: string; name: string }) {
  return (
    <div className="mx-auto w-full max-w-[240px] text-center">
      <div className="border-b border-black h-8" />
      <p className="mt-1 text-center text-[14px] font-bold uppercase tracking-wide">{name}</p>
      <p className="text-center text-[11px]">{label}</p>
    </div>
  );
}
