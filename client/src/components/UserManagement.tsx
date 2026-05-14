import { useState, useEffect } from 'react';
import axios from 'axios';

interface UserRecord {
    id: number;
    name: string;
    username: string;
    role: string;
    created_at: string;
    profile?: {
        student_id_number: string;
        assigned_office: string;
    };
}

const UserManagement = () => {
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        fetchUsers(currentPage);
    }, [currentPage]);

    const fetchUsers = async (page: number) => {
        setIsLoading(true);
        try {
            const response = await axios.get(`/api/users?page=${page}`);
            setUsers(response.data.data); // .data.data because of Laravel pagination!
            setCurrentPage(response.data.current_page);
            setTotalPages(response.data.last_page);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getRoleBadge = (role: string) => {
        if (role === 'Super Admin') return "bg-purple-100 text-purple-800 border-purple-200";
        if (role === 'Supervisor') return "bg-blue-100 text-blue-800 border-blue-200";
        if (role === 'WSPO Staff') return "bg-orange-100 text-orange-800 border-orange-200";
        return "bg-green-100 text-green-800 border-green-200"; // Student
    };

    return (
        <div className="space-y-6 fade-in font-sans">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">System Users</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Manage system access, roles, and student profiles.</p>
                </div>
                <button className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                    + Add New User
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Full Name</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">System Role</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Department / Details</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Joined Date</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading users...</td></tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 mr-3">
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">{user.name}</div>
                                                    <div className="text-xs text-gray-500 font-mono">@{user.username}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${getRoleBadge(user.role)}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {user.profile ? (
                                                <>
                                                    <div className="font-bold text-gray-900">{user.profile.assigned_office}</div>
                                                    <div className="text-xs text-gray-500">ID: {user.profile.student_id_number}</div>
                                                </>
                                            ) : (
                                                <span className="text-gray-400 italic">System Account</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                                            {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold">
                                            <button className="text-blue-600 hover:text-blue-900 mr-3">Edit</button>
                                            <button className="text-red-600 hover:text-red-900">Revoke</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {!isLoading && totalPages > 1 && (
                    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                        <span className="text-sm text-gray-500 font-medium">
                            Page <span className="font-bold text-gray-900">{currentPage}</span> of <span className="font-bold text-gray-900">{totalPages}</span>
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">Prev</button>
                            <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">Next</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserManagement;