import { useState, useEffect, useMemo, type FormEvent } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import Toast from './Toast';
import CoverageHoldNotice from './CoverageHoldNotice';
import { secretaryCoverageLocked } from '../utils/coverageHold';
import { REALTIME_EVENT, emitRealtimeRefresh } from '../utils/realtime';
import { bindPopup } from '../utils/popupDismiss';
import UserAvatar from './UserAvatar';
import { formatAssignment, withHomeDepartmentNote } from '../utils/studentAssignment';
import {
    CalendarDays,
    Clock,
    Plus,
    Users,
    CheckCircle2,
    AlertCircle,
    Trash2,
    Pencil,
    X,
    ChevronLeft,
    ChevronRight,
    MapPin,
    Briefcase,
    Send,
    GraduationCap,
    FileText,
    Paperclip,
    Printer,
    Sparkles,
} from 'lucide-react';
import AuditPager, { pageSlice } from './AuditPager';
import ComboFilter from './ComboFilter';
import MultiComboFilter from './MultiComboFilter';
import WsaExtraServiceLetter, { printExtraServiceLetter } from './staffing/WsaExtraServiceLetter';
import SecureFileViewerModal from './SecureFileViewerModal';
import { workShiftDutyOptions } from '../constants/workShiftDutyTypes';
import { formatScheduleRange } from '../utils/scheduleTime';
import ClockTimeInput from './ClockTimeInput';
import { HelpDisclosure } from './HelpDisclosure';

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

function formatExtraServiceDate(iso: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return '';
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatDutyPeriod(startDate: string, endDate: string, hoursPerDay: number | string) {
    const start = formatExtraServiceDate(startDate);
    const end = formatExtraServiceDate(endDate);
    const hours = Number(hoursPerDay);
    if (!start || !end || !Number.isFinite(hours) || hours <= 0) return '';
    const hoursLabel = hours === 1 ? '1 hour/day' : `${hours} hours/day`;
    if (startDate === endDate) {
        return `${start} · ${hoursLabel}`;
    }
    return `${start} – ${end} · ${hoursLabel}`;
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

const MAX_SCHEDULE_SLOTS = 20;

interface ScheduleSlot {
    key: string;
    kind: 'work' | 'class';
    days: string[];
    startTime: string;
    endTime: string;
    duty_type: string;
    subject: string;
    room: string;
    instructor: string;
}

let scheduleSlotSerial = 0;

function createScheduleSlot(seed: Partial<Omit<ScheduleSlot, 'key'>> = {}): ScheduleSlot {
    scheduleSlotSerial += 1;
    return {
        key: `slot-${scheduleSlotSerial}`,
        kind: 'work',
        days: ['Monday'],
        startTime: '',
        endTime: '',
        duty_type: 'Clerical Work',
        subject: '',
        room: '',
        instructor: '',
        ...seed,
    };
}

function createScheduleForm(userIds: string[] | string = [], slots?: ScheduleSlot[]) {
    const ids = Array.isArray(userIds) ? userIds : userIds ? [userIds] : [];
    return {
        user_ids: ids,
        slots: slots && slots.length > 0 ? slots : [createScheduleSlot()],
    };
}

function slotLabel(kind: 'work' | 'class', index: number, total: number) {
    const noun = kind === 'class' ? 'Class' : 'Shift';
    return total > 1 ? `${noun} ${index + 1}` : noun;
}

function saveScheduleLabel(slots: ScheduleSlot[]) {
    const classCount = slots.filter((slot) => slot.kind === 'class').length;
    const workCount = slots.length - classCount;
    if (classCount > 0 && workCount > 0) {
        const classes = classCount === 1 ? '1 Class' : `${classCount} Classes`;
        const shifts = workCount === 1 ? '1 Shift' : `${workCount} Shifts`;
        return `Save ${classes} and ${shifts}`;
    }
    if (classCount > 1) return `Save ${classCount} Classes`;
    if (workCount > 1) return `Save ${workCount} Shifts`;
    if (classCount === 1) return 'Save Class';
    return 'Finalize Shift';
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
        assignment_area?: string | null;
        assignment_label?: string | null;
        course?: string | null;
        year_level?: string | number | null;
        gender?: string | null;
    };
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
        profile?: { assignment_label?: string | null; assigned_office?: string | null } | null;
    };
}

