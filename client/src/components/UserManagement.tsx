import { useState, useEffect } from "react";
import axios from "axios";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { 
    Users, 
    UserPlus, 
    ShieldCheck, 
    CheckCircle2, 
    AlertCircle, 
    Edit, 
    Trash2, 
    X,
    Eye,
    EyeOff,
    ChevronLeft,
    ChevronRight,
    Search,
    ShieldAlert
} from "lucide-react";

interface UserRecord {
  id: number;
  name: string;
  username: string;
  role: string;
  phone_number?: string;
  created_at: string;
  deleted_at?: string | null;
  profile?: {
    student_id_number?: string;
    assigned_office?: string;
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

  const showToast = (text: string, type: "success" | "error") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const fetchUsers = async (page: number) => {
    setIsLoading(true);
    try {
      const response = await axios.get(`/api/users?page=${page}`);
      // Handle both paginated and flat array responses gracefully
      const data = response.data.data || response.data;
      setUsers(Array.isArray(data) ? data : []);
      
      if (response.data.current_page) {
          setCurrentPage(response.data.current_page);
          setTotalPages(response.data.last_page);
      }
    } catch (error) {
      console.error("Failed to fetch users", error);
      showToast("Failed to load user records.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const validateName = (name: string) => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length < 2) {
      setNameError('Please enter both a First Name and Last Name.');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateName(formData.name)) return;
    
    setIsSubmitting(true);
    try {
      if (editingUserId) {
        // Exclude password from payload if it's empty during edit
        const payload = { ...formData };
        if (!payload.password) delete (payload as any).password;
        await axios.put(`/api/users/${editingUserId}`, payload);
        showToast("User updated successfully.", "success");
      } else {
        await axios.post('/api/users', formData);
        showToast("New user created successfully.", "success");
      }
      closeModal();
      fetchUsers(currentPage);
    } catch (error: any) {
      console.error("Error saving user:", error);
      showToast(error.response?.data?.message || "Failed to save user details.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to completely remove this user from the system?')) return;
    try {
      await axios.delete(`/api/users/${id}`);
      showToast("User deleted successfully.", "success");
      fetchUsers(currentPage);
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to delete user.", "error");
    }
  };

  const openEditModal = (user: UserRecord) => {
    setEditingUserId(user.id);
    setFormData({
      name: user.name,
      username: user.username,
      password: "", // Left blank intentionally for security
      phone_number: user.phone_number || "",
      role: user.role,
      student_id_number: user.profile?.student_id_number || "",
      course: user.profile?.course || "",
      year_level: user.profile?.year_level?.toString() || "",
      assigned_office: user.profile?.assigned_office || "",
    });
    setNameError('');
    setIsModalOpen(true);
  };

  const openAddModal = () => {
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
    setNameError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setShowPassword(false);
  };

  // Helper to color-code roles beautifully
  const getRoleBadge = (role: string) => {
    const base = "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border";
    switch(role) {
      case 'Super Admin': return `${base} bg-purple-50 text-purple-700 border-purple-200`;
      case 'WSPO Staff': return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
      case 'Supervisor': return `${base} bg-blue-50 text-blue-700 border-blue-200`;
      default: return `${base} bg-slate-50 text-slate-600 border-slate-200`;
    }
  };

  // STRICT TYPESCRIPT VARIANTS
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };

  const rowVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
      
      {/* DARK THEME HEADER - IDENTITY COMMAND CENTER */}
      <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
      >
          {/* Glowing Orbs */}
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

          <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Identity & Access</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  User Management
              </h1>
              <p className="mt-2 text-slate-400 font-medium max-w-md">
                  Control system access, assign roles, and manage department allocations for all personnel and students.
              </p>
          </div>

          <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
              <div className="flex flex-col text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Quick Action</span>
                  <span className="text-sm font-medium text-slate-300">Provision account</span>
              </div>
              <button 
                  onClick={openAddModal}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-indigo-900/50 flex items-center gap-2"
              >
                  <UserPlus className="w-4 h-4" /> Add User
              </button>
          </div>
      </motion.div>

      {/* Animated Toasts */}
      <AnimatePresence>
          {toastMsg && (
              <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={`p-4 rounded-xl border flex items-center gap-3 shadow-sm ${
                      toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'
                  }`}
              >
                  {toastMsg.type === 'success' 
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      : <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  }
                  <span className={`text-sm font-bold ${toastMsg.type === 'success' ? 'text-emerald-800' : 'text-red-800'}`}>
                      {toastMsg.text}
                  </span>
              </motion.div>
          )}
      </AnimatePresence>

      {/* MAIN TABLE */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative">
          
          {isLoading && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                      <span className="text-sm font-bold text-indigo-700 animate-pulse">Loading identity records...</span>
                  </div>
              </div>
          )}

          <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                  <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200">
                          <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Account Details</th>
                          <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Role & Access</th>
                          <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Department Details</th>
                          <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                  </thead>
                  <motion.tbody 
                      variants={containerVariants}
                      initial="hidden"
                      animate={!isLoading ? "show" : "hidden"}
                      className="divide-y divide-slate-100"
                  >
                      {!isLoading && users.length === 0 ? (
                          <tr>
                              <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                                  <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                  <p className="text-base font-semibold text-slate-600">No users found</p>
                                  <p className="text-sm font-medium">Click "Add User" to provision a new account.</p>
                              </td>
                          </tr>
                      ) : (
                          users.map((user) => (
                              <motion.tr variants={rowVariants} key={user.id} className="hover:bg-slate-50 transition-colors group">
                                  <td className="px-6 py-5 align-top">
                                      <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black shrink-0 border border-indigo-100 shadow-inner">
                                              {user.name.charAt(0)}
                                          </div>
                                          <div>
                                              <p className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                                                  {user.name}
                                              </p>
                                              <p className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-0.5 font-mono">
                                                  {user.username}
                                              </p>
                                          </div>
                                      </div>
                                  </td>
                                  
                                  <td className="px-6 py-5 align-top">
                                      <span className={getRoleBadge(user.role)}>
                                          {user.role}
                                      </span>
                                  </td>

                                  <td className="px-6 py-5 align-top">
                                      {user.role === 'Student' ? (
                                          <div>
                                              <p className="text-sm font-bold text-slate-800">{user.profile?.assigned_office || 'No Office Assigned'}</p>
                                              <p className="text-xs font-medium text-slate-500 mt-1">ID: {user.profile?.student_id_number || 'N/A'}</p>
                                          </div>
                                      ) : user.role === 'Supervisor' || user.role === 'WSPO Staff' ? (
                                          <div>
                                              <p className="text-sm font-bold text-slate-800">{user.profile?.assigned_office || 'Central Office'}</p>
                                              <p className="text-xs font-medium text-slate-400 mt-1 italic">Administrative Staff</p>
                                          </div>
                                      ) : (
                                          <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5"/> Unrestricted Access</span>
                                      )}
                                  </td>

                                  <td className="px-6 py-5 align-top text-right">
                                      <div className="flex items-center justify-end gap-2">
                                          <button 
                                              onClick={() => openEditModal(user)}
                                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                              title="Edit Account"
                                          >
                                              <Edit className="w-5 h-5" />
                                          </button>
                                          <button 
                                              onClick={() => handleDelete(user.id)}
                                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                              title="Delete Account"
                                          >
                                              <Trash2 className="w-5 h-5" />
                                          </button>
                                      </div>
                                  </td>
                              </motion.tr>
                          ))
                      )}
                  </motion.tbody>
              </table>
          </div>

          {/* PREMIUM PAGINATION FOOTER */}
          {!isLoading && users.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <span className="text-sm text-slate-500 font-medium">
                      Showing page <span className="font-bold text-slate-900">{currentPage}</span> of <span className="font-bold text-slate-900">{totalPages}</span>
                  </span>
                  <div className="flex gap-2">
                      <button 
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-1"
                      >
                          <ChevronLeft className="w-4 h-4" /> Prev
                      </button>
                      <button 
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-1"
                      >
                          Next <ChevronRight className="w-4 h-4" />
                      </button>
                  </div>
              </div>
          )}
      </div>

      {/* IDENTITY PROVISIONING MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-auto"
            >
              <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center sticky top-0 z-10">
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-indigo-600" /> 
                  {editingUserId ? "Edit Identity Profile" : "Provision New Identity"}
                </h3>
                <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="user-form" onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                
                {/* Section 1: Security Credentials */}
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-500" /> Security Credentials
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Access Level (Role)</label>
                      <select 
                        name="role" 
                        value={formData.role} 
                        onChange={handleInputChange} 
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all appearance-none cursor-pointer"
                      >
                        <option value="Student">Student Worker</option>
                        <option value="Supervisor">Department Supervisor</option>
                        <option value="WSPO Staff">WSPO Staff Member</option>
                        <option value="Super Admin">Super Administrator</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Username / Login ID</label>
                      <input 
                        required 
                        name="username" 
                        value={formData.username} 
                        onChange={handleInputChange} 
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all" 
                      />
                    </div>
                    <div className="sm:col-span-2 relative">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                        <span>Account Password</span>
                        {editingUserId && <span className="text-amber-500 text-[10px]">Leave blank to keep current</span>}
                      </label>
                      <input 
                        type={showPassword ? "text" : "password"} 
                        name="password" 
                        value={formData.password} 
                        onChange={handleInputChange} 
                        required={!editingUserId} 
                        placeholder={editingUserId ? "••••••••" : "Create a secure password"}
                        className="w-full p-3.5 pr-12 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all placeholder:text-slate-400" 
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-[38px] text-slate-400 hover:text-indigo-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section 2: Personal Profile */}
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Users className="w-4 h-4 text-indigo-500" /> Personal Profile
                  </h4>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                        <span>Full Legal Name</span>
                        {nameError && <span className="text-red-500 text-[10px]">{nameError}</span>}
                      </label>
                      <input 
                        required 
                        name="name" 
                        value={formData.name} 
                        onChange={handleInputChange} 
                        placeholder="First and Last Name required"
                        className={`w-full p-3.5 bg-slate-50 border rounded-xl font-bold outline-none focus:ring-2 focus:bg-white transition-all ${nameError ? 'border-red-400 focus:ring-red-500 text-red-900' : 'border-slate-200 focus:ring-indigo-600 text-slate-900'}`} 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contact Number</label>
                      <input 
                        name="phone_number" 
                        value={formData.phone_number} 
                        onChange={handleInputChange} 
                        placeholder="Optional"
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all placeholder:text-slate-400" 
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Dynamic Role Configuration */}
                {formData.role !== 'Super Admin' && (
                  <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-500" /> Organizational Details
                    </h4>
                    
                    {formData.role === "Student" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Student ID Number</label>
                          <input name="student_id_number" value={formData.student_id_number} onChange={handleInputChange} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Assigned Office / Dept</label>
                          <input name="assigned_office" value={formData.assigned_office} onChange={handleInputChange} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Course / Degree</label>
                          <input name="course" value={formData.course} onChange={handleInputChange} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Year Level</label>
                          <select name="year_level" value={formData.year_level} onChange={handleInputChange} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all appearance-none cursor-pointer">
                            <option value="">-- Select Year --</option>
                            <option value="1">1st Year</option>
                            <option value="2">2nd Year</option>
                            <option value="3">3rd Year</option>
                            <option value="4">4th Year</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {formData.role === "Supervisor" && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Supervised Department</label>
                        <input name="assigned_office" value={formData.assigned_office} onChange={handleInputChange} placeholder="e.g. CCS Office" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all" />
                      </div>
                    )}

                    {formData.role === "WSPO Staff" && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">WSPO Position</label>
                        <select name="assigned_office" value={formData.assigned_office} onChange={handleInputChange} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all appearance-none cursor-pointer">
                          <option value="">-- Select Position --</option>
                          <option value="WSPO Coordinator">WSPO Coordinator</option>
                          <option value="WSPO President">WSPO President</option>
                          <option value="WSPO Secretary">WSPO Secretary</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </form>

              {/* Modal Footer */}
              <div className="px-6 sm:px-8 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors">
                    Cancel
                  </button>
                  <button 
                    form="user-form" 
                    type="submit" 
                    disabled={isSubmitting} 
                    className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-600/25 disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {isSubmitting ? "Provisioning..." : editingUserId ? <><CheckCircle2 className="w-4 h-4"/> Update Identity</> : <><UserPlus className="w-4 h-4"/> Create Identity</>}
                  </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserManagement;