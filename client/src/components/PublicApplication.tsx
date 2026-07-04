import { useState, type FormEvent } from 'react';
import axios from 'axios';

interface PublicApplicationProps {
    onBackToLogin: () => void;
}

type ApplicationStatus = {
    loading: boolean;
    success: boolean;
    error: string;
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const DEPARTMENTS = [
    'College of Computer Studies',
    'College of Business and Accountancy',
    'University Library',
    "Registrar's Office",
    'Guidance Office',
];

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

const PublicApplication = ({ onBackToLogin }: PublicApplicationProps) => {
    const [formData, setFormData] = useState({
        first_name: '',
        middle_name: '',
        last_name: '',
        email: '',
        age: '',
        address: '',
        contact_number: '',
        year_level: '',
        course: '',
        preferred_department: '',
        available_schedules: [] as string[],
        reason_for_applying: '',
    });
    const [status, setStatus] = useState<ApplicationStatus>({
        loading: false,
        success: false,
        error: '',
    });

    const toggleDay = (day: string) => {
        setFormData((current) => ({
            ...current,
            available_schedules: current.available_schedules.includes(day)
                ? current.available_schedules.filter((selectedDay) => selectedDay !== day)
                : [...current.available_schedules, day],
        }));
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus({ loading: true, success: false, error: '' });

        try {
            await axios.post('/api/apply', {
                ...formData,
                age: Number(formData.age),
            });
            setStatus({ loading: false, success: true, error: '' });
        } catch (error: any) {
            setStatus({
                loading: false,
                success: false,
                error: error.response?.data?.message || 'Email already exists or the application has invalid data.',
            });
        }
    };

    if (status.success) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
                <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
                    <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-extrabold text-gray-900">Application Received</h2>
                    <p className="text-sm text-gray-600 mt-3 leading-relaxed">
                        Thank you for applying to the Work Study Program. If approved, WSPO staff will contact you with your official login credentials.
                    </p>
                    <button
                        type="button"
                        onClick={onBackToLogin}
                        className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-lg shadow-blue-100 transition-colors"
                    >
                        Return to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 lg:bg-white flex font-sans">
            <div className="hidden lg:flex lg:w-1/3 relative bg-blue-900 items-center justify-center overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src="/fcu.jpg"
                        alt="FCU Campus"
                        className="w-full h-full object-cover opacity-20 mix-blend-overlay"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-blue-900/90 via-blue-800/80 to-blue-900/40" />
                </div>
                <div className="relative z-10 px-10 text-center">
                    <img
                        src="/logo.jpg"
                        alt="TechHRM Logo"
                        className="mx-auto w-24 h-24 rounded-full border-4 border-white shadow-2xl mb-8"
                    />
                    <h1 className="text-4xl font-extrabold text-white tracking-tight">WSPO Applicant Registration</h1>
                    <p className="mt-4 text-blue-100 font-medium leading-relaxed">
                        Submit your personal, academic, and placement information for coordinator review.
                    </p>
                </div>
            </div>

            <div className="w-full lg:w-2/3 flex items-center justify-center p-6 sm:p-10">
                <div className="w-full max-w-3xl">
                    <div className="mb-8">
                        <button
                            type="button"
                            onClick={onBackToLogin}
                            className="text-sm font-bold text-blue-600 hover:text-blue-800 mb-6"
                        >
                            Back to login
                        </button>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                            Apply for WSPO
                        </h2>
                        <p className="mt-2 text-sm text-gray-500 font-medium">
                            Please fill out all required personal and academic information.
                        </p>
                    </div>

                    {status.error && (
                        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-sm font-bold text-red-700">
                            {status.error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <section className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
                            <h3 className="text-xs font-extrabold text-gray-600 uppercase tracking-wider border-b border-gray-200 pb-3">
                                Personal Information
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                        First Name
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.first_name}
                                        onChange={(event) => setFormData({ ...formData, first_name: event.target.value })}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                        Middle Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.middle_name}
                                        onChange={(event) => setFormData({ ...formData, middle_name: event.target.value })}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                        Last Name
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.last_name}
                                        onChange={(event) => setFormData({ ...formData, last_name: event.target.value })}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                        Age
                                    </label>
                                    <input
                                        required
                                        type="number"
                                        min={16}
                                        value={formData.age}
                                        onChange={(event) => setFormData({ ...formData, age: event.target.value })}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                                    />
                                </div>

                                <div className="md:col-span-3">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                        Complete Address
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.address}
                                        onChange={(event) => setFormData({ ...formData, address: event.target.value })}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                        Contact Number
                                    </label>
                                    <input
                                        required
                                        type="tel"
                                        value={formData.contact_number}
                                        onChange={(event) => setFormData({ ...formData, contact_number: event.target.value })}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                        FCU Gmail
                                    </label>
                                    <input
                                        required
                                        type="email"
                                        value={formData.email}
                                        onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                                    />
                                </div>
                            </div>
                        </section>

                        <section className="bg-blue-50 border border-blue-100 rounded-xl p-5 space-y-4">
                            <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider border-b border-blue-200 pb-3">
                                Academic & Placement Profile
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">
                                        Course / Program
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="e.g. BSIT, BSCS, BSN"
                                        value={formData.course}
                                        onChange={(event) => setFormData({ ...formData, course: event.target.value })}
                                        className="w-full p-3 bg-white border border-blue-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">
                                        Year Level
                                    </label>
                                    <select
                                        required
                                        value={formData.year_level}
                                        onChange={(event) => setFormData({ ...formData, year_level: event.target.value })}
                                        className="w-full p-3 bg-white border border-blue-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                                    >
                                        <option value="">Select year</option>
                                        {YEAR_LEVELS.map((yearLevel) => (
                                            <option key={yearLevel} value={yearLevel}>
                                                {yearLevel}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">
                                    Preferred Assigned Office
                                </label>
                                <select
                                    required
                                    value={formData.preferred_department}
                                    onChange={(event) => setFormData({ ...formData, preferred_department: event.target.value })}
                                    className="w-full p-3 bg-white border border-blue-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                                >
                                    <option value="">Select a department</option>
                                    {DEPARTMENTS.map((department) => (
                                        <option key={department} value={department}>
                                            {department}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-3">
                                    Available Days
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {DAYS.map((day) => {
                                        const isSelected = formData.available_schedules.includes(day);

                                        return (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => toggleDay(day)}
                                                className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                                                    isSelected
                                                        ? 'bg-blue-600 text-white border-blue-600'
                                                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                                                }`}
                                            >
                                                {day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">
                                    Why do you want to join WSPO?
                                </label>
                                <textarea
                                    required
                                    rows={4}
                                    value={formData.reason_for_applying}
                                    onChange={(event) => setFormData({ ...formData, reason_for_applying: event.target.value })}
                                    className="w-full p-3 bg-white border border-blue-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900 resize-none"
                                />
                            </div>
                        </section>

                        <div className="flex flex-col gap-3 pt-2">
                            <button
                                type="submit"
                                disabled={status.loading || formData.available_schedules.length === 0}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-lg shadow-blue-100 transition-all disabled:bg-blue-400 disabled:cursor-not-allowed uppercase tracking-wider"
                            >
                                {status.loading ? 'Submitting Application...' : 'Submit Final Application'}
                            </button>
                            <button
                                type="button"
                                onClick={onBackToLogin}
                                className="text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                            >
                                Cancel and Return to Login
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default PublicApplication;
