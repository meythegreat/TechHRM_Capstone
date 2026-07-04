import React, { useEffect, useState } from 'react';
import { getMyViolations, submitAppeal } from '../services/disciplinaryService';

const StudentDisciplinaryBoard = () => {
    const [records, setRecords] = useState([]);
    const [appealModal, setAppealModal] = useState(null);
    const [appealNotes, setAppealNotes] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { fetchRecords(); }, []);

    const fetchRecords = async () => {
        try {
            const res = await getMyViolations();
            setRecords(res.data);
        } catch (err) {
            console.error('Failed to load disciplinary records', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAppealSubmit = async () => {
        if (!appealNotes.trim()) return;
        await submitAppeal(appealModal, appealNotes);
        setAppealModal(null);
        setAppealNotes('');
        fetchRecords();
    };

    if (isLoading) {
        return <div className="p-6 text-gray-500 font-bold">Loading disciplinary records...</div>;
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <h2 className="text-2xl font-black text-gray-800">My Disciplinary & Compliance Records</h2>

            {records.length === 0 ? (
                <div className="p-6 bg-green-50 text-green-700 font-bold rounded-xl border border-green-200">
                    Clean Record! You have no disciplinary infractions.
                </div>
            ) : (
                <div className="space-y-4">
                    {records.map(record => (
                        <div
                            key={record.id}
                            className={`p-5 border-l-4 rounded-xl shadow-sm bg-white ${
                                record.status === 'Resolved' || record.status === 'Dismissed'
                                    ? 'border-gray-400'
                                    : 'border-red-500'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="font-bold text-lg text-red-700">{record.violation_type}</h3>
                                    <p className="text-xs text-gray-500 font-semibold uppercase">
                                        Issued by: {record.issuer?.name}
                                    </p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                    record.status === 'Active' ? 'bg-red-100 text-red-800' :
                                    record.status === 'Pending Appeal' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                                }`}>
                                    {record.status}
                                </span>
                            </div>
                            <p className="text-gray-700 text-sm mb-4">{record.description}</p>

                            {Number(record.penalty_hours) > 0 && (
                                <p className="text-sm font-bold text-red-600 bg-red-50 inline-block px-2 py-1 rounded mb-4">
                                    Penalty: +{record.penalty_hours} hours added to requirement
                                </p>
                            )}

                            {record.status === 'Active' && (
                                <button
                                    onClick={() => { setAppealModal(record.id); setAppealNotes(''); }}
                                    className="text-sm font-bold text-blue-600 underline"
                                >
                                    File an Appeal
                                </button>
                            )}

                            {record.status === 'Pending Appeal' && record.appeal_notes && (
                                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                                    <p className="font-bold text-yellow-800">Your appeal (pending review):</p>
                                    <p className="text-yellow-900 italic mt-1">{record.appeal_notes}</p>
                                </div>
                            )}

                            {(record.status === 'Resolved' || record.status === 'Dismissed') && (
                                <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
                                    <p className="font-bold text-gray-700">Resolution ({record.status}):</p>
                                    <p className="text-gray-600 italic">{record.resolution_remarks}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {appealModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl w-full max-w-lg shadow-xl">
                        <h3 className="font-bold text-lg mb-2">Submit Formal Appeal</h3>
                        <p className="text-xs text-gray-500 mb-4">
                            Explain your side of the incident. This will be reviewed by WSPO Admin.
                        </p>
                        <textarea
                            className="w-full p-3 border rounded-lg h-32 mb-4"
                            placeholder="Type your explanation here..."
                            value={appealNotes}
                            onChange={e => setAppealNotes(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setAppealModal(null)}
                                className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAppealSubmit}
                                disabled={!appealNotes.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50"
                            >
                                Submit Appeal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentDisciplinaryBoard;
