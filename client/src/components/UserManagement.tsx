import { useState, useEffect } from "react";
import axios from "axios";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import Toast from "./Toast";
import UserAvatar from "./UserAvatar";
import { formatAssignment } from "../utils/studentAssignment";
import {
  formatDisplayName,
  normalizeAbbreviation,
  parseFullName,
} from "../utils/personName";
import ComboFilter from "./ComboFilter";
import { WSPO_OFFICER_POSITIONS } from "../utils/wspoActivityAccess";
import { REALTIME_EVENT } from "../utils/realtime";
import { bindPopup } from "../utils/popupDismiss";
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
  KeyRound,
  Sparkles,
} from "lucide-react";

const FCU_DEPARTMENTS = [
  "Pre-School Department",
  "Elementary Department",
  "Junior High School Department",
  "Senior High School Department",
  "College of Arts and Sciences",
  "College of Business and Accountancy",
  "College of Computer Studies",
  "College of Criminal Justice Education",
  "College of Engineering",
  "College of Hotel and Tourism Management",
  "College of Nursing",
  "College of Teacher Education",
  "Graduate School",
];

interface UserRecord {
  id: number;
  name: string;
  username: string;
  email?: string | null;
  role: string;
  profile_picture?: string | null;
  phone_number?: string;
  created_at: string;
  deleted_at?: string | null;
  department_supervisors?: string[];
  profile?: {
    student_id_number?: string;
    assigned_office?: string;
    work_department?: string | null;
    organization_officer?: boolean;
    officer_position?: string | null;
    assignment_area?: string | null;
    assignment_label?: string | null;
    special_hours_request?: boolean;
    supervised_departments?: string[];
    secretary_departments?: string[];
    supervisor_absent_on?: string | null;
    course?: string;
    year_level?: number;
    duty_type?: "Clerical" | "Janitorial" | "Request";
    duty_request?: string | null;
    gender?: string | null;
  };
}

const GENDERS = ["Male", "Female"];

const ROLE_FILTERS = [
  { value: "Student", label: "Student Worker" },
  { value: "Supervisor", label: "Department Supervisor" },
  { value: "Department Secretary", label: "Department Secretary" },
  { value: "Immediate Supervisor", label: "Immediate Supervisor" },
  { value: "WSPO Staff", label: "Coordinator" },
  { value: "Super Admin", label: "Super Admin" },
];

type DirectorySlice = { records: UserRecord[]; page: number; totalPages: number };

const blankSlice = (): DirectorySlice => ({ records: [], page: 1, totalPages: 1 });

const isStudentOfficerAccount = (user: UserRecord) => {
  const office = `${user.profile?.assigned_office || ""}`.toLowerCase();
  return (
    office.includes("secretary") ||
    office.includes("president") ||
    Boolean(user.profile?.organization_officer)
  );
};

