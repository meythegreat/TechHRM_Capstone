import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ApplicationForm from './ApplicationForm';
import ApplicationStatusTracker from './ApplicationStatusTracker';

const StudentApplicationHub = () => {
    const [hasApplied, setHasApplied] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check if the student already has an application
        axios.get('/api/applications/my-status')
            .then(res => {
                if (res.data) setHasApplied(true);
            })
            .catch(() => setHasApplied(false))
            .finally(() => setIsLoading(false));
    }, []);

    if (isLoading) return <div className="p-6 text-gray-500 font-bold">Loading your application data...</div>;

    // If they already applied, show the Tracker. If not, show the Form!
    return (
        <div className="fade-in">
            {hasApplied ? <ApplicationStatusTracker /> : <ApplicationForm onApplicationSubmitted={() => setHasApplied(true)} />}
        </div>
    );
};

export default StudentApplicationHub;