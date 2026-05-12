import { useState } from 'react';
import type { FC, FormEvent } from 'react';
import axios from 'axios';

interface AddUserFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (message?: string) => void;
}

const AddUserFormModal: FC<AddUserFormModalProps> = ({ isOpen, onClose, onSuccess }) => {
    // Base User State
    const [fullname, setFullname] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('User');
    
    // Student Profile State
    const [studentId, setStudentId] = useState('');
    const [course, setCourse] = useState('');
    const [yearLevel, setYearLevel] = useState('1');
    const [assignedOffice, setAssignedOffice] = useState('');
    const [contactNumber, setContactNumber] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const resetForm = () => {
        setFullname(''); setUsername(''); setPassword(''); setRole('User');
        setStudentId(''); setCourse(''); setYearLevel('1'); setAssignedOffice(''); setContactNumber('');
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const payload: any = { fullname, username, password, role };
            
            // Only attach profile data if the role is 'User'
            if (role === 'User') {
                payload.student_id_number = studentId;
                payload.course = course;
                payload.year_level = parseInt(yearLevel);
                payload.assigned_office = assignedOffice;
                payload.contact_number = contactNumber;
            }

            await axios.post('/api/users', payload);
            resetForm();
            onSuccess(`User ${username} created successfully!`);
        } catch (err: any) {
            if (err.response?.status === 422) {
                setError(err.response.data.message || 'Please check your inputs.');
            } else {
                setError('An unexpected error occurred while creating the user.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto bg-gray-900/50 backdrop-blur-sm">
            <div className="relative w-full max-w-md p-6 mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-xl font-bold text-gray-900">Add New User</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Role Selection (Placed at top so it dictates the rest of the form) */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">System Role</label>
                        <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                            <option value="User">Student Worker</option>
                            <option value="Admin">Administrator</option>
                        </select>
                    </div>

                    <hr className="border-gray-100" />

                    {/* Base Account Info */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
                        <input type="text" value={fullname} onChange={(e) => setFullname(e.target.value)} required className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Username</label>
                            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="••••••••" />
                        </div>
                    </div>

                    {/* Conditional Student Fields */}
                    {role === 'User' && (
                        <div className="space-y-4 pt-2 border-t border-gray-100">
                            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Student Profile Data</h4>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Student ID</label>
                                    <input type="text" value={studentId} onChange={(e) => setStudentId(e.target.value)} required className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="e.g. 2024-0001" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Course</label>
                                    <input type="text" value={course} onChange={(e) => setCourse(e.target.value)} required className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="e.g. BSIT" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Year Level</label>
                                    <select value={yearLevel} onChange={(e) => setYearLevel(e.target.value)} required className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                        <option value="1">1st Year</option>
                                        <option value="2">2nd Year</option>
                                        <option value="3">3rd Year</option>
                                        <option value="4">4th Year</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Contact No.</label>
                                    <input type="text" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Assigned Office</label>
                                <input type="text" value={assignedOffice} onChange={(e) => setAssignedOffice(e.target.value)} required className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="e.g. Registrar's Office" />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-6 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
                            {isLoading ? 'Saving...' : 'Save Profile'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddUserFormModal;