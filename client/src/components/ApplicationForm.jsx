import React, { useState } from 'react';
import { submitApplication } from '../services/applicationService';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const ApplicationForm = ({ onApplicationSubmitted }) => {
    const [formData, setFormData] = useState({
        preferred_department: '',
        available_schedules: [],
        reason_for_applying: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const toggleDay = (day) => {
        setFormData(prev => ({
            ...prev,
            available_schedules: prev.available_schedules.includes(day)
                ? prev.available_schedules.filter(d => d !== day)
                : [...prev.available_schedules, day]
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await submitApplication(formData);
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
                    <option value="College of Computer Studies">College of Computer Studies</option>
                    <option value="College of Business and Accountancy">College of Business and Accountancy</option>
                    <option value="Library">Library</option>
                    <option value="Registrar">Registrar</option>
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

            <button
                type="submit"
                disabled={isSubmitting || formData.available_schedules.length === 0}
                className="bg-blue-600 text-white px-4 py-2 rounded font-bold disabled:opacity-50"
            >
                {isSubmitting ? 'Submitting...' : 'Submit Application'}
            </button>
        </form>
    );
};

export default ApplicationForm;
