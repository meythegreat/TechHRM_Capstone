import StudentOverview from './StudentOverview';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import PageTransition from './PageTransition';
import Toast from './Toast';
import {
    CalendarRange,
    Clock,
    FileText,
    UploadCloud,
    CheckCircle2,
    XCircle,
    AlertCircle,
    UserCircle,
    Check,
    Briefcase,
    GraduationCap,
    ShieldCheck,
    Eye,
    EyeOff,
    Lock,
    X,
    Sparkles,
    Building2,
    Menu,
} from 'lucide-react';

import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import SyncStatus from './SyncStatus';
import SecureImage from './SecureImage';
import AvatarCropDialog from './AvatarCropDialog';
import AvatarPhotoMenu from './AvatarPhotoMenu';
import { normalizeFilePath } from '../utils/secureFile';
import SecureFileViewerModal from './SecureFileViewerModal';
import { firstPathSegment, resolveStudentPath } from '../config/routes';
import { REALTIME_EVENT, emitRealtimeRefresh } from '../utils/realtime';
import { bindPopup } from '../utils/popupDismiss';
import StudentDisciplinaryBoard from './StudentDisciplinaryBoard';
import StudentAttendanceTerminal from './StudentAttendanceTerminal';
import { StudentCompensationView } from './StudentCompensationView';
import ApplicationStatusTracker from './ApplicationStatusTracker';
import HelpPage from './HelpPage';
import MessagesPage from './MessagesPage';
import { YearLeaderActivities } from './hours/YearLeaderActivities';
import { StudentOfficerActivityHub } from './hours/StudentOfficerActivityHub';
import { JanitorialCodeScreen } from './hours/JanitorialCodeScreen';
import { JanitorialFinalReview } from './hours/JanitorialFinalReview';
import { janitorialGroupService } from '../services/janitorialGroupService';
import { canCheckActivityAttendance, storeActivityAttendanceCapability } from '../utils/wspoActivityAccess';
import { formatClockTime, formatScheduleRange } from '../utils/scheduleTime';
import { type StudentActivityItem } from '../types/studentActivity';

interface ScheduleRecord {
    id: number;
    kind?: 'work' | 'class' | string;
    day: string;
    time: string;
    duty_type: string;
    subject?: string | null;
    room?: string | null;
    instructor?: string | null;
    department: string;
    supervisor: string;
    edit_request_status?: 'none' | 'pending' | 'approved' | 'rejected';
    edit_request_note?: string | null;
}

interface RequirementRecord {
    id: number;
    document_type: string;
    file_path: string;
    status: string;
    remarks: string | null;
    created_at: string;
}

interface StudentDashboardProps {
    onLogout: () => void | Promise<void>;
}

