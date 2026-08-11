import React from 'react';

interface AttendanceRecord {
    id: number;
    date: string;
    time_in: string;
    time_out: string | null;
    rendered_hours: number | string | null;
    work_type: string | null;
    task_description: string | null;
}

interface TimesheetPrintViewProps {
    fullName: string;
    studentProfile: {
        student_id_number: string;
        course: string;
        year_level: string;
        assigned_office: string;
    };
    history: AttendanceRecord[];
    totalHours: number;
    startDate: string;
    endDate: string;
}

const TimesheetPrintView: React.FC<TimesheetPrintViewProps> = ({ fullName, studentProfile, history, totalHours, startDate, endDate }) => {
    
    // Format time helper (12-hour format)
    const formatTime = (dateString: string | null) => {
        if (!dateString) return '--:--';
        return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    // Format date helper
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Generate a pseudo-random document ID for official appearance
    const documentId = `TS-${new Date().getTime().toString().slice(-6)}-${studentProfile.student_id_number.slice(-4) || 'XXXX'}`;

    return (
        <div className="bg-white text-slate-900 p-10 max-w-[850px] mx-auto font-sans" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
            
            {/* OFFICIAL LETTERHEAD */}
            <div className="flex items-center justify-between border-b-4 border-slate-900 pb-6 mb-6">
                <div className="flex items-center gap-5">
                    {/* Placeholder for University Logo */}
                    <div className="w-16 h-16 bg-slate-100 border-2 border-slate-900 rounded-full flex items-center justify-center font-black text-xs text-center leading-tight">
                        FCU<br/>LOGO
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-widest text-slate-900 leading-none">Filamer Christian Univ.</h1>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-600 mt-1.5">Work-Study Program Organization</h2>
                    </div>
                </div>
                <div className="text-right">
                    <h3 className="text-xl font-black uppercase tracking-widest text-blue-800">Timesheet Report</h3>
                    <p className="text-xs font-bold text-slate-500 font-mono mt-1">REF: {documentId}</p>
                </div>
            </div>

            {/* STUDENT INFORMATION GRID */}
            <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="border border-slate-300 rounded-lg p-4 bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Student Worker Name</p>
                    <p className="font-black text-lg text-slate-900 uppercase">{fullName}</p>
                    <div className="flex items-center gap-3 mt-2">
                        <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs font-bold font-mono text-slate-600">
                            {studentProfile.student_id_number || 'No ID Provided'}
                        </span>
                        <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600">
                            {studentProfile.course} - Yr {studentProfile.year_level}
                        </span>
                    </div>
                </div>
                <div className="border border-slate-300 rounded-lg p-4 bg-slate-50">
                    <div className="mb-3">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Assigned Department / Office</p>
                        <p className="font-bold text-sm text-slate-900">{studentProfile.assigned_office || 'Unassigned'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Payroll Period</p>
                        <p className="font-bold text-sm text-blue-800">
                            {startDate ? formatDate(startDate) : 'Start'} — {endDate ? formatDate(endDate) : 'End'}
                        </p>
                    </div>
                </div>
            </div>

            {/* ATTENDANCE TABLE */}
            <div className="mb-8">
                <table className="w-full text-sm border-collapse border border-slate-400">
                    <thead>
                        <tr className="bg-slate-800 text-white">
                            <th className="border border-slate-700 p-2.5 text-left font-bold uppercase tracking-wider text-xs">Date</th>
                            <th className="border border-slate-700 p-2.5 text-center font-bold uppercase tracking-wider text-xs">Time In</th>
                            <th className="border border-slate-700 p-2.5 text-center font-bold uppercase tracking-wider text-xs">Time Out</th>
                            <th className="border border-slate-700 p-2.5 text-left font-bold uppercase tracking-wider text-xs">Activity / Task Description</th>
                            <th className="border border-slate-700 p-2.5 text-right font-bold uppercase tracking-wider text-xs w-20">Hours</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="border border-slate-300 p-6 text-center text-slate-500 font-bold italic">
                                    No attendance records found for this selected period.
                                </td>
                            </tr>
                        ) : (
                            history.map((record) => (
                                <tr key={record.id} className="even:bg-slate-50">
                                    <td className="border border-slate-300 p-2.5 font-medium whitespace-nowrap">{formatDate(record.date)}</td>
                                    <td className="border border-slate-300 p-2.5 text-center font-mono text-xs">{formatTime(record.time_in)}</td>
                                    <td className="border border-slate-300 p-2.5 text-center font-mono text-xs">{formatTime(record.time_out)}</td>
                                    <td className="border border-slate-300 p-2.5">
                                        <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">{record.work_type || 'Assigned Duty'}</span>
                                        <span className="text-slate-800 text-xs font-medium">{record.task_description || '—'}</span>
                                    </td>
                                    <td className="border border-slate-300 p-2.5 text-right font-bold font-mono">
                                        {record.rendered_hours ? Number(record.rendered_hours).toFixed(2) : '0.00'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    <tfoot>
                        <tr className="bg-slate-100">
                            <td colSpan={4} className="border border-slate-400 p-3 text-right font-black uppercase tracking-wider text-slate-900">Total Validated Hours:</td>
                            <td className="border border-slate-400 p-3 text-right font-black text-lg text-slate-900 font-mono bg-blue-50">
                                {totalHours.toFixed(2)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* CERTIFICATION & SIGNATURE BLOCK */}
            <div className="mt-16 pt-6">
                <p className="text-xs font-medium text-slate-500 italic mb-12">
                    I hereby certify that the above records are true and correct, representing the actual and verified hours rendered for the FCU Work-Study Program.
                </p>
                <div className="grid grid-cols-2 gap-16">
                    <div className="text-center">
                        <div className="border-b-2 border-slate-900 w-full h-8 mb-2"></div>
                        <p className="font-black text-sm uppercase text-slate-900">{fullName}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Student Worker Signature</p>
                    </div>
                    <div className="text-center">
                        <div className="border-b-2 border-slate-900 w-full h-8 mb-2"></div>
                        <p className="font-black text-sm uppercase text-slate-900">Supervisor / Office Head</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Signature Over Printed Name</p>
                    </div>
                </div>
            </div>

            {/* OFFICIAL FOOTER / WATERMARK */}
            <div className="mt-16 pt-4 border-t border-slate-200 flex justify-between items-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Generated by TechHRM Core System
                </div>
                <div className="text-[10px] font-bold text-slate-400 font-mono">
                    Printed: {new Date().toLocaleString()}
                </div>
            </div>
        </div>
    );
};

export default TimesheetPrintView;