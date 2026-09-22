import React, { useState } from 'react';
import { submitApplication } from '../services/applicationService';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const DEPARTMENTS = [
    "University President", "Quality Assurance", "Human Resource Development Center", "Office of the Student Affairs", "University Chaplain", "Alumni Affairs", "VP-Administration", "Superintendent Buildings & Grounds / Officer Pollution Control", "Security Office", "Safety and Disaster Management", "Sports", "Socio-Cultural", "WSPO", "Health Services", "General Services", "Mass Media", "ICT Services Office", "Higher Education Laboratory", "VP-Academic Affairs", "Graduate School", "College of Arts and Sciences", "College of Business and Accountancy", "College of Computer Studies", "College of Criminal Justice Education", "College of Electronic Engineering", "College of Hospitality and Tourism Management", "College of Nursing", "College of Teacher Education", "Kindergarten/Elementary", "High School", "University Registrar", "Director of Libraries", "Guidance & Counselling Center", "NSTP", "VP-REIID", "International Program Office", "Community Extension", "Research", "VP-Finance", "Accountant/Budget Officer", "Business Manager", "Property Custodian", "University Enterprise"
];

const ApplicationForm = ({ onApplicationSubmitted }) => {
    const [formData, setFormData] = useState({
        preferred_department: '',
        available_schedules: [],
        reason_for_applying: ''
    });
    const [documents, setDocuments] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const toggleDay = (day) => {
        setFormData(prev => ({
            ...prev,
            available_schedules: prev.available_schedules.includes(day)
                ? prev.available_schedules.filter(d => d !== day)
                : [...prev.available_schedules, day]
        }));
    };

    const addDocuments = (incoming) => {
        if (!incoming) return;
        const next = [...documents];
        Array.from(incoming).forEach((file) => {
            if (next.length >= 5) return;
            const duplicate = next.some((existing) => existing.name === file.name && existing.size === file.size);
            if (!duplicate) next.push(file);
        });
        setDocuments(next.slice(0, 5));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (documents.length < 3 || documents.length > 5) {
            alert('Please attach 3 to 5 supporting documents.');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = new FormData();
            payload.append('preferred_department', formData.preferred_department);
            payload.append('reason_for_applying', formData.reason_for_applying);
            formData.available_schedules.forEach((day) => payload.append('available_schedules[]', day));
            documents.forEach((file) => payload.append('documents[]', file));
            await submitApplication(payload);
            onApplicationSubmitted?.();
        } catch (error) {
            console.error('Error submitting application', error);
            alert(error.response?.data?.message || 'Failed to submit application. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold mb-4">WSPO Application Form</h2>

            <div className="mb-4">
                <label className="block text-sm font-bold mb-1">Preferred Department</label>
                <select
                    required
                    className="w-full p-2 border rounded"
                    value={formData.preferred_department}
                    onChange={(e) => setFormData({ ...formData, preferred_department: e.target.value })}
                >
                    <option value="">Select Department</option>
                    {DEPARTMENTS.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                </select>
            </div>

            <div className="mb-4">
                <label className="block text-sm font-bold mb-2">Available Days</label>
                <div className="flex flex-wrap gap-2">
                    {DAYS.map(day => (
                        <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(day)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                                formData.available_schedules.includes(day)
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                            }`}
                        >
                            {day}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-4">
                <label className="block text-sm font-bold mb-1">Reason for Applying</label>
                <textarea
                    required
                    rows={4}
                    className="w-full p-2 border rounded"
                    value={formData.reason_for_applying}
                    onChange={(e) => setFormData({ ...formData, reason_for_applying: e.target.value })}
                />
            </div>

            <div className="mb-4">
                <label className="block text-sm font-bold mb-1">Supporting Documents (3–5)</label>
                <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    multiple
                    className="w-full p-2 border rounded"
                    onChange={(e) => {
                        addDocuments(e.target.files);
                        e.target.value = '';
                    }}
                />
                <p className="text-xs text-gray-500 mt-1">{documents.length} of 5 selected. PDF, JPG, or PNG only.</p>
                {documents.length > 0 && (
                    <ul className="mt-2 space-y-1">
                        {documents.map((file, index) => (
                            <li key={`${file.name}-${index}`} className="flex items-center justify-between text-sm">
                                <span className="truncate">{file.name}</span>
                                <button type="button" className="text-red-600 font-bold" onClick={() => setDocuments(documents.filter((_, i) => i !== index))}>Remove</button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <button
                type="submit"
                disabled={isSubmitting || formData.available_schedules.length === 0 || documents.length < 3}
                className="bg-blue-600 text-white px-4 py-2 rounded font-bold disabled:opacity-50"
            >
                {isSubmitting ? 'Submitting...' : 'Submit Application'}
            </button>
        </form>
    );
};

export default ApplicationForm;
