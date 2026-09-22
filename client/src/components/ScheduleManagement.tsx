import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { 
    CalendarDays, 
    Clock, 
    Plus, 
    User, 
    CheckCircle2, 
    AlertCircle, 
    Trash2, 
    Check, 
    X,
    ChevronLeft,
    ChevronRight,
    MapPin
} from 'lucide-react';

interface UserData {
    id: number;
    name: string;
    gender?: string | null;
    profile?: {
        assigned_office?: string;
        gender?: string | null;
    }
}

interface Schedule {
    id: number;
    user_id: number;
    day: string;
    time: string;
    duty_type: string;
    department: string;
    supervisor: string;
    edit_request_status?: string;
    edit_request_note?: string;
    user?: {
        name: string;
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
    const [staffingRequests, setStaffingRequests] = useState<any[]>([]);
    const [staffingCandidates, setStaffingCandidates] = useState<UserData[]>([]);
    const [assignmentSelections, setAssignmentSelections] = useState<Record<number, number[]>>({});
    const [staffingForm, setStaffingForm] = useState({ duty_type: 'Clerical', duty_request: '', quantity: 1, requested_genders: ['Male'] });

    const [formData, setFormData] = useState({
        user_id: '',
        day: 'Monday',
        startTime: '', 
        endTime: '',   
        duty_type: 'Clerical Work',
        department: '',
        supervisor: ''
    });

    useEffect(() => {
        fetchStudents();
        fetchStaffingRequests();
        if (currentUserRole !== 'Supervisor') {
            fetchStaffingCandidates();
        }
    }, []);

    useEffect(() => {
        fetchSchedules(currentPage);
    }, [currentPage]);

    const showToast = (text: string, type: 'success' | 'error') => {
        setToastMsg({ text, type });
        setTimeout(() => setToastMsg(null), 3000);
    };

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
            // The API scopes supervisors to their own department.
            const response = await axios.get('/api/personnel');
            setStudents(response.data);
        } catch (error) {
            console.error("Failed to fetch students", error);
        }
    };

    const fetchSchedules = async (page: number) => {
        setIsLoading(true);
        try {
            const response = await axios.get(`/api/schedules?page=${page}`);
            setSchedules(response.data.data);
            setCurrentPage(response.data.current_page);
            setTotalPages(response.data.last_page);
        } catch (error) {
            console.error("Failed to fetch schedules", error);
            showToast("Failed to load schedules.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const payload = {
            user_id: formData.user_id,
            day: formData.day,
            time: `${formData.startTime} - ${formData.endTime}`,
            duty_type: formData.duty_type,
            department: formData.department,
            supervisor: formData.supervisor
        };

        try {
            await axios.post('/api/schedules', payload);
            showToast("Shift assigned successfully!", "success");
            setIsModalOpen(false);
            setFormData({
                user_id: '', day: 'Monday', startTime: '', endTime: '', duty_type: 'Clerical Work', department: '', supervisor: ''
            });
            fetchSchedules(currentPage);
        } catch (error: any) {
            showToast(error.response?.data?.message || "Failed to assign shift.", "error");
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
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const rowVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
            
            {/* DARK THEME HEADER - SCHEDULE MASTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Glowing Orbs */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <CalendarDays className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Timetable Management</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Schedule Master
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Assign and manage weekly shifts for student workers. Review requested schedule modifications.
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className="flex flex-col text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Quick Action</span>
                        <span className="text-sm font-medium text-slate-300">Deploy new worker</span>
                    </div>
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-blue-900/50 flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Assign Shift
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

            {currentUserRole === 'Supervisor' && (
                <form onSubmit={submitStaffingRequest} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                    <div className="sm:col-span-4"><h2 className="font-black text-slate-900">Request a Working Student</h2><p className="text-sm text-slate-500">Tell WSPO how many workers you need, the duty type, and the gender for each slot. The coordinator will assign who is sent to your office.</p></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Duty</label><select value={staffingForm.duty_type} onChange={e => setStaffingForm({...staffingForm, duty_type: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl"><option>Clerical</option><option>Janitorial</option><option>Request</option></select></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Workers Needed</label><input required min="1" max="50" type="number" value={staffingForm.quantity} onChange={e => setRequestedQuantity(Number(e.target.value))} className="w-full p-3 bg-slate-50 border rounded-xl" /></div>
                    {staffingForm.duty_type === 'Request' && <div className="sm:col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Specific Request</label><input required value={staffingForm.duty_request} onChange={e => setStaffingForm({...staffingForm, duty_request: e.target.value})} placeholder="Describe the required assignment" className="w-full p-3 bg-slate-50 border rounded-xl" /></div>}
                    <div className="sm:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Gender for each working student</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {staffingForm.requested_genders.map((gender, index) => (
                                <div key={`gender-slot-${index}`}>
                                    <p className="text-[11px] font-semibold text-slate-500 mb-1">Student {index + 1}</p>
                                    <select value={gender} onChange={(e) => setSlotGender(index, e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl">
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button className="px-4 py-3 bg-blue-600 text-white font-bold rounded-xl">Send Request</button>
                </form>
            )}

            {staffingRequests.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <h2 className="font-black text-slate-900 mb-3">{currentUserRole === 'Supervisor' ? 'Your Staffing Requests' : 'Supervisor Staffing Requests'}</h2>
                    <div className="space-y-3">
                        {staffingRequests.map(request => {
                            const selectedIds = assignmentSelections[request.id] || [];
                            const assignedNames = assignedStudentNames(request);
                            return (
                                <div key={request.id} className="border rounded-xl p-3 space-y-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="font-bold text-slate-800">{request.department} — {request.quantity} {request.duty_type}</p>
                                            <p className="text-sm text-slate-500">Requested by {request.requester?.name}{request.duty_request ? `: ${request.duty_request}` : ''}</p>
                                            {(request.gender_summary || genderSummary(request.requested_genders || [])) && (
                                                <p className="text-sm font-semibold text-slate-700 mt-1">Gender needed: {request.gender_summary || genderSummary(request.requested_genders || [])}</p>
                                            )}
                                            {assignedNames && <p className="text-sm font-semibold text-indigo-700 mt-1">Assigned: {assignedNames}</p>}
                                        </div>
                                        <span className="text-xs font-bold text-slate-500">{request.status}</span>
                                    </div>
                                    {currentUserRole !== 'Supervisor' && request.status === 'Pending' && (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Select working student{request.quantity > 1 ? 's' : ''} to send ({selectedIds.length}/{request.quantity})</label>
                                                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                                                    {staffingCandidates.map((student) => {
                                                        const gender = studentGender(student);
                                                        const remaining = remainingGenders(request, selectedIds);
                                                        const genderLocked = (request.requested_genders || []).length > 0;
                                                        const genderFull = genderLocked && (gender === 'Male' || gender === 'Female') && remaining[gender] <= 0 && !selectedIds.includes(student.id);
                                                        const missingGender = genderLocked && gender !== 'Male' && gender !== 'Female';
                                                        return (
                                                        <label key={student.id} className={`flex items-center gap-3 px-3 py-2 ${genderFull || missingGender ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
                                                            <input
                                                                type="checkbox"
                                                                disabled={genderFull || missingGender}
                                                                checked={selectedIds.includes(student.id)}
                                                                onChange={() => toggleAssignedStudent(request.id, student.id, request)}
                                                            />
                                                            <span className="text-sm font-bold text-slate-800">{student.name}</span>
                                                            <span className="text-xs text-slate-500">{gender || 'No gender'} · {student.profile?.assigned_office || 'Unassigned'}</span>
                                                        </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button type="button" onClick={() => updateStaffingRequest(request.id, 'Approved')} className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg">Approve & Assign</button>
                                                <button type="button" onClick={() => updateStaffingRequest(request.id, 'Declined')} className="px-3 py-2 text-sm bg-slate-200 rounded-lg">Decline</button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* MAIN TABLE */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative">
                
                {isLoading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200">
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Student Worker</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Shift Timing</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Duty Details</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <motion.tbody 
                            variants={containerVariants}
                            initial="hidden"
                            animate={!isLoading ? "show" : "hidden"}
                            className="divide-y divide-slate-100"
                        >
                            {!isLoading && schedules.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                                        <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="text-base font-semibold text-slate-600">No schedules found</p>
                                        <p className="text-sm font-medium">Click "Assign Shift" to schedule a worker.</p>
                                    </td>
                                </tr>
                            ) : (
                                schedules.map((schedule) => (
                                    <motion.tr variants={rowVariants} key={schedule.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black shrink-0 border border-blue-100 shadow-inner">
                                                    {(schedule.user?.name || '?').charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                                        {schedule.user?.name || 'Unknown User'}
                                                    </p>
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
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-widest">
                                                {schedule.day}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 align-top">
                                            <p className="text-sm font-bold text-slate-800">{schedule.duty_type}</p>
                                            <p className="text-xs font-medium text-slate-500 mt-1 flex items-center gap-1">
                                                <User className="w-3.5 h-3.5" /> Sup: {schedule.supervisor}
                                            </p>
                                        </td>
                                        <td className="px-6 py-5 align-top text-right">
                                            <div className="flex flex-col items-end gap-3">
                                                {schedule.edit_request_status === 'pending' && (
                                                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-left max-w-xs shadow-sm">
                                                        <p className="text-xs font-bold text-amber-800 mb-1 flex items-center gap-1">
                                                            <AlertCircle className="w-4 h-4" /> Edit Requested
                                                        </p>
                                                        <p className="text-xs text-amber-700 font-medium mb-2 italic">"{schedule.edit_request_note}"</p>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => handleEditAction(schedule.id, 'approve')} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1">
                                                                <Check className="w-3.5 h-3.5" /> Approve
                                                            </button>
                                                            <button onClick={() => handleEditAction(schedule.id, 'reject')} className="px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-bold transition-colors flex items-center gap-1">
                                                                <X className="w-3.5 h-3.5" /> Reject
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                <button 
                                                    onClick={() => handleDelete(schedule.id)}
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete Schedule"
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

                {/* Pagination Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                        Page {currentPage} of {totalPages}
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
            </div>

            {/* MODAL: ASSIGN NEW SHIFT */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
                        >
                            <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                    <Plus className="w-5 h-5 text-blue-600" /> Assign New Shift
                                </h3>
                                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Student Worker</label>
                                    <select 
                                        required 
                                        value={formData.user_id} 
                                        onChange={e => setFormData({...formData, user_id: e.target.value})} 
                                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="" disabled>-- Select a student --</option>
                                        {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.profile?.assigned_office || 'Unassigned'})</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Day of Week</label>
                                        <select 
                                            value={formData.day} 
                                            onChange={e => setFormData({...formData, day: e.target.value})} 
                                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all appearance-none cursor-pointer"
                                        >
                                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Duty Type</label>
                                        <select 
                                            value={formData.duty_type} 
                                            onChange={e => setFormData({...formData, duty_type: e.target.value})} 
                                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all appearance-none cursor-pointer"
                                        >
                                            <option>Clerical Work</option>
                                            <option>Library Assistant</option>
                                            <option>Lab Assistant</option>
                                            <option>Cleaning</option>
                                            <option>Event Setup</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Start Time</label>
                                        <input required type="time" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all cursor-pointer" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">End Time</label>
                                        <input required type="time" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all cursor-pointer" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Department</label>
                                        <input required type="text" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="e.g. CCS Office" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all placeholder:text-slate-400 placeholder:font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Supervisor</label>
                                        <input required type="text" value={formData.supervisor} onChange={e => setFormData({...formData, supervisor: e.target.value})} placeholder="e.g. Mr. Smith" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all placeholder:text-slate-400 placeholder:font-medium" />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/25 disabled:opacity-50 transition-all flex items-center gap-2">
                                        {isSubmitting ? 'Saving...' : <><CheckCircle2 className="w-4 h-4" /> Assign Shift</>}
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
