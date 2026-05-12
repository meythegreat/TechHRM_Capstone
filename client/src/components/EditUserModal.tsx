import { useState, useEffect } from 'react';
import type { FC, FormEvent } from 'react';
import axios from 'axios';

interface StudentProfile {
    student_id_number: string;
    course: string;
    year_level: number;
    assigned_office: string;
    contact_number: string | null;
}

interface User {
    id: number;
    fullname: string;
    username: string;
    role: string;
    profile: StudentProfile | null;
}

interface EditUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (message?: string) => void;
    user: User | null;
}

const EditUserModal: FC<EditUserModalProps> = ({ isOpen, onClose, onSuccess, user }) => {
    // Base State
    const [fullname, setFullname] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('User');
    
    // Profile State
    const [studentId, setStudentId] = useState('');
    const [course, setCourse] = useState('');
    const [yearLevel, setYearLevel] = useState('1');
    const [assignedOffice, setAssignedOffice] = useState('');
    const [contactNumber, setContactNumber] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Pre-fill the form whenever the selected user changes
    useEffect(() => {
        if (user) {
            setFullname(user.fullname);
            setUsername(user.username);
            setRole(user.role);
            setPassword(''); 
            setError('');

            if (user.profile) {
                setStudentId(user.profile.student_id_number || '');
                setCourse(user.profile.course || '');
                setYearLevel(user.profile.year_level?.toString() || '1');
                setAssignedOffice(user.profile.assigned_office || '');
                setContactNumber(user.profile.contact_number || '');
            } else {
                // Clear profile fields if editing an Admin
                setStudentId(''); setCourse(''); setYearLevel('1'); setAssignedOffice(''); setContactNumber('');
            }
        }
    }, [user, isOpen]);

    if (!isOpen || !user) return null;

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const payload: any = { fullname, username, role };
            if (password) payload.password = password;

            if (role === 'User') {
                payload.student_id_number = studentId;
                payload.course = course;
                payload.year_level = parseInt(yearLevel);
                payload.assigned_office = assignedOffice;
                payload.contact_number = contactNumber;
            }

            await axios.put(`/api/users/${user.id}`, payload);
            onSuccess(`User ${username} updated successfully!`);
        } catch (err: any) {
            if (err.response?.status === 422) {
                setError(err.response.data.message || 'Please check your inputs.');
            } else {
                setError('An unexpected error occurred while updating the user.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto bg-gray-900/50 backdrop-blur-sm">
            <div className="relative w-full max-w-md p-6 mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-xl font-bold text-gray-900">Edit User Profile</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {error && <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">System Role</label>
                        <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                            <option value="User">Student Worker</option>
                            <option value="Admin">Administrator</option>
                        </select>
                    </div>

                    <hr className="border-gray-100" />

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
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                                Password <span className="text-gray-400 font-normal text-[10px]">(Optional)</span>
                            </label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="••••••••" />
                        </div>
                    </div>

                    {role === 'User' && (
                        <div className="space-y-4 pt-2 border-t border-gray-100">
                            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Student Profile Data</h4>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Student ID</label>
                                    <input type="text" value={studentId} onChange={(e) => setStudentId(e.target.value)} required className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Course</label>
                                    <input type="text" value={course} onChange={(e) => setCourse(e.target.value)} required className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
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
                                <input type="text" value={assignedOffice} onChange={(e) => setAssignedOffice(e.target.value)} required className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-6 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
                            {isLoading ? 'Updating...' : 'Update Profile'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditUserModal;