import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Html5Qrcode } from 'html5-qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Clock, 
    KeyRound, 
    History, 
    CheckCircle2, 
    LogIn, 
    LogOut, 
    ShieldCheck, 
    Timer,
    Activity,
    CalendarRange,
    Eye,
    X,
    QrCode
} from 'lucide-react';
import {
    fetchWorkHourSummary,
    submitSecureClockIn,
    submitSecureClockOut,
} from '../services/advancedAttendanceService';
import TimesheetPrintView from './TimesheetPrintView';
import Toast from './Toast';
import { playAccessAcceptedSound, playAccessRejectedSound } from '../sounds';

const padMonth = (n) => String(n).padStart(2, '0');

const currentYearMonth = () => {
    const today = new Date();
    return `${today.getFullYear()}-${padMonth(today.getMonth() + 1)}`;
};

const monthBounds = (yearMonth) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const start = `${yearMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${yearMonth}-${padMonth(lastDay)}`;
    return { start, end };
};

const installedApp = () => window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

const cameraErrorMessage = (err) => {
    const name = err?.name || '';
    const text = String(err?.message || err || '');
    const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError' || /not allowed|permission/i.test(text);
    if (denied && installedApp() && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
        return 'This installed app cannot use the camera yet. Open Settings, tap TechHRM, turn Camera on, then come back and tap Turn on camera.';
    }
    if (denied && installedApp()) {
        return 'This installed app cannot use the camera yet. Open Settings, then Apps, TechHRM, Permissions, and allow Camera. Then tap Turn on camera.';
    }
    if (denied) {
        return 'Camera permission was blocked. Allow the camera for this site, then tap Turn on camera again.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return 'No camera was found on this device. Use the passcode instead.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
        return 'The camera is busy in another app. Close that app, then tap Turn on camera again.';
    }
    return 'The camera could not start. Allow camera access for TechHRM, or use the passcode instead.';
};

let qrDetector;
const barcodeDetector = () => {
    if (qrDetector !== undefined) return qrDetector;
    try {
        qrDetector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    } catch {
        qrDetector = null;
    }
    return qrDetector;
};

