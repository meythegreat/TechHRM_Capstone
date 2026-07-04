import React, { useEffect, useState } from 'react';
import axios from 'axios';

const STAGES = ['Pending', 'Interview', 'Training', 'For Result', 'Approved'];

const ApplicationStatusTracker = () => {
    const [application, setApplication] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        axios.get('/api/applications/my-status')
            .then(res => setApplication(res.data))
            .catch(() => setApplication(null))
            .finally(() => setIsLoading(false));
    }, []);

    if (isLoading) {
        return <div className="p-6 text-gray-500 font-bold">Loading application status...</div>;
    }

    if (!application) {
        return <div className="p-6 text-red-600 font-bold">No application found.</div>;
    }

    if (application.status === 'Rejected') {
        return (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-red-200">
                <h2 className="text-xl font-bold mb-2 text-red-700">Application Not Approved</h2>
                <p className="text-gray-600">Your WSPO application was reviewed and not approved at this time.</p>
            </div>
        );
    }

    const currentIndex = STAGES.indexOf(application.status);

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-6">
            <div>
                <h2 className="text-xl font-bold text-gray-900">Application Status</h2>
                <p className="text-sm text-gray-500 mt-1">Track your WSPO application through each stage.</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0">
                {STAGES.map((stage, index) => {
                    const isComplete = currentIndex > index;
                    const isCurrent = application.status === stage;

                    return (
                        <React.Fragment key={stage}>
                            <div className="flex items-center gap-2 sm:flex-col sm:text-center sm:flex-1">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                    isComplete ? 'bg-green-600 text-white' :
                                    isCurrent ? 'bg-blue-600 text-white' :
                                    'bg-gray-200 text-gray-500'
                                }`}>
                                    {isComplete ? '✓' : index + 1}
                                </div>
                                <span className={`text-xs font-bold ${isCurrent ? 'text-blue-700' : 'text-gray-500'}`}>
                                    {stage}
                                </span>
                            </div>
                            {index < STAGES.length - 1 && (
                                <div className={`hidden sm:block h-0.5 flex-1 mx-2 ${currentIndex > index ? 'bg-green-500' : 'bg-gray-200'}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">Preferred Department</p>
                    <p className="font-bold text-gray-900">{application.preferred_department}</p>
                </div>
                <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">Current Status</p>
                    <p className="font-bold text-blue-600">{application.status}</p>
                </div>
                {application.interview_date && (
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Interview Date</p>
                        <p className="font-bold text-gray-900">
                            {new Date(application.interview_date).toLocaleString()}
                        </p>
                    </div>
                )}
                {application.assigned_department && (
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Assigned Placement</p>
                        <p className="font-bold text-gray-900">
                            {application.assigned_department} — {application.assigned_position}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ApplicationStatusTracker;
