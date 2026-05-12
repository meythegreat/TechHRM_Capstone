import { useState, useEffect } from 'react';
import axios from 'axios';
import AddUserFormModal from './AddUserFormModal';
import EditUserModal from './EditUserModal';

// 1. We added the Profile interface
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
    created_at: string;
    profile: StudentProfile | null; // 2. Attach it to the User interface
}

const UserManagement = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>('');
    const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/api/users');
            setUsers(response.data);
        } catch (err) {
            setError('Failed to load user data.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: number, username: string) => {
        if (!window.confirm(`Are you sure you want to delete the account for ${username}? This action cannot be undone.`)) {
            return;
        }

        try {
            await axios.delete(`/api/users/${id}`);
            fetchUsers();
            showToast(`User ${username} deleted successfully.`, 'success');
        } catch (err: any) {
            if (err.response?.status === 403) {
                showToast(err.response.data.message || "You cannot delete your own account.", 'error');
            } else {
                showToast("An error occurred while trying to delete the user.", 'error');
            }
        }
    };

    return (
        <div className="p-8 font-sans relative">
            <div className="sm:flex sm:items-center sm:justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Users</h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Manage administrative access and student worker deployments.
                    </p>
                </div>
                <div className="mt-4 sm:mt-0">
                    <button onClick={() => setIsAddModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                        + Add New User
                    </button>
                </div>
            </div>

            {error && <div className="mb-4 p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">{error}</div>}

            <div className="overflow-hidden bg-white shadow-sm ring-1 ring-black ring-opacity-5 rounded-xl border border-gray-100">
                {/* 3. We expanded the table width by adding overflow-x-auto */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Details</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Academic</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Assignment</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {isLoading ? (
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">Loading users...</td></tr>
                            ) : users.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">No users found.</td></tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                        {/* Name and Username stacked */}
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{user.fullname}</div>
                                            <div className="text-sm text-gray-500">@{user.username}</div>
                                        </td>
                                        
                                        {/* Student ID */}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {user.profile ? <span className="font-mono">{user.profile.student_id_number}</span> : <span className="text-gray-300">-</span>}
                                        </td>

                                        {/* Course and Year */}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {user.profile ? `${user.profile.course} - Year ${user.profile.year_level}` : <span className="text-gray-300">-</span>}
                                        </td>

                                        {/* Office Assignment */}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                            {user.profile ? user.profile.assigned_office : <span className="text-gray-300">-</span>}
                                        </td>

                                        {/* Role Badge */}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                user.role === 'Admin' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                                {user.role}
                                            </span>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button 
                                                onClick={() => {
                                                    setSelectedUser(user);
                                                    setIsEditModalOpen(true);
                                                }}
                                                className="text-blue-600 hover:text-blue-900 mr-4 font-semibold transition-colors"
                                            >
                                                Edit
                                            </button>
                                            <button onClick={() => handleDelete(user.id, user.username)} className="text-red-600 hover:text-red-900 font-semibold transition-colors">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <AddUserFormModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onSuccess={(msg) => {
                    setIsAddModalOpen(false);
                    fetchUsers();
                    showToast(msg || 'Action completed successfully.', 'success');
                }} 
            />

            <EditUserModal
                isOpen={isEditModalOpen}
                user={selectedUser}
                onClose={() => {
                    setIsEditModalOpen(false);
                    setSelectedUser(null);
                }}
                onSuccess={(msg) => {
                    setIsEditModalOpen(false);
                    setSelectedUser(null);
                    fetchUsers();
                    showToast(msg || 'User updated successfully.', 'success');
                }}
            />

            {toast && (
                <div className={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 transition-all duration-300 transform translate-y-0 opacity-100 ${
                    toast.type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'
                }`}>
                    {toast.type === 'success' ? (
                        <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    ) : (
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    )}
                    <span className="font-semibold text-sm">{toast.message}</span>
                </div>
            )}
        </div>
    );
};

export default UserManagement;