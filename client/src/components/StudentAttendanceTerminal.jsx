import React, { useEffect, useState } from 'react';
import {
    fetchWorkHourSummary,
    submitSecureClockIn,
    submitSecureClockOut,
} from '../services/advancedAttendanceService';

const StudentAttendanceTerminal = () => {
    const [summary, setSummary] = useState({
        total_rendered: 0,
        remaining_hours: 100,
        target_hours: 100,
        history: [],
    });
    const [tokenInput, setTokenInput] = useState('');
    const [dutyType, setDutyType] = useState('Regular');
    const [activeShift, setActiveShift] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        loadSummary();
        const localShift = localStorage.getItem('active_shift_segment');
        if (localShift) setActiveShift(JSON.parse(localShift));
    }, []);

    const loadSummary = async () => {
        try {
            const res = await fetchWorkHourSummary();
            setSummary(res.data);
            const openShift = res.data.history?.find((log) => !log.time_out);
            if (openShift) {
                setActiveShift(openShift);
                localStorage.setItem('active_shift_segment', JSON.stringify(openShift));
            }
        } catch (err) {
            console.error('Failed to load hour summary', err);
        }
    };

    const handleClockIn = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        try {
            const res = await submitSecureClockIn(tokenInput, dutyType);
            setActiveShift(res.data.attendance);
            localStorage.setItem('active_shift_segment', JSON.stringify(res.data.attendance));
            setTokenInput('');
            loadSummary();
        } catch (err) {
            setErrorMsg(err.response?.data?.message || 'Verification execution failed.');
        }
    };

    const handleClockOut = async () => {
        if (!activeShift) return;
        try {
            await submitSecureClockOut(activeShift.id);
            setActiveShift(null);
            localStorage.removeItem('active_shift_segment');
            loadSummary();
        } catch (err) {
            setErrorMsg(err.response?.data?.message || 'Failed to clock out.');
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border p-5 rounded-xl shadow-sm text-center">
                    <span className="text-xs text-gray-400 font-bold block uppercase tracking-wider">Total Accumulated</span>
                    <h3 className="text-3xl font-black text-gray-900 mt-1">{summary.total_rendered} hrs</h3>
                </div>
                <div className="bg-white border p-5 rounded-xl shadow-sm text-center">
                    <span className="text-xs text-gray-400 font-bold block uppercase tracking-wider">Remaining Deficit</span>
                    <h3 className="text-3xl font-black text-orange-600 mt-1">{summary.remaining_hours} hrs</h3>
                </div>
                <div className="bg-white border p-5 rounded-xl shadow-sm text-center">
                    <span className="text-xs text-gray-400 font-bold block uppercase tracking-wider">Target Threshold</span>
                    <h3 className="text-3xl font-black text-blue-900 mt-1">{summary.target_hours} hrs</h3>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 bg-white border p-6 rounded-xl shadow-sm h-fit">
                    <h2 className="font-extrabold text-lg mb-4 text-gray-800">Secure Time Logging</h2>

                    {activeShift ? (
                        <div className="space-y-4">
                            <div className="p-4 bg-green-50 border border-green-200 text-green-800 text-sm font-semibold rounded-lg">
                                Session Active: Tracking {activeShift.attendance_type || 'Regular'} duty segment.
                            </div>
                            <button
                                onClick={handleClockOut}
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow"
                            >
                                Terminate Logging Segment
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleClockIn} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold block uppercase tracking-wider mb-1 text-gray-500">
                                    Operation Mode
                                </label>
                                <select
                                    className="w-full p-2 border rounded-lg font-medium"
                                    value={dutyType}
                                    onChange={(e) => setDutyType(e.target.value)}
                                >
                                    <option value="Regular">Regular Scheduled Shift</option>
                                    <option value="Cleaning">Sanitation/Cleaning Duty</option>
                                    <option value="Meeting">Official Program Meeting</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold block uppercase tracking-wider mb-1 text-gray-500">
                                    Authentication Token
                                </label>
                                <input
                                    type="text"
                                    maxLength={6}
                                    required
                                    placeholder="ENTER CODE"
                                    className="w-full p-3 border rounded-xl text-center uppercase tracking-widest text-lg font-black"
                                    value={tokenInput}
                                    onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                                />
                            </div>
                            {errorMsg && (
                                <p className="text-xs font-bold text-red-600 bg-red-50 p-2 border border-red-200 rounded">
                                    {errorMsg}
                                </p>
                            )}
                            <button
                                type="submit"
                                className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold py-3 rounded-xl shadow"
                            >
                                Authorize Entry
                            </button>
                        </form>
                    )}
                </div>

                <div className="md:col-span-2 bg-white border p-6 rounded-xl shadow-sm overflow-hidden">
                    <h2 className="font-extrabold text-lg mb-4 text-gray-800">Attendance Log Trail</h2>
                    <div className="overflow-y-auto max-h-96 space-y-3">
                        {summary.history.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">No attendance records yet.</p>
                        ) : (
                            summary.history.map((log) => (
                                <div
                                    key={log.id}
                                    className="p-4 border rounded-xl flex justify-between items-center bg-gray-50"
                                >
                                    <div>
                                        <h4 className="font-bold text-sm text-gray-800">
                                            {log.attendance_type || 'Regular'} Duty Segment
                                        </h4>
                                        <p className="text-xs text-gray-500 mt-1">
                                            In: {log.time_in ? new Date(log.time_in).toLocaleString() : '—'}
                                        </p>
                                        {log.time_out && (
                                            <p className="text-xs text-gray-500">
                                                Out: {new Date(log.time_out).toLocaleString()}
                                            </p>
                                        )}
                                        {log.verification_code_used && (
                                            <p className="text-xs text-blue-600 mt-1">
                                                Token: {log.verification_code_used}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-black text-gray-900 block">
                                            {(log.computed_hours || log.rendered_hours || 0)} hrs
                                        </span>
                                        {log.is_anomaly && (
                                            <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block">
                                                Anomaly Flagged
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentAttendanceTerminal;