const ScheduleManagement = () => {
    const [students, setStudents] = useState<UserData[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [coverageHold, setCoverageHold] = useState(secretaryCoverageLocked);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const currentUserRole = localStorage.getItem('user_role') || '';
    const assignedOffice = (localStorage.getItem('assigned_office') || '').trim().toLowerCase();
    const canManageSchedules =
        currentUserRole === 'Super Admin' ||
        (currentUserRole === 'WSPO Staff' &&
            localStorage.getItem('is_student_officer') !== '1' &&
            ['', 'wspo', 'unassigned', 'wspo coordinator'].includes(assignedOffice));
    const canSetSemester = currentUserRole === 'WSPO Staff' || currentUserRole === 'Super Admin';
    const isAudit = currentUserRole === 'Super Admin';
    const [semester, setSemester] = useState<SemesterTerm | null>(null);
    const [semesterForm, setSemesterForm] = useState(() => {
        const starts_on = suggestedSemesterStart();
        return { label: '1st Semester', starts_on, ends_on: semesterEndDate(starts_on, 5), months: 5 };
    });
    const [semesterSaving, setSemesterSaving] = useState(false);
    const [auditFilters, setAuditFilters] = useState({ date: '', hour: '', minute: '', meridiem: '', department: '' });
    const [nameFilters, setNameFilters] = useState<string[]>([]);
    const [dayFilters, setDayFilters] = useState<string[]>([]);
    const [departments, setDepartments] = useState<string[]>([]);
    const [schedulePage, setSchedulePage] = useState(1);
    const [requestSlide, setRequestSlide] = useState(0);
    const [requestSlideDirection, setRequestSlideDirection] = useState(1);
    const [listKind, setListKind] = useState<'all' | 'work' | 'class'>('all');
    const [selectedScheduleIds, setSelectedScheduleIds] = useState<number[]>([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [entryKind, setEntryKind] = useState<'work' | 'class'>('work');
    const [staffingRequests, setStaffingRequests] = useState<any[]>([]);
    const [staffingCandidates, setStaffingCandidates] = useState<UserData[]>([]);
    const [assignmentSelections, setAssignmentSelections] = useState<Record<number, number[]>>({});
    const emptyStaffingForm = {
        duty_type: 'Clerical',
        duty_request: '',
        event_title: '',
        duty_start_date: '',
        duty_end_date: '',
        hours_per_day: 4,
        reason: '',
        quantity: 1,
        requested_genders: ['Male'] as string[],
    };
    const [staffingForm, setStaffingForm] = useState(emptyStaffingForm);
    const [approvalLetterFile, setApprovalLetterFile] = useState<File | null>(null);
    const [draftRequestId, setDraftRequestId] = useState<number | null>(null);
    const [coordinatorName, setCoordinatorName] = useState('');
    const [letterSaving, setLetterSaving] = useState(false);
    const [letterViewerPath, setLetterViewerPath] = useState<string | null>(null);
    const [letterViewerTitle, setLetterViewerTitle] = useState('Signed approval letter');
    const supervisorName = localStorage.getItem('user_name') || '';
    const supervisorDepartment = localStorage.getItem('assigned_office') || '';
    const isExtraServiceRequest = staffingForm.duty_type === 'Request';
    const letterDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const dutyPeriodLabel = formatDutyPeriod(
        staffingForm.duty_start_date,
        staffingForm.duty_end_date,
        staffingForm.hours_per_day
    );

    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const weekdayRank: Record<string, number> = {
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
        Sunday: 7,
    };
    const [formData, setFormData] = useState(() => createScheduleForm());
    const [editingId, setEditingId] = useState<number | null>(null);

    const openScheduleModal = (kind: 'work' | 'class') => {
        if (!semester) {
            showToast('Set the semester length before creating a schedule.', 'error');
            return;
        }
        setEditingId(null);
        setEntryKind(kind);
        setFormData(createScheduleForm([], [createScheduleSlot({ kind })]));
        setIsModalOpen(true);
    };

    const openEditSchedule = (schedule: Schedule) => {
        const times = splitScheduleTime(schedule.time);
        const kind = schedule.kind === 'class' ? 'class' : 'work';
        setEditingId(schedule.id);
        setEntryKind(kind);
        const storedSubject = (schedule.subject || '').trim();
        const dutyName = (schedule.duty_type || '').trim();
        setFormData(
            createScheduleForm([String(schedule.user_id)], [
                createScheduleSlot({
                    kind,
                    days: weekdays.includes(schedule.day) ? [schedule.day] : ['Monday'],
                    startTime: times.startTime,
                    endTime: times.endTime,
                    duty_type: kind === 'work' ? schedule.duty_type || 'Clerical Work' : 'Clerical Work',
                    subject: storedSubject || (kind === 'class' && dutyName !== '' && dutyName !== 'Class' ? dutyName : ''),
                    room: schedule.room || '',
                    instructor: schedule.instructor || (kind === 'class' ? schedule.supervisor : '') || '',
                }),
            ])
        );
        setIsModalOpen(true);
    };

    const closeScheduleModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
        setFormData(createScheduleForm());
    };

    const updateSlot = (key: string, patch: Partial<ScheduleSlot>) => {
        setFormData((current) => ({
            ...current,
            slots: current.slots.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)),
        }));
    };

    const toggleSlotDay = (key: string, day: string) => {
        setFormData((current) => ({
            ...current,
            slots: current.slots.map((slot) => {
                if (slot.key !== key) return slot;
                if (editingId) return { ...slot, days: [day] };
                const selected = slot.days.includes(day);
                return {
                    ...slot,
                    days: selected ? slot.days.filter((item) => item !== day) : [...slot.days, day],
                };
            }),
        }));
    };

    const addSlot = () => {
        if (formData.slots.length >= MAX_SCHEDULE_SLOTS) {
            showToast(`You can add up to ${MAX_SCHEDULE_SLOTS} at a time.`, 'error');
            return;
        }
        const slot = createScheduleSlot({ kind: formData.slots[formData.slots.length - 1]?.kind || entryKind });
        setFormData((current) => ({ ...current, slots: [...current.slots, slot] }));
        window.setTimeout(() => {
            document.getElementById(`schedule-slot-${slot.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 40);
    };

    const removeSlot = (key: string) => {
        setFormData((current) => ({
            ...current,
            slots: current.slots.filter((slot) => slot.key !== key),
        }));
    };

    useEffect(() => {
        if (secretaryCoverageLocked()) {
            setCoverageHold(true);
            setIsLoading(false);
            return;
        }
        fetchSemester();
        fetchStudents();
        fetchStaffingRequests();
        fetchExtraServiceSignatories();
        if (currentUserRole === 'WSPO Staff' || currentUserRole === 'Super Admin') {
            fetchStaffingCandidates();
        }
        if (isAudit) {
            axios
                .get('/api/offices')
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
    }, [currentPage, listKind, nameFilters, dayFilters]);

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
            const fieldError =
                error.response?.data?.errors?.label?.[0] ||
                error.response?.data?.errors?.starts_on?.[0] ||
                error.response?.data?.errors?.ends_on?.[0];
            showToast(fieldError || error.response?.data?.message || 'Failed to save the semester.', 'error');
        } finally {
            setSemesterSaving(false);
        }
    };

    const semesterDatesValid = Boolean(
        semesterForm.starts_on && semesterForm.ends_on && semesterForm.ends_on >= semesterForm.starts_on
    );

    const fetchStaffingRequests = async () => {
        if (secretaryCoverageLocked()) {
            setCoverageHold(true);
            return;
        }
        try {
            const response = await axios.get('/api/staffing-requests');
            setStaffingRequests(response.data);
        } catch (error) {
            console.error('Failed to fetch staffing requests', error);
        }
    };

    const fetchExtraServiceSignatories = async () => {
        if (secretaryCoverageLocked()) return;
        try {
            const response = await axios.get('/api/staffing-requests/signatories');
            setCoordinatorName(String(response.data?.coordinator || '').trim());
        } catch (error) {
            console.error('Failed to fetch Extra Service signatories', error);
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
            if (
                (request.requested_genders || []).length > 0 &&
                (gender === 'Male' || gender === 'Female') &&
                remaining[gender] <= 0
            ) {
                return current;
            }
            return { ...current, [requestId]: [...selected, studentId] };
        });
    };

    const assignedStudentNames = (request: any) => {
        const names = (request.assigned_students || []).map((student: UserData) => student.name).filter(Boolean);
        return names.length > 0 ? names.join(', ') : '';
    };

    const appendExtraServiceFields = (body: FormData) => {
        body.append('event_title', staffingForm.event_title.trim());
        body.append('duty_period', dutyPeriodLabel);
        body.append('duty_start_date', staffingForm.duty_start_date);
        body.append('duty_end_date', staffingForm.duty_end_date);
        body.append('hours_per_day', String(staffingForm.hours_per_day));
        body.append('reason', staffingForm.reason.trim());
        body.append('duty_request', staffingForm.reason.trim());
    };

    const validateExtraServiceForm = () => {
        if (!staffingForm.event_title.trim() || !dutyPeriodLabel || !staffingForm.reason.trim()) {
            showToast('Extra Service requests need an event title, duty dates, hours/day, and reason.', 'error');
            return false;
        }
        if (staffingForm.duty_end_date < staffingForm.duty_start_date) {
            showToast('Duty end date must be on or after the start date.', 'error');
            return false;
        }
        return true;
    };

    const buildExtraServiceJsonBody = () => ({
        event_title: staffingForm.event_title.trim(),
        duty_period: dutyPeriodLabel,
        duty_start_date: staffingForm.duty_start_date,
        duty_end_date: staffingForm.duty_end_date,
        hours_per_day: staffingForm.hours_per_day,
        reason: staffingForm.reason.trim(),
        quantity: staffingForm.quantity,
        requested_genders: staffingForm.requested_genders,
    });

    const submitStaffingRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isExtraServiceRequest) {
            if (!validateExtraServiceForm()) return;
            if (!approvalLetterFile) {
                showToast('Attach the signed Extra Service approval letter before submitting.', 'error');
                return;
            }
        }

        try {
            if (isExtraServiceRequest && draftRequestId) {
                const body = new FormData();
                appendExtraServiceFields(body);
                body.append('quantity', String(staffingForm.quantity));
                staffingForm.requested_genders.forEach((gender, index) => {
                    body.append(`requested_genders[${index}]`, gender);
                });
                body.append('approval_letter', approvalLetterFile as File);
                await axios.post(`/api/staffing-requests/${draftRequestId}/finalize`, body, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            } else {
                const body = new FormData();
                body.append('duty_type', staffingForm.duty_type);
                body.append('quantity', String(staffingForm.quantity));
                staffingForm.requested_genders.forEach((gender, index) => {
                    body.append(`requested_genders[${index}]`, gender);
                });

                if (isExtraServiceRequest) {
                    appendExtraServiceFields(body);
                    body.append('approval_letter', approvalLetterFile as File);
                } else if (staffingForm.duty_request.trim()) {
                    body.append('duty_request', staffingForm.duty_request.trim());
                }

                await axios.post('/api/staffing-requests', body, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            }
            setStaffingForm({ ...emptyStaffingForm, requested_genders: ['Male'] });
            setApprovalLetterFile(null);
            setDraftRequestId(null);
            showToast('Staffing request sent to WSPO.', 'success');
            fetchStaffingRequests();
        } catch (error: any) {
            const validation = error.response?.data?.errors;
            const firstValidation = validation ? Object.values(validation).flat()[0] : null;
            showToast(
                (typeof firstValidation === 'string' ? firstValidation : null) ||
                    error.response?.data?.message ||
                    'Could not send staffing request.',
                'error'
            );
        }
    };

    const handlePrintApprovalLetter = async () => {
        if (!validateExtraServiceForm()) return;

        setLetterSaving(true);
        try {
            if (draftRequestId) {
                await axios.patch(`/api/staffing-requests/${draftRequestId}/draft`, buildExtraServiceJsonBody());
            } else {
                const body = new FormData();
                body.append('duty_type', 'Request');
                body.append('as_draft', '1');
                body.append('quantity', String(staffingForm.quantity));
                staffingForm.requested_genders.forEach((gender, index) => {
                    body.append(`requested_genders[${index}]`, gender);
                });
                appendExtraServiceFields(body);
                const response = await axios.post('/api/staffing-requests', body, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                const savedId = Number(response.data?.request?.id);
                if (Number.isFinite(savedId)) {
                    setDraftRequestId(savedId);
                }
            }
            fetchStaffingRequests();
            showToast('Draft saved. Print the letter, then attach the signed scan to send it to WSPO.', 'success');
            printExtraServiceLetter();
        } catch (error: any) {
            const validation = error.response?.data?.errors;
            const firstValidation = validation ? Object.values(validation).flat()[0] : null;
            showToast(
                (typeof firstValidation === 'string' ? firstValidation : null) ||
                    error.response?.data?.message ||
                    'Could not save the Extra Service draft.',
                'error'
            );
        } finally {
            setLetterSaving(false);
        }
    };

    const resumeDraftRequest = (request: any) => {
        if (request.status !== 'Draft' || request.duty_type !== 'Request') return;
        const quantity = Math.max(1, Number(request.quantity) || 1);
        const genders =
            Array.isArray(request.requested_genders) && request.requested_genders.length === quantity
                ? request.requested_genders
                : Array.from({ length: quantity }, () => 'Male');
        setStaffingForm({
            duty_type: 'Request',
            duty_request: '',
            event_title: request.event_title || '',
            duty_start_date: String(request.duty_start_date || '').slice(0, 10),
            duty_end_date: String(request.duty_end_date || '').slice(0, 10),
            hours_per_day: Number(request.hours_per_day) || 4,
            reason: request.reason || request.duty_request || '',
            quantity,
            requested_genders: genders,
        });
        setDraftRequestId(request.id);
        setApprovalLetterFile(null);
        showToast('Draft loaded. Print again if needed, then attach the signed letter to submit.', 'success');
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
        if (secretaryCoverageLocked()) {
            setCoverageHold(true);
            return;
        }
        try {
            const response = await axios.get('/api/personnel');
            setStudents(response.data);
        } catch (error) {
            console.error('Failed to fetch students', error);
        }
    };

    const fetchSchedules = async (page: number, silent = false) => {
        if (secretaryCoverageLocked()) {
            setCoverageHold(true);
            if (!silent) setIsLoading(false);
            return;
        }
        setCoverageHold(false);
        if (!silent) setIsLoading(true);
        try {
            const kindQuery = listKind === 'all' ? '' : `&kind=${listKind}`;
            const nameQuery = !isAudit && nameFilters.length
                ? nameFilters.map((name) => `&names[]=${encodeURIComponent(name)}`).join('')
                : '';
            const dayQuery = !isAudit && dayFilters.length
                ? dayFilters.map((day) => `&days[]=${encodeURIComponent(day)}`).join('')
                : '';
            const response = await axios.get(
                isAudit
                    ? `/api/schedules?audit=1${kindQuery}`
                    : `/api/schedules?page=${page}${kindQuery}${nameQuery}${dayQuery}`
            );
            if (isAudit) {
                setSchedules(Array.isArray(response.data) ? response.data : []);
                setTotalPages(1);
            } else {
                setSchedules(response.data.data);
                setCurrentPage(response.data.current_page);
                setTotalPages(response.data.last_page);
            }
        } catch (error) {
            if (secretaryCoverageLocked()) {
                setCoverageHold(true);
                return;
            }
            console.error('Failed to fetch schedules', error);
            if (!silent) showToast('Failed to load schedules.', 'error');
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
    }, [currentPage, listKind, nameFilters, dayFilters]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const slots = editingId ? formData.slots.slice(0, 1) : formData.slots;
        for (let index = 0; index < slots.length; index += 1) {
            const slot = slots[index];
            const label = slotLabel(slot.kind, index, slots.length);
            if (slot.days.length === 0) {
                showToast(`Select at least one day for ${label.toLowerCase()}.`, 'error');
                setIsSubmitting(false);
                return;
            }
            if (!slot.startTime || !slot.endTime) {
                showToast(`Enter a start and end time for ${label.toLowerCase()}.`, 'error');
                setIsSubmitting(false);
                return;
            }
        }

        const slotPayload = (slot: ScheduleSlot) => {
            const time = `${slot.startTime} - ${slot.endTime}`;
            return slot.kind === 'class'
                ? {
                      kind: slot.kind,
                      days: slot.days,
                      time,
                      subject: slot.subject.trim(),
                      room: slot.room.trim(),
                      instructor: slot.instructor.trim(),
                  }
                : {
                      kind: slot.kind,
                      days: slot.days,
                      time,
                      duty_type: slot.duty_type,
                  };
        };

        try {
            if (editingId) {
                const slot = slots[0];
                const userId = formData.user_ids[0];
                if (!userId) {
                    showToast('Select a student worker.', 'error');
                    setIsSubmitting(false);
                    return;
                }
                await axios.put(`/api/schedules/${editingId}`, {
                    user_id: userId,
                    day: slot.days[0],
                    time: `${slot.startTime} - ${slot.endTime}`,
                    ...(slot.kind === 'class'
                        ? {
                              subject: slot.subject.trim(),
                              room: slot.room.trim(),
                              instructor: slot.instructor.trim(),
                          }
                        : { duty_type: slot.duty_type }),
                });
                showToast(entryKind === 'class' ? 'Class schedule updated.' : 'Work schedule updated.', 'success');
            } else {
                if (formData.user_ids.length === 0) {
                    showToast('Select at least one student worker.', 'error');
                    setIsSubmitting(false);
                    return;
                }
                const response = await axios.post('/api/schedules', {
                    user_ids: formData.user_ids.map((id) => Number(id)),
                    kind: entryKind,
                    entries: slots.map(slotPayload),
                });
                showToast(
                    response.data?.message ||
                        (entryKind === 'class' ? 'Class schedule saved.' : 'Shift assigned successfully!'),
                    'success'
                );
            }
            closeScheduleModal();
            fetchSchedules(currentPage);
        } catch (error: any) {
            showToast(
                error.response?.data?.message ||
                    (editingId
                        ? 'Failed to update schedule.'
                        : entryKind === 'class'
                          ? 'Failed to save class schedule.'
                          : 'Failed to assign shift.'),
                'error'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditAction = async (id: number, action: 'approve' | 'reject') => {
        try {
            const response = await axios.patch(`/api/schedules/${id}/resolve-request`, { action });
            showToast(
                response.data?.message || (action === 'approve' ? 'Edit request approved.' : 'Edit request rejected.'),
                'success'
            );
            fetchSchedules(currentPage);
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to process request.', 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this schedule?')) return;
        try {
            await axios.delete(`/api/schedules/${id}`);
            showToast('Schedule deleted successfully.', 'success');
            setSelectedScheduleIds((current) => current.filter((selectedId) => selectedId !== id));
            fetchSchedules(currentPage);
        } catch (error) {
            showToast('Failed to delete schedule.', 'error');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedScheduleIds.length === 0) return;
        const count = selectedScheduleIds.length;
        if (!confirm(`Delete ${count} selected schedule${count === 1 ? '' : 's'}? This cannot be undone.`)) return;
        setIsBulkDeleting(true);
        try {
            const response = await axios.delete('/api/schedules/bulk', {
                data: { ids: selectedScheduleIds },
            });
            showToast(response.data?.message || `${count} schedules removed.`, 'success');
            setSelectedScheduleIds([]);
            fetchSchedules(currentPage);
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to delete selected schedules.', 'error');
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.04 } },
    };

    const rowVariants: Variants = {
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
    };

    const auditWeekday = auditFilters.date
        ? new Date(`${auditFilters.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
        : '';

    const filteredRequests = useMemo(() => {
        if (!isAudit) return staffingRequests;
        const names = nameFilters.map((name) => name.trim().toLowerCase()).filter(Boolean);
        return staffingRequests.filter((request) => {
            if (auditFilters.department && request.department !== auditFilters.department) return false;
            if (auditFilters.date && String(request.created_at || '').slice(0, 10) !== auditFilters.date) return false;
            if (names.length > 0) {
                const haystack =
                    `${request.requester?.name || ''} ${request.department} ${(request.assigned_students || [])
                        .map((student: UserData) => student.name)
                        .join(' ')}`.toLowerCase();
                if (!names.some((name) => haystack.includes(name))) return false;
            }
            return true;
        });
    }, [isAudit, staffingRequests, auditFilters, nameFilters]);

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

    const applyNameFilters = (names: string[]) => {
        setNameFilters(names);
        setCurrentPage(1);
        setRequestSlide(0);
        setSchedulePage(1);
        setSelectedScheduleIds([]);
    };

    const applyDayFilters = (days: string[]) => {
        setDayFilters(days);
        setCurrentPage(1);
        setSchedulePage(1);
        setSelectedScheduleIds([]);
    };

    const listFiltersActive = nameFilters.length > 0 || dayFilters.length > 0;

    const filteredSchedules = useMemo(() => {
        if (!isAudit) return schedules;
        const names = nameFilters.map((name) => name.trim().toLowerCase()).filter(Boolean);
        return schedules.filter((schedule) => {
            if (auditFilters.department && schedule.department !== auditFilters.department) return false;
            if (auditWeekday && schedule.day !== auditWeekday) return false;
            if (!scheduleMatchesClock(schedule.time, auditFilters.hour, auditFilters.minute, auditFilters.meridiem)) {
                return false;
            }
            if (dayFilters.length > 0 && !dayFilters.includes(schedule.day)) return false;
            if (names.length > 0) {
                const haystack = `${schedule.user?.name || ''} ${schedule.supervisor || ''}`.toLowerCase();
                if (!names.some((name) => haystack.includes(name))) return false;
            }
            return true;
        });
    }, [isAudit, schedules, auditFilters, auditWeekday, nameFilters, dayFilters]);

    const pagedSchedules = pageSlice(filteredSchedules, schedulePage);
    const requestSlides = isAudit ? filteredRequests : staffingRequests;
    const requestSlideIndex = requestSlides.length === 0 ? 0 : Math.min(requestSlide, requestSlides.length - 1);
    const arrangeByWeekday = (rows: Schedule[]) =>
        [...rows].sort((left, right) => {
            const day = (weekdayRank[left.day] ?? 8) - (weekdayRank[right.day] ?? 8);
            if (day !== 0) return day;
            return String(left.time || '').localeCompare(String(right.time || ''));
        });
    const visibleSchedules = arrangeByWeekday(isAudit ? pagedSchedules.rows : schedules);
    const visibleScheduleIds = visibleSchedules.map((schedule) => schedule.id);
    const allVisibleSelected =
        visibleScheduleIds.length > 0 && visibleScheduleIds.every((id) => selectedScheduleIds.includes(id));

    const toggleScheduleSelection = (id: number) => {
        setSelectedScheduleIds((current) =>
            current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
        );
    };

    const toggleSelectVisibleSchedules = () => {
        setSelectedScheduleIds((current) => {
            if (allVisibleSelected) {
                return current.filter((id) => !visibleScheduleIds.includes(id));
            }
            return Array.from(new Set([...current, ...visibleScheduleIds]));
        });
    };

    const scheduleSlotsAreMixed =
        formData.slots.some((slot) => slot.kind === 'class') && formData.slots.some((slot) => slot.kind === 'work');
    const scheduleSlotsAreClass = formData.slots.length > 0 && formData.slots.every((slot) => slot.kind === 'class');

    if (coverageHold) {
        return <CoverageHoldNotice />;
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
            <SecureFileViewerModal
                filePath={letterViewerPath}
                title={letterViewerTitle}
                onClose={() => setLetterViewerPath(null)}
            />

            {/* OBSIDIAN SCHEDULE MASTER HERO */}
            <motion.header
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
            >
                <div
                    className="pointer-events-none absolute inset-0 opacity-20"
                    style={{
                        backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
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
                    <div className="min-w-0 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                                <CalendarDays className="h-3.5 w-3.5 text-blue-400" />
                                Timetable Management
                            </span>
                            {semester && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-300">
                                    <Sparkles className="h-3 w-3" />
                                    {semester.label}
                                </span>
                            )}
                        </div>

                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Schedule Master
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            {isAudit
                                ? 'Configure the semester window and manage or audit campus-wide class and work schedules.'
                                : canManageSchedules
                                  ? 'Configure the semester window and assign weekly work shifts and class schedules.'
                                  : 'Review assigned work shifts and class schedules for your department.'}
                        </p>
                    </div>

                    {canManageSchedules && (
                        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                            <button
                                type="button"
                                onClick={() => openScheduleModal('class')}
                                disabled={!semester}
                                className="inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/20 px-4 py-2.5 text-xs font-extrabold text-violet-200 backdrop-blur-md transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <GraduationCap className="h-4 w-4" />
                                Add Class
                            </button>
                            <button
                                type="button"
                                onClick={() => openScheduleModal('work')}
                                disabled={!semester}
                                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Plus className="h-4 w-4" />
                                Assign Shift
                            </button>
                        </div>
                    )}
                </div>
            </motion.header>

            {/* SEMESTER WINDOW CARD */}
            {canSetSemester ? (
                <form
                    onSubmit={saveSemester}
                    className="rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm"
                >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 className="text-base font-black tracking-tight text-slate-900">Semester Length</h2>
                            <p className="mt-0.5 max-w-2xl text-xs font-medium text-slate-500">
                                Define the active semester dates within which weekly schedules repeat.
                            </p>
                        </div>
                        {semester && (
                            <span className="inline-flex shrink-0 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                                {semester.label}: {formatSemesterDate(semester.starts_on)} – {formatSemesterDate(semester.ends_on)}
                            </span>
                        )}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
                        <label className="block">
                            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Semester
                            </span>
                            <input
                                value={semesterForm.label}
                                onChange={(event) =>
                                    setSemesterForm((current) => ({ ...current, label: event.target.value }))
                                }
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                placeholder="1st Semester"
                                maxLength={80}
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Starts
                            </span>
                            <input
                                type="date"
                                value={semesterForm.starts_on}
                                onChange={(event) => {
                                    const starts_on = event.target.value;
                                    setSemesterForm((current) => ({
                                        ...current,
                                        starts_on,
                                        ends_on:
                                            current.ends_on && current.ends_on >= starts_on
                                                ? current.ends_on
                                                : semesterEndDate(starts_on, current.months),
                                    }));
                                }}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Ends
                            </span>
                            <input
                                type="date"
                                value={semesterForm.ends_on}
                                min={semesterForm.starts_on}
                                onChange={(event) =>
                                    setSemesterForm((current) => ({ ...current, ends_on: event.target.value }))
                                }
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Length
                            </span>
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
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                            >
                                {SEMESTER_MONTH_OPTIONS.map((months) => (
                                    <option key={months} value={months}>
                                        {months} months
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="submit"
                            disabled={semesterSaving || !semesterDatesValid || !semesterForm.label.trim()}
                            className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {semesterSaving ? 'Saving…' : semester ? 'Update Semester' : 'Save Semester'}
                        </button>
                    </div>
                    {semesterForm.starts_on && semesterForm.ends_on && (
                        <p className={`mt-3 text-xs font-medium ${semesterDatesValid ? 'text-slate-500' : 'text-rose-600'}`}>
                            {semesterDatesValid ? (
                                <>
                                    Schedules repeat each week from{' '}
                                    <span className="font-bold text-slate-900">
                                        {formatSemesterDate(semesterForm.starts_on)}
                                    </span>{' '}
                                    through{' '}
                                    <span className="font-bold text-slate-900">
                                        {formatSemesterDate(semesterForm.ends_on)}
                                    </span>
                                    .
                                </>
                            ) : (
                                'The end date must be on or after the start date.'
                            )}
                        </p>
                    )}
                </form>
            ) : semester ? (
                <div className="rounded-2xl border border-slate-200/90 bg-white px-5 py-4 text-xs font-medium text-slate-600 shadow-xs">
                    <span className="font-extrabold text-slate-900">{semester.label}</span> runs{' '}
                    {formatSemesterDate(semester.starts_on)} through {formatSemesterDate(semester.ends_on)}. Weekly schedules repeat only inside that window.
                </div>
            ) : null}

            {/* SUPER ADMIN AUDIT FILTERS */}
            {isAudit && (
                <div className="grid grid-cols-1 items-end gap-3 rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-sm lg:grid-cols-[auto_1fr_auto_auto]">
                    <label className="block">
                        <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Date
                        </span>
                        <input
                            type="date"
                            value={auditFilters.date}
                            onChange={(event) => {
                                setAuditFilters({ ...auditFilters, date: event.target.value });
                                setRequestSlide(0);
                                setSchedulePage(1);
                            }}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-600 focus:bg-white"
                        />
                    </label>
                    <div>
                        <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Time
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                            <ComboFilter
                                value={auditFilters.hour}
                                onChange={(hour) => {
                                    setAuditFilters({ ...auditFilters, hour });
                                    setSchedulePage(1);
                                }}
                                options={HOUR_OPTIONS}
                                placeholder="Hour"
                                emptyLabel="Hour"
                            />
                            <ComboFilter
                                value={auditFilters.minute}
                                onChange={(minute) => {
                                    setAuditFilters({ ...auditFilters, minute });
                                    setSchedulePage(1);
                                }}
                                options={MINUTE_OPTIONS}
                                placeholder="Min"
                                emptyLabel="Min"
                            />
                            <ComboFilter
                                value={auditFilters.meridiem}
                                onChange={(meridiem) => {
                                    setAuditFilters({ ...auditFilters, meridiem: meridiem.toUpperCase() });
                                    setSchedulePage(1);
                                }}
                                options={['AM', 'PM']}
                                placeholder="AM/PM"
                                emptyLabel="AM/PM"
                            />
                        </div>
                    </div>
                    <label className="block min-w-[220px]">
                        <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Department
                        </span>
                        <ComboFilter
                            commitOnType={false}
                            value={auditFilters.department}
                            onChange={(department) => {
                                setAuditFilters({ ...auditFilters, department });
                                setRequestSlide(0);
                                setSchedulePage(1);
                            }}
                            options={departments}
                            placeholder="All departments"
                            emptyLabel="All departments"
                        />
                    </label>
                    <label className="block min-w-[220px]">
                        <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Names
                        </span>
                        <MultiComboFilter
                            values={nameFilters}
                            onChange={applyNameFilters}
                            options={studentNames}
                            placeholder="Filter by names"
                            emptyLabel="All names"
                        />
                    </label>
                    <label className="block min-w-[180px]">
                        <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Days
                        </span>
                        <MultiComboFilter
                            values={dayFilters}
                            onChange={applyDayFilters}
                            options={weekdays}
                            placeholder="Filter by days"
                            emptyLabel="All days"
                        />
                    </label>
                </div>
            )}

            <Toast message={toastMsg?.text ?? null} type={toastMsg?.type} onClose={() => setToastMsg(null)} />

            {/* STAFFING REQUESTS CONSOLE (Supervisor View) */}
            {currentUserRole === 'Supervisor' && (
                <motion.form
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={submitStaffingRequest}
                    className="flex flex-col gap-5 rounded-[1.75rem] border border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 via-white to-blue-50/40 p-6 shadow-sm sm:p-7"
                >
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
                            <Users className="h-5 w-5" />
                        </span>
                        <div>
                            <h2 className="text-base font-black tracking-tight text-slate-900">
                                Request Working Students
                            </h2>
                            <p className="mt-0.5 text-xs font-medium text-slate-500">
                                Submit an official request to WSPO to deploy student workers to your department.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4">
                        <div className="sm:col-span-2">
                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Duty Type
                            </label>
                            <select
                                value={staffingForm.duty_type}
                                onChange={(e) => {
                                    const duty_type = e.target.value;
                                    setStaffingForm({ ...staffingForm, duty_type });
                                    if (duty_type !== 'Request') {
                                        setApprovalLetterFile(null);
                                        setDraftRequestId(null);
                                    }
                                }}
                                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                            >
                                <option value="Clerical">Clerical</option>
                                <option value="Janitorial">Janitorial</option>
                                <option value="Request">Extra Service / Special Request</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Workers Needed
                            </label>
                            <input
                                required
                                min="1"
                                max="50"
                                type="number"
                                value={staffingForm.quantity}
                                onChange={(e) => setRequestedQuantity(Number(e.target.value))}
                                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                            />
                        </div>
                    </div>

                    {isExtraServiceRequest && (
                        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-indigo-200/70 bg-white p-5">
                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Event Title
                                </label>
                                <input
                                    required
                                    value={staffingForm.event_title}
                                    onChange={(e) => setStaffingForm({ ...staffingForm, event_title: e.target.value })}
                                    placeholder="e.g. University Foundation Day ushers"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-600/20"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Period of Duty
                                </label>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <div>
                                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            Start date
                                        </label>
                                        <input
                                            required
                                            type="date"
                                            value={staffingForm.duty_start_date}
                                            onChange={(e) => {
                                                const duty_start_date = e.target.value;
                                                setStaffingForm((current) => ({
                                                    ...current,
                                                    duty_start_date,
                                                    duty_end_date:
                                                        !current.duty_end_date || current.duty_end_date < duty_start_date
                                                            ? duty_start_date
                                                            : current.duty_end_date,
                                                }));
                                            }}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            End date
                                        </label>
                                        <input
                                            required
                                            type="date"
                                            min={staffingForm.duty_start_date || undefined}
                                            value={staffingForm.duty_end_date}
                                            onChange={(e) =>
                                                setStaffingForm({ ...staffingForm, duty_end_date: e.target.value })
                                            }
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            Hours / day
                                        </label>
                                        <input
                                            required
                                            type="number"
                                            min={1}
                                            max={12}
                                            step={0.5}
                                            value={staffingForm.hours_per_day}
                                            onChange={(e) =>
                                                setStaffingForm({
                                                    ...staffingForm,
                                                    hours_per_day: Math.min(12, Math.max(0.5, Number(e.target.value) || 0)),
                                                })
                                            }
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                                        />
                                    </div>
                                </div>
                                {dutyPeriodLabel && (
                                    <p className="mt-2 text-xs font-bold text-indigo-700">On letter: {dutyPeriodLabel}</p>
                                )}
                            </div>
                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Reason / Purpose
                                </label>
                                <textarea
                                    required
                                    rows={3}
                                    value={staffingForm.reason}
                                    onChange={(e) => setStaffingForm({ ...staffingForm, reason: e.target.value })}
                                    placeholder="Purpose of the Extra Service request"
                                    className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                                />
                            </div>

                            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="space-y-1.5">
                                    <p className="text-xs font-medium text-slate-500">
                                        {draftRequestId
                                            ? `Linked to Draft #${draftRequestId} — upload the signed letter below to transmit.`
                                            : 'Print the approval letter, collect wet signatures, then upload the signed scan.'}
                                    </p>
                                    <HelpDisclosure
                                        variant="inline"
                                        title="Extra Service letter guidelines"
                                        items={[
                                            'Clicking Save & Print Approval Letter saves a draft of this request automatically.',
                                            'Print the generated letter, collect the required wet signatures, then upload the signed PDF or image before transmitting to WSPO.',
                                        ]}
                                    />
                                </div>
                                <button
                                    type="button"
                                    disabled={letterSaving}
                                    onClick={handlePrintApprovalLetter}
                                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-60"
                                >
                                    <Printer className="h-4 w-4" />
                                    {letterSaving ? 'Saving draft…' : 'Save & Print Approval Letter'}
                                </button>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Attach Signed Approval Letter
                                </label>
                                <label className="flex cursor-pointer flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3.5 transition-colors hover:border-indigo-400 sm:flex-row sm:items-center">
                                    <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                                        <Paperclip className="h-4 w-4 text-indigo-600" />
                                        {approvalLetterFile ? approvalLetterFile.name : 'Choose PDF or image (max 4MB)'}
                                    </span>
                                    <input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                        className="sr-only"
                                        onChange={(e) => setApprovalLetterFile(e.target.files?.[0] ?? null)}
                                    />
                                </label>
                            </div>

                            <WsaExtraServiceLetter
                                data={{
                                    date: letterDate,
                                    department: supervisorDepartment,
                                    supervisorName,
                                    coordinatorName,
                                    eventTitle: staffingForm.event_title,
                                    reason: staffingForm.reason,
                                    dutyPeriod: dutyPeriodLabel,
                                    quantity: staffingForm.quantity,
                                    genderSummary: genderSummary(staffingForm.requested_genders),
                                }}
                            />
                        </div>
                    )}

                    <div>
                        <label className="mb-2.5 block border-b border-indigo-200/50 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            Gender Allocation for Requested Slots
                        </label>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                            {staffingForm.requested_genders.map((gender, index) => (
                                <div key={`gender-slot-${index}`} className="rounded-xl border border-slate-200 bg-white p-2.5">
                                    <p className="mb-1.5 px-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                        Slot {index + 1}
                                    </p>
                                    <select
                                        value={gender}
                                        onChange={(e) => setSlotGender(index, e.target.value)}
                                        className="w-full rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600"
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-1">
                        <button className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-indigo-600">
                            <Send className="h-4 w-4" />
                            Transmit Request
                        </button>
                    </div>
                </motion.form>
            )}

            {/* STAFFING REQUESTS CAROUSEL */}
            {(isAudit ? filteredRequests.length > 0 || staffingRequests.length > 0 : staffingRequests.length > 0) && (
                <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="flex items-center gap-2.5 text-base font-black tracking-tight text-slate-900">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                                <Briefcase className="h-4 w-4" />
                            </span>
                            {currentUserRole === 'Supervisor'
                                ? 'Your Active Staffing Requests'
                                : isAudit
                                  ? 'Department Requests'
                                  : 'Pending Department Requests'}
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
                                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
                                >
                                    <ChevronLeft className="h-4 w-4" /> Previous
                                </button>
                                <span className="min-w-[4.5rem] text-center font-mono text-xs font-extrabold text-slate-700">
                                    {requestSlideIndex + 1} / {requestSlides.length}
                                </span>
                                <button
                                    type="button"
                                    disabled={requestSlideIndex >= requestSlides.length - 1}
                                    onClick={() => {
                                        setRequestSlideDirection(1);
                                        setRequestSlide(requestSlideIndex + 1);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
                                >
                                    Next <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {requestSlides.length === 0 ? (
                        <div className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-12 text-center text-sm font-medium text-slate-500">
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
                                            initial={{ opacity: 0, x: requestSlideDirection * 32 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: requestSlideDirection * -32 }}
                                            transition={{ duration: 0.22 }}
                                            className="flex flex-col justify-between rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm"
                                        >
                                            <div>
                                                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <h3 className="text-base font-black tracking-tight text-slate-900">
                                                            {request.department}
                                                        </h3>
                                                        <p className="mt-0.5 text-sm font-extrabold text-indigo-700">
                                                            {request.quantity}{' '}
                                                            {request.duty_type === 'Request' ? 'Extra Service' : request.duty_type}{' '}
                                                            Worker{request.quantity !== 1 ? 's' : ''}
                                                        </p>
                                                        <p className="mt-1 text-xs font-medium text-slate-500">
                                                            Requested by:{' '}
                                                            <span className="font-bold text-slate-800">
                                                                {request.requester?.name}
                                                            </span>
                                                        </p>

                                                        {request.event_title && (
                                                            <p className="mt-2 flex items-start gap-1.5 text-sm font-bold text-slate-800">
                                                                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                                                                {request.event_title}
                                                            </p>
                                                        )}

                                                        {request.duty_period && (
                                                            <p className="mt-1 text-xs font-semibold text-slate-600">
                                                                Period: {request.duty_period}
                                                            </p>
                                                        )}

                                                        {(request.reason || request.duty_request) && (
                                                            <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                                                                <p className="text-xs italic text-slate-600">
                                                                    &ldquo;{request.reason || request.duty_request}&rdquo;
                                                                </p>
                                                            </div>
                                                        )}

                                                        {request.approval_letter_path && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setLetterViewerTitle(
                                                                        request.event_title
                                                                            ? `Extra Service letter · ${request.event_title}`
                                                                            : 'Signed Extra Service letter'
                                                                    );
                                                                    setLetterViewerPath(request.approval_letter_path);
                                                                }}
                                                                className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-700 hover:underline"
                                                            >
                                                                <Paperclip className="h-3.5 w-3.5" />
                                                                View signed approval letter
                                                            </button>
                                                        )}

                                                        {(request.gender_summary ||
                                                            genderSummary(request.requested_genders || [])) && (
                                                            <div className="mt-3 inline-flex rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                                                                Req:{' '}
                                                                {request.gender_summary ||
                                                                    genderSummary(request.requested_genders || [])}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <span
                                                        className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest ${
                                                            request.status === 'Draft'
                                                                ? 'border-slate-200 bg-slate-100 text-slate-700'
                                                                : request.status === 'Pending'
                                                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                                  : request.status === 'Declined'
                                                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                        }`}
                                                    >
                                                        {request.status}
                                                    </span>
                                                </div>

                                                {assignedNames && (
                                                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
                                                        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
                                                            Assigned Personnel
                                                        </p>
                                                        <p className="text-sm font-bold text-emerald-950">{assignedNames}</p>
                                                    </div>
                                                )}

                                                {currentUserRole === 'Supervisor' && request.status === 'Draft' && (
                                                    <div className="mt-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => resumeDraftRequest(request)}
                                                            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100"
                                                        >
                                                            <FileText className="h-3.5 w-3.5" />
                                                            Resume draft to print / attach letter
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* WSPO Staff Deployment Selector */}
                                            {!isAudit && currentUserRole !== 'Supervisor' && request.status === 'Pending' && (
                                                <div className="mt-4 border-t border-slate-100 pt-4">
                                                    <label className="mb-2 flex justify-between text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                        <span>Select Personnel to Deploy</span>
                                                        <span
                                                            className={
                                                                selectedIds.length === request.quantity
                                                                    ? 'text-emerald-600'
                                                                    : 'text-indigo-600'
                                                            }
                                                        >
                                                            {selectedIds.length} of {request.quantity} selected
                                                        </span>
                                                    </label>

                                                    <div className="custom-scrollbar mb-4 max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/50">
                                                        {staffingCandidates.map((student) => {
                                                            const gender = studentGender(student);
                                                            const remaining = remainingGenders(request, selectedIds);
                                                            const genderLocked = (request.requested_genders || []).length > 0;
                                                            const genderFull =
                                                                genderLocked &&
                                                                (gender === 'Male' || gender === 'Female') &&
                                                                remaining[gender] <= 0 &&
                                                                !selectedIds.includes(student.id);
                                                            const missingGender =
                                                                genderLocked && gender !== 'Male' && gender !== 'Female';

                                                            return (
                                                                <label
                                                                    key={student.id}
                                                                    className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                                                                        genderFull || missingGender
                                                                            ? 'opacity-40 grayscale'
                                                                            : 'cursor-pointer hover:bg-white'
                                                                    }`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        disabled={genderFull || missingGender}
                                                                        checked={selectedIds.includes(student.id)}
                                                                        onChange={() =>
                                                                            toggleAssignedStudent(
                                                                                request.id,
                                                                                student.id,
                                                                                request
                                                                            )
                                                                        }
                                                                        className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                                                                    />
                                                                    <div className="flex flex-col">
                                                                        <span className="text-sm font-bold text-slate-900">
                                                                            {student.name}
                                                                        </span>
                                                                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                                                                            {gender || 'No gender'} ·{' '}
                                                                            <MapPin className="h-3 w-3" />
                                                                            {student.profile?.assignment_label ||
                                                                                formatAssignment(
                                                                                    student.profile?.assigned_office,
                                                                                    student.profile?.assignment_area
                                                                                ) ||
                                                                                'Unassigned'}
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
                                                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                                                        >
                                                            <CheckCircle2 className="h-4 w-4" />
                                                            Approve &amp; Assign
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateStaffingRequest(request.id, 'Declined')}
                                                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
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

            {/* FILTER & KIND BAR */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="inline-flex flex-wrap rounded-xl border border-slate-200/90 bg-white p-1 shadow-2xs">
                    {(
                        [
                            ['all', 'All schedules'],
                            ['work', 'Work shifts'],
                            ['class', 'Class schedules'],
                        ] as const
                    ).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => {
                                setListKind(value);
                                setCurrentPage(1);
                                setSchedulePage(1);
                                setSelectedScheduleIds([]);
                            }}
                            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
                                listKind === value
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {!isAudit && (
                    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[28rem]">
                        <label className="block">
                            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Filter by names
                            </span>
                            <MultiComboFilter
                                values={nameFilters}
                                onChange={applyNameFilters}
                                options={studentNames}
                                placeholder="Select names"
                                emptyLabel="All names"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Filter by days
                            </span>
                            <MultiComboFilter
                                values={dayFilters}
                                onChange={applyDayFilters}
                                options={weekdays}
                                placeholder="Select days"
                                emptyLabel="All days"
                            />
                        </label>
                    </div>
                )}
            </div>

            {/* BULK DELETE BAR */}
            {canManageSchedules && selectedScheduleIds.length > 0 && (
                <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-extrabold text-rose-800">
                        {selectedScheduleIds.length} schedule{selectedScheduleIds.length === 1 ? '' : 's'} selected
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedScheduleIds([])}
                            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                        >
                            Clear selection
                        </button>
                        <button
                            type="button"
                            onClick={handleBulkDelete}
                            disabled={isBulkDeleting}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            {isBulkDeleting ? 'Deleting…' : 'Delete selected'}
                        </button>
                    </div>
                </div>
            )}

            {/* MAIN SCHEDULES TABLE */}
            <section className="relative min-h-[400px] overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                {isLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                            <span className="text-xs font-extrabold uppercase tracking-widest text-blue-700">
                                Loading schedules…
                            </span>
                        </div>
                    </div>
                )}

                <div className="custom-scrollbar overflow-x-auto">
                    <table className="app-data-table w-full min-w-[760px] border-collapse text-left">
                        <thead>
                            <tr className="bg-slate-950 text-white">
                                {canManageSchedules && (
                                    <th className="w-12 px-4 py-4">
                                        <input
                                            type="checkbox"
                                            aria-label="Select all schedules on this page"
                                            checked={allVisibleSelected}
                                            onChange={toggleSelectVisibleSchedules}
                                            className="h-4 w-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500"
                                        />
                                    </th>
                                )}
                                <th className="px-4 py-4 text-[11px] font-extrabold uppercase tracking-widest">Student</th>
                                <th className="px-4 py-4 text-[11px] font-extrabold uppercase tracking-widest">Day</th>
                                <th className="px-4 py-4 text-[11px] font-extrabold uppercase tracking-widest">Time</th>
                                <th className="px-4 py-4 text-[11px] font-extrabold uppercase tracking-widest">Type</th>
                                <th className="px-4 py-4 text-[11px] font-extrabold uppercase tracking-widest">Details</th>
                                <th className="px-4 py-4 text-right text-[11px] font-extrabold uppercase tracking-widest">
                                    Actions
                                </th>
                            </tr>
                        </thead>

                        <motion.tbody
                            variants={containerVariants}
                            initial="hidden"
                            animate={!isLoading ? 'show' : 'hidden'}
                            className="divide-y divide-slate-100"
                        >
                            {!isLoading && visibleSchedules.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={canManageSchedules ? 7 : 6}
                                        className="px-6 py-16 text-center text-slate-400"
                                    >
                                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                            <CalendarDays className="h-7 w-7" />
                                        </div>
                                        <p className="text-sm font-extrabold text-slate-700">
                                            {listFiltersActive ? 'No schedules match these filters' : 'No schedules found'}
                                        </p>
                                        <p className="mt-1 text-xs font-medium text-slate-400">
                                            {listFiltersActive
                                                ? 'Choose another name or day, or clear the filters.'
                                                : canManageSchedules
                                                  ? 'Assign a work shift or add a class schedule.'
                                                  : 'The WSPO coordinator, secretary, or a super admin has not recorded a schedule yet.'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                visibleSchedules.map((schedule) => {
                                    const isSelected = selectedScheduleIds.includes(schedule.id);
                                    const isClass = schedule.kind === 'class';
                                    return (
                                        <motion.tr
                                            variants={rowVariants}
                                            key={schedule.id}
                                            className={`group transition-colors ${
                                                isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'
                                            }`}
                                        >
                                            {canManageSchedules && (
                                                <td className="px-4 py-4 align-middle">
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`Select schedule for ${schedule.user?.name || 'student'}`}
                                                        checked={isSelected}
                                                        onChange={() => toggleScheduleSelection(schedule.id)}
                                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                                                    />
                                                </td>
                                            )}

                                            <td className="px-4 py-4 align-middle">
                                                <div className="flex min-w-[12rem] items-center gap-3">
                                                    <UserAvatar
                                                        name={schedule.user?.name}
                                                        picture={schedule.user?.profile_picture}
                                                        className="h-9 w-9 shrink-0 rounded-full border border-blue-100 bg-blue-50 text-sm text-blue-700"
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-extrabold text-slate-900">
                                                            {schedule.user?.name || 'Unknown User'}
                                                        </p>
                                                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-slate-500">
                                                            <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                                                            {schedule.user?.profile?.assignment_label || schedule.department}
                                                        </p>
                                                        {schedule.user?.deleted_at && (
                                                            <span className="mt-1 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                                Account deleted
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-4 py-4 align-middle">
                                                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                                                    {schedule.day}
                                                </span>
                                            </td>

                                            <td className="px-4 py-4 align-middle">
                                                <div className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-xs font-bold tabular-nums text-slate-900">
                                                    <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                    {formatScheduleRange(schedule.time)}
                                                </div>
                                            </td>

                                            <td className="px-4 py-4 align-middle">
                                                <span
                                                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                        isClass
                                                            ? 'border-violet-200 bg-violet-50 text-violet-700'
                                                            : 'border-sky-200 bg-sky-50 text-sky-700'
                                                    }`}
                                                >
                                                    {isClass ? (
                                                        <GraduationCap className="h-3 w-3" />
                                                    ) : (
                                                        <Briefcase className="h-3 w-3" />
                                                    )}
                                                    {isClass ? 'Class' : 'Work'}
                                                </span>
                                            </td>

                                            <td className="max-w-[16rem] px-4 py-4 align-middle">
                                                {isClass ? (
                                                    <>
                                                        <p className="truncate text-sm font-bold text-slate-900">
                                                            {schedule.subject || schedule.duty_type || 'Class'}
                                                        </p>
                                                        <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                                                            {[schedule.room, schedule.instructor || schedule.supervisor]
                                                                .filter(Boolean)
                                                                .join(' · ') || 'No room or instructor'}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <p className="truncate text-sm font-bold text-slate-900">
                                                        {schedule.duty_type || 'Work shift'}
                                                    </p>
                                                )}

                                                {schedule.edit_request_status === 'pending' && (
                                                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                                                        <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                                                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                            Edit requested
                                                        </p>
                                                        {schedule.edit_request_note && (
                                                            <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-snug text-amber-900">
                                                                {schedule.edit_request_note}
                                                            </p>
                                                        )}
                                                        {canManageSchedules && (
                                                            <div className="mt-2 flex gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleEditAction(schedule.id, 'approve')}
                                                                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white transition hover:bg-emerald-700"
                                                                >
                                                                    Approve
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleEditAction(schedule.id, 'reject')}
                                                                    className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-rose-600 transition hover:bg-rose-50"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-4 py-4 text-right align-middle">
                                                {canManageSchedules ? (
                                                    <div className="inline-flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditSchedule(schedule)}
                                                            className="rounded-xl p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                                                            aria-label={isClass ? 'Edit class schedule' : 'Edit work schedule'}
                                                            title={isClass ? 'Edit class schedule' : 'Edit work schedule'}
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(schedule.id)}
                                                            className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                                            aria-label="Remove schedule"
                                                            title="Remove schedule"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400">—</span>
                                                )}
                                            </td>
                                        </motion.tr>
                                    );
                                })
                            )}
                        </motion.tbody>
                    </table>
                </div>

                {isAudit ? (
                    <AuditPager
                        page={pagedSchedules.page}
                        totalPages={pagedSchedules.totalPages}
                        total={pagedSchedules.total}
                        onPage={setSchedulePage}
                    />
                ) : (
                    !isLoading &&
                    schedules.length > 0 && (
                        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row">
                            <span className="text-xs font-semibold text-slate-500">
                                Showing page <span className="font-extrabold text-slate-900">{currentPage}</span> of{' '}
                                <span className="font-extrabold text-slate-900">{totalPages}</span>
                            </span>
                            <div className="flex gap-2">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => {
                                        setCurrentPage((p) => p - 1);
                                        setSelectedScheduleIds([]);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
                                >
                                    <ChevronLeft className="h-4 w-4" /> Prev
                                </button>
                                <button
                                    disabled={currentPage === totalPages}
                                    onClick={() => {
                                        setCurrentPage((p) => p + 1);
                                        setSelectedScheduleIds([]);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
                                >
                                    Next <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )
                )}
            </section>

            {/* OBSIDIAN ASSIGN / EDIT SCHEDULE MODAL */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(closeScheduleModal)}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="my-auto w-full max-w-2xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        >
                            <div className="sticky top-0 z-10 flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
                                <h3 className="flex items-center gap-2.5 text-base font-black tracking-tight">
                                    {editingId ? (
                                        entryKind === 'class' ? (
                                            <>
                                                <GraduationCap className="h-5 w-5 text-violet-400" />
                                                Edit Class Schedule
                                            </>
                                        ) : (
                                            <>
                                                <Pencil className="h-5 w-5 text-blue-400" />
                                                Edit Work Schedule
                                            </>
                                        )
                                    ) : scheduleSlotsAreMixed ? (
                                        <>
                                            <CalendarDays className="h-5 w-5 text-blue-400" />
                                            Add Classes &amp; Shifts
                                        </>
                                    ) : scheduleSlotsAreClass ? (
                                        <>
                                            <GraduationCap className="h-5 w-5 text-violet-400" />
                                            Add Class Schedule
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="h-5 w-5 text-blue-400" />
                                            Assign New Shift
                                        </>
                                    )}
                                </h3>
                                <button
                                    type="button"
                                    onClick={closeScheduleModal}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <form
                                onSubmit={handleSubmit}
                                className="custom-scrollbar max-h-[75vh] space-y-5 overflow-y-auto p-6 sm:p-7"
                            >
                                <HelpDisclosure
                                    variant="inline"
                                    title="Scheduling rules"
                                    items={
                                        editingId
                                            ? [
                                                  'Changes update only the selected schedule entry.',
                                                  'The updated time cannot overlap another class or work shift on the same day.',
                                              ]
                                            : [
                                                  'Add all class blocks and work shifts for this student before saving.',
                                                  'Class blocks only require a start and end time; times cannot overlap on the same day.',
                                                  'Student duty clock-in follows assigned work shifts only.',
                                              ]
                                    }
                                />

                                <div>
                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        {editingId ? 'Select Student Worker' : 'Select Student Workers'}
                                    </label>
                                    {editingId ? (
                                        <select
                                            required
                                            value={formData.user_ids[0] || ''}
                                            onChange={(e) =>
                                                setFormData({ ...formData, user_ids: e.target.value ? [e.target.value] : [] })
                                            }
                                            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                        >
                                            <option value="" disabled>
                                                -- Select a student --
                                            </option>
                                            {editingId &&
                                                !students.some((student) => String(student.id) === formData.user_ids[0]) && (
                                                    <option value={formData.user_ids[0]}>
                                                        {schedules.find((schedule) => schedule.id === editingId)?.user
                                                            ?.name || 'Current student'}
                                                    </option>
                                                )}
                                            {students.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {withHomeDepartmentNote(
                                                        `${s.name} (${
                                                            s.profile?.assignment_label ||
                                                            formatAssignment(
                                                                s.profile?.assigned_office,
                                                                s.profile?.assignment_area
                                                            ) ||
                                                            'Unassigned'
                                                        })`,
                                                        s.profile?.course,
                                                        s.profile?.assigned_office,
                                                        s.profile?.year_level
                                                    )}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="custom-scrollbar max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2">
                                            {students.length === 0 ? (
                                                <p className="px-3 py-4 text-xs font-medium text-slate-500">
                                                    No schedulable students found.
                                                </p>
                                            ) : (
                                                students.map((s) => {
                                                    const id = String(s.id);
                                                    const checked = formData.user_ids.includes(id);
                                                    return (
                                                        <label
                                                            key={s.id}
                                                            className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() =>
                                                                    setFormData((current) => ({
                                                                        ...current,
                                                                        user_ids: checked
                                                                            ? current.user_ids.filter((item) => item !== id)
                                                                            : [...current.user_ids, id],
                                                                    }))
                                                                }
                                                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                                                            />
                                                            <span className="text-sm font-bold text-slate-800">
                                                                {withHomeDepartmentNote(
                                                                    `${s.name} (${
                                                                        s.profile?.assignment_label ||
                                                                        formatAssignment(
                                                                            s.profile?.assigned_office,
                                                                            s.profile?.assignment_area
                                                                        ) ||
                                                                        'Unassigned'
                                                                    })`,
                                                                    s.profile?.course,
                                                                    s.profile?.assigned_office,
                                                                    s.profile?.year_level
                                                                )}
                                                            </span>
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                    {!editingId && formData.user_ids.length > 0 && (
                                        <p className="mt-2 text-[11px] font-semibold text-slate-500">
                                            {formData.user_ids.length} student
                                            {formData.user_ids.length === 1 ? '' : 's'} selected
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    {formData.slots.map((slot, index) => {
                                        const label = slotLabel(slot.kind, index, editingId ? 1 : formData.slots.length);
                                        const isClass = slot.kind === 'class';
                                        const selectedDayClass = isClass
                                            ? 'border-violet-600 bg-violet-600 text-white'
                                            : 'border-blue-600 bg-blue-600 text-white';
                                        const fieldClass = `w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 ${
                                            isClass
                                                ? 'focus:border-violet-600 focus:ring-violet-600/20'
                                                : 'focus:border-blue-600 focus:ring-blue-600/20'
                                        }`;

                                        return (
                                            <div
                                                key={slot.key}
                                                id={`schedule-slot-${slot.key}`}
                                                className="space-y-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 sm:p-5"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                        {label}
                                                    </p>
                                                    {!editingId && formData.slots.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeSlot(slot.key)}
                                                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>

                                                {!editingId && (
                                                    <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => updateSlot(slot.key, { kind: 'class' })}
                                                            className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                                                                isClass
                                                                    ? 'bg-violet-600 text-white'
                                                                    : 'text-slate-500 hover:text-slate-900'
                                                            }`}
                                                        >
                                                            Class
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateSlot(slot.key, { kind: 'work' })}
                                                            className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                                                                !isClass
                                                                    ? 'bg-blue-600 text-white'
                                                                    : 'text-slate-500 hover:text-slate-900'
                                                            }`}
                                                        >
                                                            Work shift
                                                        </button>
                                                    </div>
                                                )}

                                                <div>
                                                    <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                        {editingId ? 'Day' : 'Days of the week'}
                                                    </label>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {weekdays.map((day) => {
                                                            const selected = slot.days.includes(day);
                                                            return (
                                                                <button
                                                                    key={day}
                                                                    type="button"
                                                                    onClick={() => toggleSlotDay(slot.key, day)}
                                                                    className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                                                                        selected
                                                                            ? selectedDayClass
                                                                            : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'
                                                                    }`}
                                                                >
                                                                    {day}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {isClass ? (
                                                    <div className="space-y-4">
                                                        <div>
                                                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                                Subject{' '}
                                                                <span className="font-medium normal-case tracking-normal text-slate-400">
                                                                    (optional)
                                                                </span>
                                                            </label>
                                                            <input
                                                                value={slot.subject}
                                                                onChange={(e) =>
                                                                    updateSlot(slot.key, { subject: e.target.value })
                                                                }
                                                                placeholder="e.g. CS 301 Data Structures"
                                                                className={`${fieldClass} placeholder:font-medium placeholder:text-slate-400`}
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                            <div>
                                                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                                    Room
                                                                </label>
                                                                <input
                                                                    value={slot.room}
                                                                    onChange={(e) =>
                                                                        updateSlot(slot.key, { room: e.target.value })
                                                                    }
                                                                    placeholder="e.g. CCS 204"
                                                                    className={`${fieldClass} placeholder:font-medium placeholder:text-slate-400`}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                                    Instructor
                                                                </label>
                                                                <input
                                                                    value={slot.instructor}
                                                                    onChange={(e) =>
                                                                        updateSlot(slot.key, {
                                                                            instructor: e.target.value,
                                                                        })
                                                                    }
                                                                    placeholder="e.g. Prof. Cruz"
                                                                    className={`${fieldClass} placeholder:font-medium placeholder:text-slate-400`}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                            Duty Type
                                                        </label>
                                                        <select
                                                            value={slot.duty_type}
                                                            onChange={(e) =>
                                                                updateSlot(slot.key, { duty_type: e.target.value })
                                                            }
                                                            className={`${fieldClass} cursor-pointer`}
                                                        >
                                                            {workShiftDutyOptions(slot.duty_type).map((duty) => (
                                                                <option key={duty} value={duty}>
                                                                    {duty}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                            Start Time
                                                        </label>
                                                        <ClockTimeInput
                                                            required
                                                            value={slot.startTime}
                                                            onChange={(value) =>
                                                                updateSlot(slot.key, { startTime: value })
                                                            }
                                                            className={`${fieldClass} cursor-pointer`}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                            End Time
                                                        </label>
                                                        <ClockTimeInput
                                                            required
                                                            value={slot.endTime}
                                                            onChange={(value) =>
                                                                updateSlot(slot.key, { endTime: value })
                                                            }
                                                            className={`${fieldClass} cursor-pointer`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {!editingId && (
                                    <button
                                        type="button"
                                        onClick={addSlot}
                                        className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-xs font-extrabold uppercase tracking-wider transition-colors ${
                                            entryKind === 'class'
                                                ? 'border-violet-300 text-violet-700 hover:bg-violet-50'
                                                : 'border-blue-300 text-blue-700 hover:bg-blue-50'
                                        }`}
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add another class or shift
                                    </button>
                                )}

                                <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-5">
                                    <button
                                        type="button"
                                        onClick={closeScheduleModal}
                                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md transition disabled:opacity-50 ${
                                            scheduleSlotsAreMixed
                                                ? 'bg-slate-900 hover:bg-slate-800'
                                                : scheduleSlotsAreClass
                                                  ? 'bg-violet-600 hover:bg-violet-700'
                                                  : 'bg-blue-600 hover:bg-blue-700'
                                        }`}
                                    >
                                        {isSubmitting ? (
                                            'Saving…'
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-4 w-4" />
                                                {editingId ? 'Save Changes' : saveScheduleLabel(formData.slots)}
                                            </>
                                        )}
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