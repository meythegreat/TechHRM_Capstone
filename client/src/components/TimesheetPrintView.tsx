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
    // Format time helper
    const formatTime = (dateString: string | null) => {
        if (!dateString) return '--:--';
        return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    return (
        <div className="bg-white text-black p-8 max-w-[800px] mx-auto font-sans" style={{ printColorAdjust: 'exact' }}>
            
            {/* DOCUMENT HEADER */}
            <div className="text-center mb-8 border-b-2 border-black pb-6">
                <h1 className="text-2xl font-black uppercase tracking-widest">Filamer Christian University, Inc.</h1>
                <h2 className="text-lg font-bold text-gray-700 uppercase mt-1">Working Students Program Office (WSPO)</h2>
                <h3 className="text-xl font-bold mt-4 underline underline-offset-4">OFFICIAL TIMESHEET REPORT</h3>
                <p className="text-sm font-medium mt-2 text-gray-600">
                    Period: {startDate ? new Date(startDate).toLocaleDateString() : 'Start'} to {endDate ? new Date(endDate).toLocaleDateString() : 'Present'}
                </p>
            </div>

            {/* STUDENT DETAILS */}
            <div className="grid grid-cols-2 gap-4 mb-8 text-sm border-b border-gray-300 pb-6">
                <div>
                    <div className="flex mb-2"><span className="font-bold w-32">Student Name:</span> <span className="border-b border-black flex-1 uppercase">{fullName}</span></div>
                    <div className="flex mb-2"><span className="font-bold w-32">Student ID:</span> <span className="border-b border-black flex-1 font-mono">{studentProfile.student_id_number}</span></div>
                </div>
                <div>
                    <div className="flex mb-2"><span className="font-bold w-32">Course & Year:</span> <span className="border-b border-black flex-1 uppercase">{studentProfile.course} - {studentProfile.year_level}</span></div>
                    <div className="flex mb-2"><span className="font-bold w-32">Department:</span> <span className="border-b border-black flex-1 uppercase">{studentProfile.assigned_office}</span></div>
                </div>
            </div>

            {/* ATTENDANCE TABLE */}
            <table className="w-full text-sm border-collapse border border-black mb-8">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="border border-black p-2 text-left">Date</th>
                        <th className="border border-black p-2 text-center">Time In</th>
                        <th className="border border-black p-2 text-center">Time Out</th>
                        <th className="border border-black p-2 text-left">Work Type</th>
                        <th className="border border-black p-2 text-right">Hours</th>
                    </tr>
                </thead>
                <tbody>
                    {history.length === 0 ? (
                        <tr><td colSpan={5} className="border border-black p-4 text-center italic">No records found for this period.</td></tr>
                    ) : (
                        history.map((record) => (
                            <tr key={record.id}>
                                <td className="border border-black p-2 font-medium">{new Date(record.date || record.time_in).toLocaleDateString()}</td>
                                <td className="border border-black p-2 text-center">{formatTime(record.time_in)}</td>
                                <td className="border border-black p-2 text-center">{formatTime(record.time_out)}</td>
                                <td className="border border-black p-2">{record.work_type || 'Unspecified'}</td>
                                <td className="border border-black p-2 text-right font-bold">{Number(record.rendered_hours || 0).toFixed(2)}</td>
                            </tr>
                        ))
                    )}
                </tbody>
                <tfoot>
                    <tr className="bg-gray-100">
                        <td colSpan={4} className="border border-black p-2 text-right font-black uppercase tracking-wider">Total Rendered Hours:</td>
                        <td className="border border-black p-2 text-right font-black text-lg">{totalHours.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>

            {/* SIGNATURES */}
            <div className="grid grid-cols-2 gap-12 mt-16 pt-8">
                <div className="text-center">
                    <div className="border-b border-black w-full h-8 mb-2"></div>
                    <p className="font-bold text-sm uppercase">{fullName}</p>
                    <p className="text-xs text-gray-500">Student Signature over Printed Name</p>
                </div>
                <div className="text-center">
                    <div className="border-b border-black w-full h-8 mb-2"></div>
                    <p className="font-bold text-sm uppercase">Supervisor / Head of Office</p>
                    <p className="text-xs text-gray-500">Signature over Printed Name</p>
                </div>
            </div>

            <div className="text-center mt-12 text-[10px] text-gray-400 font-mono">
                Generated by TechHRM System • {new Date().toLocaleString()}
            </div>
        </div>
    );
};

export default TimesheetPrintView;