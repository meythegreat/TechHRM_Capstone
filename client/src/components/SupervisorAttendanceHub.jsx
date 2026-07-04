import React, { useEffect, useState } from 'react';
import { generateSecureToken, fetchAnomalyLogs } from '../services/advancedAttendanceService';

const SupervisorAttendanceHub = () => {
    const [selectedType, setSelectedType] = useState('Daily Clock');
    const [descInput, setDescInput] = useState('');
    const [activeToken, setActiveToken] = useState(null);
    const [anomalies, setAnomalies] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadAnomalies();
    }, []);

    const loadAnomalies = async () => {
        try {
            const res = await fetchAnomalyLogs();
            setAnomalies(res.data);
        } catch (err) {
            console.error('Failed to load anomalies', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateToken = async (e) => {
        e.preventDefault();
        const res = await generateSecureToken(selectedType, descInput);
        setActiveToken(res.data.token);
        setDescInput('');
    };

    if (isLoading) {
        return <div className="p-6 text-gray-500 font-bold">Loading attendance hub...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 bg-white border p-6 rounded-xl shadow-sm h-fit">
                <h2 className="font-extrabold text-lg mb-4 text-gray-800">Token Validation Generator</h2>
                <form onSubmit={handleCreateToken} className="space-y-4">
                    <div>
                        <label className="text-xs font-bold block uppercase tracking-wider mb-1 text-gray-500">
                            Validation Context
                        </label>
                        <select
                            className="w-full p-2 border rounded-lg font-medium"
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                        >
                            <option value="Daily Clock">Standard Shift Code</option>
                            <option value="Cleaning">Sanitation/Cleaning Log Validation</option>
                            <option value="Meeting">Meeting Assembly Validation</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold block uppercase tracking-wider mb-1 text-gray-500">
                            Context/Agenda Description
                        </label>
                        <input
                            type="text"
                            className="w-full p-2 border rounded-lg text-sm"
                            placeholder="e.g., General Cleaning / Dept Meeting"
                            value={descInput}
                            onChange={(e) => setDescInput(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="w-full bg-blue-900 text-white font-bold py-2.5 rounded-lg text-sm">
                        Generate Secure Token
                    </button>
                </form>

                {activeToken && (
                    <div className="mt-6 p-4 border border-dashed rounded-xl text-center bg-blue-50/50">
                        <span className="text-xs text-blue-900 font-bold uppercase tracking-wider block">
                            Active Validation Code
                        </span>
                        <h1 className="text-4xl font-black text-blue-900 my-2 tracking-widest">
                            {activeToken.token_code}
                        </h1>
                        <p className="text-[11px] text-gray-500 font-medium">
                            Valid until {new Date(activeToken.expires_at).toLocaleString()}
                        </p>
                    </div>
                )}
            </div>

            <div className="lg:col-span-2 bg-white border p-6 rounded-xl shadow-sm">
                <h2 className="font-extrabold text-lg mb-4 text-gray-800">System Flagged Anomalies</h2>
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {anomalies.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">
                            No attendance anomalies flagged by systemic analysis.
                        </p>
                    ) : (
                        anomalies.map((item) => (
                            <div
                                key={item.id}
                                className="p-4 border border-red-100 bg-red-50/40 rounded-xl flex justify-between items-start"
                            >
                                <div>
                                    <h4 className="font-bold text-sm text-gray-900">{item.user?.name}</h4>
                                    <p className="text-xs text-red-700 font-semibold mt-1">
                                        Reason: {item.anomaly_reason}
                                    </p>
                                    <p className="text-[11px] text-gray-500 mt-2">
                                        Logged: {item.time_in ? new Date(item.time_in).toLocaleString() : '—'}
                                    </p>
                                </div>
                                <span className="text-xs bg-red-100 text-red-800 font-bold px-2 py-1 rounded-lg shrink-0">
                                    {(item.computed_hours || item.rendered_hours || 0)} hrs
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default SupervisorAttendanceHub;
