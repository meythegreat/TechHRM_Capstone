import { useState, useEffect } from "react";
import axios from "axios";

interface UserRecord {
  id: number;
  name: string;
  username: string;
  role: string;
  phone_number?: string;
  created_at: string;
  deleted_at?: string | null; // <-- NEW: Added for Soft Deletes
  profile?: {
    student_id_number: string;
    assigned_office: string;
    course?: string;
    year_level?: number;
  };
}

const UserManagement = () => {
  // --- TABLE STATE ---
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [toastMsg, setToastMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // --- MODAL & FORM STATE ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    password: "",
    phone_number: "",
    role: "Student",
    student_id_number: "",
    course: "",
    year_level: "",
    assigned_office: "",
  });

  useEffect(() => {
    fetchUsers(currentPage);
  }, [currentPage]);

  const fetchUsers = async (page: number) => {
    setIsLoading(true);
    try {
      const response = await axios.get(`/api/users?page=${page}`);
      setUsers(response.data.data);
      setCurrentPage(response.data.current_page);
      setTotalPages(response.data.last_page);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- CREATE / UPDATE LOGIC ---
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setToastMsg(null);

    try {
      if (editingUserId) {
        await axios.put(`/api/users/${editingUserId}`, formData);
        setToastMsg({ text: "User updated successfully!", type: "success" });
      } else {
        await axios.post("/api/users", formData);
        setToastMsg({ text: "User created successfully!", type: "success" });
      }

      closeModal();
      fetchUsers(currentPage);
      setTimeout(() => setToastMsg(null), 3000);
    } catch (error: any) {
      setToastMsg({
        text:
          error.response?.data?.message ||
          "Failed to save user. Check details.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- DELETE LOGIC ---
  const handleDeleteUser = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to revoke access for ${name}?`))
      return;

    try {
      await axios.delete(`/api/users/${id}`);
      setToastMsg({
        text: "User access revoked successfully.",
        type: "success",
      });
      fetchUsers(currentPage);
      setTimeout(() => setToastMsg(null), 3000);
    } catch (error) {
      setToastMsg({
        text: "Failed to revoke user. Please try again.",
        type: "error",
      });
    }
  };

  // --- UI HELPERS ---
  const openCreateModal = () => {
    setEditingUserId(null);
    setFormData({
      name: "",
      username: "",
      password: "",
      phone_number: "",
      role: "Student",
      student_id_number: "",
      course: "",
      year_level: "",
      assigned_office: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (user: UserRecord) => {
    setEditingUserId(user.id);
    setFormData({
      name: user.name,
      username: user.username,
      password: "",
      phone_number: user.phone_number || "",
      role: user.role,
      student_id_number: user.profile?.student_id_number || "",
      course: user.profile?.course || "",
      year_level: user.profile?.year_level?.toString() || "",
      assigned_office: user.profile?.assigned_office || "",
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUserId(null);
  };

  const getRoleBadge = (role: string) => {
    if (role === "Super Admin")
      return "bg-purple-100 text-purple-800 border-purple-200";
    if (role === "Supervisor")
      return "bg-blue-100 text-blue-800 border-blue-200";
    if (role === "WSPO Staff")
      return "bg-orange-100 text-orange-800 border-orange-200";
    return "bg-green-100 text-green-800 border-green-200";
  };

  return (
    <div className="space-y-6 fade-in font-sans relative">
      {/* Header & Button */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            System Users
          </h2>
          <p className="text-sm font-medium text-gray-500 mt-1">
            Manage system access, roles, and student profiles.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add New User
        </button>
      </div>

      {/* Notification Toast */}
      {toastMsg && (
        <div
          className={`p-4 rounded-xl border font-bold text-sm flex items-center gap-2 ${
            toastMsg.type === "success"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {toastMsg.type === "success" ? (
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          {toastMsg.text}
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                  Full Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                  System Role
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                  Department / Details
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                  Contact / Joined Date
                </th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Loading users...
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className={`hover:bg-gray-50 ${user.deleted_at ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 mr-3">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          {/* NEW: Badge for Super Admins to see who is deleted */}
                          <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            {user.name}
                            {user.deleted_at && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] uppercase rounded-full tracking-wider">Revoked</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            @{user.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-1 rounded-md text-xs font-bold border ${getRoleBadge(
                          user.role
                        )}`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {user.profile ? (
                        <>
                          <div className="font-bold text-gray-900">
                            {user.profile.assigned_office}
                          </div>
                          <div className="text-xs text-gray-500">
                            ID:{" "}
                            {user.profile.student_id_number ||
                              user.profile.course ||
                              "N/A"}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400 italic">
                          System Account
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="font-medium text-gray-900">
                        {user.phone_number || "--"}
                      </div>
                      <div className="text-xs text-gray-500">
                        Joined:{" "}
                        {new Date(user.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold">
                      <button
                        onClick={() => openEditModal(user)}
                        className="text-blue-600 hover:text-blue-900 mr-4 transition-colors"
                      >
                        Edit
                      </button>

                      {/* NEW: Only show if not already revoked */}
                      {!user.deleted_at && (
                          <button
                            onClick={() => handleDeleteUser(user.id, user.name)}
                            className="text-red-600 hover:text-red-900 transition-colors"
                          >
                            Revoke
                          </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
            <span className="text-sm text-gray-500 font-medium">
              Page <span className="font-bold text-gray-900">{currentPage}</span>{" "}
              of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 border rounded-lg text-sm font-bold bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(p + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="px-4 py-2 border rounded-lg text-sm font-bold bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Smart Modal (Create & Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden slide-up">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-bold text-gray-900">
                {editingUserId ? "Edit User Account" : "Create New Account"}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* --- Base Account Info --- */}
                <div className="space-y-4">
                  <h4 className="font-bold text-blue-600 uppercase text-xs tracking-wider border-b pb-2">
                    Account Details
                  </h4>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Full Name
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="Juan Dela Cruz"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.username}
                      onChange={(e) =>
                        setFormData({ ...formData, username: e.target.value })
                      }
                      className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="jdelacruz"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Contact Number
                    </label>
                    <input
                      type="text"
                      value={formData.phone_number}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          phone_number: e.target.value,
                        })
                      }
                      className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="+63 900 000 0000"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      {editingUserId
                        ? "New Password (Optional)"
                        : "Temporary Password"}
                    </label>
                    <input
                      required={!editingUserId}
                      type="password"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder={
                        editingUserId
                          ? "Leave blank to keep current"
                          : "Min 8 characters"
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      System Role
                    </label>
                    <select
                      required
                      value={formData.role}
                      onChange={(e) =>
                        setFormData({ ...formData, role: e.target.value })
                      }
                      className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white font-semibold"
                    >
                      <option value="Student">Student Worker</option>
                      <option value="Supervisor">Department Supervisor</option>
                      <option value="WSPO Staff">WSPO Staff</option>
                      <option value="Super Admin">System Administrator</option>
                    </select>
                  </div>
                </div>

                {/* --- Conditional Profile Info --- */}
                <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <h4 className="font-bold text-orange-500 uppercase text-xs tracking-wider border-b pb-2">
                    {formData.role === "Student"
                      ? "Student Profile"
                      : formData.role === "Supervisor"
                      ? "Department Info"
                      : formData.role === "WSPO Staff"
                      ? "Staff Details"
                      : "Role Specifics"}
                  </h4>

                  {/* STUDENT FIELDS */}
                  {formData.role === "Student" && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Student ID Number
                        </label>
                        <input
                          required
                          type="text"
                          value={formData.student_id_number}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              student_id_number: e.target.value,
                            })
                          }
                          className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          placeholder="FCU-2026-XXX"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Course
                        </label>
                        <input
                          required
                          type="text"
                          value={formData.course}
                          onChange={(e) =>
                            setFormData({ ...formData, course: e.target.value })
                          }
                          className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          placeholder="BS Information Technology"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Year Level
                        </label>
                        <input
                          required
                          type="number"
                          min="1"
                          max="5"
                          value={formData.year_level}
                          onChange={(e) =>
                            setFormData({ ...formData, year_level: e.target.value })
                          }
                          className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          placeholder="e.g. 3"
                        />
                      </div>
                    </>
                  )}

                  {/* DEPARTMENT FIELD (For Students & Supervisors) */}
                  {(formData.role === "Student" || formData.role === "Supervisor") && (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        {formData.role === "Supervisor" ? "Supervised Department" : "Assigned Department"}
                      </label>
                      <select
                        required
                        value={formData.assigned_office}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            assigned_office: e.target.value,
                          })
                        }
                        className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white font-medium"
                      >
                        <option value="" disabled>-- Select Department --</option>
                        <option value="Pre-School Department">Pre-School Department</option>
                        <option value="Elementary Department">Elementary Department</option>
                        <option value="Junior High School Department">Junior High School Department</option>
                        <option value="Senior High School Department">Senior High School Department</option>
                        <option value="College of Arts and Sciences">College of Arts and Sciences</option>
                        <option value="College of Business and Accountancy">College of Business and Accountancy</option>
                        <option value="College of Computer Studies">College of Computer Studies</option>
                        <option value="College of Criminal Justice Education">College of Criminal Justice Education</option>
                        <option value="College of Engineering">College of Engineering</option>
                        <option value="College of Hotel and Tourism Management">College of Hotel and Tourism Management</option>
                        <option value="College of Nursing">College of Nursing</option>
                        <option value="College of Teacher Education">College of Teacher Education</option>
                        <option value="Graduate School">Graduate School</option>
                      </select>
                    </div>
                  )}

                  {/* STAFF POSITION FIELD (For WSPO Staff) */}
                  {formData.role === "WSPO Staff" && (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Staff Position
                      </label>
                      <select
                        required
                        value={formData.course}
                        onChange={(e) =>
                          setFormData({ ...formData, course: e.target.value })
                        }
                        className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white font-medium"
                      >
                        <option value="" disabled>-- Select Position --</option>
                        <option value="WSPO Coordinator">WSPO Coordinator</option>
                        <option value="WSPO President">WSPO President</option>
                        <option value="WSPO Secretary">WSPO Secretary</option>
                      </select>
                    </div>
                  )}

                  {/* SUPER ADMIN NOTICE */}
                  {formData.role === "Super Admin" && (
                    <div className="text-sm text-gray-500 italic mt-4">
                      Super Admins have full system access. No additional profile details required.
                    </div>
                  )}

                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:bg-blue-400 flex items-center gap-2"
                >
                  {isSubmitting
                    ? "Saving..."
                    : editingUserId
                      ? "Update User"
                      : "Save New User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;