const UserManagement = () => {
  const currentUserRole = localStorage.getItem("user_role") || "";
  const canManageSecurity =
    currentUserRole === "Super Admin" || currentUserRole === "WSPO Staff";
  const isWspoStaff = currentUserRole === "WSPO Staff";
  const canModifyAccount = (role: string) =>
    currentUserRole === "Super Admin" ||
    (isWspoStaff && (role === "Student" || role === "Department Secretary" || role === "Immediate Supervisor"));

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [secretaries, setSecretaries] = useState<DirectorySlice>(blankSlice());
  const [immediateSupervisors, setImmediateSupervisors] = useState<DirectorySlice>(blankSlice());
  const [supervisors, setSupervisors] = useState<DirectorySlice>(blankSlice());
  const [coordinators, setCoordinators] = useState<DirectorySlice>(blankSlice());
  const [superAdmins, setSuperAdmins] = useState<DirectorySlice>(blankSlice());
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [toastMsg, setToastMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  const [generatedCredentials, setGeneratedCredentials] = useState<{
    name: string;
    username: string;
    email: string;
    password: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<
    "username" | "email" | "password" | null
  >(null);

  const [showPassword, setShowPassword] = useState(false);
  const [departmentSupervisors, setDepartmentSupervisors] = useState<
    Record<string, string[]>
  >({});
  const [universityOffices, setUniversityOffices] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    prefix: "",
    first_name: "",
    middle_initial: "",
    last_name: "",
    username: "",
    email: "",
    password: "",
    phone_number: "",
    role: "Student",
    student_id_number: "",
    course: "",
    year_level: "",
    assigned_office: "",
    work_department: "",
    organization_officer: false,
    officer_position: "",
    assignment_area: "",
    special_hours_request: false,
    supervised_departments: [] as string[],
    secretary_departments: [] as string[],
    duty_type: "Clerical",
    duty_request: "",
    gender: "",
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setCurrentPage(1);
      fetchUsers(1, searchQuery, false, roleFilter, departmentFilter, {
        secretaries: 1,
        immediates: 1,
        supervisors: 1,
        coordinators: 1,
        admins: 1,
      });
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery, roleFilter, departmentFilter]);

  useEffect(() => {
    const refresh = () =>
      fetchUsers(currentPage, searchQuery, true, roleFilter, departmentFilter);
    const interval = setInterval(refresh, 5000);
    window.addEventListener(REALTIME_EVENT, refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener(REALTIME_EVENT, refresh);
    };
  }, [currentPage, searchQuery, roleFilter, departmentFilter]);

  useEffect(() => {
    axios
      .get("/api/department-supervisors")
      .then((response) => setDepartmentSupervisors(response.data || {}))
      .catch(() => setDepartmentSupervisors({}));
    axios
      .get("/api/offices")
      .then((response) => {
        const names = Array.isArray(response.data)
          ? response.data
              .map((office: { name?: string }) => office.name)
              .filter((name): name is string => Boolean(name))
          : [];
        setUniversityOffices(names);
      })
      .catch(() => setUniversityOffices([]));
  }, []);

  const officeChoices = (selected: string[] = []) =>
    Array.from(
      new Set([
        ...universityOffices,
        ...selected.filter((name) => name && !universityOffices.includes(name)),
      ])
    );

  const supervisorLabelForOffice = (office?: string) => {
    if (!office) return "No supervisor assigned";
    const names = departmentSupervisors[office] || [];
    return names.length > 0 ? names.join(", ") : "No supervisor assigned";
  };

  const showToast = (text: string, type: "success" | "error") => {
    setToastMsg({ text, type });
  };

  const fetchSlice = async (
    page: number,
    search: string,
    role: string,
    department: string,
    perPage = 10
  ): Promise<DirectorySlice> => {
    const response = await axios.get("/api/users", {
      params: { page, search, role, department, per_page: perPage },
    });
    const data = response.data.data || response.data;
    return {
      records: Array.isArray(data) ? data : [],
      page: response.data.current_page || 1,
      totalPages: response.data.last_page || 1,
    };
  };

  const fetchUsers = async (
    page: number,
    search: string = searchQuery,
    silent = false,
    role: string = roleFilter,
    department: string = departmentFilter,
    rolePages?: {
      secretaries?: number;
      immediates?: number;
      supervisors?: number;
      coordinators?: number;
      admins?: number;
    }
  ) => {
    if (!silent) setIsLoading(true);
    try {
      if (role) {
        const slice = await fetchSlice(page, search, role, department);
        setUsers(slice.records);
        setCurrentPage(slice.page);
        setTotalPages(slice.totalPages);
        return;
      }

      const [
        studentSlice,
        secretarySlice,
        immediateSlice,
        supervisorSlice,
        coordinatorSlice,
        adminSlice,
      ] = await Promise.all([
        fetchSlice(page, search, "Student", department),
        fetchSlice(
          rolePages?.secretaries ?? secretaries.page ?? 1,
          search,
          "Department Secretary",
          department
        ),
        fetchSlice(
          rolePages?.immediates ?? immediateSupervisors.page ?? 1,
          search,
          "Immediate Supervisor",
          department
        ),
        fetchSlice(
          rolePages?.supervisors ?? supervisors.page ?? 1,
          search,
          "Supervisor",
          department
        ),
        fetchSlice(
          rolePages?.coordinators ?? coordinators.page ?? 1,
          search,
          "WSPO Staff",
          department
        ),
        fetchSlice(
          rolePages?.admins ?? superAdmins.page ?? 1,
          search,
          "Super Admin",
          department
        ),
      ]);
      setUsers(studentSlice.records);
      setCurrentPage(studentSlice.page);
      setTotalPages(studentSlice.totalPages);
      setSecretaries(secretarySlice);
      setImmediateSupervisors(immediateSlice);
      setSupervisors(supervisorSlice);
      setCoordinators({
        ...coordinatorSlice,
        records: coordinatorSlice.records.filter(
          (user) => !isStudentOfficerAccount(user)
        ),
      });
      setSuperAdmins(adminSlice);
    } catch (error) {
      console.error("Failed to fetch users", error);
      showToast("Failed to load user records.", "error");
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const handlePageChange = (newPage: number, sectionKey = "students") => {
    if (roleFilter || sectionKey === "students" || sectionKey === "filtered") {
      setCurrentPage(newPage);
      fetchUsers(newPage);
      return;
    }

    const loadSection = async (
      role: string,
      setter: (slice: DirectorySlice) => void
    ) => {
      try {
        const slice = await fetchSlice(newPage, searchQuery, role, departmentFilter);
        setter(
          role === "WSPO Staff"
            ? {
                ...slice,
                records: slice.records.filter((user) => !isStudentOfficerAccount(user)),
              }
            : slice
        );
      } catch (error) {
        console.error("Failed to fetch users", error);
        showToast("Failed to load user records.", "error");
      }
    };

    if (sectionKey === "secretaries") {
      void loadSection("Department Secretary", setSecretaries);
    } else if (sectionKey === "immediates") {
      void loadSection("Immediate Supervisor", setImmediateSupervisors);
    } else if (sectionKey === "supervisors") {
      void loadSection("Supervisor", setSupervisors);
    } else if (sectionKey === "coordinators") {
      void loadSection("WSPO Staff", setCoordinators);
    } else if (sectionKey === "admins") {
      void loadSection("Super Admin", setSuperAdmins);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const toggleNamedDepartments = (
    key: "supervised_departments" | "secretary_departments",
    department: string
  ) => {
    setFormData((current) => ({
      ...current,
      [key]: current[key].includes(department)
        ? current[key].filter((item) => item !== department)
        : [...current[key], department],
    }));
  };

  const toggleSupervisedDepartment = (department: string) =>
    toggleNamedDepartments("supervised_departments", department);

  const handleAbbreviationBlur = (field: "prefix" | "middle_initial") => {
    setFormData((current) => ({
      ...current,
      [field]: normalizeAbbreviation(current[field]),
    }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "");
    if (val.length <= 10) {
      setFormData({ ...formData, phone_number: val });
    }
  };

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
  const strengthColors = [
    "bg-slate-200",
    "bg-rose-500",
    "bg-amber-500",
    "bg-blue-500",
    "bg-emerald-500",
  ];
  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (
      formData.role === "Student" &&
      formData.organization_officer &&
      !formData.officer_position
    ) {
      showToast("Select the organization position for this officer.", "error");
      setIsSubmitting(false);
      return;
    }

    if (
      formData.role === "Department Secretary" &&
      formData.secretary_departments.length === 0
    ) {
      showToast("Select the office this secretary covers.", "error");
      setIsSubmitting(false);
      return;
    }

    if (formData.role === "Immediate Supervisor" && !formData.assigned_office) {
      showToast("Select the department this immediate supervisor covers.", "error");
      setIsSubmitting(false);
      return;
    }

    if (
      formData.role === "Student" &&
      (!formData.phone_number ||
        !formData.gender ||
        !formData.student_id_number.trim() ||
        !formData.course ||
        !formData.year_level ||
        !formData.assigned_office)
    ) {
      showToast(
        "Complete the personal profile and university details before issuing this account.",
        "error"
      );
      setIsSubmitting(false);
      return;
    }

    const combinedName = formatDisplayName(
      formData.first_name,
      formData.middle_initial,
      formData.last_name,
      formData.prefix
    );

    try {
      if (editingUserId) {
        const payload: any = {
          name: combinedName,
          email: formData.email.trim(),
          phone_number: formData.phone_number ? `+63${formData.phone_number}` : "",
          role: formData.role,
          assigned_office: formData.assigned_office,
          organization_officer:
            formData.role === "Student" && formData.organization_officer,
          officer_position:
            formData.role === "Student" && formData.organization_officer
              ? formData.officer_position
              : null,
          supervised_departments:
            formData.role === "Supervisor"
              ? formData.supervised_departments
              : undefined,
          secretary_departments:
            formData.role === "Department Secretary"
              ? formData.secretary_departments
              : undefined,
          duty_type: formData.duty_type,
          duty_request: formData.duty_request,
          gender: formData.gender || null,
        };
        if (formData.password) {
          payload.password = formData.password;
        }

        if (formData.role === "Student") {
          payload.student_id_number = formData.student_id_number;
          payload.course = formData.course;
          payload.year_level = formData.year_level;
          payload.assignment_area = formData.assignment_area;
          payload.special_hours_request = formData.special_hours_request;
        }

        await axios.put(`/api/users/${editingUserId}`, payload);
        showToast("User updated successfully.", "success");
        setIsModalOpen(false);
      } else {
        const genUser = `${formData.first_name
          .toLowerCase()
          .replace(/\s/g, "")}.${formData.last_name
          .toLowerCase()
          .replace(/\s/g, "")}${Math.floor(Math.random() * 1000)}`;
        const genPass = `FCU-${Math.random()
          .toString(36)
          .substring(2, 6)
          .toUpperCase()}!${Math.floor(Math.random() * 10)}`;

        const payload: any = {
          name: combinedName,
          username: genUser,
          email: formData.email.trim(),
          password: genPass,
          phone_number: formData.phone_number ? `+63${formData.phone_number}` : "",
          role: formData.role,
          assigned_office: formData.assigned_office,
          organization_officer:
            formData.role === "Student" && formData.organization_officer,
          officer_position:
            formData.role === "Student" && formData.organization_officer
              ? formData.officer_position
              : null,
          supervised_departments:
            formData.role === "Supervisor"
              ? formData.supervised_departments
              : undefined,
          secretary_departments:
            formData.role === "Department Secretary"
              ? formData.secretary_departments
              : undefined,
          duty_type: formData.duty_type,
          duty_request: formData.duty_request,
          gender: formData.gender || null,
        };
        if (formData.role === "Student") {
          payload.student_id_number = formData.student_id_number;
          payload.course = formData.course;
          payload.year_level = formData.year_level;
          payload.assignment_area = formData.assignment_area;
          payload.special_hours_request = formData.special_hours_request;
        }

        await axios.post("/api/users", payload);

        setIsModalOpen(false);
        setGeneratedCredentials({
          name: combinedName,
          username: genUser,
          email: formData.email.trim(),
          password: genPass,
        });
      }
      fetchUsers(currentPage);
      axios
        .get("/api/department-supervisors")
        .then((response) => setDepartmentSupervisors(response.data || {}))
        .catch(() => {});
    } catch (error: any) {
      console.error("Error saving user:", error);
      const validationError = Object.values(
        error.response?.data?.errors || {}
      ).flat()[0];
      showToast(
        error.response?.data?.message ||
          (typeof validationError === "string" ? validationError : null) ||
          "Failed to save user details.",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to completely remove this user from the system?"
      )
    )
      return;
    try {
      await axios.delete(`/api/users/${id}`);
      setUsers((current) => current.filter((user) => user.id !== id));
      showToast("User deleted successfully.", "success");
      const nextPage =
        users.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      fetchUsers(nextPage);
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to delete user.",
        "error"
      );
    }
  };

  const openEditModal = (user: UserRecord) => {
    const { prefix, first_name, middle_initial, last_name } = parseFullName(
      user.name
    );
    setEditingUserId(user.id);
    setFormData({
      prefix,
      first_name,
      middle_initial,
      last_name,
      username: user.username,
      email: user.email || "",
      password: "",
      phone_number: user.phone_number?.replace("+63", "") || "",
      role: user.role,
      student_id_number: user.profile?.student_id_number || "",
      course: user.profile?.course || "",
      year_level: user.profile?.year_level?.toString() || "",
      assigned_office: user.profile?.assigned_office || "",
      work_department: user.profile?.work_department || "",
      organization_officer: Boolean(user.profile?.organization_officer),
      officer_position: user.profile?.officer_position || "",
      assignment_area: user.profile?.assignment_area || "",
      special_hours_request: Boolean(user.profile?.special_hours_request),
      supervised_departments:
        user.profile?.supervised_departments ||
        (user.role === "Supervisor" && user.profile?.assigned_office
          ? [user.profile.assigned_office]
          : []),
      secretary_departments:
        user.profile?.secretary_departments ||
        (user.role === "Department Secretary" && user.profile?.assigned_office
          ? [user.profile.assigned_office]
          : []),
      duty_type: user.profile?.duty_type || "Clerical",
      duty_request: user.profile?.duty_request || "",
      gender: user.profile?.gender || "",
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingUserId(null);
    setFormData({
      prefix: "",
      first_name: "",
      middle_initial: "",
      last_name: "",
      username: "",
      email: "",
      password: "",
      phone_number: "",
      role: "Student",
      student_id_number: "",
      course: "",
      year_level: "",
      assigned_office: "",
      work_department: "",
      organization_officer: false,
      officer_position: "",
      assignment_area: "",
      special_hours_request: false,
      supervised_departments: [],
      secretary_departments: [],
      duty_type: "Clerical",
      duty_request: "",
      gender: "",
    });
    setIsModalOpen(true);
  };

  const copyToClipboard = (
    text: string,
    field: "username" | "email" | "password"
  ) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getRoleBadge = (role: string) => {
    const base =
      "inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider";
    switch (role) {
      case "Super Admin":
        return `${base} border-purple-200 bg-purple-50 text-purple-700`;
      case "WSPO Staff":
        return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
      case "Supervisor":
        return `${base} border-blue-200 bg-blue-50 text-blue-700`;
      case "Department Secretary":
        return `${base} border-violet-200 bg-violet-50 text-violet-700`;
      case "Immediate Supervisor":
        return `${base} border-amber-200 bg-amber-50 text-amber-800`;
      default:
        return `${base} border-slate-200 bg-slate-100 text-slate-600`;
    }
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04 } },
  };
  const rowVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
    },
  };

  const roleLabel = (user: UserRecord) =>
    user.role === "WSPO Staff" && !isStudentOfficerAccount(user)
      ? "Coordinator"
      : user.role;

  const renderUserRow = (user: UserRecord) => (
    <motion.tr
      variants={rowVariants}
      key={user.id}
      className="group transition-colors hover:bg-slate-50/80"
    >
      <td className="px-6 py-4 align-top">
        <div className="flex items-center gap-3.5">
          <UserAvatar
            name={user.name}
            picture={user.profile_picture}
            className="h-10 w-10 shrink-0 rounded-full border border-indigo-100 bg-indigo-50 text-sm text-indigo-700"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-slate-900 transition-colors group-hover:text-indigo-700">
              {user.name}
            </p>
            <p className="mt-0.5 font-mono text-xs font-semibold text-slate-500">
              {user.username}
            </p>
            {user.email && (
              <p className="mt-0.5 truncate text-xs font-medium text-slate-400">
                {user.email}
              </p>
            )}
          </div>
        </div>
      </td>

      <td className="px-6 py-4 align-top">
        <span className={getRoleBadge(user.role)}>{roleLabel(user)}</span>
      </td>

      <td className="px-6 py-4 align-top">
        {user.role === "Student" ? (
          <div>
            <p className="text-sm font-bold text-slate-900">
              {user.profile?.assignment_label ||
                formatAssignment(
                  user.profile?.assigned_office,
                  user.profile?.assignment_area
                ) ||
                "No Office Assigned"}
            </p>
            <p className="mt-1 font-mono text-xs font-medium text-slate-500">
              ID: {user.profile?.student_id_number || "N/A"}
              {user.profile?.gender ? ` · ${user.profile.gender}` : ""}
            </p>
            {user.profile?.special_hours_request && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                <Sparkles className="h-3 w-3" />
                Special request · 100 hrs
              </p>
            )}
            <p className="mt-1 text-xs font-bold text-indigo-700">
              Supervisor:{" "}
              {user.department_supervisors &&
              user.department_supervisors.length > 0
                ? user.department_supervisors.join(", ")
                : supervisorLabelForOffice(user.profile?.assigned_office)}
            </p>
            {user.profile?.organization_officer &&
              user.profile?.officer_position && (
                <p className="mt-1 text-xs font-bold text-emerald-700">
                  ✓ {user.profile.officer_position}
                </p>
              )}
          </div>
        ) : user.role === "Department Secretary" ? (
          <div>
            <p className="text-sm font-bold text-slate-900">
              {(user.profile?.secretary_departments || []).join(", ") ||
                user.profile?.assigned_office ||
                "No office assigned"}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Acts for the supervisor when they are absent
            </p>
          </div>
        ) : user.role === "Immediate Supervisor" ? (
          <div>
            <p className="text-sm font-bold text-slate-900">
              {user.profile?.assigned_office || "No department assigned"}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Final say on janitorial attendance for this department
            </p>
          </div>
        ) : user.role === "Supervisor" ? (
          <div>
            <p className="text-sm font-bold text-slate-900">
              {user.profile?.supervised_departments?.join(", ") ||
                user.profile?.assigned_office ||
                "Central Office"}
            </p>
            <p className="mt-1 text-xs font-medium italic text-slate-400">
              Administrative Staff
            </p>
          </div>
        ) : user.role === "WSPO Staff" ? (
          <div>
            <p className="text-sm font-bold text-slate-900">
              {user.profile?.assigned_office || "WSPO Coordinator"}
            </p>
            {(!user.profile?.assigned_office ||
              user.profile.assigned_office === "WSPO Coordinator" ||
              user.profile.assigned_office === "WSPO") && (
              <p className="mt-1 text-xs font-bold text-indigo-700">
                Coordinator access for WSPO
              </p>
            )}
            {user.profile?.assigned_office === "WSPO Secretary" && (
              <p className="mt-1 text-xs font-medium text-slate-500">
                Student officer · activity tools only · clocks in as a working
                student
                {user.profile?.work_department
                  ? ` · ${user.profile.work_department}`
                  : ""}
              </p>
            )}
            {user.profile?.assigned_office === "WSPO President" && (
              <p className="mt-1 text-xs font-bold text-indigo-700">
                Student officer · clocks in as a working student
                {user.profile?.work_department
                  ? ` · ${user.profile.work_department}`
                  : ""}
              </p>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <ShieldAlert className="h-3.5 w-3.5" />
            Unrestricted Access
          </span>
        )}
      </td>

      <td className="px-6 py-4 text-right align-top">
        {canModifyAccount(user.role) ? (
          <div className="inline-flex items-center justify-end gap-1">
            <button
              onClick={() => openEditModal(user)}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
              aria-label="Edit account"
              title="Edit Account"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDelete(user.id)}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              aria-label="Delete account"
              title="Delete Account"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-400"
            title="Only a Super Admin can change this account"
          >
            <Lock className="h-3 w-3" />
            Super Admin only
          </span>
        )}
      </td>
    </motion.tr>
  );

  const directorySections = roleFilter
    ? [
        {
          key: "filtered",
          title: "",
          hint: "",
          records: users,
          page: currentPage,
          totalPages,
          paginate: true,
        },
      ]
    : [
        {
          key: "students",
          title: "Students",
          hint: "Working students and student officers.",
          records: users,
          page: currentPage,
          totalPages,
          paginate: true,
        },
        {
          key: "secretaries",
          title: "Department Secretary",
          hint: "Acts for a supervisor while they are absent.",
          records: secretaries.records,
          page: secretaries.page,
          totalPages: secretaries.totalPages,
          paginate: true,
        },
        {
          key: "immediates",
          title: "Immediate Supervisor",
          hint: "Final say on janitorial attendance. Separate from the department secretary.",
          records: immediateSupervisors.records,
          page: immediateSupervisors.page,
          totalPages: immediateSupervisors.totalPages,
          paginate: true,
        },
        {
          key: "supervisors",
          title: "Supervisor",
          hint: "Department supervisors.",
          records: supervisors.records,
          page: supervisors.page,
          totalPages: supervisors.totalPages,
          paginate: true,
        },
        {
          key: "coordinators",
          title: "Coordinator",
          hint: "WSPO coordinators.",
          records: coordinators.records,
          page: coordinators.page,
          totalPages: coordinators.totalPages,
          paginate: true,
        },
        {
          key: "admins",
          title: "Super Admin",
          hint: "Accounts with full system access.",
          records: superAdmins.records,
          page: superAdmins.page,
          totalPages: superAdmins.totalPages,
          paginate: true,
        },
      ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
      {/* OBSIDIAN IDENTITY & ACCESS HERO */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-indigo-600/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/25 bg-indigo-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-indigo-300">
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
              Identity &amp; Access
            </span>
            <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
              User Management
            </h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
              Control system access, assign roles, and manage department
              allocations for all personnel and student workers.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-4 self-start rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur-xl lg:self-auto">
            <div className="hidden text-right sm:block">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Quick Action
              </p>
              <p className="mt-0.5 text-xs font-medium text-slate-300">
                Provision new account
              </p>
            </div>
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-blue-500"
            >
              <UserPlus className="h-4 w-4" />
              Add User
            </button>
          </div>
        </div>
      </motion.header>

      {/* SEARCH & FILTERS DECK */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="relative z-20 flex flex-col gap-3 rounded-[1.75rem] border border-slate-200/90 bg-white p-4 shadow-sm lg:flex-row lg:items-center"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search users by name, username, email, or student ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            aria-label="Filter by role"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 sm:w-48"
          >
            <option value="">All roles</option>
            {ROLE_FILTERS.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>

          <ComboFilter
            className="w-full sm:w-64"
            value={departmentFilter}
            onChange={setDepartmentFilter}
            options={officeChoices([
              ...(universityOffices.length === 0 ? FCU_DEPARTMENTS : []),
              ...(departmentFilter ? [departmentFilter] : []),
            ])}
            placeholder="All departments"
            emptyLabel="All departments"
            commitOnType={false}
          />

          {(searchQuery || roleFilter || departmentFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setRoleFilter("");
                setDepartmentFilter("");
              }}
              className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Clear
            </button>
          )}
        </div>
      </motion.section>

      <Toast
        message={toastMsg?.text ?? null}
        type={toastMsg?.type}
        onClose={() => setToastMsg(null)}
      />

      {/* DIRECTORY SECTIONS */}
      <div className="space-y-6">
        {directorySections.map((section) => (
          <section
            key={section.key}
            className="relative min-h-[180px] overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm"
          >
            {section.title && (
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">
                    {section.title}
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    {section.hint}
                  </p>
                </div>
                {!section.paginate && (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-mono text-xs font-extrabold text-slate-600">
                    {section.records.length}
                  </span>
                )}
              </div>
            )}

            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-9 w-9 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                  <span className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
                    Loading identity records…
                  </span>
                </div>
              </div>
            )}

            <div className="custom-scrollbar overflow-x-auto">
              <table className="app-data-table w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-950 text-white">
                    <th className="px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest">
                      Account Details
                    </th>
                    <th className="px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest">
                      Role &amp; Access
                    </th>
                    <th className="px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest">
                      Department Details
                    </th>
                    <th className="px-6 py-3.5 text-right text-[11px] font-extrabold uppercase tracking-widest">
                      Actions
                    </th>
                  </tr>
                </thead>
                <motion.tbody
                  variants={containerVariants}
                  initial="hidden"
                  animate={!isLoading ? "show" : "hidden"}
                  className="divide-y divide-slate-100"
                >
                  {!isLoading && section.records.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-14 text-center text-slate-400"
                      >
                        <Users className="mx-auto mb-3 h-10 w-10 opacity-25" />
                        <p className="text-sm font-bold text-slate-600">
                          {searchQuery || roleFilter || departmentFilter
                            ? "No users match these filters"
                            : `No ${
                                section.title
                                  ? section.title.toLowerCase()
                                  : "users"
                              } found`}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    section.records.map((user) => renderUserRow(user))
                  )}
                </motion.tbody>
              </table>
            </div>

            {!isLoading && section.paginate && section.records.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row">
                <span className="text-xs font-semibold text-slate-500">
                  Showing page{" "}
                  <span className="font-extrabold text-slate-900">
                    {section.page}
                  </span>{" "}
                  of{" "}
                  <span className="font-extrabold text-slate-900">
                    {section.totalPages}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      handlePageChange(Math.max(section.page - 1, 1), section.key)
                    }
                    disabled={section.page === 1}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </button>
                  <button
                    onClick={() =>
                      handlePageChange(
                        Math.min(section.page + 1, section.totalPages),
                        section.key
                      )
                    }
                    disabled={section.page === section.totalPages}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* OBSIDIAN GENERATED CREDENTIALS MODAL */}
      <AnimatePresence>
        {generatedCredentials && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
            {...bindPopup(() => setGeneratedCredentials(null))}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
            >
              <div className="bg-slate-950 px-6 py-6 text-center text-white">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-black tracking-tight">
                  Account Created
                </h3>
                <p className="mt-1.5 text-xs font-medium text-slate-300">
                  {generatedCredentials.name} has been provisioned.
                </p>
              </div>

              <div className="space-y-3.5 p-6">
                {[
                  ["Username", generatedCredentials.username, "username"],
                  ["Email", generatedCredentials.email, "email"],
                  [
                    "Auto-Generated Password",
                    generatedCredentials.password,
                    "password",
                  ],
                ].map(([label, val, field]) => (
                  <div
                    key={field}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5"
                  >
                    <label className="mb-1 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                      {label}
                    </label>
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate select-all font-mono text-sm font-black text-slate-900">
                        {val}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            val,
                            field as "username" | "email" | "password"
                          )
                        }
                        className="rounded-lg border border-slate-200 bg-white p-2 transition hover:border-indigo-300"
                      >
                        {copiedField === field ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Copy className="h-4 w-4 text-slate-500" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-[11px] font-bold leading-relaxed text-amber-800">
                    Copy and share these credentials securely. Passwords are
                    permanently encrypted and cannot be viewed again once
                    closed.
                  </p>
                </div>

                <button
                  onClick={() => setGeneratedCredentials(null)}
                  className="w-full rounded-xl bg-slate-900 py-3 text-xs font-extrabold uppercase tracking-wider text-white transition hover:bg-indigo-600"
                >
                  Done &amp; Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OBSIDIAN PROVISION / EDIT IDENTITY MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm"
            {...bindPopup(() => setIsModalOpen(false))}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 16 }}
              className="my-auto w-full max-w-2xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                <h3 className="flex items-center gap-2.5 text-base font-black tracking-tight">
                  <UserPlus className="h-5 w-5 text-indigo-400" />
                  {editingUserId
                    ? "Edit Identity Profile"
                    : "Provision New Identity"}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form
                id="user-form"
                onSubmit={handleSubmit}
                className="custom-scrollbar max-h-[72vh] space-y-7 overflow-y-auto p-6 sm:p-7"
              >
                {/* GLOBAL ROLE SELECTION */}
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <label className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-indigo-700">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Security Authorization Level
                  </label>
                  <select
                    name="role"
                    value={
                      isWspoStaff &&
                      formData.role !== "Department Secretary" &&
                      formData.role !== "Immediate Supervisor" &&
                      formData.role !== "Student"
                        ? "Student"
                        : formData.role
                    }
                    onChange={handleInputChange}
                    className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                  >
                    <option value="Student">Student Worker</option>
                    <option value="Department Secretary">
                      Department Secretary
                    </option>
                    <option value="Immediate Supervisor">
                      Immediate Supervisor
                    </option>
                    {!isWspoStaff && (
                      <>
                        <option value="Supervisor">Department Supervisor</option>
                        <option value="WSPO Staff">WSPO Staff Member</option>
                        <option value="Super Admin">Super Administrator</option>
                      </>
                    )}
                  </select>
                  {isWspoStaff && (
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      WSPO staff can provision students, department secretaries, and immediate supervisors. A secretary can time students in with the supervisor’s access even when the supervisor is busy. An immediate supervisor only reviews janitorial attendance.
                    </p>
                  )}
                </div>

                {/* Section 1: Personal Profile */}
                <div>
                  <h4 className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                    <Users className="h-4 w-4 text-indigo-500" />
                    Personal Profile
                  </h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                    <div className="sm:col-span-3">
                      <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Prefix
                      </label>
                      <input
                        name="prefix"
                        value={formData.prefix}
                        onChange={handleInputChange}
                        onBlur={() => handleAbbreviationBlur("prefix")}
                        placeholder="Mr. / Dr."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        First Name *
                      </label>
                      <input
                        required
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleInputChange}
                        placeholder="Juan"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        M.I.
                      </label>
                      <input
                        name="middle_initial"
                        value={formData.middle_initial}
                        onChange={handleInputChange}
                        onBlur={() => handleAbbreviationBlur("middle_initial")}
                        placeholder="M."
                        maxLength={2}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                      />
                    </div>

                    <div className="sm:col-span-6">
                      <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Last Name *
                      </label>
                      <input
                        required
                        name="last_name"
                        value={formData.last_name}
                        onChange={handleInputChange}
                        placeholder="Dela Cruz"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                      />
                    </div>

                    <div className="sm:col-span-6">
                      <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Gender *
                      </label>
                      <select
                        required={formData.role !== "Super Admin"}
                        name="gender"
                        value={formData.gender}
                        onChange={handleInputChange}
                        className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white"
                      >
                        <option value="">-- Select gender --</option>
                        {GENDERS.map((gender) => (
                          <option key={gender} value={gender}>
                            {gender}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-12">
                      <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Email Address *
                      </label>
                      <input
                        required
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="name@filamer.edu.ph"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                      />
                      <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                        This person can sign in with either the generated
                        username or this email.
                      </p>
                    </div>

                    <div className="sm:col-span-6">
                      <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Contact Number{formData.role === "Student" ? " *" : ""}
                      </label>
                      <div className="flex">
                        <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 pl-3.5 pr-2 text-xs font-extrabold text-slate-500">
                          +63
                        </span>
                        <input
                          required={formData.role === "Student"}
                          name="phone_number"
                          value={formData.phone_number}
                          onChange={handlePhoneChange}
                          placeholder="912 345 6789"
                          className="w-full rounded-r-xl border border-l-0 border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: University Details */}
                {formData.role !== "Super Admin" && (
                  <div>
                    <h4 className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                      <Building2 className="h-4 w-4 text-indigo-500" />
                      University Details
                    </h4>

                    {formData.role === "Student" && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Student ID Number *
                          </label>
                          <input
                            required
                            name="student_id_number"
                            value={formData.student_id_number}
                            onChange={handleInputChange}
                            placeholder="FCU-2026-001"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Assigned Office / Dept
                          </label>
                          <select
                            name="assigned_office"
                            value={formData.assigned_office}
                            onChange={handleInputChange}
                            required
                            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white"
                          >
                            <option value="">
                              -- Select Assigned Office / Dept --
                            </option>
                            {officeChoices(
                              formData.assigned_office
                                ? [formData.assigned_office]
                                : []
                            ).map((dept) => (
                              <option key={`office-${dept}`} value={dept}>
                                {dept}
                              </option>
                            ))}
                          </select>
                          {formData.assigned_office && (
                            <p className="mt-1.5 text-xs font-bold text-indigo-700">
                              Supervisor:{" "}
                              {supervisorLabelForOffice(
                                formData.assigned_office
                              )}
                              {formData.assignment_area.trim()
                                ? ` · Shown as ${formatAssignment(
                                    formData.assigned_office,
                                    formData.assignment_area
                                  )}`
                                : ""}
                            </p>
                          )}
                        </div>

                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Specific Area of Assignment
                          </label>
                          <input
                            name="assignment_area"
                            value={formData.assignment_area}
                            onChange={handleInputChange}
                            placeholder="Laboratory"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                          />
                          <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                            Shown after the department. Example: CCS -
                            Laboratory.
                          </p>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                            <input
                              type="checkbox"
                              checked={formData.organization_officer}
                              onChange={(event) =>
                                setFormData((current) => ({
                                  ...current,
                                  organization_officer: event.target.checked,
                                  officer_position: event.target.checked
                                    ? current.officer_position
                                    : "",
                                }))
                              }
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                            />
                            <span>
                              <span className="block text-xs font-extrabold text-emerald-950">
                                Officer of the organization
                              </span>
                              <span className="mt-0.5 block text-[11px] font-medium text-emerald-800">
                                Assign an elected WSPO officer title while keeping their department placement.
                                Only the WSPO Secretary receives activity tools; every officer still clocks in as a working student.
                              </span>
                            </span>
                          </label>
                          {formData.organization_officer && (
                            <div className="mt-3">
                              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Position
                              </label>
                              <select
                                name="officer_position"
                                value={formData.officer_position}
                                onChange={handleInputChange}
                                required
                                className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-600"
                              >
                                <option value="">-- Select position --</option>
                                {WSPO_OFFICER_POSITIONS.map((position) => (
                                  <option key={position} value={position}>
                                    {position}
                                    {position === "WSPO Secretary"
                                      ? " (activity access)"
                                      : ""}
                                  </option>
                                ))}
                                {formData.officer_position &&
                                  !(WSPO_OFFICER_POSITIONS as readonly string[]).includes(
                                    formData.officer_position
                                  ) && (
                                    <option value={formData.officer_position}>
                                      {formData.officer_position}
                                    </option>
                                  )}
                              </select>
                            </div>
                          )}
                        </div>

                        <div className="sm:col-span-2">
                          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-3">
                            <input
                              type="checkbox"
                              checked={formData.special_hours_request}
                              onChange={(event) =>
                                setFormData((current) => ({
                                  ...current,
                                  special_hours_request: event.target.checked,
                                }))
                              }
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-700 focus:ring-violet-600"
                            />
                            <span>
                              <span className="block text-xs font-extrabold text-violet-950">
                                Special request · 100 hours
                              </span>
                              <span className="mt-0.5 block text-[11px] font-medium text-violet-800">
                                Extends the standard 80-hour term requirement to 100 hours.
                              </span>
                            </span>
                          </label>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Course / Degree *
                          </label>
                          <select
                            required
                            name="course"
                            value={formData.course}
                            onChange={handleInputChange}
                            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white"
                          >
                            <option value="">
                              -- Select College/Department --
                            </option>
                            {formData.course &&
                              !FCU_DEPARTMENTS.includes(formData.course) && (
                                <option value={formData.course}>
                                  {formData.course}
                                </option>
                              )}
                            {FCU_DEPARTMENTS.map((dept) => (
                              <option key={`course-${dept}`} value={dept}>
                                {dept}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Type of Duty
                          </label>
                          <select
                            name="duty_type"
                            value={formData.duty_type}
                            onChange={handleInputChange}
                            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white"
                          >
                            <option value="Clerical">Clerical</option>
                            <option value="Janitorial">Janitorial</option>
                            <option value="Request">Request</option>
                          </select>
                        </div>

                        {formData.duty_type === "Request" && (
                          <div className="sm:col-span-2">
                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                              Requested Duty Details
                            </label>
                            <input
                              required
                              name="duty_request"
                              value={formData.duty_request}
                              onChange={handleInputChange}
                              placeholder="Specify the requested duty for this student"
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                            />
                          </div>
                        )}

                        <div>
                          <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Year Level *
                          </label>
                          <select
                            required
                            name="year_level"
                            value={formData.year_level}
                            onChange={handleInputChange}
                            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white"
                          >
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
                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                          Supervised Departments
                        </label>
                        <p className="mb-3 text-xs font-medium text-slate-500">
                          Select every department this supervisor manages.
                        </p>
                        <div className="custom-scrollbar max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50">
                          {officeChoices(formData.supervised_departments).map(
                            (dept) => (
                              <label
                                key={`sup-${dept}`}
                                className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-white"
                              >
                                <input
                                  type="checkbox"
                                  checked={formData.supervised_departments.includes(
                                    dept
                                  )}
                                  onChange={() =>
                                    toggleSupervisedDepartment(dept)
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                                />
                                <span className="text-sm font-bold text-slate-700">
                                  {dept}
                                </span>
                              </label>
                            )
                          )}
                        </div>
                        {formData.supervised_departments.length > 0 && (
                          <p className="mt-2 text-xs font-bold text-indigo-700">
                            {formData.supervised_departments.length} department
                            {formData.supervised_departments.length === 1
                              ? ""
                              : "s"}{" "}
                            selected
                          </p>
                        )}
                      </div>
                    )}

                    {formData.role === "Immediate Supervisor" && (
                      <div>
                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                          Department
                        </label>
                        <p className="mb-3 text-xs font-medium text-slate-500">
                          This person gives the final say on janitorial attendance for this department. They are not the department secretary.
                        </p>
                        <select
                          name="assigned_office"
                          value={formData.assigned_office}
                          onChange={handleInputChange}
                          className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                        >
                          <option value="">Select a department</option>
                          {officeChoices([formData.assigned_office]).map((dept) => (
                            <option key={`imm-${dept}`} value={dept}>
                              {dept}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {formData.role === "Department Secretary" && (
                      <div>
                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                          Secretary For
                        </label>
                        <p className="mb-3 text-xs font-medium text-slate-500">
                          Same department access as the supervisor, including
                          timing students in when the supervisor is busy.
                        </p>
                        <div className="custom-scrollbar max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50">
                          {officeChoices(formData.secretary_departments).map(
                            (dept) => (
                              <label
                                key={`sec-${dept}`}
                                className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-white"
                              >
                                <input
                                  type="checkbox"
                                  checked={formData.secretary_departments.includes(
                                    dept
                                  )}
                                  onChange={() =>
                                    toggleNamedDepartments(
                                      "secretary_departments",
                                      dept
                                    )
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                                />
                                <span className="text-sm font-bold text-slate-700">
                                  {dept}
                                </span>
                              </label>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {formData.role === "WSPO Staff" && (
                      <div>
                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                          WSPO Position
                        </label>
                        <select
                          name="assigned_office"
                          value={formData.assigned_office}
                          onChange={handleInputChange}
                          className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white"
                        >
                          <option value="">-- Select Position --</option>
                          <option value="WSPO Coordinator">
                            WSPO Coordinator
                          </option>
                          <option value="WSPO President">WSPO President</option>
                          <option value="WSPO Secretary">WSPO Secretary</option>
                        </select>
                        <p className="mt-2 text-xs font-medium text-slate-500">
                          For staff coordinators; assign elected student officers under their student account instead.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Section 3: Security Credentials */}
                {editingUserId ? (
                  <div>
                    <h4 className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                      <KeyRound className="h-4 w-4 text-indigo-500" />
                      Account Security &amp; Reset
                    </h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                          Username / Login ID
                        </label>
                        <input
                          disabled
                          value={formData.username}
                          className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 p-3 font-mono text-sm font-bold text-slate-500"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 flex justify-between text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                          <span>Reset Password</span>
                          <span className="text-amber-600">Optional</span>
                        </label>
                        {canManageSecurity ? (
                          <div className="relative">
                            <input
                              type={showPassword ? "text" : "password"}
                              name="password"
                              value={formData.password}
                              onChange={handleInputChange}
                              placeholder="Type a new password to reset"
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 pr-11 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-3 text-slate-400 transition hover:text-indigo-600"
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>

                            {formData.password.length > 0 && (
                              <div className="mt-3 rounded-2xl border border-slate-200/80 bg-slate-50 p-3.5">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Strength
                                  </span>
                                  <span
                                    className={`text-[10px] font-extrabold uppercase tracking-wider ${strengthColors[
                                      passwordScore
                                    ].replace("bg-", "text-")}`}
                                  >
                                    {strengthLabels[passwordScore]}
                                  </span>
                                </div>
                                <div className="mb-3 flex gap-1.5">
                                  {[1, 2, 3, 4].map((level) => (
                                    <div
                                      key={level}
                                      className={`h-1.5 w-1/4 rounded-full transition-colors ${
                                        passwordScore >= level
                                          ? strengthColors[passwordScore]
                                          : "bg-slate-200"
                                      }`}
                                    />
                                  ))}
                                </div>
                                <ul className="space-y-1 text-[11px] font-semibold text-slate-500">
                                  <li
                                    className={`flex items-center gap-1.5 ${
                                      formData.password.length >= 8
                                        ? "text-emerald-600"
                                        : ""
                                    }`}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Minimum 8 characters
                                  </li>
                                  <li
                                    className={`flex items-center gap-1.5 ${
                                      /[A-Z]/.test(formData.password)
                                        ? "text-emerald-600"
                                        : ""
                                    }`}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Contains uppercase letter
                                  </li>
                                  <li
                                    className={`flex items-center gap-1.5 ${
                                      /[0-9]/.test(formData.password)
                                        ? "text-emerald-600"
                                        : ""
                                    }`}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Contains a number
                                  </li>
                                  <li
                                    className={`flex items-center gap-1.5 ${
                                      /[^A-Za-z0-9]/.test(formData.password)
                                        ? "text-emerald-600"
                                        : ""
                                    }`}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Contains a symbol (!@#$%)
                                  </li>
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <input
                              disabled
                              value="••••••••••••"
                              className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 p-3 font-mono text-sm font-bold text-slate-500"
                            />
                            <p className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              Passwords are permanently encrypted.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                    <Lock className="h-5 w-5 shrink-0 text-blue-600" />
                    <div>
                      <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-widest text-blue-800">
                        Secure Authentication Generation
                      </p>
                      <p className="text-xs font-medium leading-relaxed text-blue-900">
                        A username and password are generated when you save. The
                        person can sign in with that username or the email
                        address above.
                      </p>
                    </div>
                  </div>
                )}
              </form>

              {/* Modal Footer */}
              <div className="flex shrink-0 justify-end gap-2.5 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-200/70"
                >
                  Cancel
                </button>
                <button
                  form="user-form"
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-indigo-600 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    "Processing…"
                  ) : editingUserId ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Save Profile Updates
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Provision Identity
                    </>
                  )}
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