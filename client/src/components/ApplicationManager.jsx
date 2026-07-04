import React, { useEffect, useState } from 'react';
import {
    getAllApplications,
    updateApplicationStatus,
    updateApplicationSchedule,
    getMatchingSuggestions,
    assignPlacement,
} from '../services/applicationService';

const STAGE_ORDER = ['Pending', 'Interview', 'Training', 'For Result', 'Approved'];

const getNextStage = (status) => {
    const index = STAGE_ORDER.indexOf(status);
    if (index === -1 || index >= STAGE_ORDER.length - 2) return null;
    return STAGE_ORDER[index + 1];
};

const ApplicationManager = () => {
    const [applications, setApplications] = useState([]);
    const [modalView, setModalView] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [placementData, setPlacementData] = useState({ assigned_department: '', assigned_position: '' });
    const [interviewData, setInterviewData] = useState({ interview_date: '', interview_remarks: '' });
    const [error, setError] = useState(null);

    useEffect(() => { fetchApplications(); }, []);

    const fetchApplications = async () => {
        try {
            setError(null);
            const res = await getAllApplications();
            setApplications(res.data);
        } catch (err) {
            setError('Failed to load applications.');
            console.error(err);
        }
    };

    const handleAdvanceStage = async (app) => {
        const nextStage = getNextStage(app.status);
        if (!nextStage) return;
        await updateApplicationStatus(app.id, nextStage);
        fetchApplications();
    };

    const handleReject = async (app) => {
        if (!window.confirm(`Reject application for ${app.applicant?.name}?`)) return;
        await updateApplicationStatus(app.id, 'Rejected');
        fetchApplications();
    };

    const openInterviewModal = (app) => {
        setSelectedApp(app);
        setInterviewData({ interview_date: '', interview_remarks: '' });
        setModalView('interview');
    };

    const submitInterview = async () => {
        if (!interviewData.interview_date) return;
        await updateApplicationSchedule(selectedApp.id, interviewData);
        setModalView('');
        fetchApplications();
    };

    const handlePlacementClick = async (app) => {
        setSelectedApp(app);
        setPlacementData({ assigned_department: '', assigned_position: '' });
        const res = await getMatchingSuggestions(app.id);
        setSuggestions(res.data.suggestions);
        setModalView('placement');
    };

    const submitPlacement = async () => {
        await assignPlacement(selectedApp.id, placementData);
        setModalView('');
        fetchApplications();
    };

    const renderActions = (app) => {
        if (app.status === 'Approved') {
            return (
                <span className="text-green-700 font-bold text-sm">
                    Placed — {app.assigned_department}
                </span>
            );
        }

        if (app.status === 'Rejected') {
            return <span className="text-red-600 font-bold text-sm">Rejected</span>;
        }

        const nextStage = getNextStage(app.status);
        const canPlace = ['Interview', 'Training', 'For Result'].includes(app.status);

        return (
            <div className="flex flex-wrap gap-2">
                {app.status === 'Pending' && (
                    <button
                        onClick={() => openInterviewModal(app)}
                        className="bg-indigo-600 text-white px-3 py-1 rounded text-sm font-bold"
                    >
                        Schedule Interview
                    </button>
                )}
                {nextStage && app.status !== 'Pending' && (
                    <button
                        onClick={() => handleAdvanceStage(app)}
                        className="text-indigo-600 font-bold hover:underline text-sm"
                    >
                        Move to {nextStage}
                    </button>
                )}
                {canPlace && (
                    <button
                        onClick={() => handlePlacementClick(app)}
                        className="bg-green-600 text-white px-3 py-1 rounded text-sm font-bold shadow hover:bg-green-700"
                    >
                        Match & Place
                    </button>
                )}
                <button
                    onClick={() => handleReject(app)}
                    className="text-red-600 font-bold hover:underline text-sm"
                >
                    Reject
                </button>
            </div>
        );
    };

    return (
        <div className="p-6">
            <h2 className="text-2xl font-bold mb-6">Application Pipeline</h2>
            {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg font-bold text-sm">{error}</div>
            )}
            <table className="min-w-full bg-white shadow-sm rounded-lg overflow-hidden border">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="px-6 py-3 text-left font-bold text-xs uppercase">Student</th>
                        <th className="px-6 py-3 text-left font-bold text-xs uppercase">Preferred Dept</th>
                        <th className="px-6 py-3 text-left font-bold text-xs uppercase">Status</th>
                        <th className="px-6 py-3 text-left font-bold text-xs uppercase">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {applications.length === 0 ? (
                        <tr>
                            <td colSpan={4} className="px-6 py-8 text-center text-gray-500 italic">
                                No applications in the pipeline.
                            </td>
                        </tr>
                    ) : (
                        applications.map(app => (
                            <tr key={app.id} className="border-t">
                                <td className="px-6 py-4">{app.applicant?.name || 'Unknown Student'}</td>
                                <td className="px-6 py-4">{app.preferred_department}</td>
                                <td className="px-6 py-4 font-bold text-blue-600">{app.status}</td>
                                <td className="px-6 py-4">{renderActions(app)}</td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {modalView === 'interview' && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl w-[440px] shadow-2xl">
                        <h3 className="font-bold text-xl mb-1">Schedule Interview</h3>
                        <p className="text-sm text-gray-500 mb-4">{selectedApp?.applicant?.name}</p>
                        <input
                            type="datetime-local"
                            required
                            className="w-full p-2.5 border rounded-lg mb-4"
                            value={interviewData.interview_date}
                            onChange={(e) => setInterviewData({ ...interviewData, interview_date: e.target.value })}
                        />
                        <textarea
                            className="w-full p-2.5 border rounded-lg mb-4"
                            placeholder="Remarks (e.g., Bring ID, room number...)"
                            value={interviewData.interview_remarks}
                            onChange={(e) => setInterviewData({ ...interviewData, interview_remarks: e.target.value })}
                        />
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setModalView('')} className="px-5 py-2.5 bg-gray-100 rounded-lg font-bold">
                                Cancel
                            </button>
                            <button
                                onClick={submitInterview}
                                disabled={!interviewData.interview_date}
                                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50"
                            >
                                Save & Move to Interview
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {modalView === 'placement' && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl w-[500px] shadow-2xl">
                        <h3 className="font-bold text-xl mb-1 text-gray-800">Automated Placement</h3>
                        <p className="text-sm text-gray-500 mb-4">Matching suggestions for {selectedApp?.applicant?.name}</p>
                        <div className="mb-6 max-h-48 overflow-y-auto space-y-2">
                            {suggestions.length > 0 ? suggestions.map((sug, idx) => (
                                <div
                                    key={idx}
                                    className="p-3 border rounded-lg bg-blue-50/50 border-blue-100 flex justify-between items-center cursor-pointer hover:bg-blue-100 transition-colors"
                                    onClick={() => setPlacementData({ assigned_department: sug.department, assigned_position: sug.position })}
                                >
                                    <div>
                                        <div className="font-bold text-sm text-blue-900">{sug.department}</div>
                                        <div className="text-xs text-blue-700">{sug.position}</div>
                                    </div>
                                    <div className="bg-green-100 text-green-800 px-2 py-1 rounded font-black text-sm">
                                        {sug.match_score}
                                    </div>
                                </div>
                            )) : (
                                <div className="p-4 text-center text-gray-500 text-sm italic">
                                    No high-confidence matches found. Manual placement required.
                                </div>
                            )}
                        </div>
                        <div className="space-y-3 border-t pt-4">
                            <h4 className="font-bold text-sm text-gray-700 uppercase tracking-wider">Final Assignment</h4>
                            <input
                                type="text"
                                placeholder="Assigned Department"
                                value={placementData.assigned_department}
                                className="w-full p-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                                onChange={(e) => setPlacementData({ ...placementData, assigned_department: e.target.value })}
                            />
                            <input
                                type="text"
                                placeholder="Assigned Position"
                                value={placementData.assigned_position}
                                className="w-full p-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                                onChange={(e) => setPlacementData({ ...placementData, assigned_position: e.target.value })}
                            />
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setModalView('')} className="px-5 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-lg">
                                Cancel
                            </button>
                            <button
                                onClick={submitPlacement}
                                disabled={!placementData.assigned_department || !placementData.assigned_position}
                                className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-lg disabled:opacity-50"
                            >
                                Confirm Placement
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApplicationManager;