const StudentAttendanceTerminal = () => {
    const [summary, setSummary] = useState({
        total_rendered: 0,
        remaining_hours: 100,
        target_hours: 100,
        history: [],
    });
    
    const [tokenInput, setTokenInput] = useState('');
    const [checkInMethod, setCheckInMethod] = useState('passcode');
    const scanBusy = useRef(false);
    const repeatGuard = useRef({ code: '', quietFrames: 0 });
    const actionRef = useRef(null);
    const activityActionRef = useRef(null);
    const streamRef = useRef(null);
    const scanTimerRef = useRef(0);
    const fileDecoderRef = useRef(null);
    const [cameraLive, setCameraLive] = useState(false);
    const [cameraStarting, setCameraStarting] = useState(false);
    const insecureCamera = typeof window !== 'undefined' && !window.isSecureContext;
    const [activeShift, setActiveShift] = useState(null);
    const [openActivity, setOpenActivity] = useState(null);
    const [activityToken, setActivityToken] = useState('');
    const [activityMethod, setActivityMethod] = useState('passcode');
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const assignedDepartment = localStorage.getItem('assigned_office') || 'Unassigned';
    const [dtrMonth, setDtrMonth] = useState(currentYearMonth());
    const { start: dtrStart, end: dtrEnd } = monthBounds(dtrMonth);
    const [dtrHistory, setDtrHistory] = useState([]);
    const [dtrHolidays, setDtrHolidays] = useState([]);
    const [dtrPenaltyHours, setDtrPenaltyHours] = useState(0);
    const [dtrPreviewOpen, setDtrPreviewOpen] = useState(false);
    const [workSchedules, setWorkSchedules] = useState([]);
    const [fullName, setFullName] = useState(localStorage.getItem('user_name') || 'Student');
    const [studentProfile, setStudentProfile] = useState({
        student_id_number: '',
        course: '',
        year_level: '',
        assigned_office: assignedDepartment,
        duty_type: '',
        supervisors: [],
    });
    
    // Real-time clock state
    const [currentTime, setCurrentTime] = useState(new Date());

    const formatHours = (value) => Number(value || 0).toFixed(2);
    const formatShiftTime = (value) => {
        const parsed = new Date(`2000-01-01T${String(value || '').trim()}`);
        if (Number.isNaN(parsed.getTime())) {
            const fallback = new Date(`2000-01-01 ${String(value || '').trim()}`);
            return Number.isNaN(fallback.getTime()) ? String(value || '').trim() : fallback.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        return parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };
    const todayShifts = workSchedules.filter((shift) => shift.kind !== 'class' && shift.day === currentTime.toLocaleDateString('en-US', { weekday: 'long' }));
    const todayShiftLabel = todayShifts.map((shift) => {
        const [start, end] = String(shift.time || '').split(/\s*-\s*/);
        return `${formatShiftTime(start)} – ${formatShiftTime(end)}`;
    }).join(', ');

    const logLabel = (log) => {
        const raw = String(log.work_type || log.attendance_type || 'Regular').trim();
        if (!raw || raw === 'Regular') return 'Regular duty';
        return raw;
    };

    const isMeetingLog = (log) => /meeting/i.test(`${log.work_type || ''} ${log.attendance_type || ''}`);

    const logHours = (log) => (
        log.rendered_hour_event_id
            ? Number(log.activity_hours || 0)
            : Number(log.computed_hours || log.rendered_hours || 0)
    );

    const recentLogs = () => {
        const history = Array.isArray(summary.history) ? summary.history : [];
        const byNewest = [...history].sort((a, b) => new Date(b.time_in || 0) - new Date(a.time_in || 0));
        const regular = byNewest.filter((log) => !isMeetingLog(log)).slice(0, 5);
        const meetings = byNewest.filter(isMeetingLog).slice(0, 5);
        const seen = new Set();
        return [...regular, ...meetings]
            .filter((log) => {
                const key = String(log.id);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => new Date(b.time_in || 0) - new Date(a.time_in || 0));
    };

    useEffect(() => {
        // Update clock every second
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        loadSummary();
        loadProfile();
        axios.get('/api/my-schedule')
            .then((response) => setWorkSchedules(Array.isArray(response.data) ? response.data : []))
            .catch(() => setWorkSchedules([]));
        
        // BULLETPROOF LOCAL STORAGE CHECK
        try {
            const localShift = localStorage.getItem('active_shift_segment');
            if (localShift && localShift !== 'undefined' && localShift !== 'null') {
                setActiveShift(JSON.parse(localShift));
            }
        } catch (e) {
            console.warn("Cleared corrupted active shift data.");
            localStorage.removeItem('active_shift_segment');
        }
    }, []);

    useEffect(() => {
        loadDtr();
    }, [dtrStart, dtrEnd]);

    const loadSummary = async () => {
        try {
            const res = await fetchWorkHourSummary();
            setSummary(res.data);
            const history = Array.isArray(res.data.history) ? res.data.history : [];
            const openShift = history.find((log) => !log.time_out && !log.rendered_hour_event_id);
            const activity = res.data.open_activity
                || history.find((log) => !log.time_out && log.rendered_hour_event_id)
                || null;
            setOpenActivity(activity);
            if (openShift) {
                setActiveShift(openShift);
                localStorage.setItem('active_shift_segment', JSON.stringify(openShift));
            } else {
                setActiveShift(null);
                localStorage.removeItem('active_shift_segment');
            }
        } catch (err) {
            console.error('Failed to load hour summary', err);
        }
    };

    const clockInWith = async (code, method) => {
        setErrorMsg('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            const res = await submitSecureClockIn(code, method);
            playAccessAcceptedSound();
            setSuccessMsg(res.data?.activity
                ? res.data.message
                : (method === 'qr' ? 'QR check-in accepted. Your shift has started.' : 'Shift started successfully! Work hard and stay safe.'));
            setTokenInput('');
            await loadSummary();
            await loadDtr();
        } catch (err) {
            if (method === 'qr') {
                repeatGuard.current = { code, quietFrames: 0 };
            }
            scanBusy.current = false;
            playAccessRejectedSound();
            setErrorMsg(err.response?.data?.message || 'Failed to verify token and clock in.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClockIn = async (e) => {
        e.preventDefault();
        await clockInWith(tokenInput.trim().toUpperCase(), 'passcode');
    };

    const clockOutWith = async (code, method) => {
        if (!activeShift) return;
        setErrorMsg('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            await submitSecureClockOut(activeShift.id, code, method);
            playAccessAcceptedSound();
            setSuccessMsg(method === 'qr' ? 'QR clock-out accepted. Your shift has ended.' : 'Shift ended successfully! Great job today.');
            setTokenInput('');
            await loadSummary();
            await loadDtr();
        } catch (err) {
            if (method === 'qr') {
                repeatGuard.current = { code, quietFrames: 0 };
            }
            scanBusy.current = false;
            playAccessRejectedSound();
            setErrorMsg(err.response?.data?.message || 'Failed to verify token and clock out.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClockOut = async (e) => {
        e.preventDefault();
        await clockOutWith(tokenInput.trim().toUpperCase(), 'passcode');
    };

    const timeOutActivity = async (code, method) => {
        if (!openActivity) return;
        setErrorMsg('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            const res = await submitSecureClockOut(openActivity.id, code, method);
            playAccessAcceptedSound();
            setSuccessMsg(res.data?.message || 'Activity timed out.');
            setActivityToken('');
            await loadSummary();
            await loadDtr();
        } catch (err) {
            if (method === 'qr') {
                repeatGuard.current = { code, quietFrames: 0 };
            }
            scanBusy.current = false;
            playAccessRejectedSound();
            setErrorMsg(err.response?.data?.message || 'Failed to verify token and time out.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleActivityTimeOut = async (e) => {
        e.preventDefault();
        await timeOutActivity(activityToken.trim().toUpperCase(), 'passcode');
    };

    actionRef.current = activeShift ? clockOutWith : clockInWith;
    activityActionRef.current = openActivity ? timeOutActivity : null;

    const stopCamera = () => {
        window.clearTimeout(scanTimerRef.current);
        scanTimerRef.current = 0;
        const stream = streamRef.current;
        streamRef.current = null;
        stream?.getTracks().forEach((track) => track.stop());
        document.querySelectorAll('[data-qr-video]').forEach((video) => {
            video.pause();
            video.srcObject = null;
        });
    };
    const stopCameraRef = useRef(stopCamera);
    stopCameraRef.current = stopCamera;

    useEffect(() => {
        setCameraLive(false);
        return () => {
            scanBusy.current = false;
            repeatGuard.current = { code: '', quietFrames: 0 };
            stopCameraRef.current();
        };
    }, [checkInMethod, activityMethod, activeShift, openActivity]);

    const acceptScan = (decoded) => {
        if (scanBusy.current) return;
        const raw = String(decoded || '').trim();
        const activity = raw.startsWith('THRM1A|');
        if (!activity && !raw.startsWith('THRM1|')) return;
        const code = raw.slice(activity ? 7 : 6).trim();
        if (code.length < 16) return;
        if (repeatGuard.current.code === code) return;
        repeatGuard.current = { code, quietFrames: 0 };
        scanBusy.current = true;
        if (activity) {
            if (activityActionRef.current) {
                activityActionRef.current(code, 'qr');
            } else {
                clockInWith(code, 'qr');
            }
            return;
        }
        actionRef.current?.(code, 'qr');
    };

    const readQrFrame = async (video) => {
        const detector = barcodeDetector();
        if (detector) {
            try {
                const codes = await detector.detect(video);
                return codes?.[0]?.rawValue || '';
            } catch {
                // This phone's detector cannot read the live video. Fall through.
            }
        }
        if (!video.videoWidth || !video.videoHeight) return '';
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d', { willReadFrequently: true })?.drawImage(video, 0, 0);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (!blob) return '';
        if (!fileDecoderRef.current) {
            fileDecoderRef.current = new Html5Qrcode('student-qr-file-decoder');
        }
        try {
            return await fileDecoderRef.current.scanFile(new File([blob], 'frame.jpg', { type: 'image/jpeg' }), false);
        } catch {
            return '';
        }
    };

    const startCamera = (elementId = 'student-qr-reader') => {
        const targetId = typeof elementId === 'string' ? elementId : 'student-qr-reader';
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            setErrorMsg(`The browser will not ask for the camera on http://${window.location.host}. Open https://${window.location.host}, accept the certificate warning, then tap Turn on camera.`);
            return;
        }

        const video = document.querySelector(`#${targetId} [data-qr-video]`);
        if (!video) {
            setErrorMsg('The camera view is not on screen. Choose Scan QR, then tap Turn on camera.');
            return;
        }

        stopCamera();
        setCameraStarting(true);
        setErrorMsg('');
        // Ask for the camera in this tap. A second request, or one made after a delay,
        // is blocked in the installed app because the tap is no longer active.
        const pending = navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' } },
        }).catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: true }));

        pending.then((stream) => {
            streamRef.current = stream;
            video.srcObject = stream;
            video.muted = true;
            video.setAttribute('playsinline', 'true');
            video.setAttribute('webkit-playsinline', 'true');
            return Promise.resolve(video.play()).catch(() => {});
        }).then(() => {
            setCameraLive(true);
            const scan = () => {
                scanTimerRef.current = window.setTimeout(async () => {
                    if (!streamRef.current) return;
                    try {
                        const raw = await readQrFrame(video);
                        if (raw) acceptScan(raw);
                        else if (repeatGuard.current.code) {
                            repeatGuard.current.quietFrames += 1;
                            if (repeatGuard.current.quietFrames >= 4) {
                                repeatGuard.current = { code: '', quietFrames: 0 };
                            }
                        }
                    } catch {
                        // One missed frame should not turn the camera off.
                    }
                    if (streamRef.current) scan();
                }, 280);
            };
            scan();
        }).catch((err) => {
            console.error('QR scanner failed', err);
            stopCamera();
            setCameraLive(false);
            setErrorMsg(cameraErrorMessage(err));
        }).finally(() => {
            setCameraStarting(false);
        });
    };

    const loadProfile = async () => {
        try {
            const response = await axios.get('/api/user');
            const user = response.data;
            if (user.name) setFullName(user.name);
            setStudentProfile({
                student_id_number: user.profile?.student_id_number || 'Not Assigned',
                course: user.profile?.course || 'Not Assigned',
                year_level: user.profile?.year_level || 'N/A',
                assigned_office: user.profile?.assigned_office || assignedDepartment,
                duty_type: user.profile?.duty_type || '',
                supervisors: Array.isArray(user.department_supervisors) ? user.department_supervisors : [],
            });
        } catch (err) {
            console.error('Failed to load profile for DTR', err);
        }
    };

    const loadDtr = async () => {
        try {
            const response = await axios.get('/api/attendance/my-history', {
                params: { start: dtrStart, end: dtrEnd },
            });
            const payload = response.data;
            const rows = Array.isArray(payload) ? payload : (payload.history ?? []);
            setDtrHistory(rows.filter((log) => !log.rendered_hour_event_id && !/meeting/i.test(`${log.work_type || ''} ${log.attendance_type || ''}`)));
            setDtrPenaltyHours(Number(payload?.duty_deduction_hours || 0));
        } catch (err) {
            console.error('Failed to load DTR', err);
        }
        try {
            const holidayResponse = await axios.get('/api/holidays', {
                params: { start: dtrStart, end: dtrEnd },
            });
            setDtrHolidays(Array.isArray(holidayResponse.data) ? holidayResponse.data : []);
        } catch (err) {
            console.error('Failed to load DTR holidays', err);
            setDtrHolidays([]);
        }
    };

    const hoursFor = (log) => Number(log.computed_hours || log.rendered_hours || 0);
    const dtrTotalHours = dtrHistory.reduce((sum, log) => sum + hoursFor(log), 0);

    // ANIMATION VARIANTS
    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    return (
        <>
        <div id="student-qr-file-decoder" className="hidden" aria-hidden="true" />
        <div className="max-w-5xl mx-auto space-y-8 font-sans">
            
            {/* Header with Live Clock */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
            >

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="w-5 h-5 text-blue-400" />
                        <span className="text-sm font-medium text-slate-500">Secure Terminal</span>
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                        Attendance Entry
                    </h1>
                    <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
                        Use your department supervisor&apos;s passcode or QR code to clock in and clock out.
                    </p>
                    <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                        Your department: <span className="font-semibold text-slate-900">{assignedDepartment}</span>
                    </p>
                </div>

                <div className="shrink-0 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col items-center sm:items-end text-right">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Current System Time</span>
                    <div className="text-3xl font-semibold tabular-nums text-slate-900 font-mono tracking-tight flex items-center gap-2">
                        <Clock className="w-6 h-6 text-blue-400" />
                        {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <span className="text-sm text-slate-500 mt-1">
                        {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </span>
                </div>
            </motion.div>

            <Toast
                message={errorMsg || successMsg || null}
                type={errorMsg ? 'error' : 'success'}
                onClose={() => {
                    setErrorMsg('');
                    setSuccessMsg('');
                }}
            />

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
                {/* --- LEFT COLUMN: ACTION TERMINAL --- */}
                <motion.div variants={itemVariants} className="lg:col-span-1 space-y-6">
                    {openActivity && (
                        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8">
                            <div className="flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-4">
                                    <Timer className="w-8 h-8" />
                                </div>
                                <h2 className="text-2xl font-semibold text-emerald-900">Activity in progress</h2>
                                <p className="text-sm font-bold text-emerald-700 mt-1 uppercase tracking-wider">
                                    {openActivity.work_type || openActivity.attendance_type || 'Activity'}
                                </p>
                                <p className="mt-3 text-sm font-medium text-emerald-800">
                                    Time out the same way you clocked in. The activity hours are added only when you time out.
                                </p>
                                <div className="mt-6 w-full p-4 bg-white/60 rounded-2xl border border-emerald-100">
                                    <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Time In</p>
                                    <p className="text-xl font-semibold text-emerald-900 font-mono">
                                        {openActivity.time_in ? new Date(openActivity.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                    </p>
                                </div>
                                <form onSubmit={handleActivityTimeOut} className="w-full mt-6 space-y-4 text-left">
                                    <div>
                                        <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Time-out method</label>
                                        <div className="grid grid-cols-2 gap-2 p-1 bg-white/70 rounded-xl">
                                            <button
                                                type="button"
                                                onClick={() => setActivityMethod('passcode')}
                                                className={`py-2.5 rounded-lg text-sm font-bold transition-all ${activityMethod === 'passcode' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                            >
                                                Passcode
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setActivityMethod('qr')}
                                                className={`py-2.5 rounded-lg text-sm font-bold transition-all ${activityMethod === 'qr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                            >
                                                Scan QR
                                            </button>
                                        </div>
                                    </div>
                                    {activityMethod === 'passcode' ? (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Verification Token</label>
                                                <div className="relative">
                                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                        <KeyRound className="h-5 w-5 text-slate-400" />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={activityToken}
                                                        onChange={(e) => setActivityToken(e.target.value.toUpperCase())}
                                                        placeholder="Enter activity token..."
                                                        className="block w-full pl-11 pr-4 py-3 bg-white border border-emerald-100 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-red-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium uppercase tracking-widest"
                                                    />
                                                </div>
                                                <p className="mt-2 text-xs font-medium text-emerald-800">
                                                    The passcode changes every 30 seconds. Use the one currently on the activity screen.
                                                </p>
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={isLoading || !activityToken}
                                                className="w-full py-4 bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl shadow-lg shadow-red-500/25 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isLoading ? (
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                ) : (
                                                    <>
                                                        <LogOut className="w-5 h-5" />
                                                        Time out
                                                    </>
                                                )}
                                            </button>
                                        </>
                                    ) : (
                                        <div className="space-y-3">
                                            {insecureCamera && (
                                                <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                                    This page is open over http, so the phone will not ask for the camera. Open https://{window.location.host}, accept the certificate warning, then turn the camera on.
                                                </p>
                                            )}
                                            {!cameraLive && (
                                                <button
                                                    type="button"
                                                    onClick={() => startCamera('student-activity-qr-reader')}
                                                    disabled={cameraStarting}
                                                    className="w-full py-3.5 bg-slate-900 hover:bg-red-600 text-white font-bold rounded-xl transition-all disabled:opacity-50"
                                                >
                                                    {cameraStarting ? 'Asking for the camera…' : 'Turn on camera'}
                                                </button>
                                            )}
                                            <div id="student-activity-qr-reader" className="overflow-hidden rounded-2xl border border-emerald-100 bg-slate-900">
                                                <video data-qr-video playsInline muted autoPlay className="block h-[240px] w-full object-cover" />
                                            </div>
                                            <p className="text-xs font-medium text-emerald-800 text-center flex items-center justify-center gap-1.5">
                                                <QrCode className="w-3.5 h-3.5" />
                                                Scan the live activity QR to time out. Hours are added only after this scan.
                                            </p>
                                        </div>
                                    )}
                                </form>
                            </div>
                        </div>
                    )}
                    <AnimatePresence mode="wait">
                        {!activeShift ? (
                            /* CLOCK IN FORM */
                            <motion.div 
                                key="clock-in"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                                className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8 relative overflow-hidden"
                            >
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                                        <LogIn className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-semibold text-slate-900">Start Shift</h2>
                                </div>

                                <p className="mb-5 text-sm font-medium text-slate-600">
                                    {todayShiftLabel
                                        ? `Today’s work schedule: ${todayShiftLabel}. You can clock in from 30 minutes before a shift starts until it ends.${todayShifts.length > 1 ? ' Each shift is recorded separately. Clock out of the current shift before you clock in for the next one.' : ''}`
                                        : 'No work schedule is assigned for today. Clock-in follows the shift set by the WSPO coordinator or secretary.'}
                                </p>

                                <form onSubmit={handleClockIn} className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Check-in method</label>
                                        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                                            <button
                                                type="button"
                                                onClick={() => setCheckInMethod('passcode')}
                                                className={`py-2.5 rounded-lg text-sm font-bold transition-all ${checkInMethod === 'passcode' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                            >
                                                Passcode
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setCheckInMethod('qr')}
                                                className={`py-2.5 rounded-lg text-sm font-bold transition-all ${checkInMethod === 'qr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                            >
                                                Scan QR
                                            </button>
                                        </div>
                                    </div>

                                    {checkInMethod === 'passcode' ? (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Verification Token</label>
                                                <div className="relative">
                                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                        <KeyRound className="h-5 w-5 text-slate-400" />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={tokenInput}
                                                        onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                                                        placeholder="Enter supervisor token..."
                                                        className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all placeholder:text-slate-400 placeholder:font-medium uppercase tracking-widest"
                                                    />
                                                </div>
                                                <p className="mt-2 text-xs font-medium text-slate-500">
                                                    The passcode changes every 30 seconds. Use the one currently on your supervisor&apos;s screen.
                                                </p>
                                            </div>

                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                type="submit"
                                                disabled={isLoading || !tokenInput}
                                                className="w-full py-3.5 mt-2 bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isLoading ? (
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                ) : (
                                                    <>Clock In Now</>
                                                )}
                                            </motion.button>
                                        </>
                                    ) : (
                                        <div className="space-y-3">
                                            {insecureCamera && (
                                                <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                                    This page is open over http, so the phone will not ask for the camera. Open https://{window.location.host}, accept the certificate warning, then turn the camera on.
                                                </p>
                                            )}
                                            {!cameraLive && (
                                                <button
                                                    type="button"
                                                    onClick={() => startCamera('student-qr-reader')}
                                                    disabled={cameraStarting}
                                                    className="w-full py-3.5 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-xl transition-all disabled:opacity-50"
                                                >
                                                    {cameraStarting ? 'Asking for the camera…' : 'Turn on camera'}
                                                </button>
                                            )}
                                            <div id="student-qr-reader" className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
                                                <video data-qr-video playsInline muted autoPlay className="block h-[240px] w-full object-cover" />
                                            </div>
                                            <p className="text-xs font-medium text-slate-500 text-center flex items-center justify-center gap-1.5">
                                                <QrCode className="w-3.5 h-3.5" />
                                                Point the camera at the QR. Daily clock-in starts a shift. Cleaning, devotional, and assembly QR codes clock you in. Time out with that same code. Hours are added only when you time out.
                                            </p>
                                            {isLoading && (
                                                <div className="flex justify-center">
                                                    <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </form>
                            </motion.div>
                        ) : (
                            /* ACTIVE SHIFT DASHBOARD */
                            <motion.div 
                                key="active-shift"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8 relative overflow-hidden"
                            >

                                <div className="flex flex-col items-center text-center relative z-10">
                                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-4 shadow-inner">
                                        <Timer className="w-8 h-8 animate-pulse" />
                                    </div>
                                    <h2 className="text-2xl font-semibold text-emerald-900">Shift Active</h2>
                                    <p className="text-sm font-bold text-emerald-700 mt-1 uppercase tracking-wider">
                                        {activeShift.work_type || 'Regular Duty'}
                                    </p>
                                    
                                    <div className="mt-6 w-full p-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-emerald-100">
                                        <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Time In</p>
                                        <p className="text-xl font-semibold text-emerald-900 font-mono">
                                            {activeShift.time_in ? new Date(activeShift.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                        </p>
                                    </div>

                                    <form onSubmit={handleClockOut} className="w-full mt-6 space-y-4 text-left">
                                        <div>
                                            <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Clock-out method</label>
                                            <div className="grid grid-cols-2 gap-2 p-1 bg-white/70 rounded-xl">
                                                <button
                                                    type="button"
                                                    onClick={() => setCheckInMethod('passcode')}
                                                    className={`py-2.5 rounded-lg text-sm font-bold transition-all ${checkInMethod === 'passcode' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                                >
                                                    Passcode
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setCheckInMethod('qr')}
                                                    className={`py-2.5 rounded-lg text-sm font-bold transition-all ${checkInMethod === 'qr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                                >
                                                    Scan QR
                                                </button>
                                            </div>
                                        </div>

                                        {checkInMethod === 'passcode' ? (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Verification Token</label>
                                                    <div className="relative">
                                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                            <KeyRound className="h-5 w-5 text-slate-400" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={tokenInput}
                                                            onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                                                            placeholder="Enter supervisor token..."
                                                            className="block w-full pl-11 pr-4 py-3 bg-white border border-emerald-100 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-red-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium uppercase tracking-widest"
                                                        />
                                                    </div>
                                                    <p className="mt-2 text-xs font-medium text-emerald-800">
                                                        The passcode changes every 30 seconds. Use the one currently on your supervisor&apos;s screen.
                                                    </p>
                                                </div>
                                                <motion.button
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    type="submit"
                                                    disabled={isLoading || !tokenInput}
                                                    className="w-full py-4 bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl shadow-lg shadow-red-500/25 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isLoading ? (
                                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                    ) : (
                                                        <>
                                                            <LogOut className="w-5 h-5" />
                                                            Clock Out
                                                        </>
                                                    )}
                                                </motion.button>
                                            </>
                                        ) : (
                                            <div className="space-y-3">
                                                {insecureCamera && (
                                                    <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                                        This page is open over http, so the phone will not ask for the camera. Open https://{window.location.host}, accept the certificate warning, then turn the camera on.
                                                    </p>
                                                )}
                                                {!cameraLive && (
                                                    <button
                                                        type="button"
                                                        onClick={() => startCamera('student-clockout-qr-reader')}
                                                        disabled={cameraStarting}
                                                        className="w-full py-3.5 bg-slate-900 hover:bg-red-600 text-white font-bold rounded-xl transition-all disabled:opacity-50"
                                                    >
                                                        {cameraStarting ? 'Asking for the camera…' : 'Turn on camera'}
                                                    </button>
                                                )}
                                                <div id="student-clockout-qr-reader" className="overflow-hidden rounded-2xl border border-emerald-100 bg-slate-900">
                                                    <video data-qr-video playsInline muted autoPlay className="block h-[240px] w-full object-cover" />
                                                </div>
                                                <p className="text-xs font-medium text-emerald-800 text-center flex items-center justify-center gap-1.5">
                                                    <QrCode className="w-3.5 h-3.5" />
                                                    Scan the live QR on your supervisor&apos;s screen to clock out. It changes every 30 seconds.
                                                </p>
                                                {isLoading && (
                                                    <div className="flex justify-center">
                                                        <div className="w-5 h-5 border-2 border-red-200 border-t-red-600 rounded-full animate-spin"></div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </form>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* --- RIGHT COLUMN: STATS & HISTORY --- */}
                <motion.div variants={itemVariants} className="lg:col-span-2 space-y-8">
                    
                    {/* Stat Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Total Rendered</p>
                            <h3 className="text-3xl font-semibold text-blue-600">
                                {formatHours(summary.total_rendered)} <span className="text-sm font-bold text-slate-400 uppercase tracking-normal">hrs</span>
                            </h3>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-4 overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(((summary.total_rendered || 0) / summary.target_hours) * 100, 100)}%` }}
                                    transition={{ duration: 1 }}
                                    className="bg-blue-600 h-1.5 rounded-full"
                                />
                            </div>
                        </div>
                        
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Remaining Hours</p>
                            <h3 className="text-3xl font-semibold text-slate-900">
                                {formatHours(summary.remaining_hours)} <span className="text-sm font-bold text-slate-400 uppercase tracking-normal">hrs</span>
                            </h3>
                            <p className="text-xs font-bold text-emerald-600 mt-3 flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4" /> Target: {summary.target_hours} hrs
                            </p>
                        </div>
                    </div>

                    {/* Recent History List */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                            <History className="w-5 h-5 text-slate-400" />
                            <h3 className="text-lg font-semibold text-slate-900">Recent Logs</h3>
                        </div>
                        
                        <div className="p-0">
                            {(!summary.history || summary.history.length === 0) ? (
                                <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                                    <Activity className="w-12 h-12 mb-3 opacity-20" />
                                    <p className="font-semibold text-slate-600 text-base">No history yet</p>
                                    <p className="text-sm">Your verified attendance records will appear here.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {recentLogs().map((log) => (
                                        <div key={log.id} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-start gap-4">
                                                <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${log.time_out ? 'bg-slate-300' : 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]'}`}></div>
                                                <div>
                                                    <p className="font-bold text-slate-900 text-base mb-1">
                                                        {log.time_in ? new Date(log.time_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Unknown Date'}
                                                    </p>
                                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">{logLabel(log)}</p>
                                                    <div className="text-sm font-medium text-slate-600 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                                        <span className="flex items-center gap-1">
                                                            <LogIn className="w-3.5 h-3.5 text-blue-500" /> 
                                                            {log.time_in ? new Date(log.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                        </span>
                                                        {log.time_out && (
                                                            <>
                                                                <span className="hidden sm:inline text-slate-300">→</span>
                                                                <span className="flex items-center gap-1">
                                                                    <LogOut className="w-3.5 h-3.5 text-slate-500" /> 
                                                                    {new Date(log.time_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-col items-start sm:items-end w-full sm:w-auto pl-6 sm:pl-0">
                                                <span className="text-lg font-semibold text-slate-900">
                                                    {formatHours(logHours(log))} <span className="text-xs text-slate-500 font-bold">hrs</span>
                                                </span>
                                                {(log.check_in_method === 'qr' || log.verification_code_used) && (
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                                                        {log.check_in_method === 'qr' ? 'Checked in with QR' : `Passcode: ${log.verification_code_used}`}
                                                    </span>
                                                )}
                                                {log.is_anomaly && (
                                                    <span className="mt-2 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wider rounded-md border border-red-200">
                                                        Anomaly Flagged
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <CalendarRange className="w-5 h-5 text-slate-400" />
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Daily Time Record</h3>
                            <p className="text-xs font-medium text-slate-500">Official WSPO DTR for the selected month. View your own record only.</p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <input
                            type="month"
                            value={dtrMonth}
                            onChange={(e) => setDtrMonth(e.target.value)}
                            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <button
                            type="button"
                            onClick={() => setDtrPreviewOpen(true)}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl shadow-sm transition-colors"
                        >
                            <Eye className="w-4 h-4" />
                            View DTR
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-900 text-white">
                                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs">Date</th>
                                <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">Time In</th>
                                <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">Time Out</th>
                                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs">Duty</th>
                                <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">Status</th>
                                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-xs">Hours</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dtrHistory.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500 font-medium">
                                        No DTR records found for this period.
                                    </td>
                                </tr>
                            ) : (
                                dtrHistory.map((log) => (
                                    <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50">
                                        <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                                            {log.time_in ? new Date(log.time_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-center font-mono text-slate-700">
                                            {log.time_in ? new Date(log.time_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '--:--'}
                                        </td>
                                        <td className="px-4 py-3 text-center font-mono text-slate-700">
                                            {log.time_out ? new Date(log.time_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '--:--'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            <div>{log.work_type || log.attendance_type || 'Regular Duty'}</div>
                                            {log.check_in_method && (
                                                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                    {log.check_in_method === 'qr' ? 'QR' : 'Passcode'}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${['approved', 'accepted'].includes(String(log.status).toLowerCase()) ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : String(log.status).toLowerCase() === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                {['approved', 'accepted'].includes(String(log.status).toLowerCase()) ? 'Accepted' : String(log.status).toLowerCase() === 'rejected' ? 'Rejected' : (log.time_out ? 'Pending' : 'Timed in')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold font-mono text-slate-900">
                                            {hoursFor(log).toFixed(2)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-50 border-t border-slate-200">
                                <td colSpan={5} className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs text-slate-600">Total Hours</td>
                                <td className="px-4 py-3 text-right font-semibold font-mono text-slate-900">{dtrTotalHours.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>

        {typeof document !== 'undefined' && createPortal(
            <AnimatePresence>
                {dtrPreviewOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-80 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setDtrPreviewOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 16, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 16, scale: 0.98 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">Official WSPO DTR</p>
                                    <p className="text-xs font-medium text-slate-500">{fullName} · {studentProfile.student_id_number}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setDtrPreviewOpen(false)}
                                    className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
                                    aria-label="Close DTR preview"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="overflow-y-auto bg-slate-100 p-4">
                                <div className="dtr-paper bg-white shadow-sm mx-auto w-fit max-w-full">
                                    <TimesheetPrintView
                                        fullName={fullName}
                                        studentProfile={studentProfile}
                                        history={dtrHistory}
                                        totalHours={dtrTotalHours}
                                        penaltyHours={dtrPenaltyHours}
                                        startDate={dtrStart}
                                        endDate={dtrEnd}
                                        holidays={dtrHolidays}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>,
            document.body
        )}
        </>
    );
};

export default StudentAttendanceTerminal;
