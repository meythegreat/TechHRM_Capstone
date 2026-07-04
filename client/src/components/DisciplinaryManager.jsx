import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAllViolations, issueViolation, resolveViolation } from '../services/disciplinaryService';

const DisciplinaryManager = () => {
    const [records, setRecords] = useState([]);
    const [students, setStudents] = useState([]);
    const [formData, setFormData] = useState({
        student_id: '',
        violation_type: 'Tardiness',
        description: '',
        penalty_hours: 0,
    });
    const [resolveModal, setResolveModal] = useState(null);
    const [resolveData, setResolveData] = useState({ status: 'Resolved', resolution_remarks: '' });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchRecords();
        axios.get('/api/users')
            .then(res => {
                const usersArray = Array.isArray(res.data) ? res.data : res.data?.data;

                if (!Array.isArray(usersArray)) {
                    console.error('Could not find an array of users in the response', res.data);
                    setStudents([]);
                    return;
                }

                const studentUsers = usersArray.filter(
                    user => user.role && user.role.toLowerCase() === 'student'
                );

                setStudents(studentUsers);
            })
            .catch(err => console.error('Failed to load students', err));
    }, []);

    const fetchRecords = async () => {
        try {
            const res = await getAllViolations();
            setRecords(res.data);
        } catch (err) {
            console.error('Failed to load violations', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIssueViolation = async (e) => {
        e.preventDefault();
        await issueViolation({
            ...formData,
            penalty_hours: Number(formData.penalty_hours) || 0,
        });
        fetchRecords();
        setFormData({ student_id: '', violation_type: 'Tardiness', description: '', penalty_hours: 0 });
    };

    const handleResolve = async () => {
        if (!resolveData.resolution_remarks.trim()) return;
        await resolveViolation(resolveModal.id, resolveData);
        setResolveModal(null);
        setResolveData({ status: 'Resolved', resolution_remarks: '' });
        fetchRecords();
    };

    if (isLoading) {
        return <div className="p-6 text-gray-500 font-bold">Loading compliance records...</div>;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            <div className="col-span-1 bg-white p-6 rounded-xl shadow-sm border h-fit">
                <h2 className="font-extrabold text-lg mb-4 text-red-700">Issue Disciplinary Action</h2>
                <form onSubmit={handleIssueViolation} className="space-y-4">
                    <div>
                        <label className="text-xs font-bold block uppercase mb-1">Student</label>
                        <select
                            required
                            className="w-full p-2 border rounded"
                            value={formData.student_id}
                            onChange={e => setFormData({ ...formData, student_id: e.target.value })}
                        >
                            <option value="">Select Student...</option>
                            {students.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold block uppercase mb-1">Infraction Type</label>
                        <select
                            required
                            className="w-full p-2 border rounded"
                            value={formData.violation_type}
                            onChange={e => setFormData({ ...formData, violation_type: e.target.value })}
                        >
                            <option value="Tardiness">Tardiness / Late</option>
                            <option value="AWOL">AWOL / Unexcused Absence</option>
                            <option value="Insubordination">Insubordination</option>
                            <option value="Policy Breach">Policy Breach</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold block uppercase mb-1">Incident Description</label>
                        <textarea
                            required
                            className="w-full p-2 border rounded"
                            rows={3}
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold block uppercase mb-1">Penalty (Hours to Add)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.5"
                            className="w-full p-2 border rounded"
                            value={formData.penalty_hours}
                            onChange={e => setFormData({ ...formData, penalty_hours: e.target.value })}
                        />
                    </div>
                    <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded">
                        Log Violation
                    </button>
                </form>
            </div>

            <div className="col-span-2">
                <h2 className="font-extrabold text-lg mb-4 text-gray-800">Compliance & Appeals Monitor</h2>
                {records.length === 0 ? (
                    <p className="text-gray-500 italic">No disciplinary records on file.</p>
                ) : (
                    <div className="space-y-4 max-h-[700px] overflow-y-auto">
                        {records.map(rec => (
                            <div
                                key={rec.id}
                                className={`p-4 bg-white border rounded-xl shadow-sm ${
                                    rec.status === 'Pending Appeal' ? 'ring-2 ring-yellow-400' : ''
                                }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 className="font-bold">{rec.student?.name}</h4>
                                        <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                                            {rec.violation_type}
                                        </span>
                                    </div>
                                    <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded uppercase tracking-wider">
                                        {rec.status}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 my-2">{rec.description}</p>
                                {Number(rec.penalty_hours) > 0 && (
                                    <p className="text-xs font-bold text-red-600">Penalty: +{rec.penalty_hours} hrs</p>
                                )}

                                {rec.status === 'Pending Appeal' && (
                                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                        <p className="text-xs font-bold text-yellow-800 uppercase">Student Appeal Request:</p>
                                        <p className="text-sm text-yellow-900 italic mt-1">{rec.appeal_notes}</p>
                                        <button
                                            onClick={() => {
                                                setResolveModal(rec);
                                                setResolveData({ status: 'Resolved', resolution_remarks: '' });
                                            }}
                                            className="mt-3 bg-yellow-600 text-white text-xs px-3 py-1.5 font-bold rounded"
                                        >
                                            Review & Resolve
                                        </button>
                                    </div>
                                )}

                                {rec.status === 'Active' && (
                                    <button
                                        onClick={() => {
                                            setResolveModal(rec);
                                            setResolveData({ status: 'Resolved', resolution_remarks: '' });
                                        }}
                                        className="mt-2 text-xs font-bold text-blue-600 underline"
                                    >
                                        Close Case Manually
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {resolveModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl w-full max-w-lg shadow-xl">
                        <h3 className="font-bold text-lg mb-4">Resolve Infraction Case</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            {resolveModal.student?.name} — {resolveModal.violation_type}
                        </p>
                        <div className="mb-4">
                            <label className="text-xs font-bold block uppercase mb-1">Final Verdict</label>
                            <select
                                className="w-full p-2 border rounded"
                                value={resolveData.status}
                                onChange={e => setResolveData({ ...resolveData, status: e.target.value })}
                            >
                                <option value="Resolved">Resolved (Penalty Stands)</option>
                                <option value="Dismissed">Dismissed (Appeal Accepted / Excused)</option>
                            </select>
                        </div>
                        <div className="mb-4">
                            <label className="text-xs font-bold block uppercase mb-1">Resolution Remarks</label>
                            <textarea
                                className="w-full p-2 border rounded h-24"
                                placeholder="State why this was dismissed or resolved..."
                                value={resolveData.resolution_remarks}
                                onChange={e => setResolveData({ ...resolveData, resolution_remarks: e.target.value })}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setResolveModal(null)}
                                className="px-4 py-2 bg-gray-200 rounded text-sm font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleResolve}
                                disabled={!resolveData.resolution_remarks.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold disabled:opacity-50"
                            >
                                Finalize Case
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DisciplinaryManager;
