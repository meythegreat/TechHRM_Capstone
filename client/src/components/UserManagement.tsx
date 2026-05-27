import { useState, useEffect } from "react";
import axios from "axios";

interface UserRecord {
  id: number;
  name: string;
  username: string;
  role: string;
  phone_number?: string;
  created_at: string;
  deleted_at?: string | null;
  profile?: {
    student_id_number: string;
    assigned_office: string;
    course?: string;
    year_level?: number;
  };
}

const UserManagement = () => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [nameError, setNameError] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);

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

  // --- STRICT INPUT HANDLERS ---
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const hasValidChars = /^[a-zA-Z\s.-]*$/.test(val);
    const dashCount = (val.match(/-/g) || []).length;
    
    // Checks if the string starts with a lowercase letter, or if any letter 
    // after a space or dash is lowercase.
    const hasSmallCaps = /(?:^|\s|-)[a-z]/.test(val);

    if (hasValidChars && dashCount <= 1) {
      setFormData({ ...formData, name: val });
      
      // If characters are valid, but they used lowercase, show the warning
      if (hasSmallCaps) {
        setNameError('Please capitalize the first letter of each name.');
      } else {
        setNameError(''); // Clear error if perfectly formatted
      }
      
    } else {
      // Handle the invalid character errors
      if (!hasValidChars) {
        setNameError('Only letters, spaces, periods, and dashes are allowed.');
      } else if (dashCount > 1) {
        setNameError('Only one dash is allowed.');
      }
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Replace anything that is NOT a number with an empty string
    const val = e.target.value.replace(/[^0-9]/g, '');
    
    // Limit to exactly 10 digits (Standard PH mobile). 
    // Change the 10 to a 9 if your professor strictly meant 9!
    if (val.length <= 10) {
      setFormData({ ...formData, phone_number: val });
    }
  };

  // --- PASSWORD STRENGTH CALCULATOR ---
  const getPasswordStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 8) score += 1; // Minimum length
    if (/[A-Z]/.test(pass)) score += 1; // Has uppercase
    if (/[0-9]/.test(pass)) score += 1; // Has number
    if (/[^A-Za-z0-9]/.test(pass)) score += 1; // Has symbol
    return score;
  };

  const passwordScore = getPasswordStrength(formData.password);
  const strengthColors = ['bg-gray-200', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'];
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  // --- SUBMIT LOGIC ---
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameError) return;

    const payload = {
        ...formData,
        phone_number: formData.phone_number ? `+63${formData.phone_number}` : ''
    };

    setIsSubmitting(true);
    // Clear any previous toasts on submit
    setToastMsg(null); 

    try {
      if (editingUserId) {
        if (!payload.password) delete (payload as any).password;
        await axios.put(`/api/users/${editingUserId}`, payload);
        
        closeModal(); // 1. Close Modal FIRST
        fetchUsers(currentPage); // 2. Refresh Table
        setToastMsg({ text: "User updated successfully!", type: "success" }); // 3. Fire Toast
      } else {
        await axios.post("/api/users", payload);
        
        closeModal(); // 1. Close Modal FIRST
        fetchUsers(currentPage); // 2. Refresh Table
        setToastMsg({ text: "User created successfully!", type: "success" }); // 3. Fire Toast
      }

      setTimeout(() => setToastMsg(null), 4000);
    } catch (error: any) {
      // If it's an error, don't close the modal so they can fix it
      setToastMsg({ text: error.response?.data?.message || "Failed to save user.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to revoke access for ${name}?`)) return;
    try {
      await axios.delete(`/api/users/${id}`);
      setToastMsg({ text: "User access revoked successfully.", type: "success" });
      fetchUsers(currentPage);
      setTimeout(() => setToastMsg(null), 3000);
    } catch (error) {
      setToastMsg({ text: "Failed to revoke user. Please try again.", type: "error" });
    }
  };

  const openCreateModal = () => {
    setEditingUserId(null);
    setNameError('');
    setFormData({ name: "", username: "", password: "", phone_number: "", role: "Student", student_id_number: "", course: "", year_level: "", assigned_office: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (user: UserRecord) => {
    setEditingUserId(user.id);
    setNameError('');
    // Strip out the +63 if it exists so it displays correctly in the input box
    const strippedPhone = user.phone_number?.replace('+63', '') || "";
    
    setFormData({
      name: user.name,
      username: user.username,
      password: "",
      phone_number: strippedPhone,
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
    if (role === "Super Admin") return "bg-purple-100 text-purple-800 border-purple-200";
    if (role === "Supervisor") return "bg-blue-100 text-blue-800 border-blue-200";
    if (role === "WSPO Staff") return "bg-orange-100 text-orange-800 border-orange-200";
    return "bg-green-100 text-green-800 border-green-200";
  };

  return (
    <div className="space-y-6 fade-in font-sans relative">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">System Users</h2>
          <p className="text-sm font-medium text-gray-500 mt-1">Manage system access, roles, and student profiles.</p>
        </div>
        <button onClick={openCreateModal} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add New User
        </button>
      </div>

      {/* --- CORRECT PLACEMENT: TOAST IS OUTSIDE THE MODAL --- */}
      {toastMsg && (
        <div className={`p-4 rounded-xl border font-bold text-sm flex items-center gap-2 slide-up ${toastMsg.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
            <span className="text-lg">{toastMsg.type === 'success' ? '✓' : '⚠'}</span> 
            {toastMsg.text}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Full Name</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">System Role</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Department / Details</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Contact / Joined Date</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading users...</td></tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className={`hover:bg-gray-50 ${user.deleted_at ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 mr-3">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            {user.name}
                            {user.deleted_at && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] uppercase rounded-full tracking-wider">Revoked</span>}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${getRoleBadge(user.role)}`}>{user.role}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {user.profile ? (
                        <>
                          <div className="font-bold text-gray-900">{user.profile.assigned_office}</div>
                          <div className="text-xs text-gray-500">ID: {user.profile.student_id_number || user.profile.course || "N/A"}</div>
                        </>
                      ) : <span className="text-gray-400 italic">System Account</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="font-medium text-gray-900">{user.phone_number || "--"}</div>
                      <div className="text-xs text-gray-500">Joined: {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold">
                      <button onClick={() => openEditModal(user)} className="text-blue-600 hover:text-blue-900 mr-4 transition-colors">Edit</button>
                      {!user.deleted_at && (
                          <button onClick={() => handleDeleteUser(user.id, user.name)} className="text-red-600 hover:text-red-900 transition-colors">Revoke</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* --- UPGRADED PAGINATION --- */}
        {!isLoading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
            <span className="text-sm text-gray-500 font-medium">Page <span className="font-bold text-gray-900">{currentPage}</span> of {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1.5 border rounded-lg text-xs font-bold bg-white hover:bg-gray-50 disabled:opacity-50">&laquo; First</button>
              <button onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-3 py-1.5 border rounded-lg text-xs font-bold bg-white hover:bg-gray-50 disabled:opacity-50">Prev</button>
              <button onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1.5 border rounded-lg text-xs font-bold bg-white hover:bg-gray-50 disabled:opacity-50">Next</button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1.5 border rounded-lg text-xs font-bold bg-white hover:bg-gray-50 disabled:opacity-50">Last &raquo;</button>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden slide-up flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h3 className="text-xl font-bold text-gray-900">{editingUserId ? "Edit User Account" : "Create New Account"}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="overflow-y-auto p-6 flex-1">
                <form id="user-form" onSubmit={handleSaveUser}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="font-bold text-blue-600 uppercase text-xs tracking-wider border-b pb-2">Account Details</h4>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Full Name</label>
                        <input required type="text" value={formData.name} onChange={handleNameChange} className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${nameError ? 'border-red-500 ring-1 ring-red-500' : ''}`} placeholder="Juan Dela-Cruz" />
                        {nameError && <p className="text-[10px] font-bold text-red-500 mt-1">{nameError}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Username (4-16 chars)</label>
                        <input required type="text" minLength={4} maxLength={16} value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="jdelacruz" />
                      </div>

                      {/* --- UPGRADED PHONE INPUT --- */}
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Contact Number</label>
                        <div className="flex">
                            <span className="inline-flex items-center px-3 border border-r-0 border-gray-200 rounded-l-lg bg-gray-50 text-gray-600 text-sm font-bold">
                                +63
                            </span>
                            <input type="text" value={formData.phone_number} onChange={handlePhoneChange} className="w-full p-2.5 border rounded-r-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium tracking-wide" placeholder="912 345 6789" />
                        </div>
                      </div>

                      {/* --- UPGRADED PASSWORD FIELD WITH EYE ICON --- */}
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">{editingUserId ? "New Password (Optional)" : "Temporary Password"}</label>
                        <div className="relative">
                            <input 
                                required={!editingUserId} 
                                type={showPassword ? "text" : "password"} 
                                minLength={8} 
                                value={formData.password} 
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
                                className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm pr-10" 
                                placeholder={editingUserId ? "Leave blank to keep current" : "Min 8 characters"} 
                            />
                            <button 
                                type="button" 
                                onClick={() => setShowPassword(!showPassword)} 
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-blue-600 transition-colors focus:outline-none"
                            >
                                {showPassword ? (
                                    // Eye Open
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                ) : (
                                    // Eye Closed (with slash)
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.05 10.05 0 011.41-2.47m2.32-2.32A10.05 10.05 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.05 10.05 0 01-1.41 2.47m-2.32 2.32L3 3m18 18l-8.586-8.586" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        
                        {/* Password Strength Meter */}
                        {formData.password.length > 0 && (
                            <div className="mt-2">
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4].map((level) => (
                                        <div key={level} className={`h-1.5 w-1/4 rounded-full transition-all ${passwordScore >= level ? strengthColors[passwordScore] : 'bg-gray-200'}`} />
                                    ))}
                                </div>
                                <div className="text-[10px] font-bold text-right mt-1 text-gray-500 uppercase tracking-wider">
                                    {strengthLabels[passwordScore]}
                                </div>
                            </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">System Role</label>
                        <select required value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white font-semibold">
                          <option value="Student">Student Worker</option>
                          <option value="Supervisor">Department Supervisor</option>
                          <option value="WSPO Staff">WSPO Staff</option>
                          <option value="Super Admin">System Administrator</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <h4 className="font-bold text-orange-500 uppercase text-xs tracking-wider border-b pb-2">
                        {formData.role === "Student" ? "Student Profile" : formData.role === "Supervisor" ? "Department Info" : formData.role === "WSPO Staff" ? "Staff Details" : "Role Specifics"}
                      </h4>
                      {formData.role === "Student" && (
                        <>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Student ID Number</label>
                            <input required type="text" value={formData.student_id_number} onChange={(e) => setFormData({ ...formData, student_id_number: e.target.value })} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="FCU-2026-XXX" />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Course</label>
                            <input required type="text" value={formData.course} onChange={(e) => setFormData({ ...formData, course: e.target.value })} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="BS Information Technology" />
                          </div>
                          
                          {/* --- UPGRADED YEAR LEVEL DROPDOWN --- */}
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Year Level</label>
                            <select required value={formData.year_level} onChange={(e) => setFormData({ ...formData, year_level: e.target.value })} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white font-medium">
                                <option value="" disabled>-- Select Year --</option>
                                <option value="1">1st Year</option>
                                <option value="2">2nd Year</option>
                                <option value="3">3rd Year</option>
                                <option value="4">4th Year</option>
                            </select>
                          </div>
                        </>
                      )}
                      {(formData.role === "Student" || formData.role === "Supervisor") && (
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">{formData.role === "Supervisor" ? "Supervised Department" : "Assigned Department"}</label>
                          <select required value={formData.assigned_office} onChange={(e) => setFormData({ ...formData, assigned_office: e.target.value })} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white font-medium">
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
                      {formData.role === "WSPO Staff" && (
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Staff Position</label>
                          <select required value={formData.course} onChange={(e) => setFormData({ ...formData, course: e.target.value })} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white font-medium">
                            <option value="" disabled>-- Select Position --</option>
                            <option value="WSPO Coordinator">WSPO Coordinator</option>
                            <option value="WSPO President">WSPO President</option>
                            <option value="WSPO Secretary">WSPO Secretary</option>
                          </select>
                        </div>
                      )}
                      {formData.role === "Super Admin" && (
                        <div className="text-sm text-gray-500 italic mt-4">Super Admins have full system access. No additional profile details required.</div>
                      )}
                    </div>
                  </div>
                </form>
            </div>

            {/* Sticky footer for buttons */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0 rounded-b-2xl">
                <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button form="user-form" type="submit" disabled={isSubmitting} className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:bg-blue-400">
                  {isSubmitting ? "Saving..." : editingUserId ? "Update User" : "Save New User"}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;