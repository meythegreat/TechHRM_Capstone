import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Filter, Printer, Search, SlidersHorizontal, Users, X, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { CAMPUS_LETTERHEAD, CAMPUS_OFFICERS } from '../../constants/campusDocuments';
import { courseAcronym } from '../../utils/studentAssignment';
import { financialService } from '../../services/financialService';
import { REALTIME_EVENT } from '../../utils/realtime';
import { HoursActivityBoard } from './HoursActivityBoard';
import { HourLimitApprovalsPanel } from './HourLimitApprovalsPanel';
import { HelpDisclosure } from '../HelpDisclosure';

export interface HourStudentRow {
  user_id: number;
  name: string;
  student_id_number?: string | null;
  course?: string | null;
  course_abbreviation?: string | null;
  assigned_office?: string | null;
  assignment_area?: string | null;
  assignment_label?: string | null;
  special_hours_request?: boolean;
  office_abbreviation?: string | null;
  year_level?: number | null;
  dtr_hours: number;
  janitorial_hrs?: number;
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

const periodHeading = (start?: string, end?: string) => {
  if (!start) return '—';
  const from = new Date(`${start.slice(0, 10)}T00:00:00`);
  const to = end ? new Date(`${end.slice(0, 10)}T00:00:00`) : from;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '—';
  const lastDay = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
  const fullMonth = from.getFullYear() === to.getFullYear()
    && from.getMonth() === to.getMonth()
    && from.getDate() === 1
    && to.getDate() === lastDay;
  if (fullMonth) {
    return `FOR THE MONTH OF ${from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}`;
  }
  const fmt = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  return `FOR THE PERIOD ${fmt(from)} – ${fmt(to)}`;
};

const monthValueFromDate = (value: string) => value.slice(0, 7);

const boundsForMonth = (monthValue: string) => {
  const [year, mon] = monthValue.split('-').map(Number);
  if (!year || !mon) return { start: '', end: '' };
  const last = new Date(year, mon, 0).getDate();
  return {
    start: `${monthValue}-01`,
    end: `${monthValue}-${String(last).padStart(2, '0')}`,
  };
};

interface HoursListFilters {
  studentIds: number[];
  years: string[];
  department: string;
  course: string;
}

const emptyFilters = (): HoursListFilters => ({ studentIds: [], years: [], department: '', course: '' });

const departmentOf = (student: HourStudentRow) =>
  student.assigned_office?.trim() || student.office_abbreviation?.trim() || '';

const courseOf = (student: HourStudentRow) =>
  student.course?.trim() || student.course_abbreviation?.trim() || '';

const yearKey = (student: HourStudentRow) => (student.year_level ? String(student.year_level) : 'unset');

const yearOptionLabel = (key: string) => {
  if (key === '1') return '1st Year';
  if (key === '2') return '2nd Year';
  if (key === '3') return '3rd Year';
  if (key === '4') return '4th Year';
  if (key === 'unset') return 'Year not set';
  return `Year ${key}`;
};

const emptyHourTotals = () => ({
  student_count: 0,
  dtr_hours: 0,
  duty_deduction: 0,
  adjustments: 0,
  grand_total: 0,
});

const addHourTotals = (totals: ReturnType<typeof emptyHourTotals>, student: HourStudentRow) => {
  totals.student_count += 1;
  totals.dtr_hours = roundHours(totals.dtr_hours + student.dtr_hours);
  totals.duty_deduction = roundHours(totals.duty_deduction + student.duty_deduction);
  totals.adjustments = roundHours(totals.adjustments + student.adjustments);
  totals.grand_total = roundHours(totals.grand_total + student.grand_total);
};

const matchesHoursFilter = (student: HourStudentRow, filters: HoursListFilters) => {
  const pickedStudents = filters.studentIds.length > 0;
  const pickedYears = filters.years.length > 0;
  if (pickedStudents || pickedYears) {
    const named = pickedStudents && filters.studentIds.includes(student.user_id);
    const inYear = pickedYears && filters.years.includes(yearKey(student));
    if (!named && !inYear) return false;
  }
  if (filters.department && departmentOf(student) !== filters.department) return false;
  if (filters.course && courseOf(student) !== filters.course) return false;
  return true;
};

const applyHoursFilters = (report: HoursReport, filters: HoursListFilters): HoursReport => {
  const breakdown = report.breakdown
    .map((group) => {
      const students = group.students.filter((student) => matchesHoursFilter(student, filters));
      const totals = emptyHourTotals();
      students.forEach((student) => addHourTotals(totals, student));
      return { ...group, students, totals };
    })
    .filter((group) => group.students.length > 0);

  const grand = emptyHourTotals();
  breakdown.forEach((group) => {
    grand.student_count += group.totals.student_count;
    grand.dtr_hours = roundHours(grand.dtr_hours + group.totals.dtr_hours);
    grand.duty_deduction = roundHours(grand.duty_deduction + group.totals.duty_deduction);
    grand.adjustments = roundHours(grand.adjustments + group.totals.adjustments);
    grand.grand_total = roundHours(grand.grand_total + group.totals.grand_total);
  });

  return {
    ...report,
    breakdown,
    summary: breakdown.map((group) => ({
      year_level: group.year_level,
      label: group.label,
      student_count: group.students.length,
      dtr_hours: group.totals.dtr_hours,
      adjustments: group.totals.adjustments,
      grand_total: group.totals.grand_total,
    })),
    grand,
  };
};

const cell = 'border border-black px-1 py-1 text-[10px] align-middle';

const assignmentArea = (student: HourStudentRow) =>
  student.assignment_label?.trim()
  || [student.office_abbreviation?.trim() || student.assigned_office, student.assignment_area?.trim()].filter(Boolean).join(' - ')
  || '—';

const courseYear = (student: HourStudentRow) => {
  const course = student.course_abbreviation?.trim() || courseAcronym(student.course);
  const year = student.year_level ? `Y${student.year_level}` : '';
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
      <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
        <FileSpreadsheet className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
        <p className="text-sm font-extrabold text-slate-700">No hours in this period yet</p>
        <p className="mt-1 text-xs font-medium text-slate-400">
          Verified DTR logs and activity marks for this period will appear here, grouped by year level.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {report.breakdown.map((group) => (
        <section key={group.label} className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white">
                {group.year_level ? `Y${group.year_level}` : '—'}
              </span>
              <h3 className="text-base font-black tracking-tight text-slate-900">{group.label}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-600">
                {group.students.length} student{group.students.length === 1 ? '' : 's'}
              </span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-mono text-[11px] font-extrabold text-blue-700">
                {hoursText(group.totals.grand_total)} hrs
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-[11px] font-extrabold text-emerald-700">
                {pesoText(group.totals.grand_total, rate)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="app-data-table w-full min-w-[980px] text-left">
              <thead className="border-b border-slate-200/80 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-3 py-3.5 text-right">DTR</th>
                  <th className="px-3 py-3.5 text-right">Janitorial</th>
                  <th className="px-3 py-3.5 text-right">Deduction</th>
                  <th className="px-3 py-3.5 text-right">Special</th>
                  <th className="px-3 py-3.5 text-right">Daily Cleaning</th>
                  <th className="px-3 py-3.5 text-right">General Meeting</th>
                  <th className="px-4 py-3.5 text-right">Grand Total</th>
                  <th className="px-5 py-3.5 text-right">At ₱{hoursText(rate)}/hr</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {group.students.map((student) => (
                  <tr key={student.user_id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-extrabold text-slate-900">{student.name}</p>
                      <p className="font-mono text-xs font-medium text-slate-500">{student.student_id_number || 'No ID'}</p>
                    </td>
                    <HourCell value={student.dtr_hours} />
                    <HourCell value={student.janitorial_hrs || 0} />
                    <HourCell value={student.duty_deduction === 0 ? 0 : -student.duty_deduction} />
                    <HourCell value={student.special_request} />
                    <HourCell value={student.daily_cleaning} />
                    <HourCell value={meetingHours(student)} />
                    <td className="px-4 py-3.5 text-right font-mono text-sm font-black tabular-nums text-slate-900">
                      {hoursText(student.grand_total)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm font-black tabular-nums text-emerald-700">
                      {pesoText(student.grand_total, rate)}
                    </td>
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

export function HoursSummarySheet({ report, rate, filterNote }: { report: HoursReport | null; rate: number; filterNote?: string }) {
  const dutyPeriodLabel = periodHeading(report?.period_start, report?.period_end);
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
      <div className="mb-4 flex flex-col gap-4 rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Printer className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Summary for Accounting</h2>
            <p className="mt-0.5 max-w-xl text-xs font-medium leading-relaxed text-slate-500">
              Printable summary sheet for the Accounting Office and the President&apos;s Office.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!report || students.length === 0}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-45"
        >
          <Printer className="h-4 w-4" /> Print Summary
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
            <p className="text-[11px]">{dutyPeriodLabel}</p>
            {filterNote ? <p className="mt-1 text-[10px] font-semibold">{filterNote}</p> : null}
          </div>
          <img src={CAMPUS_LETTERHEAD.wspoLogoSrc} alt="Work Study Program Organization" className="h-14 w-14 shrink-0 object-contain" />
        </div>

        <table className="w-full border-collapse table-fixed" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className={cell}>Name</th>
              <th className={cell}>Area of assignment</th>
              <th className={cell}>Course/Year</th>
              <th className={cell}>Hours rendered for the month</th>
              <th className={cell}>Janitorial hrs</th>
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
                <td className={cell} colSpan={10}>No hours rendered for this period.</td>
              </tr>
            ) : groups.map((group) => (
              <Fragment key={group.label}>
                <tr>
                  <td className={`${cell} font-bold`} colSpan={10}>{group.label}</td>
                </tr>
                {group.students.map((student) => (
                  <tr key={student.user_id}>
                    <td className={cell}>
                      {student.name}
                      {student.special_hours_request ? ' · Special request 100 hrs' : ''}
                    </td>
                    <td className={cell}>{assignmentArea(student)}</td>
                    <td className={cell} title={student.course || undefined}>{courseYear(student)}</td>
                    <td className={`${cell} text-right`}>{hoursText(renderedHours(student))}</td>
                    <td className={`${cell} text-right`}>{hoursText(student.janitorial_hrs || 0)}</td>
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
                  <td className={`${cell} text-right font-bold`}>{hoursText(columnSum((student) => student.janitorial_hrs || 0, group.students))}</td>
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
                <td className={`${cell} text-right font-bold`}>{hoursText(columnSum((student) => student.janitorial_hrs || 0))}</td>
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

const fieldClass = 'mt-1.5 block w-full min-w-[10rem] rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20';

export function HoursRenderedSection({ readOnly }: { readOnly: boolean }) {
  const canEditHourlyRate = localStorage.getItem('user_role') === 'Super Admin';
  const now = new Date();
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const initialBounds = boundsForMonth(initialMonth);
  const [month, setMonth] = useState(initialMonth);
  const [startDate, setStartDate] = useState(initialBounds.start);
  const [endDate, setEndDate] = useState(initialBounds.end);
  const [filters, setFilters] = useState<HoursListFilters>(emptyFilters);
  const [studentQuery, setStudentQuery] = useState('');
  const [rate, setRate] = useState(String(DEFAULT_HOURLY_RATE));
  const [savedRate, setSavedRate] = useState(DEFAULT_HOURLY_RATE);
  const [rateStatus, setRateStatus] = useState('');
  const [report, setReport] = useState<HoursReport | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const rateFocused = useRef(false);

  const rangeInvalid = Boolean(startDate && endDate && endDate < startDate);
  const hourlyRate = Number(rate) > 0 ? Number(rate) : 0;

  const roster = useMemo(
    () => report?.breakdown.flatMap((group) => group.students) ?? [],
    [report],
  );
  const departmentOptions = useMemo(() => {
    const names = roster.map(departmentOf).filter(Boolean);
    return [...new Set(filters.department ? [...names, filters.department] : names)].sort((a, b) => a.localeCompare(b));
  }, [roster, filters.department]);
  const courseOptions = useMemo(() => {
    const names = roster.map(courseOf).filter(Boolean);
    return [...new Set(filters.course ? [...names, filters.course] : names)].sort((a, b) => a.localeCompare(b));
  }, [roster, filters.course]);
  const yearOptions = useMemo(() => {
    const keys = [...roster.map(yearKey), ...filters.years];
    return [...new Set(keys)].sort((a, b) => {
      if (a === 'unset') return 1;
      if (b === 'unset') return -1;
      return Number(a) - Number(b);
    });
  }, [roster, filters.years]);
  const studentChoices = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    return [...roster]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((student) => {
        if (!query) return true;
        return `${student.name} ${student.student_id_number || ''}`.toLowerCase().includes(query);
      });
  }, [roster, studentQuery]);

  const filtersActive = Boolean(
    filters.studentIds.length || filters.years.length || filters.department || filters.course,
  );
  const filteredReport = useMemo(
    () => (report && filtersActive ? applyHoursFilters(report, filters) : report),
    [report, filters, filtersActive],
  );
  const selectedNames = roster
    .filter((student) => filters.studentIds.includes(student.user_id))
    .map((student) => student.name);
  const shownNames = selectedNames.slice(0, 8);
  const extraNames = selectedNames.length - shownNames.length;
  const filterNote = [
    filters.years.length > 0 && `Year: ${filters.years.map(yearOptionLabel).join(', ')}`,
    shownNames.length > 0 && `Students: ${shownNames.join(', ')}${extraNames > 0 ? ` and ${extraNames} more` : ''}`,
    filters.department && `Department: ${filters.department}`,
    filters.course && `Course: ${filters.course}`,
  ].filter(Boolean).join(' · ');

  const toggleYear = (key: string) => {
    setFilters((current) => ({
      ...current,
      years: current.years.includes(key)
        ? current.years.filter((year) => year !== key)
        : [...current.years, key],
    }));
  };
  const toggleStudent = (userId: number) => {
    setFilters((current) => ({
      ...current,
      studentIds: current.studentIds.includes(userId)
        ? current.studentIds.filter((id) => id !== userId)
        : [...current.studentIds, userId],
    }));
  };

  const applyMonth = (nextMonth: string) => {
    setMonth(nextMonth);
    if (!nextMonth) return;
    const bounds = boundsForMonth(nextMonth);
    setStartDate(bounds.start);
    setEndDate(bounds.end);
  };

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
    if (!startDate || !endDate || endDate < startDate) return undefined;
    let active = true;
    const load = (silent = false) => {
      financialService.getHoursReport(startDate, endDate)
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
  }, [startDate, endDate, reloadKey]);

  return (
    <div className="space-y-6">
      <div className="space-y-6 print:hidden">
        {/* PERIOD & RATE CONTROLS CARD */}
        <section className="rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <Calendar className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-black tracking-tight text-slate-900">Period Breakdown</h2>
                <p className="mt-0.5 max-w-2xl text-xs font-medium leading-relaxed text-slate-500">
                  Filter verified DTR and activity hours by date range, cohort, or student.
                </p>
                <HelpDisclosure
                  variant="inline"
                  title="Calculation & filter guidelines"
                  className="mt-2.5"
                  items={[
                    'Grand total = DTR hours − duty deductions + activity hours.',
                    'Leave year level and student selections empty to include everyone with hours in the selected period.',
                    'Selecting a year level includes that entire cohort; individually checked students are also included even if their year level is unselected.',
                  ]}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Month
                <input
                  type="month"
                  value={month}
                  onChange={(event) => applyMonth(event.target.value)}
                  title="Fills the from and to dates with that calendar month"
                  className={fieldClass}
                />
              </label>
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                From
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(event) => {
                    const next = event.target.value;
                    setStartDate(next);
                    if (next) setMonth(monthValueFromDate(next));
                  }}
                  className={fieldClass}
                />
              </label>
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                To
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Hourly Rate (₱)
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
                  className={`mt-1.5 block w-28 rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm font-black outline-none transition ${
                    canEditHourlyRate
                      ? 'bg-slate-50 text-slate-900 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20'
                      : 'cursor-not-allowed bg-slate-100 text-slate-500'
                  }`}
                />
                <span className="mt-1 block text-[11px] font-medium normal-case tracking-normal text-slate-400">
                  {canEditHourlyRate ? rateStatus || 'Leave field to save' : 'Super Admin only'}
                </span>
              </label>
            </div>
          </div>
        </section>

        {/* FILTER DECK */}
        <section className="space-y-5 rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                <SlidersHorizontal className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-black tracking-tight text-slate-900">Who to Include</p>
                <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">
                  Leave filters empty to include all students with hours in this period.
                </p>
              </div>
            </div>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setFilters(emptyFilters());
                  setStudentQuery('');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                <X className="h-3.5 w-3.5" /> Clear Filters
              </button>
            )}
          </div>

          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Year Level</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {yearOptions.length === 0 ? (
                <p className="text-xs font-medium text-slate-500">No year levels in this date range yet.</p>
              ) : yearOptions.map((key) => {
                const selected = filters.years.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleYear(key)}
                    aria-pressed={selected}
                    className={`rounded-xl border px-3.5 py-2 text-xs font-extrabold transition ${
                      selected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    {yearOptionLabel(key)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Specific Students
                </label>
                {filters.studentIds.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-extrabold text-blue-700">
                    <Users className="h-3 w-3" />
                    {filters.studentIds.length} selected
                  </span>
                )}
              </div>
              <div className="relative mt-1.5">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={studentQuery}
                  onChange={(event) => setStudentQuery(event.target.value)}
                  placeholder="Search name or student ID…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
              {studentChoices.length === 0 ? (
                <p className="mt-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-xs font-medium text-slate-500">
                  No students with hours match this search in the selected dates.
                </p>
              ) : (
                <ul className="mt-2.5 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                  {studentChoices.map((student) => {
                    const checked = filters.studentIds.includes(student.user_id);
                    return (
                      <li key={student.user_id}>
                        <label className={`flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-sm transition ${checked ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStudent(student.user_id)}
                            className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                          />
                          <span className="min-w-0">
                            <span className="font-bold text-slate-900">{student.name}</span>
                            <span className="font-mono text-xs text-slate-500">
                              {' '}· {student.student_id_number || 'No ID'} · {yearOptionLabel(yearKey(student))}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                <Filter className="h-3.5 w-3.5" /> Additional Filters
              </div>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Department
                <select
                  value={filters.department}
                  onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}
                  className={fieldClass}
                >
                  <option value="">All departments</option>
                  {departmentOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Course
                <select
                  value={filters.course}
                  onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))}
                  className={fieldClass}
                >
                  <option value="">All courses</option>
                  {courseOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        {rangeInvalid && (
          <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>The end date must be on or after the start date.</span>
          </div>
        )}

        {filteredReport && (
          <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-800 bg-slate-950 px-6 py-6 text-white shadow-xl shadow-slate-900/15 sm:px-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
              aria-hidden="true"
            />
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
            <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Grand Total Hours
                </p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
                  <p className="font-mono text-4xl font-black tabular-nums tracking-tight text-white">
                    {hoursText(filteredReport.grand.grand_total)}
                    <span className="ml-1.5 text-base font-bold text-slate-400">hrs</span>
                  </p>
                  <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 font-mono text-xs font-extrabold text-emerald-300">
                    {pesoText(filteredReport.grand.grand_total, hourlyRate)} at ₱{hoursText(hourlyRate)}/hr
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Included Cohort</p>
                <p className="mt-0.5 text-sm font-black text-white">
                  {filteredReport.grand.student_count} student{filteredReport.grand.student_count === 1 ? '' : 's'}
                  {filtersActive ? ' matching filters' : ' in this range'}
                </p>
              </div>
            </div>
          </div>
        )}
        <HourLimitApprovalsPanel
          readOnly={readOnly}
          userRole={localStorage.getItem('user_role') || undefined}
        />
        {startDate && endDate && !rangeInvalid && (
          <HoursActivityBoard
            readOnly={readOnly}
            periodStart={startDate}
            periodEnd={endDate}
            onChanged={() => setReloadKey((value) => value + 1)}
          />
        )}
        <YearLevelBreakdown report={filteredReport} rate={hourlyRate} />
      </div>
      <HoursSummarySheet report={filteredReport} rate={hourlyRate} filterNote={filterNote} />
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
