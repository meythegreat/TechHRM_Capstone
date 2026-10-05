import React from 'react';

interface AttendanceRecord {
    id: number;
    date?: string | null;
    time_in: string;
    time_out: string | null;
    rendered_hours?: number | string | null;
    computed_hours?: number | string | null;
    work_type: string | null;
    task_description: string | null;
    status?: string | null;
}

interface TimesheetPrintViewProps {
    fullName: string;
    studentProfile: {
        student_id_number: string;
        course: string;
        year_level: string;
        assigned_office: string;
        duty_type?: string | null;
        supervisors?: string[];
    };
    history: AttendanceRecord[];
    totalHours: number;
    penaltyHours?: number;
    startDate: string;
    endDate: string;
}

interface DaySlots {
    amIn?: Date;
    amOut?: Date;
    pmIn?: Date;
    pmOut?: Date;
    remarks: string[];
}

const border = '1px solid #000';
const cell: React.CSSProperties = {
    border,
    padding: '1px 3px',
    fontSize: '9px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    verticalAlign: 'middle',
};
const th: React.CSSProperties = {
    ...cell,
    textAlign: 'center',
    fontWeight: 700,
    background: '#fff',
};

const formatClock = (date?: Date) => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const hoursFor = (record: AttendanceRecord) => Number(record.computed_hours || record.rendered_hours || 0);

const supervisorRemark = (record: AttendanceRecord) => {
    if (!record.time_out) return '';
    const status = String(record.status || '').toLowerCase();
    if (status === 'accepted' || status === 'approved') return 'Approved by supervisor';
    if (status === 'rejected') return 'Rejected by supervisor';
    return '';
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const mondayOf = (date: Date) => {
    const day = startOfDay(date);
    const weekday = day.getDay();
    const offset = weekday === 0 ? -6 : 1 - weekday;
    day.setDate(day.getDate() + offset);
    return day;
};

const weekdayShort = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short' });

const monthDay = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

interface WorkWeek {
    key: string;
    index: number;
    start: Date;
    end: Date;
    hours: number;
}

const isMorning = (date: Date) => date.getHours() < 12 || (date.getHours() === 12 && date.getMinutes() === 0);

const applyTime = (slots: DaySlots, date: Date, kind: 'in' | 'out') => {
    const isAm = isMorning(date);
    if (kind === 'in') {
        if (isAm) {
            if (!slots.amIn || date < slots.amIn) slots.amIn = date;
        } else if (!slots.pmIn || date < slots.pmIn) {
            slots.pmIn = date;
        }
        return;
    }
    if (isAm) {
        if (!slots.amOut || date > slots.amOut) slots.amOut = date;
    } else if (!slots.pmOut || date > slots.pmOut) {
        slots.pmOut = date;
    }
};

const TimesheetPrintView: React.FC<TimesheetPrintViewProps> = ({
    fullName,
    studentProfile,
    history,
    totalHours,
    penaltyHours = 0,
    startDate,
}) => {
    const monthBase = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    const year = monthBase.getFullYear();
    const month = monthBase.getMonth();
    const monthLabel = monthBase.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const byDay: Record<number, DaySlots> = {};
    history.forEach((record) => {
        if (!record.time_in) return;
        const timeIn = new Date(record.time_in);
        if (timeIn.getFullYear() !== year || timeIn.getMonth() !== month) return;
        const day = timeIn.getDate();
        if (!byDay[day]) byDay[day] = { remarks: [] };
        applyTime(byDay[day], timeIn, 'in');
        if (record.time_out) applyTime(byDay[day], new Date(record.time_out), 'out');
        const remark = supervisorRemark(record);
        if (remark && !byDay[day].remarks.includes(remark)) byDay[day].remarks.push(remark);
    });

    const supervisor = studentProfile.supervisors?.filter(Boolean).join(', ') || '';
    const dutyRaw = (studentProfile.duty_type || '').trim().toLowerCase();
    const dutyCode = dutyRaw.startsWith('clerical')
        ? 'C'
        : dutyRaw.startsWith('janitorial')
            ? 'J'
            : dutyRaw.startsWith('request')
                ? 'R'
                : '';
    const dutyMarks = [
        { code: 'C', label: 'Clerical (C)' },
        { code: 'J', label: 'Janitorial (J)' },
        { code: 'R', label: 'Request (R)' },
    ];

    const weekHours = new Map<string, number>();
    history.forEach((record) => {
        if (!record.time_in && !record.date) return;
        const when = record.time_in ? new Date(record.time_in) : new Date(`${record.date}T00:00:00`);
        if (Number.isNaN(when.getTime())) return;
        if (when.getFullYear() !== year || when.getMonth() !== month) return;
        const key = mondayOf(when).toDateString();
        weekHours.set(key, (weekHours.get(key) || 0) + hoursFor(record));
    });

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const workWeeks: WorkWeek[] = [];
    for (let monday = mondayOf(monthStart); monday <= monthEnd; monday.setDate(monday.getDate() + 7)) {
        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);
        const start = monday < monthStart ? new Date(monthStart) : new Date(monday);
        const end = friday > monthEnd ? new Date(monthEnd) : new Date(friday);
        if (start > end) continue;
        workWeeks.push({
            key: monday.toDateString(),
            index: workWeeks.length + 1,
            start,
            end,
            hours: weekHours.get(monday.toDateString()) || 0,
        });
    }

    const weekHoursTotal = workWeeks.reduce((sum, week) => sum + week.hours, 0);
    const monthHours = weekHoursTotal > 0 ? weekHoursTotal : totalHours;
    const dutyDeduction = Math.max(0, Number(penaltyHours) || 0);
    const netHours = Math.max(0, monthHours - dutyDeduction);

    return (
        <div
            className="dtr-sheet bg-white text-black mx-auto"
            style={{
                width: '190mm',
                maxWidth: '100%',
                padding: '6mm 8mm',
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#000',
                printColorAdjust: 'exact',
                WebkitPrintColorAdjust: 'exact',
            }}
        >
            <div className="flex items-center justify-between gap-3 mb-1">
                <img src="/fcu.jpg" alt="Filamer Christian University" className="dtr-logo w-[56px] h-[56px] object-contain shrink-0" />
                <div className="text-center flex-1">
                    <p className="font-bold text-[11px] leading-tight tracking-wide">FILAMER CHRISTIAN UNIVERSITY, INC.</p>
                    <p className="font-bold text-[11px] leading-tight">Work Study Program Organization</p>
                    <p className="font-bold text-[11px] leading-tight">Roxas City</p>
                </div>
                <img src="/logo.jpg" alt="Work Study Program Organization" className="dtr-logo w-[56px] h-[56px] object-contain shrink-0" />
            </div>

            <table className="w-full border-collapse mb-1.5" style={{ borderCollapse: 'collapse' }}>
                <tbody>
                    <tr>
                        <td style={{ ...cell, width: '22%' }}>Document Name:</td>
                        <td style={{ ...cell, width: '28%' }}>WSPO Daily Time Record</td>
                        <td style={{ ...cell, width: '22%' }}>Effectivity:</td>
                        <td style={{ ...cell, width: '28%' }}>September 8, 2022</td>
                    </tr>
                    <tr>
                        <td style={cell}>Document No:</td>
                        <td style={cell}>WSPO – 2022 – 03</td>
                        <td style={cell}>Issuing Office:</td>
                        <td style={cell}>WSPO</td>
                    </tr>
                    <tr>
                        <td style={cell}>Revision No:</td>
                        <td style={cell}>1</td>
                        <td style={cell}>Page No:</td>
                        <td style={cell}>1</td>
                    </tr>
                </tbody>
            </table>

            <p className="text-center font-bold text-[12px] mb-1.5">WSPO Daily Time Record</p>

            <div className="flex gap-2 mb-1.5 items-start">
                <table className="flex-1 border-collapse" style={{ borderCollapse: 'collapse' }}>
                    <tbody>
                        <tr>
                            <td style={{ ...cell, width: '34%' }}>Name:</td>
                            <td style={{ ...cell, fontWeight: 700 }}>{fullName}</td>
                        </tr>
                        <tr>
                            <td style={cell}>For the month of:</td>
                            <td style={{ ...cell, fontWeight: 700 }}>{monthLabel}</td>
                        </tr>
                        <tr>
                            <td style={cell}>Area of Assignment:</td>
                            <td style={{ ...cell, fontWeight: 700 }}>{studentProfile.assigned_office || ''}</td>
                        </tr>
                    </tbody>
                </table>
                <table className="border-collapse shrink-0" style={{ borderCollapse: 'collapse', width: '132px' }}>
                    <tbody>
                        {dutyMarks.map((duty) => (
                            <tr key={duty.code}>
                                <td style={{ ...cell, fontWeight: 700, whiteSpace: 'nowrap', fontSize: '8px' }}>{duty.label}</td>
                                <td style={{ ...cell, width: '22px', textAlign: 'center', fontWeight: 700, fontSize: '11px' }}>
                                    {dutyCode === duty.code ? '✓' : ''}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <table className="w-full border-collapse" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                    <tr>
                        <th rowSpan={2} style={{ ...th, width: '8%' }}>Day</th>
                        <th colSpan={2} style={th}>AM</th>
                        <th colSpan={2} style={th}>PM</th>
                        <th rowSpan={2} style={{ ...th, width: '28%' }}>Remarks</th>
                    </tr>
                    <tr>
                        <th style={th}>Arrival</th>
                        <th style={th}>Departure</th>
                        <th style={th}>Arrival</th>
                        <th style={th}>Departure</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: 31 }, (_, index) => {
                        const day = index + 1;
                        const slots = byDay[day];
                        const dayExists = new Date(year, month, day).getMonth() === month;
                        const td: React.CSSProperties = {
                            ...cell,
                            textAlign: 'center',
                            height: '13px',
                            lineHeight: 1.1,
                            padding: '0 3px',
                            fontSize: '9px',
                            color: dayExists ? '#000' : '#999',
                        };
                        return (
                            <tr key={day}>
                                <td style={{ ...td, fontWeight: 700 }}>{day}</td>
                                <td style={td}>{dayExists ? formatClock(slots?.amIn) : ''}</td>
                                <td style={td}>{dayExists ? formatClock(slots?.amOut) : ''}</td>
                                <td style={td}>{dayExists ? formatClock(slots?.pmIn) : ''}</td>
                                <td style={td}>{dayExists ? formatClock(slots?.pmOut) : ''}</td>
                                <td style={{ ...td, textAlign: 'left', fontSize: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dayExists ? (slots?.remarks.join(', ') || '') : ''}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <table className="w-full border-collapse mt-1.5" style={{ borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th style={{ ...th, width: '18%', fontSize: '9px' }}>Week</th>
                        <th style={{ ...th, fontSize: '9px' }}>Dates (Monday – Friday)</th>
                        <th style={{ ...th, width: '18%', fontSize: '9px' }}>Hours</th>
                    </tr>
                </thead>
                <tbody>
                    {workWeeks.map((week) => {
                        const sameDay = week.start.toDateString() === week.end.toDateString();
                        const range = sameDay
                            ? `${monthDay(week.start)} (${weekdayShort(week.start)})`
                            : `${monthDay(week.start)} – ${monthDay(week.end)} (${weekdayShort(week.start)}–${weekdayShort(week.end)})`;
                        return (
                            <tr key={week.key}>
                                <td style={{ ...cell, textAlign: 'center', fontWeight: 700, fontSize: '9px', padding: '1px 3px' }}>
                                    Week {week.index}
                                </td>
                                <td style={{ ...cell, textAlign: 'center', fontSize: '9px', padding: '1px 3px' }}>{range}</td>
                                <td style={{ ...cell, textAlign: 'center', fontWeight: 700, fontSize: '9px', padding: '1px 3px' }}>
                                    {week.hours.toFixed(2)}
                                </td>
                            </tr>
                        );
                    })}
                    <tr>
                        <td colSpan={2} style={{ ...cell, textAlign: 'right', fontWeight: 700, fontSize: '10px', padding: '2px 6px' }}>
                            Total hours for {monthLabel}
                        </td>
                        <td style={{ ...cell, textAlign: 'center', fontWeight: 700, fontSize: '10px', padding: '2px 3px' }}>
                            {monthHours.toFixed(2)}
                        </td>
                    </tr>
                    {dutyDeduction > 0 && (
                        <>
                            <tr>
                                <td colSpan={2} style={{ ...cell, textAlign: 'right', fontWeight: 700, fontSize: '10px', padding: '2px 6px' }}>
                                    Duty deduction (infraction)
                                </td>
                                <td style={{ ...cell, textAlign: 'center', fontWeight: 700, fontSize: '10px', padding: '2px 3px' }}>
                                    -{dutyDeduction.toFixed(2)}
                                </td>
                            </tr>
                            <tr>
                                <td colSpan={2} style={{ ...cell, textAlign: 'right', fontWeight: 700, fontSize: '10px', padding: '2px 6px' }}>
                                    Credited hours
                                </td>
                                <td style={{ ...cell, textAlign: 'center', fontWeight: 700, fontSize: '10px', padding: '2px 3px' }}>
                                    {netHours.toFixed(2)}
                                </td>
                            </tr>
                        </>
                    )}
                </tbody>
            </table>
            <p className="text-center text-[9px] leading-snug my-1.5 px-4">
                I CERTIFY on my honor that above is true and correct report of hours of work performed, record which was daily time arrival and at departure from the office.
            </p>

            <div className="flex gap-10 mt-2">
                <div className="flex-1 text-center">
                    <div style={{ height: '28px', borderBottom: '1px solid #000' }} />
                    <div style={{ fontSize: '9px', fontWeight: 700, paddingTop: '3px' }}>
                        {supervisor || 'Immediate Supervisor'}
                    </div>
                    {supervisor ? <div style={{ fontSize: '8px' }}>Immediate Supervisor</div> : null}
                </div>
                <div className="flex-1 text-center">
                    <div style={{ height: '28px', borderBottom: '1px solid #000' }} />
                    <div style={{ fontSize: '9px', fontWeight: 700, paddingTop: '3px' }}>{fullName}</div>
                    <div style={{ fontSize: '8px' }}>Working Student</div>
                </div>
            </div>
        </div>
    );
};

export default TimesheetPrintView;