const StudentDashboard = ({ onLogout }: StudentDashboardProps) => {
    const location = useLocation();
    const navigate = useNavigate();

    const [fullName, setFullName] = useState(localStorage.getItem('user_name') || 'Student');
    const [assignedOffice, setAssignedOffice] = useState(localStorage.getItem('assigned_office') || 'Unassigned');
    const firstName = fullName.split(' ')[0];

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const pathSegment = firstPathSegment(location.pathname);
    const currentPath = resolveStudentPath(pathSegment);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [documentViewer, setDocumentViewer] = useState<{ path: string; title: string } | null>(null);

    const [avatarPath, setAvatarPath] = useState<string | null>(() =>
        normalizeFilePath(localStorage.getItem('profile_picture'))
    );
    const [cropSource, setCropSource] = useState<string | null>(null);

    const [studentProfile, setStudentProfile] = useState({
        student_id_number: 'Loading...',
        course: 'Loading...',
        year_level: '...',
        phone_number: 'Loading...',
        assigned_office: 'Loading...',
        special_hours_request: false,
        supervisors: [] as string[],
    });

    const [schedule, setSchedule] = useState<ScheduleRecord[]>([]);
    const [studentActivities, setStudentActivities] = useState<StudentActivityItem[]>([]);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedShiftId, setSelectedShiftId] = useState<number | ''>('');
    const [editNote, setEditNote] = useState('');

    const [requirements, setRequirements] = useState<RequirementRecord[]>([]);
    const [docType, setDocType] = useState('Medical Clearance');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [accountPhone, setAccountPhone] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [profileReady, setProfileReady] = useState(false);
    const [yearLeader, setYearLeader] = useState(false);
    const [janitorialSupervisor, setJanitorialSupervisor] = useState(false);
    const [janitorialImmediate, setJanitorialImmediate] = useState(false);

    const fetchYearLeader = () => {
        axios
            .get('/api/attendance/my-year-activities')
            .then((response) => setYearLeader(Boolean(response.data.leader)))
            .catch(() => setYearLeader(false));
    };

    useEffect(() => {
        fetchYearLeader();
    }, []);

    useEffect(() => {
        let cancelled = false;
        Promise.all([axios.get('/api/user'), janitorialGroupService.list()])
            .then(([userRes, groups]) => {
                if (cancelled) return;
                const userId = Number(userRes.data?.id);
                setJanitorialSupervisor(groups.some((group) => group.supervisor?.id === userId));
                setJanitorialImmediate(groups.some((group) => group.immediate_supervisor?.id === userId));
            })
            .catch(() => {
                if (!cancelled) {
                    setJanitorialSupervisor(false);
                    setJanitorialImmediate(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!localStorage.getItem('auth_token')) return;
        const segment = firstPathSegment(location.pathname);
        if (!segment) {
            navigate('/dashboard', { replace: true });
            return;
        }
        const resolved = resolveStudentPath(segment);
        if (resolved !== segment) {
            navigate(`/${resolved}`, { replace: true });
        }
    }, [location.pathname, navigate]);

    const fetchMyProfile = async () => {
        try {
            const response = await axios.get('/api/user');
            const user = response.data;
            storeActivityAttendanceCapability(user);
            if (user.name) {
                setFullName(user.name);
                localStorage.setItem('user_name', user.name);
            }
            const office = user.profile?.assignment_label || user.profile?.assigned_office || 'Unassigned';
            setAssignedOffice(office);
            if (user.profile?.assigned_office) {
                localStorage.setItem('assigned_office', user.profile.assigned_office);
            }
            setStudentProfile({
                student_id_number: user.profile?.student_id_number || 'Not Assigned',
                course: user.profile?.course || 'Not Assigned',
                year_level: user.profile?.year_level || 'N/A',
                phone_number: user.phone_number || 'No Contact Provided',
                assigned_office: user.profile?.assignment_label || user.profile?.assigned_office || 'Not Assigned',
                special_hours_request: Boolean(user.profile?.special_hours_request),
                supervisors: Array.isArray(user.department_supervisors) ? user.department_supervisors : [],
            });
            setAccountPhone(user.phone_number || '');
            setProfileReady(true);
            if (user.profile_picture) {
                const path = normalizeFilePath(user.profile_picture);
                setAvatarPath(path);
                if (path) localStorage.setItem('profile_picture', path);
            } else {
                setAvatarPath(null);
                localStorage.removeItem('profile_picture');
            }
        } catch (error) {
            console.error('Failed to fetch profile', error);
        }
    };

    const fetchSchedule = async () => {
        try {
            const response = await axios.get('/api/my-schedule');
            const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const sortedSchedules = response.data.sort((a: ScheduleRecord, b: ScheduleRecord) => {
                return daysOfWeek.indexOf(a.day) - daysOfWeek.indexOf(b.day);
            });
            setSchedule(sortedSchedules);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchActivities = async () => {
        try {
            const response = await axios.get('/api/my-activities');
            const rows: StudentActivityItem[] = Array.isArray(response.data?.activities)
                ? response.data.activities
                : [];
            setStudentActivities(rows.filter((item) => !item.has_ended));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchRequirements = async () => {
        try {
            const response = await axios.get('/api/my-requirements');
            setRequirements(response.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        const refresh = () => {
            fetchMyProfile();
            fetchSchedule();
            fetchActivities();
            fetchRequirements();
            fetchYearLeader();
        };
        refresh();
        const interval = setInterval(refresh, 5000);
        window.addEventListener(REALTIME_EVENT, refresh);
        const onVisible = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, refresh);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    const handleRequestEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const response = await axios.post(`/api/my-schedule/${selectedShiftId}/request-edit`, { note: editNote });
            setMessage({ text: response.data.message, type: 'success' });
            setIsEditModalOpen(false);
            setEditNote('');
            setSelectedShiftId('');
            fetchSchedule();
        } catch (error: any) {
            setMessage({ text: error.response?.data?.message || 'Failed to send request.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleUploadRequirement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile) {
            setMessage({ text: 'Please select a file to upload.', type: 'error' });
            return;
        }

        const formData = new FormData();
        formData.append('document_type', docType);
        formData.append('file', uploadFile);

        setIsLoading(true);
        try {
            const res = await axios.post('/api/requirements/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setMessage({ text: res.data.message, type: 'success' });
            setUploadFile(null);
            (document.getElementById('fileUpload') as HTMLInputElement).value = '';
            fetchRequirements();
        } catch (error: any) {
            setMessage({ text: error.response?.data?.message || 'Failed to upload document.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const closeCrop = () => {
        setCropSource((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
        });
    };

    const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setMessage({ text: 'Choose a JPG or PNG image.', type: 'error' });
            return;
        }
        setCropSource((current) => {
            if (current) URL.revokeObjectURL(current);
            return URL.createObjectURL(file);
        });
    };

    const uploadCroppedAvatar = async (file: File) => {
        closeCrop();
        const formData = new FormData();
        formData.append('avatar', file);
        setIsLoading(true);
        try {
            const response = await axios.post('/api/user/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const path = normalizeFilePath(response.data.profile_picture);
            setAvatarPath(path);
            if (path) localStorage.setItem('profile_picture', path);
            emitRealtimeRefresh();
            setMessage({ text: 'Profile picture updated successfully!', type: 'success' });
        } catch {
            setMessage({ text: 'Failed to upload image. Ensure it is under 2MB.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const removeAvatar = async () => {
        setIsLoading(true);
        try {
            await axios.delete('/api/user/avatar');
            setAvatarPath(null);
            localStorage.removeItem('profile_picture');
            emitRealtimeRefresh();
            setMessage({ text: 'Profile picture removed.', type: 'success' });
        } catch {
            setMessage({ text: 'Failed to remove profile picture.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPassword) {
            setMessage({ text: 'Enter a new password.', type: 'error' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setMessage({ text: 'New password and confirmation do not match.', type: 'error' });
            return;
        }

        setIsSavingPassword(true);
        try {
            await axios.put('/api/user', {
                name: fullName,
                phone_number: accountPhone,
                password: newPassword,
                password_confirmation: confirmPassword,
                current_password: currentPassword,
            });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setMessage({ text: 'Password updated.', type: 'success' });
        } catch (error: any) {
            const validation = error.response?.data?.errors;
            const firstError = validation ? Object.values(validation).flat()[0] : null;
            setMessage({
                text: firstError || error.response?.data?.message || 'Failed to update password.',
                type: 'error',
            });
        } finally {
            setIsSavingPassword(false);
        }
    };

    const requirementsAllVerified =
        requirements.length > 0 && requirements.every((req) => req.status === 'verified');
    const workShifts = schedule.filter((shift) => shift.kind !== 'class');
    const classShifts = schedule.filter((shift) => shift.kind === 'class');

    const canManageCampusActivities = canCheckActivityAttendance('Student');

    const studentNavItems = [
        {
            id: 'dashboard',
            label: 'Dashboard',
            icon: (
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
            ),
        },
        {
            id: 'attendance',
            label: 'Attendance / DTR',
            icon: (
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
            ),
        },
        ...(janitorialSupervisor
            ? [
                  {
                      id: 'janitorial-code',
                      label: 'Janitorial code',
                      icon: (
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                          />
                      ),
                  },
              ]
            : []),
        ...(janitorialImmediate
            ? [
                  {
                      id: 'janitorial-approval',
                      label: 'Janitorial approval',
                      icon: (
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                      ),
                  },
              ]
            : []),
        ...(yearLeader
            ? [
                  {
                      id: 'year-activities',
                      label: 'Year Activities',
                      icon: (
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m4-4a4 4 0 100-8 4 4 0 000 8zm6 2a3 3 0 100-6 3 3 0 000 6zM6 10a3 3 0 100-6 3 3 0 000 6z"
                          />
                      ),
                  },
              ]
            : []),
        ...(canManageCampusActivities
            ? [
                  {
                      id: 'campus-activities',
                      label: 'Campus Activities',
                      icon: (
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                      ),
                  },
              ]
            : []),
        {
            id: 'hours',
            label: 'Hours Rendered',
            icon: (
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 7h6m0 10v-3m-3 3v-6m-3 6v-9m6 13H6a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2z"
                />
            ),
        },
        {
            id: 'schedule',
            label: 'My Schedule',
            icon: (
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
            ),
        },
        {
            id: 'requirements',
            label: 'Requirements',
            icon: (
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
            ),
        },
        {
            id: 'disciplinary',
            label: 'Disciplinary Records',
            icon: (
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
            ),
        },
        {
            id: 'application',
            label: 'Application Status',
            icon: (
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6M7 3h7l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"
                />
            ),
        },
        {
            id: 'messages',
            label: 'Messages',
            icon: (
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
            ),
        },
        {
            id: 'help',
            label: 'Help',
            icon: (
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
            ),
        },
        {
            id: 'settings',
            label: 'Settings',
            icon: (
                <>
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </>
            ),
        },
    ];

    const staggerContainer: Variants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.08 } },
    };
    const cardVariants: Variants = {
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { duration: 0.36, ease: [0.22, 1, 0.36, 1] } },
    };
    const reduceMotion = useReducedMotion();
    const pageEase = [0.22, 1, 0.36, 1] as const;

    const currentLabel =
        studentNavItems.find((item) => item.id === currentPath)?.label ?? currentPath.replace('-', ' ');

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50 font-sans print:h-auto print:overflow-visible print:bg-white">
            <SecureFileViewerModal
                filePath={documentViewer?.path || null}
                title={documentViewer?.title || 'Submitted document'}
                onClose={() => setDocumentViewer(null)}
            />
            <Sidebar
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
                activeTab={currentPath}
                setActiveTab={(path) => navigate(`/${path}`)}
                handleLogout={onLogout}
                navItems={studentNavItems}
                userRole="Student"
            />

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:h-auto print:overflow-visible">
                {/* FROSTED TOP NAVIGATION BAR */}
                <header className="relative z-50 flex h-[4.5rem] shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl sm:px-6 print:hidden">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
                            aria-label="Toggle navigation"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={currentPath}
                                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                                transition={{ duration: reduceMotion ? 0 : 0.22, ease: pageEase }}
                                className="hidden items-center gap-2 sm:flex"
                            >
                                <span className="h-2 w-2 rounded-full bg-blue-600" />
                                <h2 className="text-sm font-extrabold tracking-tight text-slate-900">
                                    {currentLabel}
                                </h2>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    <div className="flex items-center gap-2.5 sm:gap-3.5">
                        <SyncStatus />
                        <NotificationBell onNavigate={(path) => navigate(`/${path}`)} />
                        <div className="hidden text-right sm:block">
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                {assignedOffice}
                            </p>
                            <p className="text-sm font-bold text-slate-900">{fullName}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate('/settings')}
                            title="Profile Settings"
                            className="group flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 font-bold text-slate-600 shadow-xs transition hover:border-blue-400"
                        >
                            {avatarPath ? (
                                <SecureImage
                                    filePath={avatarPath}
                                    altText="Nav Avatar"
                                    className="h-full w-full object-cover transition-transform group-hover:scale-110"
                                    fallback={firstName.charAt(0)}
                                />
                            ) : (
                                firstName.charAt(0)
                            )}
                        </button>
                    </div>
                </header>

                <main
                    className={`app-content-frame install-clearance custom-scrollbar relative min-w-0 flex-1 print:h-auto print:overflow-visible print:p-0 ${
                        currentPath === 'messages'
                            ? 'flex min-h-0 flex-col overflow-hidden p-0'
                            : 'overflow-y-auto p-4 sm:p-0'
                    }`}
                >
                    <Toast
                        message={message?.text ?? null}
                        type={message?.type}
                        onClose={() => setMessage(null)}
                    />

                    {currentPath === 'messages' ? (
                        <PageTransition pageKey={currentPath} className="flex min-h-0 flex-1 flex-col">
                            <MessagesPage />
                        </PageTransition>
                    ) : (
                        <div className="app-page w-full min-w-0 space-y-6 sm:p-8">
                            <PageTransition pageKey={currentPath}>
                                {/* 1. DASHBOARD */}
                                {currentPath === 'dashboard' && <StudentOverview />}

                                {currentPath === 'application' && <ApplicationStatusTracker />}

                                {currentPath === 'help' && <HelpPage userRole="Student" />}

                                {/* 2. ATTENDANCE LOG */}
                                {currentPath === 'attendance' && <StudentAttendanceTerminal />}

                                {currentPath === 'janitorial-code' && <JanitorialCodeScreen />}

                                {currentPath === 'janitorial-approval' && <JanitorialFinalReview />}

                                {currentPath === 'year-activities' && <YearLeaderActivities />}

                                {currentPath === 'campus-activities' && canManageCampusActivities && (
                                    <StudentOfficerActivityHub />
                                )}

                                {/* 3. HOURS RENDERED */}
                                {currentPath === 'hours' && <StudentCompensationView />}

                                {/* 4. SCHEDULE TAB */}
                                {currentPath === 'schedule' && (
                                    <motion.div
                                        variants={staggerContainer}
                                        initial="hidden"
                                        animate="show"
                                        className="space-y-6"
                                    >
                                        {/* Obsidian Duty Roster Hero */}
                                        <motion.header
                                            initial={{ opacity: 0, y: -12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.4, ease: pageEase }}
                                            className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
                                        >
                                            <div
                                                className="pointer-events-none absolute inset-0 opacity-20"
                                                style={{
                                                    backgroundImage:
                                                        'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                                                    backgroundSize: '20px 20px',
                                                }}
                                                aria-hidden="true"
                                            />
                                            <div
                                                className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl"
                                                aria-hidden="true"
                                            />
                                            <div
                                                className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl"
                                                aria-hidden="true"
                                            />

                                            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                                                <div className="min-w-0 max-w-xl">
                                                    <div className="flex flex-wrap items-center gap-2.5">
                                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                                                            <CalendarRange className="h-3.5 w-3.5 text-blue-400" />
                                                            Duty Roster
                                                        </span>
                                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300">
                                                            {workShifts.length} work · {classShifts.length} class · {studentActivities.length} activities
                                                        </span>
                                                    </div>
                                                    <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                                                        My Schedule
                                                    </h1>
                                                    <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                                                        View your assigned work shifts and class schedule, or request a shift edit.
                                                    </p>
                                                </div>

                                                <div className="flex shrink-0 flex-col items-stretch gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl sm:flex-row sm:items-center">
                                                    <div className="text-left sm:text-right">
                                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                            Need a change?
                                                        </p>
                                                        <p className="mt-0.5 text-xs font-medium text-slate-300">
                                                            Submit a formal edit request
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => setIsEditModalOpen(true)}
                                                        disabled={workShifts.length === 0}
                                                        className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                                                    >
                                                        Request Edit
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.header>

                                        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
                                            {/* Work Schedule Column */}
                                            <section className="@container flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                                                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                                                    <h2 className="flex items-center gap-2.5 text-base font-black text-slate-900">
                                                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                                            <Briefcase className="h-4 w-4" />
                                                        </span>
                                                        Work Schedule
                                                    </h2>
                                                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-slate-600">
                                                        {workShifts.length} shifts
                                                    </span>
                                                </div>

                                                <div className="flex flex-1 flex-col p-6">
                                                    {workShifts.length === 0 ? (
                                                        <div className="flex flex-1 flex-col items-center justify-center py-14 text-center">
                                                            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                                                <CalendarRange className="h-7 w-7" />
                                                            </div>
                                                            <p className="text-sm font-extrabold text-slate-700">
                                                                No shifts assigned yet
                                                            </p>
                                                            <p className="mt-1 text-xs font-medium text-slate-400">
                                                                Wait for your department supervisor to finalize your schedule.
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-3.5">
                                                            {workShifts.map((shift) => (
                                                                <motion.div
                                                                    variants={cardVariants}
                                                                    key={shift.id}
                                                                    className={`flex flex-col gap-4 rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md @md:flex-row @md:items-center @md:justify-between ${
                                                                        shift.edit_request_status === 'pending'
                                                                            ? 'border-amber-200 bg-amber-50/70'
                                                                            : 'border-slate-200/90 bg-white hover:border-blue-300'
                                                                    }`}
                                                                >
                                                                    <div className="flex min-w-0 items-center gap-4">
                                                                        <div className="flex h-13 w-13 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-600/20">
                                                                            <span className="text-xs font-black uppercase tracking-wider">
                                                                                {shift.day.substring(0, 3)}
                                                                            </span>
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <div className="whitespace-nowrap text-base font-black tracking-tight text-slate-900">
                                                                                {formatScheduleRange(shift.time)}
                                                                            </div>
                                                                            <div className="mt-0.5 text-[11px] font-extrabold uppercase tracking-wider text-blue-600">
                                                                                {shift.duty_type}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col items-start gap-1.5 pl-[4.25rem] @md:items-end @md:pl-0">
                                                                        {shift.edit_request_status === 'pending' && (
                                                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800 animate-pulse">
                                                                                <Clock className="h-3 w-3" /> Pending Edit
                                                                            </span>
                                                                        )}
                                                                        {shift.edit_request_status === 'approved' && (
                                                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
                                                                                <CheckCircle2 className="h-3 w-3" /> Edit Approved
                                                                            </span>
                                                                        )}
                                                                        {shift.edit_request_status === 'rejected' && (
                                                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-800">
                                                                                <XCircle className="h-3 w-3" /> Edit Rejected
                                                                            </span>
                                                                        )}
                                                                        <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                                                                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                                                                            {shift.department}
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                                                            <UserCircle className="h-3.5 w-3.5 text-slate-400" />
                                                                            {shift.supervisor}
                                                                        </div>
                                                                    </div>
                                                                </motion.div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </section>

                                            {/* Class Schedule Column */}
                                            <section className="@container flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                                                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                                                    <h2 className="flex items-center gap-2.5 text-base font-black text-slate-900">
                                                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                                                            <GraduationCap className="h-4 w-4" />
                                                        </span>
                                                        Class Schedule
                                                    </h2>
                                                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-slate-600">
                                                        {classShifts.length} blocks
                                                    </span>
                                                </div>

                                                <div className="flex flex-1 flex-col p-6">
                                                    {classShifts.length === 0 ? (
                                                        <div className="flex flex-1 flex-col items-center justify-center py-14 text-center">
                                                            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-400">
                                                                <GraduationCap className="h-7 w-7" />
                                                            </div>
                                                            <p className="text-sm font-extrabold text-slate-700">
                                                                No class schedule yet
                                                            </p>
                                                            <p className="mt-1 max-w-xs text-xs font-medium text-slate-400">
                                                                The WSPO coordinator or secretary can add your class hours beside your work schedule.
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-3.5">
                                                            {classShifts.map((shift) => (
                                                                <motion.div
                                                                    variants={cardVariants}
                                                                    key={shift.id}
                                                                    className="flex flex-col gap-4 rounded-2xl border border-violet-200/70 bg-violet-50/40 p-4 transition-all hover:border-violet-300 @md:flex-row @md:items-center @md:justify-between"
                                                                >
                                                                    <div className="flex min-w-0 items-center gap-4">
                                                                        <div className="flex h-13 w-13 shrink-0 flex-col items-center justify-center rounded-2xl border border-violet-200 bg-white text-violet-700 shadow-2xs">
                                                                            <span className="text-xs font-black uppercase tracking-wider">
                                                                                {shift.day.substring(0, 3)}
                                                                            </span>
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <div className="whitespace-nowrap text-base font-black tracking-tight text-slate-900">
                                                                                {formatScheduleRange(shift.time)}
                                                                            </div>
                                                                            <div className="mt-0.5 text-[11px] font-extrabold uppercase tracking-wider text-violet-700">
                                                                                {shift.subject || shift.duty_type}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col items-start gap-1 pl-[4.25rem] @md:items-end @md:pl-0">
                                                                        {shift.room && (
                                                                            <div className="text-xs font-extrabold text-slate-900">
                                                                                {shift.room}
                                                                            </div>
                                                                        )}
                                                                        {(shift.instructor || shift.supervisor) && (
                                                                            <div className="text-xs font-medium text-slate-500">
                                                                                Instructor: {shift.instructor || shift.supervisor}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </motion.div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </section>
                                        </div>

                                        {/* Campus & Group Activities Section */}
                                        <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                                            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                                                <h2 className="flex items-center gap-2.5 text-base font-black text-slate-900">
                                                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                                                        <Sparkles className="h-4 w-4" />
                                                    </span>
                                                    Campus &amp; Group Activities
                                                </h2>
                                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-slate-600">
                                                    {studentActivities.length} active / upcoming
                                                </span>
                                            </div>

                                            <div className="p-6">
                                                {studentActivities.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-10 text-center">
                                                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
                                                            <Sparkles className="h-6 w-6" />
                                                        </div>
                                                        <p className="text-sm font-extrabold text-slate-700">
                                                            No ongoing or upcoming activities
                                                        </p>
                                                        <p className="mt-1 max-w-sm text-xs font-medium text-slate-400">
                                                            Assembly meetings, devotional meetings, and group cleaning activities will appear here when scheduled.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                                                        {studentActivities.map((activity) => {
                                                            const startLabel = formatClockTime(activity.starts_at);
                                                            const endLabel = formatClockTime(activity.ends_at);
                                                            const rangeLabel =
                                                                startLabel && endLabel
                                                                    ? `${startLabel} – ${endLabel}`
                                                                    : startLabel || 'All day';
                                                            return (
                                                                <motion.div
                                                                    variants={cardVariants}
                                                                    key={`sched-activity-${activity.id}`}
                                                                    className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-all ${
                                                                        activity.is_happening_now
                                                                            ? 'border-emerald-300 bg-emerald-50/60 shadow-xs'
                                                                            : 'border-slate-200/90 bg-white hover:border-emerald-300'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
                                                                                    {activity.kind_label}
                                                                                </span>
                                                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">
                                                                                    +{activity.hours.toFixed(1)} hrs
                                                                                </span>
                                                                            </div>
                                                                            <p className="mt-1.5 truncate text-base font-black text-slate-900">
                                                                                {activity.title}
                                                                            </p>
                                                                        </div>
                                                                        {activity.is_happening_now ? (
                                                                            <span className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                                                                                Live Now
                                                                            </span>
                                                                        ) : activity.is_today ? (
                                                                            <span className="shrink-0 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                                                                                Today
                                                                            </span>
                                                                        ) : (
                                                                            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                                                                                {activity.event_date}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                                                                        <span>
                                                                            {activity.day} · {rangeLabel}
                                                                        </span>
                                                                        <span>{activity.audience_label}</span>
                                                                    </div>
                                                                </motion.div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    </motion.div>
                                )}

                                {/* 5. REQUIREMENTS TAB */}
                                {currentPath === 'requirements' && (
                                    <motion.div
                                        variants={staggerContainer}
                                        initial="hidden"
                                        animate="show"
                                        className="space-y-6"
                                    >
                                        {/* Obsidian Document Center Hero */}
                                        <motion.header
                                            initial={{ opacity: 0, y: -12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.4, ease: pageEase }}
                                            className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
                                        >
                                            <div
                                                className="pointer-events-none absolute inset-0 opacity-20"
                                                style={{
                                                    backgroundImage:
                                                        'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                                                    backgroundSize: '20px 20px',
                                                }}
                                                aria-hidden="true"
                                            />
                                            <div
                                                className={`pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl ${
                                                    requirementsAllVerified ? 'bg-emerald-500/25' : 'bg-amber-500/20'
                                                }`}
                                                aria-hidden="true"
                                            />
                                            <div
                                                className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl"
                                                aria-hidden="true"
                                            />

                                            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                                                <div className="min-w-0 max-w-xl">
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                                                        <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                                                        Document Center
                                                    </span>
                                                    <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                                                        Requirements
                                                    </h1>
                                                    <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                                                        Upload your student records securely and track their verification status in real time.
                                                    </p>
                                                </div>

                                                <div className="flex shrink-0 items-center gap-4 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                                                    <div
                                                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                                            requirementsAllVerified
                                                                ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/30'
                                                                : 'bg-amber-500/20 text-amber-300 ring-amber-400/30'
                                                        }`}
                                                    >
                                                        {requirementsAllVerified ? (
                                                            <CheckCircle2 className="h-6 w-6" />
                                                        ) : (
                                                            <AlertCircle className="h-6 w-6" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                            Compliance Status
                                                        </p>
                                                        <p
                                                            className={`mt-0.5 text-base font-black ${
                                                                requirementsAllVerified
                                                                    ? 'text-emerald-300'
                                                                    : 'text-amber-300'
                                                            }`}
                                                        >
                                                            {requirementsAllVerified
                                                                ? 'Fully Compliant'
                                                                : 'Requirements Pending'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.header>

                                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                                            {/* Upload Form Card */}
                                            <motion.section
                                                variants={cardVariants}
                                                className="h-fit rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-7 xl:col-span-4"
                                            >
                                                <div className="mb-5 flex items-center gap-3">
                                                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                                                        <UploadCloud className="h-5 w-5" />
                                                    </span>
                                                    <div>
                                                        <h3 className="text-base font-black tracking-tight text-slate-900">
                                                            Submit Document
                                                        </h3>
                                                        <p className="text-xs font-medium text-slate-500">
                                                            PDF, JPG, or PNG accepted
                                                        </p>
                                                    </div>
                                                </div>

                                                <form onSubmit={handleUploadRequirement} className="space-y-5">
                                                    <div>
                                                        <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                            Document Type
                                                        </label>
                                                        <select
                                                            value={docType}
                                                            onChange={(e) => setDocType(e.target.value)}
                                                            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                                        >
                                                            <option>Medical Clearance</option>
                                                            <option>Parents Consent</option>
                                                            <option>Copy of Grades</option>
                                                            <option>Certificate of Enrollment</option>
                                                            <option>Good Moral Character</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                            Select File
                                                        </label>
                                                        <div className="group relative">
                                                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/60 transition-colors group-hover:border-blue-400 group-hover:bg-blue-50">
                                                                <UploadCloud className="mb-1.5 h-6 w-6 text-blue-600" />
                                                                <span className="text-xs font-extrabold text-blue-700">
                                                                    Choose PDF or Image
                                                                </span>
                                                            </div>
                                                            <input
                                                                type="file"
                                                                id="fileUpload"
                                                                accept=".pdf,.jpg,.jpeg,.png"
                                                                onChange={(e) =>
                                                                    setUploadFile(e.target.files ? e.target.files[0] : null)
                                                                }
                                                                className="h-28 w-full cursor-pointer opacity-0"
                                                            />
                                                        </div>
                                                        {uploadFile && (
                                                            <p className="mt-2.5 flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                                                                <Check className="h-4 w-4 shrink-0" />
                                                                <span className="truncate">{uploadFile.name}</span>
                                                            </p>
                                                        )}
                                                    </div>

                                                    <button
                                                        type="submit"
                                                        disabled={isLoading || !uploadFile}
                                                        className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        {isLoading ? 'Uploading…' : 'Upload Document'}
                                                    </button>
                                                </form>
                                            </motion.section>

                                            {/* Uploaded Requirements List */}
                                            <motion.section
                                                variants={cardVariants}
                                                className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm xl:col-span-8"
                                            >
                                                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-5">
                                                    <h3 className="text-base font-black tracking-tight text-slate-900">
                                                        My Uploaded Requirements
                                                    </h3>
                                                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-slate-600">
                                                        {requirements.length} submitted
                                                    </span>
                                                </div>

                                                {requirements.length === 0 ? (
                                                    <div className="flex flex-col items-center px-6 py-16 text-center">
                                                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                                            <FileText className="h-7 w-7" />
                                                        </div>
                                                        <p className="text-sm font-extrabold text-slate-700">
                                                            No requirements uploaded yet
                                                        </p>
                                                        <p className="mt-1 text-xs font-medium text-slate-400">
                                                            Use the form on the left to submit your required documents.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="divide-y divide-slate-100">
                                                        {requirements.map((req) => (
                                                            <div
                                                                key={req.id}
                                                                className="flex flex-col items-start justify-between gap-4 px-6 py-5 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center"
                                                            >
                                                                <div className="flex items-center gap-4">
                                                                    <div
                                                                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${
                                                                            req.status === 'verified'
                                                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                                                                : req.status === 'rejected'
                                                                                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                                                                                  : 'border-amber-200 bg-amber-50 text-amber-600'
                                                                        }`}
                                                                    >
                                                                        {req.status === 'verified' ? (
                                                                            <CheckCircle2 className="h-5 w-5" />
                                                                        ) : req.status === 'rejected' ? (
                                                                            <XCircle className="h-5 w-5" />
                                                                        ) : (
                                                                            <Clock className="h-5 w-5" />
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="text-sm font-extrabold text-slate-900">
                                                                            {req.document_type}
                                                                        </h4>
                                                                        <p className="mt-0.5 text-xs font-medium text-slate-400">
                                                                            Uploaded:{' '}
                                                                            {new Date(req.created_at).toLocaleDateString()}
                                                                        </p>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                setDocumentViewer({
                                                                                    path: req.file_path,
                                                                                    title:
                                                                                        req.document_type ||
                                                                                        'Submitted document',
                                                                                })
                                                                            }
                                                                            className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-blue-600 transition-colors hover:text-blue-800"
                                                                        >
                                                                            <FileText className="h-3.5 w-3.5" />
                                                                            View Document
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                <div className="flex w-full flex-col items-start sm:w-auto sm:items-end">
                                                                    <span
                                                                        className={`rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest ${
                                                                            req.status === 'verified'
                                                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                                : req.status === 'rejected'
                                                                                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                                                                                  : 'border-amber-200 bg-amber-50 text-amber-700'
                                                                        }`}
                                                                    >
                                                                        {req.status}
                                                                    </span>
                                                                    {req.status === 'rejected' && req.remarks && (
                                                                        <p className="mt-2 max-w-xs rounded-xl border border-rose-200/80 bg-rose-50 p-2.5 text-xs font-medium leading-relaxed text-rose-800">
                                                                            <span className="mb-0.5 block font-extrabold">
                                                                                Rejection Reason:
                                                                            </span>
                                                                            {req.remarks}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </motion.section>
                                        </div>
                                    </motion.div>
                                )}

                                {currentPath === 'disciplinary' && <StudentDisciplinaryBoard />}

                                {/* 7. SETTINGS TAB */}
                                {currentPath === 'settings' && (
                                    <motion.div
                                        variants={staggerContainer}
                                        initial="hidden"
                                        animate="show"
                                        className="space-y-6"
                                    >
                                        {/* Obsidian Account Hero */}
                                        <motion.header
                                            initial={{ opacity: 0, y: -12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.4, ease: pageEase }}
                                            className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
                                        >
                                            <div
                                                className="pointer-events-none absolute inset-0 opacity-20"
                                                style={{
                                                    backgroundImage:
                                                        'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                                                    backgroundSize: '20px 20px',
                                                }}
                                                aria-hidden="true"
                                            />
                                            <div
                                                className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl"
                                                aria-hidden="true"
                                            />
                                            <div
                                                className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
                                                aria-hidden="true"
                                            />

                                            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                                                <div className="min-w-0 max-w-xl">
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                                                        <UserCircle className="h-3.5 w-3.5 text-blue-400" />
                                                        Account Management
                                                    </span>
                                                    <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                                                        Profile Settings
                                                    </h1>
                                                    <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                                                        Manage your profile photo, review your locked academic details, and update your password.
                                                    </p>
                                                </div>

                                                <div className="flex shrink-0 items-center gap-4 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                                                        <ShieldCheck className="h-6 w-6" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                            Account Security
                                                        </p>
                                                        <p className="mt-0.5 text-base font-black text-white">
                                                            Protected Account
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.header>

                                        {/* Profile Identity Card */}
                                        <section className="rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
                                            <div className="flex flex-col items-start gap-8 md:flex-row">
                                                <motion.div
                                                    variants={cardVariants}
                                                    className="flex w-full flex-col items-center md:w-1/3"
                                                >
                                                    <div className="group relative cursor-pointer">
                                                        <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-100 shadow-xl ring-1 ring-slate-200">
                                                            {avatarPath ? (
                                                                <SecureImage
                                                                    filePath={avatarPath}
                                                                    altText="Profile"
                                                                    className="h-full w-full object-cover"
                                                                    fallback={
                                                                        <span className="text-5xl font-black text-slate-400">
                                                                            {firstName.charAt(0)}
                                                                        </span>
                                                                    }
                                                                />
                                                            ) : (
                                                                <span className="text-5xl font-black text-slate-400">
                                                                    {firstName.charAt(0)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <AvatarPhotoMenu
                                                            inputId="avatarUpload"
                                                            hasPicture={Boolean(avatarPath)}
                                                            disabled={isLoading}
                                                            onFileSelected={handleImageSelected}
                                                            onRemove={removeAvatar}
                                                        />
                                                    </div>
                                                    <p className="mt-4 max-w-[220px] text-center text-xs font-medium leading-relaxed text-slate-500">
                                                        Tap the camera button to change or remove your photo. JPG or PNG, up to 2MB.
                                                    </p>
                                                </motion.div>

                                                <motion.div
                                                    variants={cardVariants}
                                                    className="w-full flex-1 space-y-5"
                                                >
                                                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                                                        <div>
                                                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                                Full Name
                                                            </label>
                                                            <input
                                                                type="text"
                                                                disabled
                                                                value={fullName}
                                                                className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-bold text-slate-900 opacity-85"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                                Student ID Number
                                                            </label>
                                                            <input
                                                                type="text"
                                                                disabled
                                                                value={studentProfile.student_id_number}
                                                                className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 p-3.5 font-mono text-sm font-bold text-slate-900 opacity-85"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                                Course &amp; Year
                                                            </label>
                                                            <input
                                                                type="text"
                                                                disabled
                                                                value={`${studentProfile.course} - Year ${studentProfile.year_level}`}
                                                                className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-bold text-slate-900 opacity-85"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                                Assigned Office
                                                            </label>
                                                            <input
                                                                type="text"
                                                                disabled
                                                                value={studentProfile.assigned_office}
                                                                className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-bold text-slate-900 opacity-85"
                                                            />
                                                            {studentProfile.special_hours_request && (
                                                                <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">
                                                                    <Sparkles className="h-3.5 w-3.5" />
                                                                    Special request · 100 hours instead of 80
                                                                </p>
                                                            )}
                                                            <p className="mt-2 text-xs font-bold text-indigo-700">
                                                                Supervisor:{' '}
                                                                {studentProfile.supervisors.length > 0
                                                                    ? studentProfile.supervisors.join(', ')
                                                                    : 'No supervisor assigned'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            </div>
                                        </section>

                                        {/* Change Password Card */}
                                        <form
                                            onSubmit={handleChangePassword}
                                            className="space-y-5 rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                                                    <Lock className="h-4 w-4" />
                                                </span>
                                                <div>
                                                    <h2 className="text-base font-black tracking-tight text-slate-900">
                                                        Change Password
                                                    </h2>
                                                    <p className="text-xs font-medium text-slate-500">
                                                        Use your current password to set a new one (minimum 6 characters).
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                                                <div className="relative">
                                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                        Current Password
                                                    </label>
                                                    <input
                                                        type={showCurrentPassword ? 'text' : 'password'}
                                                        value={currentPassword}
                                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                                        required
                                                        autoComplete="current-password"
                                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 pr-11 text-sm font-semibold outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                                        className="absolute right-3 top-[34px] text-slate-400 transition-colors hover:text-blue-600"
                                                    >
                                                        {showCurrentPassword ? (
                                                            <EyeOff className="h-4 w-4" />
                                                        ) : (
                                                            <Eye className="h-4 w-4" />
                                                        )}
                                                    </button>
                                                </div>

                                                <div className="relative">
                                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                        New Password
                                                    </label>
                                                    <input
                                                        type={showNewPassword ? 'text' : 'password'}
                                                        value={newPassword}
                                                        onChange={(e) => setNewPassword(e.target.value)}
                                                        required
                                                        minLength={6}
                                                        autoComplete="new-password"
                                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 pr-11 text-sm font-semibold outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                                        className="absolute right-3 top-[34px] text-slate-400 transition-colors hover:text-blue-600"
                                                    >
                                                        {showNewPassword ? (
                                                            <EyeOff className="h-4 w-4" />
                                                        ) : (
                                                            <Eye className="h-4 w-4" />
                                                        )}
                                                    </button>
                                                </div>

                                                <div>
                                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                        Confirm Password
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                        required
                                                        minLength={6}
                                                        autoComplete="new-password"
                                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex justify-end pt-1">
                                                <button
                                                    type="submit"
                                                    disabled={isSavingPassword || !profileReady}
                                                    className="rounded-xl bg-slate-900 px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-blue-600 disabled:opacity-50"
                                                >
                                                    {isSavingPassword ? 'Saving…' : 'Update Password'}
                                                </button>
                                            </div>
                                        </form>
                                    </motion.div>
                                )}
                            </PageTransition>
                        </div>
                    )}
                </main>
            </div>

            {/* OBSIDIAN REQUEST EDIT MODAL */}
            <AnimatePresence>
                {isEditModalOpen && (
                    <motion.div
                        key="edit-request"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(() => setIsEditModalOpen(false))}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: 8 }}
                            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <div className="flex items-center gap-2.5">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-blue-300">
                                        <CalendarRange className="h-4 w-4" />
                                    </span>
                                    <div>
                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Schedule Request
                                        </p>
                                        <h3 className="text-base font-black tracking-tight">
                                            Request Schedule Edit
                                        </h3>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close modal"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <form onSubmit={handleRequestEdit} className="space-y-5 p-6 sm:p-7">
                                <div>
                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Select Shift
                                    </label>
                                    <select
                                        required
                                        value={selectedShiftId}
                                        onChange={(e) => setSelectedShiftId(Number(e.target.value))}
                                        className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-bold text-slate-800 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                    >
                                        <option value="" disabled>
                                            -- Select a shift --
                                        </option>
                                        {workShifts.map((shift) => (
                                            <option key={shift.id} value={shift.id}>
                                                {shift.day} ({formatScheduleRange(shift.time)})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Reason for Edit
                                    </label>
                                    <textarea
                                        required
                                        value={editNote}
                                        onChange={(e) => setEditNote(e.target.value)}
                                        placeholder="Please explain why you need this schedule changed…"
                                        className="h-32 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                    />
                                </div>

                                <div className="flex justify-end gap-2.5 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditModalOpen(false)}
                                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-blue-600 disabled:opacity-50"
                                    >
                                        {isLoading ? 'Sending…' : 'Submit Request'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {cropSource && (
                <AvatarCropDialog imageUrl={cropSource} onCancel={closeCrop} onConfirm={uploadCroppedAvatar} />
            )}
        </div>
    );
};

export default StudentDashboard;