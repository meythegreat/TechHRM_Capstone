import { useState, useEffect, useMemo, type FormEvent } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import Toast from './Toast';
import { REALTIME_EVENT, emitRealtimeRefresh } from '../utils/realtime';
import { bindPopup } from '../utils/popupDismiss';
import UserAvatar from './UserAvatar';
import { withHomeDepartmentNote } from '../utils/studentAssignment';
import { 
    CalendarDays, 
    Clock, 
    Plus, 
    Users,
    CheckCircle2, 
    AlertCircle, 
    Trash2,
    Pencil,
    Check, 
    X,
    ChevronLeft,
    ChevronRight,
    MapPin,
    Briefcase,
    ShieldCheck,
    Send,
    GraduationCap
} from 'lucide-react';
import AuditPager, { pageSlice } from './AuditPager';
import ComboFilter from './ComboFilter';

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const SEMESTER_MONTH_OPTIONS = [4, 5, 6];

function semesterEndDate(start: string, months: number) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
    if (!match) return '';
    const end = new Date(Number(match[1]), Number(match[2]) - 1 + months, Number(match[3]));
    end.setDate(end.getDate() - 1);
    const month = String(end.getMonth() + 1).padStart(2, '0');
    const day = String(end.getDate()).padStart(2, '0');
    return `${end.getFullYear()}-${month}-${day}`;
}

function formatSemesterDate(iso: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return iso;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

function timeInputValue(raw: string) {
    const match = /(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(raw.trim());
    if (!match) return '';
    let hour = Number(match[1]);
    const minute = match[2];
    const meridiem = match[3]?.toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (hour > 23) return '';
    return `${String(hour).padStart(2, '0')}:${minute}`;
}

function splitScheduleTime(time: string) {
    const parts = String(time || '').split(/\s*-\s*/);
    return {
        startTime: timeInputValue(parts[0] || ''),
        endTime: timeInputValue(parts[1] || ''),
    };
}

function suggestedSemesterStart() {
    const now = new Date();
    const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-08-01`;
}

const scheduleMatchesClock = (rawTime: string, hour: string, minute: string, meridiem: string) => {
    const wantedHour = hour.trim();
    const wantedMinute = minute.trim();
    const wantedMeridiem = meridiem.trim().toUpperCase();
    if (!wantedHour && !wantedMinute && !wantedMeridiem) return true;

    const clocks = [...String(rawTime || '').matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)?/gi)];
    if (clocks.length === 0) return false;

    return clocks.some((match) => {
        let clockHour = Number(match[1]);
        const clockMinute = match[2];
        let clockMeridiem = match[3]?.toUpperCase();
        if (!clockMeridiem) {
            clockMeridiem = clockHour >= 12 ? 'PM' : 'AM';
        }
        clockHour = clockHour % 12 || 12;
        if (wantedHour && clockHour !== Number(wantedHour)) return false;
        if (wantedMinute && clockMinute !== wantedMinute.padStart(2, '0')) return false;
        if (wantedMeridiem && clockMeridiem !== wantedMeridiem) return false;
        return true;
    });
};

interface UserData {
    id: number;
    name: string;
    gender?: string | null;
    profile?: {
        assigned_office?: string;
        course?: string | null;
        year_level?: string | number | null;
        gender?: string | null;
    }
}

interface SemesterTerm {
    id: number;
    label: string;
    starts_on: string;
    ends_on: string;
    months: number;
}

interface Schedule {
    id: number;
    user_id: number;
    kind?: 'work' | 'class' | string;
    day: string;
    time: string;
    duty_type: string;
    subject?: string | null;
    room?: string | null;
    instructor?: string | null;
    department: string;
    supervisor: string;
    edit_request_status?: string;
    edit_request_note?: string;
    user?: {
        name: string;
        profile_picture?: string | null;
        deleted_at?: string | null;
    }
}

const ScheduleManagement = () => {
    const [students, setStudents] = useState<UserData[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    
    // Modal & Form State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Global Toast State
    const [toastMsg, setToastMsg] = useState<{text: string, type: 'success' | 'error'} | null>(null);
    const currentUserRole = localStorage.getItem('user_role') || '';
    const assignedOffice = (localStorage.getItem('assigned_office') || '').trim().toLowerCase();
    const canManageSchedules = currentUserRole === 'WSPO Staff' && ['', 'wspo', 'unassigned', 'wspo coordinator', 'wspo secretary'].includes(assignedOffice);
    const canSetSemester = currentUserRole === 'WSPO Staff' || currentUserRole === 'Super Admin';
    const isAudit = currentUserRole === 'Super Admin';
    const [semester, setSemester] = useState<SemesterTerm | null>(null);
    const [semesterForm, setSemesterForm] = useState(() => {
        const starts_on = suggestedSemesterStart();
        return { label: '1st Semester', starts_on, ends_on: semesterEndDate(starts_on, 5), months: 5 };
    });
    const [semesterSaving, setSemesterSaving] = useState(false);
    const [auditFilters, setAuditFilters] = useState({ date: '', hour: '', minute: '', meridiem: '', department: '' });
    const [nameFilter, setNameFilter] = useState('');
    const [dayFilter, setDayFilter] = useState('');
    const [departments, setDepartments] = useState<string[]>([]);
    const [schedulePage, setSchedulePage] = useState(1);
    const [requestSlide, setRequestSlide] = useState(0);
    const [requestSlideDirection, setRequestSlideDirection] = useState(1);
    const [listKind, setListKind] = useState<'all' | 'work' | 'class'>('all');
    const [entryKind, setEntryKind] = useState<'work' | 'class'>('work');
    const [staffingRequests, setStaffingRequests] = useState<any[]>([]);
    const [staffingCandidates, setStaffingCandidates] = useState<UserData[]>([]);
    const [assignmentSelections, setAssignmentSelections] = useState<Record<number, number[]>>({});
    const [staffingForm, setStaffingForm] = useState({ duty_type: 'Clerical', duty_request: '', quantity: 1, requested_genders: ['Male'] });

    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const emptyForm = {
        user_id: '',
        days: ['Monday'] as string[],
        startTime: '',
        endTime: '',
        duty_type: 'Clerical Work',
        subject: '',
        room: '',
        instructor: '',
    };
    const [formData, setFormData] = useState(emptyForm);
    const [editingId, setEditingId] = useState<number | null>(null);

    const openScheduleModal = (kind: 'work' | 'class') => {
        if (!semester) {
            showToast('Set the semester length before creating a schedule.', 'error');
            return;
        }
        setEditingId(null);
        setEntryKind(kind);
        setFormData(emptyForm);
        setIsModalOpen(true);
    };

    const openEditSchedule = (schedule: Schedule) => {
        const times = splitScheduleTime(schedule.time);
        const kind = schedule.kind === 'class' ? 'class' : 'work';
        setEditingId(schedule.id);
        setEntryKind(kind);
        setFormData({
            user_id: String(schedule.user_id),
            days: weekdays.includes(schedule.day) ? [schedule.day] : ['Monday'],
            startTime: times.startTime,
            endTime: times.endTime,
            duty_type: kind === 'work' ? (schedule.duty_type || 'Clerical Work') : 'Clerical Work',
            subject: schedule.subject || (kind === 'class' ? schedule.duty_type : '') || '',
            room: schedule.room || '',
            instructor: schedule.instructor || (kind === 'class' ? schedule.supervisor : '') || '',
        });
        setIsModalOpen(true);
    };

    const closeScheduleModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
        setFormData(emptyForm);
    };

    useEffect(() => {
        fetchSemester();
        fetchStudents();
        fetchStaffingRequests();
        if (currentUserRole !== 'Supervisor') {
            fetchStaffingCandidates();
        }
        if (isAudit) {
            axios.get('/api/offices')
                .then((response) => {
                    const names = (Array.isArray(response.data) ? response.data : [])
                        .map((office: { name?: string }) => office.name)
                        .filter((name: string | undefined): name is string => Boolean(name));
                    setDepartments(names);
                })
                .catch(() => setDepartments([]));
        }
    }, []);

    useEffect(() => {
        if (isAudit) return;
        fetchSchedules(currentPage);
    }, [currentPage, listKind, nameFilter, dayFilter]);

    useEffect(() => {
        if (!isAudit) return;
        fetchSchedules(1);
    }, [listKind]);

    const showToast = (text: string, type: 'success' | 'error') => {
        setToastMsg({ text, type });
    };

    const fetchSemester = async () => {
        try {
            const response = await axios.get('/api/semester');
            const next = response.data?.semester ?? null;
            setSemester(next);
            if (next) {
                setSemesterForm({
                    label: next.label || '1st Semester',
                    starts_on: String(next.starts_on).slice(0, 10),
                    ends_on: String(next.ends_on).slice(0, 10),
                    months: Number(next.months) || 5,
                });
            }
        } catch (error) {
            console.error('Failed to fetch semester', error);
        }
    };

    const saveSemester = async (event: FormEvent) => {
        event.preventDefault();
        if (!canSetSemester || semesterSaving) return;
        setSemesterSaving(true);
        try {
            const response = await axios.put('/api/semester', {
                label: semesterForm.label.trim(),
                starts_on: semesterForm.starts_on,
                ends_on: semesterForm.ends_on,
            });
            setSemester(response.data.semester);
            showToast(response.data.message || 'Semester window saved.', 'success');
            emitRealtimeRefresh();
        } catch (error: any) {
            const fieldError = error.response?.data?.errors?.label?.[0]
                || error.response?.data?.errors?.starts_on?.[0]
                || error.response?.data?.errors?.ends_on?.[0];
            showToast(fieldError || error.response?.data?.message || 'Failed to save the semester.', 'error');
        } finally {
            setSemesterSaving(false);
        }
    };

    const semesterDatesValid = Boolean(semesterForm.starts_on && semesterForm.ends_on && semesterForm.ends_on >= semesterForm.starts_on);

    const fetchStaffingRequests = async () => {
        try {
            const response = await axios.get('/api/staffing-requests');
            setStaffingRequests(response.data);
        } catch (error) {
            console.error('Failed to fetch staffing requests', error);
        }
    };

    const fetchStaffingCandidates = async () => {
        try {
            const response = await axios.get('/api/staffing-candidates');
            setStaffingCandidates(response.data);
        } catch (error) {
            console.error('Failed to fetch working students', error);
        }
    };

    const setRequestedQuantity = (quantity: number) => {
        const nextQuantity = Math.max(1, Math.min(50, Number(quantity) || 1));
        setStaffingForm((current) => {
            const requested_genders = [...current.requested_genders];
            while (requested_genders.length < nextQuantity) {
                requested_genders.push('Male');
            }
            return {
                ...current,
                quantity: nextQuantity,
                requested_genders: requested_genders.slice(0, nextQuantity),
            };
        });
    };

    const setSlotGender = (index: number, gender: string) => {
        setStaffingForm((current) => {
            const requested_genders = [...current.requested_genders];
            requested_genders[index] = gender;
            return { ...current, requested_genders };
        });
    };

    const genderSummary = (genders: string[] = []) => {
        const male = genders.filter((gender) => gender === 'Male').length;
        const female = genders.filter((gender) => gender === 'Female').length;
        const parts = [];
        if (male > 0) parts.push(male === 1 ? '1 Male' : `${male} Male`);
        if (female > 0) parts.push(female === 1 ? '1 Female' : `${female} Female`);
        return parts.join(' and ');
    };

    const remainingGenders = (request: any, selectedIds: number[]) => {
        const needed = { Male: 0, Female: 0 };
        (request.requested_genders || []).forEach((gender: string) => {
            if (gender === 'Male' || gender === 'Female') needed[gender] += 1;
        });
        selectedIds.forEach((id) => {
            const student = staffingCandidates.find((candidate) => candidate.id === id);
            const gender = student?.gender || student?.profile?.gender;
            if (gender === 'Male' || gender === 'Female') needed[gender] = Math.max(0, needed[gender] - 1);
        });
        return needed;
    };

    const studentGender = (student: UserData) => student.gender || student.profile?.gender || '';

    const toggleAssignedStudent = (requestId: number, studentId: number, request: any) => {
        const limit = request.quantity;
        setAssignmentSelections((current) => {
            const selected = current[requestId] || [];
            if (selected.includes(studentId)) {
                return { ...current, [requestId]: selected.filter((id) => id !== studentId) };
            }
            if (selected.length >= limit) {
                return current;
            }
            const student = staffingCandidates.find((candidate) => candidate.id === studentId);
            const gender = studentGender(student || { id: studentId, name: '' });
            const remaining = remainingGenders(request, selected);
            if ((request.requested_genders || []).length > 0 && (gender === 'Male' || gender === 'Female') && remaining[gender] <= 0) {
                return current;
            }
            return { ...current, [requestId]: [...selected, studentId] };
        });
    };

    const assignedStudentNames = (request: any) => {
        const names = (request.assigned_students || []).map((student: UserData) => student.name).filter(Boolean);
        return names.length > 0 ? names.join(', ') : '';
    };

    const submitStaffingRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post('/api/staffing-requests', staffingForm);
            setStaffingForm({ duty_type: 'Clerical', duty_request: '', quantity: 1, requested_genders: ['Male'] });
            showToast('Staffing request sent to WSPO.', 'success');
            fetchStaffingRequests();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Could not send staffing request.', 'error');
        }
    };

    const updateStaffingRequest = async (id: number, status: string) => {
        try {
            const payload: { status: string; student_ids?: number[] } = { status };
            if (status === 'Approved' || status === 'Fulfilled') {
                payload.student_ids = assignmentSelections[id] || [];
            }
            await axios.patch(`/api/staffing-requests/${id}`, payload);
            showToast('Staffing request updated.', 'success');
            setAssignmentSelections((current) => {
                const next = { ...current };
                delete next[id];
                return next;
            });
            fetchStaffingRequests();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Could not update staffing request.', 'error');
        }
    };

    const fetchStudents = async () => {
        try {
            const response = await axios.get('/api/personnel');
            setStudents(response.data);
        } catch (error) {
            console.error("Failed to fetch students", error);
        }
    };

    const fetchSchedules = async (page: number, silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const kindQuery = listKind === 'all' ? '' : `&kind=${listKind}`;
            const nameQuery = !isAudit && nameFilter.trim() ? `&name=${encodeURIComponent(nameFilter.trim())}` : '';
            const dayQuery = !isAudit && dayFilter ? `&day=${encodeURIComponent(dayFilter)}` : '';
            const response = await axios.get(isAudit ? `/api/schedules?audit=1${kindQuery}` : `/api/schedules?page=${page}${kindQuery}${nameQuery}${dayQuery}`);
            if (isAudit) {
                setSchedules(Array.isArray(response.data) ? response.data : []);
                setTotalPages(1);
            } else {
                setSchedules(response.data.data);
                setCurrentPage(response.data.current_page);
                setTotalPages(response.data.last_page);
            }
        } catch (error) {
            console.error("Failed to fetch schedules", error);
            if (!silent) showToast("Failed to load schedules.", "error");
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        const refresh = () => {
            fetchSchedules(currentPage, true);
            fetchStudents();
            fetchStaffingRequests();
        };
        const interval = setInterval(refresh, 5000);
        window.addEventListener(REALTIME_EVENT, refresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener(REALTIME_EVENT, refresh);
        };
    }, [currentPage, listKind, nameFilter, dayFilter]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        if (formData.days.length === 0) {
            showToast('Select at least one day.', 'error');
            setIsSubmitting(false);
            return;
        }

        const time = `${formData.startTime} - ${formData.endTime}`;
        const details = entryKind === 'class'
            ? {
                subject: formData.subject.trim(),
                room: formData.room.trim(),
                instructor: formData.instructor.trim(),
            }
            : { duty_type: formData.duty_type };

        try {
            if (editingId) {
                await axios.put(`/api/schedules/${editingId}`, {
                    user_id: formData.user_id,
                    day: formData.days[0],
                    time,
                    ...details,
                });
                showToast(entryKind === 'class' ? 'Class schedule updated.' : 'Work schedule updated.', 'success');
            } else {
                await axios.post('/api/schedules', {
                    user_id: formData.user_id,
                    days: formData.days,
                    time,
                    kind: entryKind,
                    ...details,
                });
                const saved = formData.days.length;
                showToast(
                    entryKind === 'class'
                        ? (saved === 1 ? 'Class schedule saved.' : `${saved} class days saved.`)
                        : (saved === 1 ? 'Shift assigned successfully!' : `${saved} work days assigned successfully!`),
                    'success',
                );
            }
            closeScheduleModal();
            fetchSchedules(currentPage);
        } catch (error: any) {
            showToast(error.response?.data?.message || (editingId ? 'Failed to update schedule.' : entryKind === 'class' ? 'Failed to save class schedule.' : 'Failed to assign shift.'), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditAction = async (id: number, action: 'approve' | 'reject') => {
        try {
            await axios.patch(`/api/schedules/${id}/edit-request`, { action });
            showToast(`Edit request ${action}d successfully.`, "success");
            fetchSchedules(currentPage);
        } catch (error) {
            showToast("Failed to process request.", "error");
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this schedule?')) return;
        try {
            await axios.delete(`/api/schedules/${id}`);
            showToast("Schedule deleted successfully.", "success");
            fetchSchedules(currentPage);
        } catch (error) {
            showToast("Failed to delete schedule.", "error");
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

    const auditWeekday = auditFilters.date
        ? new Date(`${auditFilters.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
        : '';

    const filteredRequests = useMemo(() => {
        if (!isAudit) return staffingRequests;
        const name = nameFilter.trim().toLowerCase();
        return staffingRequests.filter((request) => {
            if (auditFilters.department && request.department !== auditFilters.department) return false;
            if (auditFilters.date && String(request.created_at || '').slice(0, 10) !== auditFilters.date) return false;
            if (name && !`${request.requester?.name || ''} ${request.department} ${(request.assigned_students || []).map((student: UserData) => student.name).join(' ')}`.toLowerCase().includes(name)) return false;
            return true;
        });
    }, [isAudit, staffingRequests, auditFilters, nameFilter]);

    const studentNames = useMemo(() => {
        const names = new Set<string>();
        students.forEach((student) => {
            const name = student.name?.trim();
            if (name) names.add(name);
        });
        schedules.forEach((schedule) => {
            const name = schedule.user?.name?.trim();
            if (name) names.add(name);
        });
        staffingRequests.forEach((request) => {
            const requester = request.requester?.name?.trim();
            if (requester) names.add(requester);
            (request.assigned_students || []).forEach((student: UserData) => {
                const name = student.name?.trim();
                if (name) names.add(name);
            });
        });
        return Array.from(names).sort((left, right) => left.localeCompare(right));
    }, [students, schedules, staffingRequests]);

    const applyNameFilter = (name: string) => {
        setNameFilter(name);
        setCurrentPage(1);
        setRequestSlide(0);
        setSchedulePage(1);
    };

    const applyDayFilter = (day: string) => {
        setDayFilter(day);
        setCurrentPage(1);
        setSchedulePage(1);
    };

    const listFiltersActive = Boolean(nameFilter.trim() || dayFilter);

    const filteredSchedules = useMemo(() => {
        if (!isAudit) return schedules;
        const name = nameFilter.trim().toLowerCase();
        return schedules.filter((schedule) => {
            if (auditFilters.department && schedule.department !== auditFilters.department) return false;
            if (auditWeekday && schedule.day !== auditWeekday) return false;
            if (!scheduleMatchesClock(schedule.time, auditFilters.hour, auditFilters.minute, auditFilters.meridiem)) return false;
            if (dayFilter && schedule.day !== dayFilter) return false;
            if (name && !`${schedule.user?.name || ''} ${schedule.supervisor || ''}`.toLowerCase().includes(name)) return false;
            return true;
        });
    }, [isAudit, schedules, auditFilters, auditWeekday, nameFilter, dayFilter]);

    const pagedSchedules = pageSlice(filteredSchedules, schedulePage);
    const requestSlides = isAudit ? filteredRequests : staffingRequests;
    const requestSlideIndex = requestSlides.length === 0 ? 0 : Math.min(requestSlide, requestSlides.length - 1);
    const visibleSchedules = isAudit ? pagedSchedules.rows : schedules;

    return (
        <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
            
            {/* DARK THEME HEADER - SCHEDULE MASTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
            >

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <CalendarDays className="w-5 h-5 text-blue-400" />
                        <span className="text-sm font-medium text-slate-500">Timetable Management</span>
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                        Schedule Master
                    </h1>
                    <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
                        {isAudit
                            ? 'Set the semester window, then review department requests and assigned schedules. Other changes stay read-only.'
                            : canManageSchedules
                                ? 'Set how long the semester runs, then assign or edit duty hours and class schedules. Those entries repeat each week until the semester ends.'
                                : 'Work and class schedules are recorded by the WSPO coordinator or secretary. You can review the entries already set for your department.'}
                    </p>
                </div>

                {canManageSchedules && <div className="shrink-0 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-wrap items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => openScheduleModal('class')}
                        disabled={!semester}
                        className="px-5 py-2.5 bg-white hover:bg-violet-50 text-violet-700 border border-violet-200 font-bold text-sm rounded-xl transition-colors flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
                    >
                        <GraduationCap className="w-4 h-4" /> Add Class
                    </button>
                    <button
                        type="button"
                        onClick={() => openScheduleModal('work')}
                        disabled={!semester}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-blue-900/50 flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4" /> Assign Shift
                    </button>
                </div>}
            </motion.div>

            {canSetSemester ? (
                <form onSubmit={saveSemester} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Semester length</h2>
                            <p className="mt-1 max-w-2xl text-sm text-slate-500">
                                Set this before creating schedules. A semester usually lasts 5 months, and weekly schedules repeat only between the start and end dates.
                            </p>
                        </div>
                        {semester && (
                            <p className="text-sm font-medium text-slate-700">
                                Current: {semester.label}, {formatSemesterDate(semester.starts_on)} – {formatSemesterDate(semester.ends_on)}
                            </p>
                        )}
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
                        <label className="block">
                            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Semester</span>
                            <input
                                value={semesterForm.label}
                                onChange={(event) => setSemesterForm((current) => ({ ...current, label: event.target.value }))}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-600"
                                placeholder="1st Semester"
                                maxLength={80}
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Starts</span>
                            <input
                                type="date"
                                value={semesterForm.starts_on}
                                onChange={(event) => {
                                    const starts_on = event.target.value;
                                    setSemesterForm((current) => ({
                                        ...current,
                                        starts_on,
                                        ends_on: current.ends_on && current.ends_on >= starts_on
                                            ? current.ends_on
                                            : semesterEndDate(starts_on, current.months),
                                    }));
                                }}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-600"
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Ends</span>
                            <input
                                type="date"
                                value={semesterForm.ends_on}
                                min={semesterForm.starts_on}
                                onChange={(event) => setSemesterForm((current) => ({ ...current, ends_on: event.target.value }))}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-600"
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Length</span>
                            <select
                                value={semesterForm.months}
                                onChange={(event) => {
                                    const months = Number(event.target.value);
                                    setSemesterForm((current) => ({
                                        ...current,
                                        months,
                                        ends_on: semesterEndDate(current.starts_on, months),
                                    }));
                                }}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-600"
                            >
                                {SEMESTER_MONTH_OPTIONS.map((months) => (
                                    <option key={months} value={months}>{months} months</option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="submit"
                            disabled={semesterSaving || !semesterDatesValid || !semesterForm.label.trim()}
                            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {semesterSaving ? 'Saving...' : semester ? 'Update semester' : 'Save semester'}
                        </button>
                    </div>
                    {semesterForm.starts_on && semesterForm.ends_on && (
                        <p className={`mt-3 text-sm ${semesterDatesValid ? 'text-slate-600' : 'text-rose-600'}`}>
                            {semesterDatesValid
                                ? <>Schedules repeat each week from <span className="font-semibold text-slate-900">{formatSemesterDate(semesterForm.starts_on)}</span> through <span className="font-semibold text-slate-900">{formatSemesterDate(semesterForm.ends_on)}</span>.</>
                                : 'The end date must be on or after the start date.'}
                        </p>
                    )}
                </form>
            ) : semester ? (
                <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-sm text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <span className="font-semibold text-slate-900">{semester.label}</span> runs {formatSemesterDate(semester.starts_on)} through {formatSemesterDate(semester.ends_on)}. Weekly schedules repeat only inside that window.
                </div>
            ) : null}

            {isAudit && (
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 lg:grid-cols-[auto_1fr_auto_auto] gap-3 items-end">
                    <label className="block">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Date</span>
                        <input type="date" value={auditFilters.date} onChange={(event) => { setAuditFilters({ ...auditFilters, date: event.target.value }); setRequestSlide(0); setSchedulePage(1); }} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none" />
                    </label>
                    <div>
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Time</span>
                        <div className="grid grid-cols-3 gap-2">
                            <ComboFilter value={auditFilters.hour} onChange={(hour) => { setAuditFilters({ ...auditFilters, hour }); setSchedulePage(1); }} options={HOUR_OPTIONS} placeholder="Hour" emptyLabel="Hour" />
                            <ComboFilter value={auditFilters.minute} onChange={(minute) => { setAuditFilters({ ...auditFilters, minute }); setSchedulePage(1); }} options={MINUTE_OPTIONS} placeholder="Min" emptyLabel="Min" />
                            <ComboFilter value={auditFilters.meridiem} onChange={(meridiem) => { setAuditFilters({ ...auditFilters, meridiem: meridiem.toUpperCase() }); setSchedulePage(1); }} options={['AM', 'PM']} placeholder="AM/PM" emptyLabel="AM/PM" />
                        </div>
                    </div>
                    <label className="block min-w-[220px]">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Department</span>
                        <ComboFilter commitOnType={false} value={auditFilters.department} onChange={(department) => { setAuditFilters({ ...auditFilters, department }); setRequestSlide(0); setSchedulePage(1); }} options={departments} placeholder="All departments" emptyLabel="All departments" />
                    </label>
                    <label className="block min-w-[220px]">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Name</span>
                        <ComboFilter commitOnType={false} value={nameFilter} onChange={applyNameFilter} options={studentNames} placeholder="Search by name" emptyLabel="All names" />
                    </label>
                    <label className="block min-w-[180px]">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Day</span>
                        <ComboFilter commitOnType={false} value={dayFilter} onChange={applyDayFilter} options={weekdays} placeholder="All days" emptyLabel="All days" />
                    </label>
                </div>
            )}

            <Toast
                message={toastMsg?.text ?? null}
                type={toastMsg?.type}
                onClose={() => setToastMsg(null)}
            />

            {/* STAFFING REQUESTS CONSOLE (Supervisor View) */}
            {currentUserRole === 'Supervisor' && (
                <motion.form 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={submitStaffingRequest} 
                    className="bg-indigo-50/40 border border-indigo-100 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col gap-5"
                >
                    <div>
                        <h2 className="text-lg font-semibold text-indigo-900 flex items-center gap-2 tracking-tight">
                            <Users className="w-5 h-5" /> Request Working Students
                        </h2>
                        <p className="text-sm font-medium text-slate-500 mt-1">Submit an official request to WSPO to deploy new student workers to your department.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-5 items-start">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Duty Type</label>
                            <select 
                                value={staffingForm.duty_type} 
                                onChange={e => setStaffingForm({...staffingForm, duty_type: e.target.value})} 
                                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm"
                            >
                                <option>Clerical</option>
                                <option>Janitorial</option>
                                <option>Request</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Workers Needed</label>
                            <input 
                                required 
                                min="1" 
                                max="50" 
                                type="number" 
                                value={staffingForm.quantity} 
                                onChange={e => setRequestedQuantity(Number(e.target.value))} 
                                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm" 
                            />
                        </div>
                        {staffingForm.duty_type === 'Request' && (
                            <div className="sm:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Specific Duty Requirements</label>
                                <input 
                                    required 
                                    value={staffingForm.duty_request} 
                                    onChange={e => setStaffingForm({...staffingForm, duty_request: e.target.value})} 
                                    placeholder="Describe the required assignment..." 
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm" 
                                />
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 border-b border-indigo-200/50 pb-2">Gender Allocation for requested slots</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {staffingForm.requested_genders.map((gender, index) => (
                                <div key={`gender-slot-${index}`} className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] font-bold text-slate-400 mb-1.5 px-1">Slot {index + 1}</p>
                                    <select 
                                        value={gender} 
                                        onChange={(e) => setSlotGender(index, e.target.value)} 
                                        className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600"
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-2">
                        <button className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2">
                            <Send className="w-4 h-4" /> Transmit Request
                        </button>
                    </div>
                </motion.form>
            )}

            {/* STAFFING REQUESTS LIST (WSPO & Admin View) */}
            {(isAudit ? filteredRequests.length > 0 || staffingRequests.length > 0 : staffingRequests.length > 0) && (
                <div className="space-y-4">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-indigo-600" />
                            {currentUserRole === 'Supervisor' ? 'Your Active Staffing Requests' : isAudit ? 'Department Requests' : 'Pending Department Requests'}
                        </h2>
                        {requestSlides.length > 0 && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={requestSlideIndex === 0}
                                    onClick={() => {
                                        setRequestSlideDirection(-1);
                                        setRequestSlide(requestSlideIndex - 1);
                                    }}
                                    className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 transition-colors flex items-center gap-1 shadow-sm"
                                >
                                    <ChevronLeft className="w-4 h-4" /> Previous
                                </button>
                                <span className="min-w-[4.5rem] text-center text-sm font-bold text-slate-700">
                                    {requestSlideIndex + 1} of {requestSlides.length}
                                </span>
                                <button
                                    type="button"
                                    disabled={requestSlideIndex >= requestSlides.length - 1}
                                    onClick={() => {
                                        setRequestSlideDirection(1);
                                        setRequestSlide(requestSlideIndex + 1);
                                    }}
                                    className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 transition-colors flex items-center gap-1 shadow-sm"
                                >
                                    Next <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                    {requestSlides.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-12 text-center text-slate-500 font-medium">
                            No department requests match these filters.
                        </div>
                    ) : (
                    <div className="relative overflow-hidden">
                        <AnimatePresence mode="wait" initial={false}>
                        {(() => {
                            const request = requestSlides[requestSlideIndex];
                            const selectedIds = assignmentSelections[request.id] || [];
                            const assignedNames = assignedStudentNames(request);

                            return (
                                <motion.div
                                    key={request.id}
                                    initial={{ opacity: 0, x: requestSlideDirection * 36 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: requestSlideDirection * -36 }}
                                    transition={{ duration: 0.22 }}
                                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between"
                                >
                                    <div>
                                        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                                            <div>
                                                <h3 className="text-base font-semibold text-slate-900 tracking-tight">{request.department}</h3>
                                                <p className="text-sm font-bold text-indigo-700 mt-0.5">{request.quantity} {request.duty_type} Worker{request.quantity !== 1 ? 's' : ''}</p>
                                                <p className="text-xs font-medium text-slate-500 mt-1">Requested by: <span className="font-bold text-slate-700">{request.requester?.name}</span></p>
                                                
                                                {request.duty_request && (
                                                    <div className="mt-2 p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                                                        <p className="text-xs text-slate-600 italic">"{request.duty_request}"</p>
                                                    </div>
                                                )}
                                                
                                                {(request.gender_summary || genderSummary(request.requested_genders || [])) && (
                                                    <div className="mt-3 inline-flex px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-slate-200">
                                                        Req: {request.gender_summary || genderSummary(request.requested_genders || [])}
                                                    </div>
                                                )}
                                            </div>
                                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border shadow-sm shrink-0 ${
                                                request.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                request.status === 'Declined' ? 'bg-red-50 text-red-700 border-red-200' :
                                                'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            }`}>
                                                {request.status}
                                            </span>
                                        </div>

                                        {assignedNames && (
                                            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                                <p className="text-xs font-bold text-emerald-800 mb-1">Assigned Personnel:</p>
                                                <p className="text-sm font-medium text-emerald-900">{assignedNames}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Area for WSPO Staff */}
                                    {!isAudit && currentUserRole !== 'Supervisor' && request.status === 'Pending' && (
                                        <div className="mt-4 pt-4 border-t border-slate-100">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex justify-between">
                                                <span>Select Personnel to Deploy</span>
                                                <span className={`${selectedIds.length === request.quantity ? 'text-emerald-600' : 'text-indigo-600'}`}>
                                                    ({selectedIds.length} of {request.quantity} selected)
                                                </span>
                                            </label>
                                            
                                            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 custom-scrollbar mb-4 bg-slate-50/50">
                                                {staffingCandidates.map((student) => {
                                                    const gender = studentGender(student);
                                                    const remaining = remainingGenders(request, selectedIds);
                                                    const genderLocked = (request.requested_genders || []).length > 0;
                                                    const genderFull = genderLocked && (gender === 'Male' || gender === 'Female') && remaining[gender] <= 0 && !selectedIds.includes(student.id);
                                                    const missingGender = genderLocked && gender !== 'Male' && gender !== 'Female';
                                                    
                                                    return (
                                                    <label key={student.id} className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${genderFull || missingGender ? 'opacity-40 grayscale' : 'cursor-pointer hover:bg-white'}`}>
                                                        <input
                                                            type="checkbox"
                                                            disabled={genderFull || missingGender}
                                                            checked={selectedIds.includes(student.id)}
                                                            onChange={() => toggleAssignedStudent(request.id, student.id, request)}
                                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-slate-900">{student.name}</span>
                                                            <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                                                                {gender || 'No gender'} • <MapPin className="w-3 h-3"/> {student.profile?.assigned_office || 'Unassigned'}
                                                            </span>
                                                        </div>
                                                    </label>
                                                    );
                                                })}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button 
                                                    type="button" 
                                                    disabled={selectedIds.length === 0}
                                                    onClick={() => updateStaffingRequest(request.id, 'Approved')} 
                                                    className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" /> Approve & Assign
                                                </button>
                                                <button 
                                                    type="button" 
                                                    onClick={() => updateStaffingRequest(request.id, 'Declined')} 
                                                    className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-600 text-sm font-bold rounded-xl shadow-sm transition-colors"
                                                >
                                                    Decline
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })()}
                        </AnimatePresence>
                    </div>
                    )}
                </div>
            )}

            {/* MAIN SCHEDULES TABLE */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    {([
                        ['all', 'All schedules'],
                        ['work', 'Work shifts'],
                        ['class', 'Class schedules'],
                    ] as const).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => { setListKind(value); setCurrentPage(1); setSchedulePage(1); }}
                            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${listKind === value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {!isAudit && (
                    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[28rem]">
                        <label className="block">
                            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Search by name</span>
                            <ComboFilter commitOnType={false} value={nameFilter} onChange={applyNameFilter} options={studentNames} placeholder="Search by name" emptyLabel="All names" />
                        </label>
                        <label className="block">
                            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Day</span>
                            <ComboFilter commitOnType={false} value={dayFilter} onChange={applyDayFilter} options={weekdays} placeholder="All days" emptyLabel="All days" />
                        </label>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden relative min-h-[400px]">
                
                {isLoading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                            <span className="text-sm font-bold text-blue-700 animate-pulse">Loading schedules...</span>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200">
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Student Worker</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Shift Timing</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Details</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <motion.tbody 
                            variants={containerVariants}
                            initial="hidden"
                            animate={!isLoading ? "show" : "hidden"}
                            className="divide-y divide-slate-100"
                        >
                            {!isLoading && visibleSchedules.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                                        <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="text-base font-semibold text-slate-600">{listFiltersActive ? 'No schedules match these filters' : 'No schedules found'}</p>
                                        <p className="text-sm font-medium">{listFiltersActive ? 'Choose another name or day, or clear the filters.' : canManageSchedules ? 'Assign a work shift or add a class schedule.' : 'The WSPO coordinator or secretary has not recorded a schedule yet.'}</p>
                                    </td>
                                </tr>
                            ) : (
                                visibleSchedules.map((schedule) => (
                                    <motion.tr variants={rowVariants} key={schedule.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-3">
                                                <UserAvatar
                                                    name={schedule.user?.name}
                                                    picture={schedule.user?.profile_picture}
                                                    className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm"
                                                />
                                                <div>
                                                    <p className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                                        {schedule.user?.name || 'Unknown User'}
                                                    </p>
                                                    {schedule.user?.deleted_at && (
                                                        <span className="mt-1 inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                                            Account deleted
                                                        </span>
                                                    )}
                                                    <div className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                                                        <MapPin className="w-3 h-3 text-slate-400" /> {schedule.department}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-2 text-sm text-slate-900 font-bold mb-1.5">
                                                <Clock className="w-4 h-4 text-blue-500" />
                                                {schedule.time}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-widest border border-slate-200">
                                                    {schedule.day}
                                                </span>
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${schedule.kind === 'class' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                    {schedule.kind === 'class' ? <GraduationCap className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                                                    {schedule.kind === 'class' ? 'Class' : 'Work'}
                                                </span>
                                            </div>
                                        </td>

                                        <td className="px-6 py-5 align-top">
                                            {schedule.kind === 'class' ? (
                                                <>
                                                    <p className="text-sm font-bold text-slate-800">{schedule.subject || schedule.duty_type}</p>
                                                    <p className="text-xs font-medium text-slate-500 mt-1">
                                                        {[schedule.room, schedule.instructor || schedule.supervisor].filter(Boolean).join(' · ') || 'No room or instructor'}
                                                    </p>
                                                </>
                                            ) : (
                                                <p className="text-sm font-bold text-slate-800">{schedule.duty_type}</p>
                                            )}
                                        </td>

                                        <td className="px-6 py-5 align-top text-right">
                                            <div className="flex flex-col items-end gap-3">
                                                {schedule.edit_request_status === 'pending' && (
                                                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-left max-w-[280px] shadow-sm relative overflow-hidden">
                                                        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 rounded-full blur-xl"></div>
                                                        <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5 tracking-tight relative z-10">
                                                            <AlertCircle className="w-4 h-4" /> Shift Edit Requested
                                                        </p>
                                                        <p className="text-[11px] text-amber-700 font-medium mb-3 italic leading-relaxed relative z-10 bg-white/50 p-2 rounded-lg border border-amber-100">
                                                            "{schedule.edit_request_note}"
                                                        </p>
                                                        {canManageSchedules && <div className="flex gap-2 relative z-10">
                                                            <button 
                                                                onClick={() => handleEditAction(schedule.id, 'approve')} 
                                                                className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-sm transition-colors flex items-center justify-center gap-1"
                                                            >
                                                                <Check className="w-3.5 h-3.5" /> Approve
                                                            </button>
                                                            <button 
                                                                onClick={() => handleEditAction(schedule.id, 'reject')} 
                                                                className="flex-1 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center gap-1"
                                                            >
                                                                <X className="w-3.5 h-3.5" /> Reject
                                                            </button>
                                                        </div>}
                                                    </div>
                                                )}
                                                
                                                {canManageSchedules && (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditSchedule(schedule)}
                                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                                                            title={schedule.kind === 'class' ? 'Edit class schedule' : 'Edit work schedule'}
                                                        >
                                                            <Pencil className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(schedule.id)}
                                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                                            title="Remove Schedule"
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </motion.tbody>
                    </table>
                </div>

                {isAudit ? (
                    <AuditPager page={pagedSchedules.page} totalPages={pagedSchedules.totalPages} total={pagedSchedules.total} onPage={setSchedulePage} />
                ) : !isLoading && schedules.length > 0 && (
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <span className="text-sm font-medium text-slate-500">
                            Showing page <span className="font-bold text-slate-900">{currentPage}</span> of <span className="font-bold text-slate-900">{totalPages}</span>
                        </span>
                        <div className="flex gap-2">
                            <button 
                                disabled={currentPage === 1} 
                                onClick={() => setCurrentPage(p => p - 1)}
                                className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1 shadow-sm"
                            >
                                <ChevronLeft className="w-4 h-4" /> Prev
                            </button>
                            <button 
                                disabled={currentPage === totalPages} 
                                onClick={() => setCurrentPage(p => p + 1)}
                                className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1 shadow-sm"
                            >
                                Next <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL: ASSIGN NEW SHIFT */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 overflow-y-auto"
                        {...bindPopup(closeScheduleModal)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-auto"
                        >
                            <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center sticky top-0 z-10">
                                <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                                    {editingId
                                        ? entryKind === 'class'
                                            ? <><GraduationCap className="w-5 h-5 text-violet-600" /> Edit Class Schedule</>
                                            : <><Pencil className="w-5 h-5 text-blue-600" /> Edit Work Schedule</>
                                        : entryKind === 'class'
                                            ? <><GraduationCap className="w-5 h-5 text-violet-600" /> Add Class Schedule</>
                                            : <><Plus className="w-5 h-5 text-blue-600" /> Assign New Shift</>}
                                </h3>
                                <button type="button" onClick={closeScheduleModal} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                
                                <div className={`p-4 rounded-xl flex gap-3 mb-2 border ${entryKind === 'class' ? 'bg-violet-50 border-violet-100' : 'bg-blue-50 border-blue-100'}`}>
                                    {entryKind === 'class'
                                        ? <GraduationCap className="w-5 h-5 text-violet-600 shrink-0" />
                                        : <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />}
                                    <p className={`text-[11px] font-medium leading-relaxed ${entryKind === 'class' ? 'text-violet-800' : 'text-blue-800'}`}>
                                        {editingId
                                            ? 'This updates the selected row only. The new time still cannot overlap another class or work shift on that day.'
                                            : entryKind === 'class'
                                                ? 'Class hours stay separate from duty. A work shift cannot overlap a class already saved for this student. Clock-in still follows the work schedule only.'
                                                : 'This is the student’s work schedule. It cannot overlap a class or another shift on the same day. Clock-in and clock-out are accepted only inside this shift.'}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Select Student Worker</label>
                                    <select 
                                        required 
                                        value={formData.user_id} 
                                        onChange={e => setFormData({...formData, user_id: e.target.value})} 
                                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="" disabled>-- Select a student --</option>
                                        {editingId && !students.some((student) => String(student.id) === formData.user_id) && (
                                            <option value={formData.user_id}>
                                                {schedules.find((schedule) => schedule.id === editingId)?.user?.name || 'Current student'}
                                            </option>
                                        )}
                                        {students.map(s => <option key={s.id} value={s.id}>{withHomeDepartmentNote(`${s.name} (${s.profile?.assigned_office || 'Unassigned'})`, s.profile?.course, s.profile?.assigned_office, s.profile?.year_level)}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{editingId ? 'Day' : 'Days of the week'}</label>
                                    <div className="flex flex-wrap gap-2">
                                        {weekdays.map((day) => {
                                            const selected = formData.days.includes(day);
                                            return (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    onClick={() => setFormData({
                                                        ...formData,
                                                        days: editingId
                                                            ? [day]
                                                            : selected ? formData.days.filter((item) => item !== day) : [...formData.days, day],
                                                    })}
                                                    className={`px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'}`}
                                                >
                                                    {day}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="mt-2 text-xs font-medium text-slate-500">
                                        {editingId
                                            ? 'Choose the day this entry should fall on.'
                                            : entryKind === 'class'
                                                ? 'Select every day this class meets.'
                                                : 'Select every day this shift repeats, including Saturday when the student works.'}
                                    </p>
                                </div>

                                {entryKind === 'class' ? (
                                    <div className="space-y-5">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Subject</label>
                                            <input required value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} placeholder="e.g. CS 301 Data Structures" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-violet-600 focus:bg-white transition-all placeholder:text-slate-400 placeholder:font-medium" />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Room</label>
                                                <input value={formData.room} onChange={e => setFormData({...formData, room: e.target.value})} placeholder="e.g. CCS 204" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-violet-600 focus:bg-white transition-all placeholder:text-slate-400 placeholder:font-medium" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Instructor</label>
                                                <input value={formData.instructor} onChange={e => setFormData({...formData, instructor: e.target.value})} placeholder="e.g. Prof. Cruz" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-violet-600 focus:bg-white transition-all placeholder:text-slate-400 placeholder:font-medium" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Duty Type</label>
                                        <select 
                                            value={formData.duty_type} 
                                            onChange={e => setFormData({...formData, duty_type: e.target.value})} 
                                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all appearance-none cursor-pointer"
                                        >
                                            {['Clerical Work', 'Library Assistant', 'Lab Assistant', 'Cleaning', 'Event Setup', formData.duty_type]
                                                .filter((duty, index, list) => duty && list.indexOf(duty) === index)
                                                .map((duty) => <option key={duty}>{duty}</option>)}
                                        </select>
                                </div>
                                )}

                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Start Time</label>
                                        <input required type="time" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all cursor-pointer" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">End Time</label>
                                        <input required type="time" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all cursor-pointer" />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                                    <button type="button" onClick={closeScheduleModal} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={isSubmitting} className={`px-6 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg disabled:opacity-50 transition-all flex items-center gap-2 ${entryKind === 'class' ? 'bg-violet-600 hover:bg-violet-700 shadow-violet-600/25' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/25'}`}>
                                        {isSubmitting
                                            ? 'Saving...'
                                            : editingId
                                                ? <><CheckCircle2 className="w-4 h-4" /> Save Changes</>
                                                : entryKind === 'class'
                                                    ? <><CheckCircle2 className="w-4 h-4" /> Save Class</>
                                                    : <><CheckCircle2 className="w-4 h-4" /> Finalize Shift</>}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ScheduleManagement;