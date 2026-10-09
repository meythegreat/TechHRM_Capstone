import { useState, useEffect } from "react";
import axios from "axios";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import Toast from "./Toast";
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
    ShieldAlert,
    Copy,
    Building2,
    Lock,
    KeyRound
} from "lucide-react";

const FCU_DEPARTMENTS = [
    "Pre-School Department", "Elementary Department", "Junior High School Department", "Senior High School Department", "College of Arts and Sciences", "College of Business and Accountancy", "College of Computer Studies", "College of Criminal Justice Education", "College of Engineering", "College of Hotel and Tourism Management", "College of Nursing", "College of Teacher Education", "Graduate School"
];

interface UserRecord {
  id: number;
  name: string;
  username: string;
  role: string;
  phone_number?: string;
  created_at: string;
  deleted_at?: string | null;
  department_supervisors?: string[];
  profile?: {
    student_id_number?: string;
    assigned_office?: string;
    supervised_departments?: string[];
    course?: string;
    year_level?: number;
    duty_type?: 'Clerical' | 'Janitorial' | 'Request';
    duty_request?: string | null;
    gender?: string | null;
  };
}

const GENDERS = ['Male', 'Female'];

const UserManagement = () => {
  const currentUserRole = localStorage.getItem("user_role") || "";
  const canManageSecurity = currentUserRole === "Super Admin" || currentUserRole === "WSPO Staff";
  const isWspoStaff = currentUserRole === "WSPO Staff";
  const canModifyAccount = (role: string) => currentUserRole === "Super Admin" || (isWspoStaff && role === "Student");

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  // State for showing generated credentials
  const [generatedCredentials, setGeneratedCredentials] = useState<{name: string, username: string, password: string} | null>(null);
  const [copiedField, setCopiedField] = useState<'username' | 'password' | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [departmentSupervisors, setDepartmentSupervisors] = useState<Record<string, string[]>>({});
  const [universityOffices, setUniversityOffices] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    prefix: "",
    first_name: "",
    middle_initial: "",
    last_name: "",
    username: "",
    password: "", // Kept for resetting forgotten passwords
    phone_number: "",
    role: "Student",
    student_id_number: "",
    course: "",
    year_level: "",
    assigned_office: "",
    supervised_departments: [] as string[],
    duty_type: "Clerical",
    duty_request: "",
    gender: "",
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setCurrentPage(1);
      fetchUsers(1, searchQuery);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    axios.get('/api/department-supervisors')
      .then((response) => setDepartmentSupervisors(response.data || {}))
      .catch(() => setDepartmentSupervisors({}));
    axios.get('/api/offices')
      .then((response) => {
        const names = Array.isArray(response.data)
          ? response.data.map((office: { name?: string }) => office.name).filter((name): name is string => Boolean(name))
          : [];
        setUniversityOffices(names);
      })
      .catch(() => setUniversityOffices([]));
  }, []);

  const officeChoices = (selected: string[] = []) => Array.from(new Set([
    ...universityOffices,
    ...selected.filter((name) => name && !universityOffices.includes(name)),
  ]));

  const supervisorLabelForOffice = (office?: string) => {
    if (!office) return 'No supervisor assigned';
    const names = departmentSupervisors[office] || [];
    return names.length > 0 ? names.join(', ') : 'No supervisor assigned';
  };

  const showToast = (text: string, type: "success" | "error") => {
    setToastMsg({ text, type });
  };

  const fetchUsers = async (page: number, search: string = searchQuery) => {
    setIsLoading(true);
    try {
      const response = await axios.get('/api/users', { params: { page, search } });
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

  const handlePageChange = (newPage: number) => {
      setCurrentPage(newPage);
      fetchUsers(newPage);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const toggleSupervisedDepartment = (department: string) => {
    setFormData((current) => ({
      ...current,
      supervised_departments: current.supervised_departments.includes(department)
        ? current.supervised_departments.filter((item) => item !== department)
        : [...current.supervised_departments, department],
    }));
  };

  // Prefixes and middle initials are abbreviations in the saved display name.
  // Strip any entered trailing dots first so the result always contains exactly one.
  const normalizeAbbreviation = (value: string) => {
    const abbreviation = value.trim().replace(/\.+$/, '');
    return abbreviation ? `${abbreviation}.` : '';
  };

  const handleAbbreviationBlur = (field: 'prefix' | 'middle_initial') => {
    setFormData((current) => ({
      ...current,
      [field]: normalizeAbbreviation(current[field]),
    }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length <= 10) {
      setFormData({ ...formData, phone_number: val });
    }
  };

  const parseFullName = (fullName: string) => {
      const parts = fullName.trim().split(" ");
      let prefix = ""; let first_name = ""; let middle_initial = ""; let last_name = "";
      if (parts.length === 0) return { prefix, first_name, middle_initial, last_name };

      const prefixes = ["Mr.", "Ms.", "Mrs.", "Dr.", "Atty.", "Engr.", "Prof."];
      if (prefixes.includes(parts[0]) || parts[0].endsWith('.')) prefix = normalizeAbbreviation(parts.shift() || "");
      if (parts.length > 0) last_name = parts.pop() || "";

      if (parts.length > 0) {
          const miCandidate = parts[parts.length - 1];
          if (/^[\p{L}]\.*$/u.test(miCandidate)) {
              middle_initial = normalizeAbbreviation(parts.pop() || "");
          } else if (parts.length > 1) {
              const middleName = parts.pop() || "";
              middle_initial = normalizeAbbreviation(middleName.charAt(0));
          }
      }
      first_name = parts.join(" ");
      return { prefix, first_name, middle_initial, last_name };
  };

  // PASSWORD STRENGTH CALCULATOR (For resetting)
  const getPasswordStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };
  const passwordScore = getPasswordStrength(formData.password);
  const strengthColors = ['bg-slate-200', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (formData.role === 'Student' && (!formData.phone_number || !formData.gender || !formData.student_id_number.trim() || !formData.course || !formData.year_level || !formData.assigned_office)) {
      showToast('Complete the personal profile and university details before issuing this account.', 'error');
      setIsSubmitting(false);
      return;
    }

    const prefix = normalizeAbbreviation(formData.prefix);
    const middleInitial = normalizeAbbreviation(formData.middle_initial);
    const combinedName = `${prefix ? prefix + ' ' : ''}${formData.first_name} ${middleInitial ? middleInitial + ' ' : ''}${formData.last_name}`.replace(/\s+/g, ' ').trim();

    try {
      if (editingUserId) {
        const payload: any = {
            name: combinedName,
            phone_number: formData.phone_number ? `+63${formData.phone_number}` : '',
            role: formData.role,
            assigned_office: formData.assigned_office,
            supervised_departments: formData.role === 'Supervisor' ? formData.supervised_departments : undefined
            , duty_type: formData.duty_type
            , duty_request: formData.duty_request
            , gender: formData.gender || null
        };
        // Add password payload ONLY if admin typed a new one to reset it
        if (formData.password) {
            payload.password = formData.password;
        }

        if (formData.role === 'Student') {
            payload.student_id_number = formData.student_id_number;
            payload.course = formData.course;
            payload.year_level = formData.year_level;
        }

        await axios.put(`/api/users/${editingUserId}`, payload);
        showToast("User updated successfully.", "success");
        setIsModalOpen(false);
      } else {
        const genUser = `${formData.first_name.toLowerCase().replace(/\s/g, '')}.${formData.last_name.toLowerCase().replace(/\s/g, '')}${Math.floor(Math.random() * 1000)}`;
        const genPass = `FCU-${Math.random().toString(36).substring(2, 6).toUpperCase()}!${Math.floor(Math.random() * 10)}`;

        const payload: any = {
            name: combinedName,
            username: genUser,
            password: genPass,
            phone_number: formData.phone_number ? `+63${formData.phone_number}` : '',
            role: formData.role,
            assigned_office: formData.assigned_office,
            supervised_departments: formData.role === 'Supervisor' ? formData.supervised_departments : undefined
            , duty_type: formData.duty_type
            , duty_request: formData.duty_request
            , gender: formData.gender || null
        };
        if (formData.role === 'Student') {
            payload.student_id_number = formData.student_id_number;
            payload.course = formData.course;
            payload.year_level = formData.year_level;
        }

        await axios.post('/api/users', payload);

        setIsModalOpen(false);
        setGeneratedCredentials({ name: combinedName, username: genUser, password: genPass });
      }
      fetchUsers(currentPage);
      axios.get('/api/department-supervisors')
        .then((response) => setDepartmentSupervisors(response.data || {}))
        .catch(() => {});
    } catch (error: any) {
      console.error("Error saving user:", error);
      const validationError = Object.values(error.response?.data?.errors || {}).flat()[0];
      showToast(
        error.response?.data?.message || (typeof validationError === "string" ? validationError : null) || "Failed to save user details.",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to completely remove this user from the system?')) return;
    try {
      await axios.delete(`/api/users/${id}`);
      setUsers((current) => current.filter((user) => user.id !== id));
      showToast("User deleted successfully.", "success");
      const nextPage = users.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      fetchUsers(nextPage);
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to delete user.", "error");
    }
  };

  const openEditModal = (user: UserRecord) => {
    const { prefix, first_name, middle_initial, last_name } = parseFullName(user.name);
    setEditingUserId(user.id);
    setFormData({
      prefix, first_name, middle_initial, last_name,
      username: user.username,
      password: "", // Leave blank. If typed in, it resets the forgotten password.
      phone_number: user.phone_number?.replace('+63', '') || "",
      role: user.role,
      student_id_number: user.profile?.student_id_number || "",
      course: user.profile?.course || "",
      year_level: user.profile?.year_level?.toString() || "",
      assigned_office: user.profile?.assigned_office || "",
      supervised_departments: user.profile?.supervised_departments || (user.role === 'Supervisor' && user.profile?.assigned_office ? [user.profile.assigned_office] : []),
      duty_type: user.profile?.duty_type || "Clerical",
      duty_request: user.profile?.duty_request || "",
      gender: user.profile?.gender || "",
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingUserId(null);
    setFormData({
      prefix: "", first_name: "", middle_initial: "", last_name: "",
      username: "", password: "", phone_number: "", role: "Student",
      student_id_number: "", course: "", year_level: "", assigned_office: "", supervised_departments: [], duty_type: "Clerical", duty_request: "", gender: "",
    });
    setIsModalOpen(true);
  };

  const copyToClipboard = (text: string, field: 'username' | 'password') => {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
  };

  const getRoleBadge = (role: string) => {
    const base = "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border";
    switch(role) {
      case 'Super Admin': return `${base} bg-purple-50 text-purple-700 border-purple-200`;
      case 'WSPO Staff': return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
      case 'Supervisor': return `${base} bg-blue-50 text-blue-700 border-blue-200`;
      default: return `${base} bg-slate-50 text-slate-600 border-slate-200`;
    }
  };

  const containerVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const rowVariants: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } };

  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans p-4 sm:p-8">

      {/* HEADER */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

          <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Identity & Access</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">User Management</h1>
              <p className="mt-2 text-slate-400 font-medium max-w-md">Control system access, assign roles, and manage department allocations for all personnel and students.</p>
          </div>

          <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
              <div className="flex flex-col text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Quick Action</span>
                  <span className="text-sm font-medium text-slate-300">Provision account</span>
              </div>
              <button onClick={openAddModal} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-indigo-900/50 flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> Add User
              </button>
          </div>
      </motion.div>

      {/* SEARCH BAR */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex items-center relative z-20">
        <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="text" placeholder="Search users by name, ID, department, or role across all pages..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-transparent font-medium text-slate-900 outline-none placeholder:text-slate-400" />
        </div>
        {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="p-2 mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        )}
      </motion.div>

      <Toast
          message={toastMsg?.text ?? null}
          type={toastMsg?.type}
          onClose={() => setToastMsg(null)}
      />

      {/* MAIN TABLE */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative min-h-[400px]">
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
                  <motion.tbody variants={containerVariants} initial="hidden" animate={!isLoading ? "show" : "hidden"} className="divide-y divide-slate-100">
                      {!isLoading && users.length === 0 ? (
                          <tr>
                              <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                                  <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                  <p className="text-base font-semibold text-slate-600">No users found</p>
                              </td>
                          </tr>
                      ) : (
                          users.map((user) => (
                              <motion.tr variants={rowVariants} key={user.id} className="hover:bg-slate-50 transition-colors group">
                                  <td className="px-6 py-5 align-top">
                                      <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black shrink-0 border border-indigo-100 shadow-inner">{user.name.charAt(0)}</div>
                                          <div>
                                              <p className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{user.name}</p>
                                              <p className="text-xs font-medium text-slate-500 mt-0.5 font-mono">{user.username}</p>
                                          </div>
                                      </div>
                                  </td>
                                  <td className="px-6 py-5 align-top"><span className={getRoleBadge(user.role)}>{user.role}</span></td>
                                  <td className="px-6 py-5 align-top">
                                      {user.role === 'Student' ? (
                                          <div>
                                              <p className="text-sm font-bold text-slate-800">{user.profile?.assigned_office || 'No Office Assigned'}</p>
                                              <p className="text-xs font-medium text-slate-500 mt-1">ID: {user.profile?.student_id_number || 'N/A'}{user.profile?.gender ? ` · ${user.profile.gender}` : ''}</p>
                                              <p className="text-xs font-semibold text-indigo-700 mt-1">Supervisor: {(user.department_supervisors && user.department_supervisors.length > 0) ? user.department_supervisors.join(', ') : supervisorLabelForOffice(user.profile?.assigned_office)}</p>
                                          </div>
                                      ) : user.role === 'Supervisor' ? (
                                          <div>
                                              <p className="text-sm font-bold text-slate-800">{user.profile?.supervised_departments?.join(', ') || user.profile?.assigned_office || 'Central Office'}</p>
                                              <p className="text-xs font-medium text-slate-400 mt-1 italic">Administrative Staff</p>
                                          </div>
                                      ) : user.role === 'WSPO Staff' ? (
                                          <div>
                                              <p className="text-sm font-bold text-slate-800">{user.profile?.assigned_office || 'WSPO Coordinator'}</p>
                                              {(!user.profile?.assigned_office || user.profile.assigned_office === 'WSPO Coordinator' || user.profile.assigned_office === 'WSPO') && (
                                                  <p className="text-xs font-semibold text-indigo-700 mt-1">Supervisor of WSPO</p>
                                              )}
                                          </div>
                                      ) : (
                                          <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5"/> Unrestricted Access</span>
                                      )}
                                  </td>
                                  <td className="px-6 py-5 align-top text-right">
                                      {canModifyAccount(user.role) ? (
                                          <div className="flex items-center justify-end gap-2">
                                              <button onClick={() => openEditModal(user)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit Account"><Edit className="w-5 h-5" /></button>
                                              <button onClick={() => handleDelete(user.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete Account"><Trash2 className="w-5 h-5" /></button>
                                          </div>
                                      ) : (
                                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400" title="Only a Super Admin can change this account">
                                              <Lock className="w-3.5 h-3.5" /> Super Admin only
                                          </span>
                                      )}
                                  </td>
                              </motion.tr>
                          ))
                      )}
                  </motion.tbody>
              </table>
          </div>

          {!isLoading && users.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <span className="text-sm text-slate-500 font-medium">Showing page <span className="font-bold text-slate-900">{currentPage}</span> of <span className="font-bold text-slate-900">{totalPages}</span></span>
                  <div className="flex gap-2">
                      <button onClick={() => handlePageChange(Math.max(currentPage - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 transition-all shadow-sm flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Prev</button>
                      <button onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 transition-all shadow-sm flex items-center gap-1">Next <ChevronRight className="w-4 h-4" /></button>
                  </div>
              </div>
          )}
      </div>

      {/* GENERATED CREDENTIALS MODAL (Shown only on successful creation) */}
      <AnimatePresence>
        {generatedCredentials && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-emerald-100">
                    <div className="bg-emerald-50 p-6 sm:p-8 flex flex-col items-center text-center border-b border-emerald-100 relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 rounded-full blur-3xl opacity-20 mix-blend-multiply"></div>
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center border-4 border-white shadow-sm mb-4 relative z-10">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 relative z-10">Account Created!</h3>
                        <p className="text-sm font-medium text-emerald-800 mt-2 relative z-10">{generatedCredentials.name} has been successfully provisioned.</p>
                    </div>

                    <div className="p-6 sm:p-8 space-y-5 bg-white">
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">System Username / Login ID</label>
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-lg font-black text-indigo-700 select-all">{generatedCredentials.username}</span>
                                <button onClick={() => copyToClipboard(generatedCredentials.username, 'username')} className="p-2 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 rounded-lg shadow-sm transition-all">
                                    {copiedField === 'username' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
                                </button>
                            </div>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Auto-Generated Password</label>
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-lg font-black text-slate-900 select-all">{generatedCredentials.password}</span>
                                <button onClick={() => copyToClipboard(generatedCredentials.password, 'password')} className="p-2 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 rounded-lg shadow-sm transition-all">
                                    {copiedField === 'password' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
                                </button>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-3 mt-4">
                            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                            <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
                                Please copy and securely share these credentials with the user. Passwords are permanently encrypted and cannot be viewed again once this window is closed.
                            </p>
                        </div>

                        <button onClick={() => setGeneratedCredentials(null)} className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all mt-6">
                            Done & Close
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* IDENTITY PROVISIONING / EDIT MODAL */}
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
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="user-form" onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">

                {/* GLOBAL ROLE SELECTION */}
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl">
                    <label className="block text-xs font-black text-indigo-700 uppercase tracking-widest mb-3 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4"/> Security Authorization Level</label>
                    <select name="role" value={isWspoStaff ? "Student" : formData.role} onChange={handleInputChange} disabled={isWspoStaff} className="w-full p-3.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 transition-all appearance-none cursor-pointer shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600">
                        <option value="Student">Student Worker</option>
                        {!isWspoStaff && (
                            <>
                                <option value="Supervisor">Department Supervisor</option>
                                <option value="WSPO Staff">WSPO Staff Member</option>
                                <option value="Super Admin">Super Administrator</option>
                            </>
                        )}
                    </select>
                    {isWspoStaff && (
                        <p className="mt-2 text-xs font-semibold text-slate-500">WSPO staff can create and update student accounts only.</p>
                    )}
                </div>

                {/* Section 1: Personal Profile */}
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Users className="w-4 h-4 text-indigo-500" /> Personal Profile
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">

                    <div className="sm:col-span-3">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Prefix</label>
                        <input name="prefix" value={formData.prefix} onChange={handleInputChange} onBlur={() => handleAbbreviationBlur('prefix')} placeholder="e.g. Mr. or Dr." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all placeholder:text-slate-400" />
                    </div>

                    <div className="sm:col-span-5">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">First Name *</label>
                        <input required name="first_name" value={formData.first_name} onChange={handleInputChange} placeholder="Juan" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all placeholder:text-slate-400" />
                    </div>

                    <div className="sm:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">M.I.</label>
                        <input name="middle_initial" value={formData.middle_initial} onChange={handleInputChange} onBlur={() => handleAbbreviationBlur('middle_initial')} placeholder="D." maxLength={2} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all placeholder:text-slate-400" />
                    </div>

                    <div className="sm:col-span-6">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Last Name *</label>
                        <input required name="last_name" value={formData.last_name} onChange={handleInputChange} placeholder="Dela Cruz" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all placeholder:text-slate-400" />
                    </div>

                    <div className="sm:col-span-6">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gender *</label>
                        <select required={formData.role !== 'Super Admin'} name="gender" value={formData.gender} onChange={handleInputChange} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all appearance-none cursor-pointer">
                            <option value="">-- Select gender --</option>
                            {GENDERS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
                        </select>
                    </div>

                    <div className="sm:col-span-6">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contact Number{formData.role === 'Student' ? ' *' : ''}</label>
                        <div className="flex relative">
                            <span className="inline-flex items-center pl-4 pr-2 border border-r-0 border-slate-200 rounded-l-xl bg-slate-100 text-slate-500 text-sm font-bold">
                                +63
                            </span>
                            <input required={formData.role === 'Student'} name="phone_number" value={formData.phone_number} onChange={handlePhoneChange} placeholder="912 345 6789" className="w-full p-3.5 border border-l-0 border-slate-200 rounded-r-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white font-bold text-slate-900 placeholder:text-slate-400 transition-all" />
                        </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: University Details */}
                {formData.role !== 'Super Admin' && (
                  <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                      <Building2 className="w-4 h-4 text-indigo-500" /> University Details
                    </h4>

                    {formData.role === "Student" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Student ID Number *</label>
                          <input required name="student_id_number" value={formData.student_id_number} onChange={handleInputChange} placeholder="FCU-2026-001" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all placeholder:text-slate-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Assigned Office / Dept</label>
                          <select
                            name="assigned_office"
                            value={formData.assigned_office}
                            onChange={handleInputChange}
                            required
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all appearance-none cursor-pointer"
                          >
                            <option value="">-- Select Assigned Office / Dept --</option>
                            {officeChoices(formData.assigned_office ? [formData.assigned_office] : []).map(dept => <option key={`office-${dept}`} value={dept}>{dept}</option>)}
                          </select>
                          {formData.assigned_office && (
                            <p className="mt-2 text-xs font-semibold text-indigo-700">
                              Supervisor: {supervisorLabelForOffice(formData.assigned_office)}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Course / Degree *</label>
                          <select
                            required
                            name="course"
                            value={formData.course}
                            onChange={handleInputChange}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all appearance-none cursor-pointer"
                          >
                            <option value="">-- Select College/Department --</option>
                            {formData.course && !FCU_DEPARTMENTS.includes(formData.course) && (
                              <option value={formData.course}>{formData.course}</option>
                            )}
                            {FCU_DEPARTMENTS.map(dept => <option key={`course-${dept}`} value={dept}>{dept}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Type of Duty</label>
                          <select name="duty_type" value={formData.duty_type} onChange={handleInputChange} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all appearance-none cursor-pointer">
                            <option value="Clerical">Clerical</option>
                            <option value="Janitorial">Janitorial</option>
                            <option value="Request">Request</option>
                          </select>
                        </div>
                        {formData.duty_type === 'Request' && (
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Requested Duty Details</label>
                            <input required name="duty_request" value={formData.duty_request} onChange={handleInputChange} placeholder="Specify the requested duty for this student" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all" />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Year Level *</label>
                          <select required name="year_level" value={formData.year_level} onChange={handleInputChange} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all appearance-none cursor-pointer">
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
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Supervised Departments</label>
                        <p className="text-xs text-slate-500 mb-3">Select every department this supervisor manages.</p>
                        <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100">
                          {officeChoices(formData.supervised_departments).map((dept) => (
                            <label key={`sup-${dept}`} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white transition-colors">
                              <input
                                type="checkbox"
                                checked={formData.supervised_departments.includes(dept)}
                                onChange={() => toggleSupervisedDepartment(dept)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                              />
                              <span className="text-sm font-bold text-slate-700">{dept}</span>
                            </label>
                          ))}
                        </div>
                        {formData.supervised_departments.length > 0 && (
                          <p className="mt-2 text-xs font-semibold text-indigo-700">{formData.supervised_departments.length} department{formData.supervised_departments.length === 1 ? '' : 's'} selected</p>
                        )}
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

                {/* Section 3: Security Credentials (ONLY SHOWN IN EDIT MODE for Admins) */}
                {editingUserId ? (
                    <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                            <KeyRound className="w-4 h-4 text-indigo-500" /> Account Security & Reset
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Username / Login ID</label>
                                <input
                                    disabled
                                    value={formData.username}
                                    className="w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl font-mono font-bold text-slate-500 cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                                    <span>Reset Password</span>
                                    <span className="text-[10px] text-amber-500">Leave blank to keep current</span>
                                </label>
                                {canManageSecurity ? (
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            name="password"
                                            value={formData.password}
                                            onChange={handleInputChange}
                                            placeholder="Type a new password to reset"
                                            className="w-full p-3.5 pr-12 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all placeholder:text-slate-400"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-[14px] text-slate-400 hover:text-indigo-600 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>

                                        {formData.password.length > 0 && (
                                            <div className="mt-3 bg-slate-50 border border-slate-100 p-4 rounded-xl">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Password Strength</span>
                                                    <span className={`text-[10px] font-black uppercase tracking-wider ${strengthColors[passwordScore].replace('bg-', 'text-')}`}>
                                                        {strengthLabels[passwordScore]}
                                                    </span>
                                                </div>
                                                <div className="flex gap-1.5 mb-3">
                                                    {[1, 2, 3, 4].map((level) => (
                                                        <div key={level} className={`h-1.5 w-1/4 rounded-full transition-colors duration-300 ${passwordScore >= level ? strengthColors[passwordScore] : 'bg-slate-200'}`} />
                                                    ))}
                                                </div>
                                                <ul className="text-xs font-medium text-slate-500 space-y-1.5">
                                                    <li className={`flex items-center gap-1.5 transition-colors ${formData.password.length >= 8 ? "text-emerald-600 font-bold" : ""}`}>
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Minimum 8 characters
                                                    </li>
                                                    <li className={`flex items-center gap-1.5 transition-colors ${/[A-Z]/.test(formData.password) ? "text-emerald-600 font-bold" : ""}`}>
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Contains uppercase letter
                                                    </li>
                                                    <li className={`flex items-center gap-1.5 transition-colors ${/[0-9]/.test(formData.password) ? "text-emerald-600 font-bold" : ""}`}>
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Contains a number
                                                    </li>
                                                    <li className={`flex items-center gap-1.5 transition-colors ${/[^A-Za-z0-9]/.test(formData.password) ? "text-emerald-600 font-bold" : ""}`}>
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Contains a symbol (!@#$%)
                                                    </li>
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <input disabled value="••••••••••••" className="w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl font-mono font-bold text-slate-500 cursor-not-allowed" />
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Passwords are permanently encrypted.</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3">
                        <Lock className="w-5 h-5 text-blue-600 shrink-0" />
                        <div>
                            <p className="text-xs font-black text-blue-800 uppercase tracking-widest mb-1">Secure Authentication Generation</p>
                            <p className="text-[11px] font-medium text-blue-700 leading-relaxed">
                                To ensure maximum security, a complex username and encrypted password will be automatically generated. You will be provided with the credentials to securely share with the user once you click save.
                            </p>
                        </div>
                    </div>
                )}
              </form>

              {/* Modal Footer */}
              <div className="px-6 sm:px-8 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors">
                    Cancel
                  </button>
                  <button
                    form="user-form"
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-600/25 disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {isSubmitting ? "Processing..." : editingUserId ? <><CheckCircle2 className="w-4 h-4"/> Save Profile Updates</> : <><UserPlus className="w-4 h-4"/> Provision Identity & Access</>}
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
