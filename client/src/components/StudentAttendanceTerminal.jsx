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
    QrCode,
    Building2,
    Camera,
    Sparkles,
    AlertTriangle,
} from 'lucide-react';
import {
    fetchWorkHourSummary,
    submitSecureClockIn,
    submitSecureClockOut,
} from '../services/advancedAttendanceService';
import TimesheetPrintView from './TimesheetPrintView';
import { formatScheduleRange } from '../utils/scheduleTime';
import ManualAttendanceRequestForm from './ManualAttendanceRequestForm';
import ClassClockInRequestForm from './ClassClockInRequestForm';
import CleaningProofCapture from './CleaningProofCapture';
import { HelpDisclosure } from './HelpDisclosure';
import { janitorialGroupService } from '../services/janitorialGroupService';
import Toast from './Toast';
import { playAccessAcceptedSound, playAccessRejectedSound } from '../sounds';

const needsCleaningProof = (record) => {
    if (!record) return false;
    const type = String(record.attendance_type || record.work_type || '').toLowerCase();
    return type === 'janitorial'
        || Boolean(record.janitorial_group_id)
        || /daily\s*cleaning/.test(type);
};

const cleaningProofReady = (record) => Boolean(
    record?.cleaning_before_path && record?.cleaning_after_path
);

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
        return 'This installed app cannot use the camera yet. Open Settings, tap WoSPIS, turn Camera on, then come back and tap Turn on camera.';
    }
    if (denied && installedApp()) {
        return 'This installed app cannot use the camera yet. Open Settings, then Apps, WoSPIS, Permissions, and allow Camera. Then tap Turn on camera.';
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
    return 'The camera could not start. Allow camera access for WoSPIS, or use the passcode instead.';
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
        target_hours: 80,
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
    const [janitorialGroups, setJanitorialGroups] = useState([]);
    const [janitorialGroupId, setJanitorialGroupId] = useState('');
    const [janitorialClockMode, setJanitorialClockMode] = useState('photo');
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

    const [currentTime, setCurrentTime] = useState(new Date());

    const formatHours = (value) => Number(value || 0).toFixed(2);
    const todayShifts = workSchedules.filter(
        (shift) => shift.kind !== 'class' && shift.day === currentTime.toLocaleDateString('en-US', { weekday: 'long' })
    );
    const todayShiftLabel = todayShifts.map((shift) => formatScheduleRange(shift.time)).join(', ');

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
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        loadSummary();
        loadProfile();
        Promise.all([axios.get('/api/user'), janitorialGroupService.list()])
            .then(([userRes, groups]) => {
                const userId = Number(userRes.data?.id);
                const mine = (groups || []).filter((group) =>
                    (group.members || []).some((member) => member.id === userId)
                );
                setJanitorialGroups(mine);
                if (mine.length === 1) setJanitorialGroupId(String(mine[0].id));
            })
            .catch(() => setJanitorialGroups([]));
        axios.get('/api/my-schedule')
            .then((response) => setWorkSchedules(Array.isArray(response.data) ? response.data : []))
            .catch(() => setWorkSchedules([]));

        try {
            const localShift = localStorage.getItem('active_shift_segment');
            if (localShift && localShift !== 'undefined' && localShift !== 'null') {
                setActiveShift(JSON.parse(localShift));
            }
        } catch (e) {
            console.warn('Cleared corrupted active shift data.');
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
            setSuccessMsg(
                res.data?.activity
                    ? res.data.message
                    : method === 'qr'
                      ? 'QR check-in accepted. Your shift has started.'
                      : 'Shift started successfully! Work hard and stay safe.'
            );
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
            if (err.response?.data?.requires_class_hours_approval) {
                document.getElementById('class-clock-in')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleClockIn = async (e) => {
        e.preventDefault();
        await clockInWith(tokenInput.trim().toUpperCase(), 'passcode');
    };

    const clockOutWith = async (code, method, options = {}) => {
        if (!activeShift) return;
        setErrorMsg('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            const res = await submitSecureClockOut(activeShift.id, code, method, options);
            playAccessAcceptedSound();
            const fallback =
                method === 'qr'
                    ? 'QR clock-out accepted. Your shift has ended.'
                    : options.auto_clock_out
                      ? 'Auto clock-out saved at your scheduled end time.'
                      : 'Shift ended successfully! Great job today.';
            setSuccessMsg(res.data?.message || fallback);
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

    const handleAutoClockOut = async () => {
        await clockOutWith(tokenInput.trim().toUpperCase(), 'passcode', { auto_clock_out: true });
    };

    const photoJanitorialShift = Boolean(
        activeShift
        && activeShift.check_in_method === 'photo'
        && (
            String(activeShift.attendance_type || activeShift.work_type || '').toLowerCase() === 'janitorial'
            || activeShift.janitorial_group_id
        )
    );
    const isJanitorialShift = Boolean(
        activeShift
        && (
            String(activeShift.attendance_type || activeShift.work_type || '').toLowerCase() === 'janitorial'
            || activeShift.janitorial_group_id
        )
    );
    const janitorialProofReady = !needsCleaningProof(activeShift) || cleaningProofReady(activeShift);
    const activityNeedsProof = needsCleaningProof(openActivity);
    const activityProofReady = !activityNeedsProof || cleaningProofReady(openActivity);

    const applyCleaningProofUpdate = (target, payload) => {
        const next = payload?.attendance || {
            ...target,
            cleaning_before_path: payload?.cleaning_proof?.before_path ?? target?.cleaning_before_path,
            cleaning_after_path: payload?.cleaning_proof?.after_path ?? target?.cleaning_after_path,
            cleaning_before_captured_at: payload?.cleaning_proof?.before_captured_at ?? target?.cleaning_before_captured_at,
            cleaning_after_captured_at: payload?.cleaning_proof?.after_captured_at ?? target?.cleaning_after_captured_at,
        };
        return next;
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
                // Fall through to canvas decoder.
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

        const pending = navigator.mediaDevices
            .getUserMedia({
                audio: false,
                video: { facingMode: { ideal: 'environment' } },
            })
            .catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: true }));

        pending
            .then((stream) => {
                streamRef.current = stream;
                video.srcObject = stream;
                video.muted = true;
                video.setAttribute('playsinline', 'true');
                video.setAttribute('webkit-playsinline', 'true');
                return Promise.resolve(video.play()).catch(() => {});
            })
            .then(() => {
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
                            // Ignore single missed frame.
                        }
                        if (streamRef.current) scan();
                    }, 280);
                };
                scan();
            })
            .catch((err) => {
                console.error('QR scanner failed', err);
                stopCamera();
                setCameraLive(false);
                setErrorMsg(cameraErrorMessage(err));
            })
            .finally(() => {
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
                assigned_office: user.profile?.assignment_label || user.profile?.assigned_office || assignedDepartment,
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
            const rows = Array.isArray(payload) ? payload : payload.history ?? [];
            setDtrHistory(
                rows.filter(
                    (log) =>
                        !log.rendered_hour_event_id &&
                        !/meeting/i.test(`${log.work_type || ''} ${log.attendance_type || ''}`)
                )
            );
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
    const progressPct = summary.target_hours > 0
        ? Math.min(((summary.total_rendered || 0) / summary.target_hours) * 100, 100)
        : 0;

    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.08 } },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
    };

    return (
        <>
            <div id="student-qr-file-decoder" className="hidden" aria-hidden="true" />
            <div className="mx-auto max-w-6xl space-y-6 font-sans">
                {/* OBSIDIAN SECURE TERMINAL HERO + LIVE CLOCK */}
                <motion.header
                    initial={{ opacity: 0, y: -14 }}
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
                        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl"
                        aria-hidden="true"
                    />
                    <div
                        className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
                        aria-hidden="true"
                    />

                    <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                                    <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                                    Secure Terminal
                                </span>
                                {activeShift && (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-300">
                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                                        Shift Active
                                    </span>
                                )}
                            </div>

                            <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                                Attendance Entry
                            </h1>
                            <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-slate-300">
                                Use your department supervisor&apos;s rotating passcode or QR code to clock in and clock out.
                            </p>

                            <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs backdrop-blur-md">
                                <Building2 className="h-4 w-4 text-blue-400" />
                                <span className="text-slate-400">Assigned Department:</span>
                                <span className="font-bold text-white">{assignedDepartment}</span>
                            </div>
                        </div>

                        {/* Frosted Digital Clock Widget */}
                        <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl sm:min-w-[270px]">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Current System Time
                                </span>
                                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                            </div>
                            <div className="mt-2 flex items-center gap-2.5 font-mono text-3xl font-black tracking-tight tabular-nums text-white sm:text-4xl">
                                <Clock className="h-6 w-6 shrink-0 text-blue-400" />
                                <span>
                                    {currentTime.toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: true,
                                    })}
                                </span>
                            </div>
                            <p className="mt-1.5 text-xs font-semibold text-slate-300">
                                {currentTime.toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                })}
                            </p>
                        </div>
                    </div>
                </motion.header>

                <Toast
                    message={errorMsg || successMsg || null}
                    type={errorMsg ? 'error' : 'success'}
                    onClose={() => {
                        setErrorMsg('');
                        setSuccessMsg('');
                    }}
                />

                <ClassClockInRequestForm
                    clockedIn={Boolean(activeShift)}
                    onClockedIn={() => {
                        loadSummary();
                        loadDtr();
                    }}
                    onToast={(message, type) => {
                        if (type === 'error') {
                            setSuccessMsg('');
                            setErrorMsg(message);
                        } else {
                            setErrorMsg('');
                            setSuccessMsg(message);
                        }
                    }}
                />

                <ManualAttendanceRequestForm
                    onToast={(message, type) => {
                        if (type === 'error') {
                            setSuccessMsg('');
                            setErrorMsg(message);
                        } else {
                            setErrorMsg('');
                            setSuccessMsg(message);
                        }
                    }}
                />

                {/* MAIN WORKSPACE BENTO */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 gap-6 lg:grid-cols-12"
                >
                    {/* LEFT COLUMN (5 COLS): ACTION TERMINAL */}
                    <motion.div variants={itemVariants} className="space-y-5 lg:col-span-5">
                        {openActivity && (
                            <div className="relative overflow-hidden rounded-[1.75rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-50/70 to-teal-50/60 p-6 shadow-sm">
                                <div className="flex flex-col items-center text-center">
                                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25">
                                        <Timer className="h-7 w-7 animate-pulse" />
                                    </div>
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-emerald-800">
                                        Activity In Progress
                                    </span>
                                    <h2 className="mt-2 text-xl font-black text-slate-900">
                                        {openActivity.work_type || openActivity.attendance_type || 'Activity'}
                                    </h2>
                                    <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
                                        Time out with the active activity code when finished to credit your hours.
                                    </p>

                                    <div className="mt-5 w-full rounded-2xl border border-emerald-200/80 bg-white p-4 shadow-xs">
                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600">
                                            Time In
                                        </p>
                                        <p className="mt-1 font-mono text-2xl font-black text-slate-900">
                                            {openActivity.time_in
                                                ? new Date(openActivity.time_in).toLocaleTimeString('en-US', {
                                                      hour: 'numeric',
                                                      minute: '2-digit',
                                                      hour12: true,
                                                  })
                                                : '--:--'}
                                        </p>
                                    </div>

                                    {activityNeedsProof && (
                                        <CleaningProofCapture
                                            attendanceId={openActivity.id}
                                            beforePath={openActivity.cleaning_before_path}
                                            afterPath={openActivity.cleaning_after_path}
                                            insecureCamera={insecureCamera}
                                            onUpdated={(payload) => {
                                                setOpenActivity((prev) => applyCleaningProofUpdate(prev, payload));
                                            }}
                                        />
                                    )}

                                    <form onSubmit={handleActivityTimeOut} className="mt-5 w-full space-y-4 text-left">
                                        <div>
                                            <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-widest text-emerald-800">
                                                Time-out method
                                            </label>
                                            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-emerald-200/70 bg-white p-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setActivityMethod('passcode')}
                                                    className={`rounded-lg py-2 text-xs font-bold transition-all ${
                                                        activityMethod === 'passcode'
                                                            ? 'bg-slate-900 text-white shadow-sm'
                                                            : 'text-slate-500 hover:text-slate-900'
                                                    }`}
                                                >
                                                    Passcode
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setActivityMethod('qr')}
                                                    disabled={!activityProofReady}
                                                    className={`rounded-lg py-2 text-xs font-bold transition-all ${
                                                        activityMethod === 'qr'
                                                            ? 'bg-slate-900 text-white shadow-sm'
                                                            : 'text-slate-500 hover:text-slate-900'
                                                    } disabled:opacity-50`}
                                                >
                                                    Scan QR
                                                </button>
                                            </div>
                                        </div>

                                        {!activityProofReady && (
                                            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                                                Capture before and after cleaning photos before you can time out.
                                            </p>
                                        )}

                                        {activityMethod === 'passcode' ? (
                                            <>
                                                <div>
                                                    <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-widest text-emerald-800">
                                                        Verification Token
                                                    </label>
                                                    <div className="relative">
                                                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                                                            <KeyRound className="h-4 w-4 text-slate-400" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={activityToken}
                                                            onChange={(e) => setActivityToken(e.target.value.toUpperCase())}
                                                            placeholder="ENTER ACTIVITY TOKEN"
                                                            disabled={!activityProofReady}
                                                            className="block w-full rounded-xl border border-emerald-200 bg-white py-3 pl-10 pr-4 font-mono text-sm font-bold uppercase tracking-widest text-slate-900 outline-none transition-all placeholder:font-sans placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:opacity-50"
                                                        />
                                                    </div>
                                                    <p className="mt-2 text-[11px] font-medium text-emerald-800">
                                                        Refreshes every 30 seconds on the activity screen.
                                                    </p>
                                                </div>
                                                <button
                                                    type="submit"
                                                    disabled={isLoading || !activityToken || !activityProofReady}
                                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 transition-all hover:from-red-600 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {isLoading ? (
                                                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                                    ) : (
                                                        <>
                                                            <LogOut className="h-4 w-4" />
                                                            Time Out Activity
                                                        </>
                                                    )}
                                                </button>
                                            </>
                                        ) : (
                                            <div className="space-y-3">
                                                {insecureCamera && (
                                                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                                                        This page is open over http, so the phone will not ask for the camera. Open https://{window.location.host}, accept the certificate warning, then turn the camera on.
                                                    </p>
                                                )}
                                                {!cameraLive && (
                                                    <button
                                                        type="button"
                                                        onClick={() => startCamera('student-activity-qr-reader')}
                                                        disabled={cameraStarting}
                                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white transition-all hover:bg-red-600 disabled:opacity-50"
                                                    >
                                                        <Camera className="h-4 w-4" />
                                                        {cameraStarting ? 'Asking for the camera…' : 'Turn on camera'}
                                                    </button>
                                                )}
                                                <div
                                                    id="student-activity-qr-reader"
                                                    className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-slate-950 shadow-inner"
                                                >
                                                    <video
                                                        data-qr-video
                                                        playsInline
                                                        muted
                                                        autoPlay
                                                        className="block h-[240px] w-full object-cover"
                                                    />
                                                </div>
                                                <p className="flex items-center justify-center gap-1.5 text-center text-xs font-medium text-emerald-800">
                                                    <QrCode className="h-3.5 w-3.5 shrink-0" />
                                                    Scan the live activity QR to time out and credit hours.
                                                </p>
                                            </div>
                                        )}
                                    </form>
                                </div>
                            </div>
                        )}

                        {janitorialGroups.length > 0 && (
                            <div className="space-y-2.5">
                                {janitorialGroups.map((group) => {
                                    const present = group.leader_present !== false;
                                    return (
                                        <div
                                            key={group.id}
                                            className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-xs"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                    Janitorial Assignment
                                                </p>
                                                <span
                                                    className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                        present
                                                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70'
                                                            : 'bg-slate-100 text-slate-600'
                                                    }`}
                                                >
                                                    {present ? 'Supervisor present' : 'Supervisor absent'}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm font-bold text-slate-900">
                                                Area: {group.area || '—'}
                                            </p>
                                            <p className="mt-0.5 text-xs font-medium text-slate-500">
                                                Supervisor: {group.supervisor?.name || '—'}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <AnimatePresence mode="wait">
                            {!activeShift ? (
                                /* CLOCK IN CARD */
                                <motion.div
                                    key="clock-in"
                                    initial={{ opacity: 0, x: -16 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -16, transition: { duration: 0.2 } }}
                                    className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-7"
                                >
                                    <div className="mb-5 flex items-center gap-3">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20">
                                            <LogIn className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-black tracking-tight text-slate-900">
                                                Start Shift
                                            </h2>
                                            <p className="text-xs font-medium text-slate-500">
                                                Verify your presence to begin logging hours
                                            </p>
                                        </div>
                                    </div>

                                    {janitorialGroups.length > 0 && (
                                        <div className="mb-5 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                                            <div>
                                                <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-900">
                                                    Janitorial Duty
                                                </h3>
                                                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                                                    Clock janitorial duty with live photos, or use a supervisor code when on-site.
                                                </p>
                                                <HelpDisclosure
                                                    variant="inline"
                                                    title="How janitorial duty works"
                                                    className="mt-2"
                                                    items={[
                                                        'Photo mode starts and ends janitorial duty using live timestamped before and after area photos — no code required.',
                                                        'Supervisor code is optional and only available while your janitorial leader is physically present showing a code; area photos are still required before clock-out.',
                                                        'If your leader is marked absent, record the duty under Offline Attendance with your time in and live before/after camera photos.',
                                                        'Accepted janitorial entries credit up to 4 hours from clock-in after supervisor verification.',
                                                    ]}
                                                />
                                            </div>
                                            {janitorialGroups.length > 1 && (
                                                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                    Group
                                                    <select
                                                        value={janitorialGroupId}
                                                        onChange={(event) => setJanitorialGroupId(event.target.value)}
                                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-bold normal-case tracking-normal text-slate-800"
                                                    >
                                                        {janitorialGroups.map((group) => (
                                                            <option key={group.id} value={group.id}>
                                                                {group.area}
                                                                {group.name && group.name !== group.area ? ` · ${group.name}` : ''}
                                                                {group.leader_present === false ? ' · leader absent' : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            )}
                                            {(janitorialGroups.find((group) => String(group.id) === String(janitorialGroupId)) ||
                                                janitorialGroups[0])?.leader_present === false ? (
                                                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5">
                                                    <p className="text-xs font-bold text-slate-800">
                                                        Your janitorial leader is marked absent.
                                                    </p>
                                                    <p className="text-xs leading-relaxed text-slate-600">
                                                        Code entry is unavailable — submit this shift under Offline Attendance with live before/after photos.
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            document
                                                                .getElementById('offline-attendance')
                                                                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                                        }
                                                        className="text-xs font-extrabold text-blue-700 hover:underline"
                                                    >
                                                        Go to offline attendance →
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-white p-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setJanitorialClockMode('photo')}
                                                            className={`rounded-lg py-2 text-xs font-bold transition-all ${
                                                                janitorialClockMode === 'photo'
                                                                    ? 'bg-slate-900 text-white'
                                                                    : 'text-slate-500'
                                                            }`}
                                                        >
                                                            Photo
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setJanitorialClockMode('code')}
                                                            className={`rounded-lg py-2 text-xs font-bold transition-all ${
                                                                janitorialClockMode === 'code'
                                                                    ? 'bg-slate-900 text-white'
                                                                    : 'text-slate-500'
                                                            }`}
                                                        >
                                                            Supervisor code
                                                        </button>
                                                    </div>
                                                    {janitorialClockMode === 'photo' ? (
                                                        <CleaningProofCapture
                                                            janitorial
                                                            groupId={janitorialGroupId || janitorialGroups[0]?.id}
                                                            insecureCamera={insecureCamera}
                                                            onUpdated={(payload) => {
                                                                const next = payload?.attendance;
                                                                if (!next) return;
                                                                setActiveShift(next);
                                                                localStorage.setItem('active_shift_segment', JSON.stringify(next));
                                                                setSuccessMsg(payload?.message || 'Janitorial clock-in started with your photo.');
                                                                loadSummary();
                                                            }}
                                                        />
                                                    ) : (
                                                        <p className="text-xs font-medium leading-relaxed text-slate-600">
                                                            Enter or scan your janitorial supervisor&apos;s code in the form below (area photos are still required before clock-out).
                                                        </p>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}

                                    <div className="mb-5 space-y-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 text-xs font-medium leading-relaxed text-slate-600">
                                        <p>
                                            {todayShiftLabel
                                                ? `Today’s work schedule: ${todayShiftLabel}.`
                                                : 'No work schedule assigned for today.'}
                                        </p>
                                        <HelpDisclosure
                                            variant="inline"
                                            title="Shift clock-in rules"
                                            items={[
                                                'Clock-in opens 30 minutes before a scheduled shift starts and remains open until the shift ends.',
                                                'Each shift is logged separately — clock out of your current shift before starting the next one.',
                                                'Clock-in follows the work schedule assigned by the WSPO coordinator or secretary.',
                                            ]}
                                        />
                                    </div>

                                    <form onSubmit={handleClockIn} className="space-y-4">
                                        <div>
                                            <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                                Check-in method
                                            </label>
                                            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50 p-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setCheckInMethod('passcode')}
                                                    className={`rounded-lg py-2.5 text-xs font-bold transition-all ${
                                                        checkInMethod === 'passcode'
                                                            ? 'bg-slate-900 text-white shadow-sm'
                                                            : 'text-slate-500 hover:text-slate-900'
                                                    }`}
                                                >
                                                    Passcode
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setCheckInMethod('qr')}
                                                    className={`rounded-lg py-2.5 text-xs font-bold transition-all ${
                                                        checkInMethod === 'qr'
                                                            ? 'bg-slate-900 text-white shadow-sm'
                                                            : 'text-slate-500 hover:text-slate-900'
                                                    }`}
                                                >
                                                    Scan QR
                                                </button>
                                            </div>
                                        </div>

                                        {checkInMethod === 'passcode' ? (
                                            <>
                                                <div>
                                                    <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                                                        Verification Token
                                                    </label>
                                                    <div className="relative">
                                                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                                                            <KeyRound className="h-4 w-4 text-slate-400" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={tokenInput}
                                                            onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                                                            placeholder="Enter supervisor token..."
                                                            className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 font-mono text-sm font-bold uppercase tracking-widest text-slate-900 outline-none transition-all placeholder:font-sans placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                                        />
                                                    </div>
                                                    <p className="mt-2 text-[11px] font-medium text-slate-500">
                                                        Refreshes every 30 seconds on your supervisor&apos;s screen.
                                                    </p>
                                                </div>

                                                <motion.button
                                                    whileHover={{ scale: 1.01 }}
                                                    whileTap={{ scale: 0.99 }}
                                                    type="submit"
                                                    disabled={isLoading || !tokenInput}
                                                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {isLoading ? (
                                                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                                    ) : (
                                                        <>
                                                            <LogIn className="h-4 w-4" />
                                                            Clock In Now
                                                        </>
                                                    )}
                                                </motion.button>
                                            </>
                                        ) : (
                                            <div className="space-y-3">
                                                {insecureCamera && (
                                                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                                                        This page is open over http, so the phone will not ask for the camera. Open https://{window.location.host}, accept the certificate warning, then turn the camera on.
                                                    </p>
                                                )}
                                                {!cameraLive && (
                                                    <button
                                                        type="button"
                                                        onClick={() => startCamera('student-qr-reader')}
                                                        disabled={cameraStarting}
                                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white transition-all hover:bg-blue-600 disabled:opacity-50"
                                                    >
                                                        <Camera className="h-4 w-4" />
                                                        {cameraStarting ? 'Asking for the camera…' : 'Turn on camera'}
                                                    </button>
                                                )}
                                                <div
                                                    id="student-qr-reader"
                                                    className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-slate-950 shadow-inner"
                                                >
                                                    <video
                                                        data-qr-video
                                                        playsInline
                                                        muted
                                                        autoPlay
                                                        className="block h-[240px] w-full object-cover"
                                                    />
                                                </div>
                                                <p className="flex items-start justify-center gap-1.5 text-center text-[11px] font-medium leading-relaxed text-slate-500">
                                                    <QrCode className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                                                    <span>
                                                        Scan a live daily duty or campus activity QR code (use the same code type to time out).
                                                    </span>
                                                </p>
                                                {isLoading && (
                                                    <div className="flex justify-center">
                                                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </form>
                                </motion.div>
                            ) : (
                                /* ACTIVE SHIFT CARD */
                                <motion.div
                                    key="active-shift"
                                    initial={{ opacity: 0, scale: 0.97 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="relative overflow-hidden rounded-[1.75rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-50/70 to-teal-50/60 p-6 shadow-sm sm:p-7"
                                >
                                    <div className="relative z-10 flex flex-col items-center text-center">
                                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25">
                                            <Timer className="h-7 w-7 animate-pulse" />
                                        </div>
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-emerald-800">
                                            Shift Active
                                        </span>
                                        <h2 className="mt-2 text-2xl font-black text-slate-900">
                                            {activeShift.work_type || 'Regular Duty'}
                                        </h2>

                                        <div className="mt-5 w-full rounded-2xl border border-emerald-200/80 bg-white p-4 shadow-xs">
                                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600">
                                                Time In
                                            </p>
                                            <p className="mt-1 font-mono text-2xl font-black text-slate-900">
                                                {activeShift.time_in
                                                    ? new Date(activeShift.time_in).toLocaleTimeString('en-US', {
                                                          hour: 'numeric',
                                                          minute: '2-digit',
                                                          hour12: true,
                                                      })
                                                    : '--:--'}
                                            </p>
                                            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
                                                {photoJanitorialShift
                                                    ? 'Capture your final area photo below to clock out (up to 4 hours credited upon approval).'
                                                    : isJanitorialShift
                                                      ? 'Capture your area photos, then clock out with the supervisor code (up to 4 hours credited upon approval).'
                                                      : 'Clock out when your duty ends to record and approve your shift hours.'}
                                            </p>
                                        </div>

                                        {needsCleaningProof(activeShift) && (
                                            <CleaningProofCapture
                                                janitorial={photoJanitorialShift}
                                                groupId={activeShift.janitorial_group_id}
                                                attendanceId={activeShift.id}
                                                beforePath={activeShift.cleaning_before_path}
                                                afterPath={activeShift.cleaning_after_path}
                                                insecureCamera={insecureCamera}
                                                onUpdated={(payload) => {
                                                    const next = applyCleaningProofUpdate(activeShift, payload);
                                                    if (photoJanitorialShift && next?.time_out) {
                                                        setSuccessMsg(payload?.message || 'Janitorial clock-out saved with your photo.');
                                                        localStorage.removeItem('active_shift_segment');
                                                        setActiveShift(null);
                                                        loadSummary();
                                                        return;
                                                    }
                                                    setActiveShift(next);
                                                    localStorage.setItem('active_shift_segment', JSON.stringify(next));
                                                }}
                                            />
                                        )}

                                        {!photoJanitorialShift && (
                                            <form onSubmit={handleClockOut} className="mt-5 w-full space-y-4 text-left">
                                                <div>
                                                    <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-widest text-emerald-800">
                                                        Clock-out method
                                                    </label>
                                                    <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-emerald-200/70 bg-white p-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setCheckInMethod('passcode')}
                                                            className={`rounded-lg py-2 text-xs font-bold transition-all ${
                                                                checkInMethod === 'passcode'
                                                                    ? 'bg-slate-900 text-white shadow-sm'
                                                                    : 'text-slate-500 hover:text-slate-900'
                                                            }`}
                                                        >
                                                            Passcode
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setCheckInMethod('qr')}
                                                            disabled={!janitorialProofReady}
                                                            className={`rounded-lg py-2 text-xs font-bold transition-all ${
                                                                checkInMethod === 'qr'
                                                                    ? 'bg-slate-900 text-white shadow-sm'
                                                                    : 'text-slate-500 hover:text-slate-900'
                                                            } disabled:opacity-50`}
                                                        >
                                                            Scan QR
                                                        </button>
                                                    </div>
                                                </div>

                                                {!janitorialProofReady && (
                                                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                                                        Photograph your surroundings at clock-in, then take one last photo before you can clock out.
                                                    </p>
                                                )}

                                                {checkInMethod === 'passcode' ? (
                                                    <>
                                                        <div>
                                                            <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-widest text-emerald-800">
                                                                Verification Token
                                                            </label>
                                                            <div className="relative">
                                                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                                                                    <KeyRound className="h-4 w-4 text-slate-400" />
                                                                </div>
                                                                <input
                                                                    type="text"
                                                                    required
                                                                    value={tokenInput}
                                                                    onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                                                                    placeholder="Enter supervisor token..."
                                                                    disabled={!janitorialProofReady}
                                                                    className="block w-full rounded-xl border border-emerald-200 bg-white py-3 pl-10 pr-4 font-mono text-sm font-bold uppercase tracking-widest text-slate-900 outline-none transition-all placeholder:font-sans placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:opacity-50"
                                                                />
                                                            </div>
                                                            <p className="mt-2 text-[11px] font-medium text-emerald-800">
                                                                Refreshes every 30 seconds on your supervisor&apos;s screen.
                                                            </p>
                                                        </div>

                                                        <motion.button
                                                            whileHover={{ scale: 1.01 }}
                                                            whileTap={{ scale: 0.99 }}
                                                            type="submit"
                                                            disabled={isLoading || !tokenInput || !janitorialProofReady}
                                                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 transition-all hover:from-red-600 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            {isLoading ? (
                                                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                                            ) : (
                                                                <>
                                                                    <LogOut className="h-4 w-4" />
                                                                    Clock Out
                                                                </>
                                                            )}
                                                        </motion.button>

                                                        {!isJanitorialShift && (
                                                            <button
                                                                type="button"
                                                                onClick={handleAutoClockOut}
                                                                disabled={isLoading || !tokenInput}
                                                                className="w-full rounded-xl border border-emerald-200 bg-white py-3 text-xs font-bold text-emerald-800 transition-all hover:border-emerald-400 hover:bg-emerald-50/50 disabled:opacity-50"
                                                            >
                                                                Auto clock-out at scheduled end
                                                                <span className="mt-0.5 block text-[11px] font-medium text-emerald-700/80">
                                                                    Available within 10 minutes of shift end
                                                                </span>
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {insecureCamera && (
                                                            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                                                                This page is open over http, so the phone will not ask for the camera. Open https://{window.location.host}, accept the certificate warning, then turn the camera on.
                                                            </p>
                                                        )}
                                                        {!cameraLive && (
                                                            <button
                                                                type="button"
                                                                onClick={() => startCamera('student-clockout-qr-reader')}
                                                                disabled={cameraStarting || !janitorialProofReady}
                                                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white transition-all hover:bg-red-600 disabled:opacity-50"
                                                            >
                                                                <Camera className="h-4 w-4" />
                                                                {cameraStarting ? 'Asking for the camera…' : 'Turn on camera'}
                                                            </button>
                                                        )}
                                                        <div
                                                            id="student-clockout-qr-reader"
                                                            className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-slate-950 shadow-inner"
                                                        >
                                                            <video
                                                                data-qr-video
                                                                playsInline
                                                                muted
                                                                autoPlay
                                                                className="block h-[240px] w-full object-cover"
                                                            />
                                                        </div>
                                                        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-emerald-800">
                                                            <QrCode className="h-3.5 w-3.5 shrink-0" />
                                                            Scan the live QR on your supervisor&apos;s screen to clock out.
                                                        </p>
                                                        {isLoading && (
                                                            <div className="flex justify-center">
                                                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-200 border-t-red-600" />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </form>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* RIGHT COLUMN (7 COLS): STATS & RECENT LOGS */}
                    <motion.div variants={itemVariants} className="space-y-5 lg:col-span-7">
                        {/* Stat Cards */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                                        Total Rendered
                                    </p>
                                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-extrabold text-blue-700">
                                        {progressPct.toFixed(0)}%
                                    </span>
                                </div>
                                <h3 className="mt-2.5 text-4xl font-black tracking-tight tabular-nums text-blue-600">
                                    {formatHours(summary.total_rendered)}
                                    <span className="ml-1.5 text-sm font-bold text-slate-400">hrs</span>
                                </h3>
                                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progressPct}%` }}
                                        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                                        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm">
                                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                                    Remaining Hours
                                </p>
                                <h3 className="mt-2.5 text-4xl font-black tracking-tight tabular-nums text-slate-900">
                                    {formatHours(summary.remaining_hours)}
                                    <span className="ml-1.5 text-sm font-bold text-slate-400">hrs</span>
                                </h3>
                                <p className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                    Target: {summary.target_hours} hrs
                                    {summary.special_hours_request ? ' · Special' : ''}
                                </p>
                            </div>
                        </div>

                        {/* Recent Logs Card */}
                        <div className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                                <div className="flex items-center gap-2.5">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">
                                        <History className="h-4 w-4" />
                                    </span>
                                    <h3 className="text-base font-black text-slate-900">Recent Logs</h3>
                                </div>
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-500">
                                    Latest entries
                                </span>
                            </div>

                            <div>
                                {!summary.history || summary.history.length === 0 ? (
                                    <div className="flex flex-col items-center px-6 py-14 text-center">
                                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                            <Activity className="h-6 w-6" />
                                        </div>
                                        <p className="text-sm font-bold text-slate-700">No history yet</p>
                                        <p className="mt-1 text-xs font-medium text-slate-400">
                                            Your verified attendance records will appear here.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {recentLogs().map((log) => (
                                            <div
                                                key={log.id}
                                                className="flex flex-col items-start justify-between gap-3 px-6 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center"
                                            >
                                                <div className="flex items-start gap-3.5">
                                                    <div
                                                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                                                            log.time_out
                                                                ? 'bg-slate-300'
                                                                : 'animate-pulse bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                                                        }`}
                                                    />
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="text-sm font-extrabold text-slate-900">
                                                                {log.time_in
                                                                    ? new Date(log.time_in).toLocaleDateString('en-US', {
                                                                          weekday: 'short',
                                                                          month: 'short',
                                                                          day: 'numeric',
                                                                      })
                                                                    : 'Unknown Date'}
                                                            </p>
                                                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                                {logLabel(log)}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                                                            <span className="inline-flex items-center gap-1">
                                                                <LogIn className="h-3.5 w-3.5 text-blue-500" />
                                                                {log.time_in
                                                                    ? new Date(log.time_in).toLocaleTimeString('en-US', {
                                                                          hour: 'numeric',
                                                                          minute: '2-digit',
                                                                          hour12: true,
                                                                      })
                                                                    : '--:--'}
                                                            </span>
                                                            {log.time_out && (
                                                                <>
                                                                    <span className="text-slate-300">→</span>
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <LogOut className="h-3.5 w-3.5 text-slate-400" />
                                                                        {new Date(log.time_out).toLocaleTimeString('en-US', {
                                                                            hour: 'numeric',
                                                                            minute: '2-digit',
                                                                            hour12: true,
                                                                        })}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex w-full flex-col items-start pl-6 sm:w-auto sm:items-end sm:pl-0">
                                                    <span className="font-mono text-lg font-black tabular-nums text-slate-900">
                                                        {formatHours(logHours(log))}
                                                        <span className="ml-1 font-sans text-xs font-bold text-slate-400">
                                                            hrs
                                                        </span>
                                                    </span>
                                                    {(log.check_in_method === 'qr' || log.verification_code_used) && (
                                                        <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                            {log.check_in_method === 'qr'
                                                                ? 'Checked in with QR'
                                                                : `Passcode: ${log.verification_code_used}`}
                                                        </span>
                                                    )}
                                                    {log.is_anomaly && (
                                                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-red-700">
                                                            <AlertTriangle className="h-3 w-3" />
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

                {/* DAILY TIME RECORD (DTR) LEDGER */}
                <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                    <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-6 py-5 lg:flex-row lg:items-center">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                                <CalendarRange className="h-5 w-5" />
                            </span>
                            <div>
                                <h3 className="text-base font-black text-slate-900">Daily Time Record</h3>
                                <p className="text-xs font-medium text-slate-500">
                                    Official monthly WSPO Daily Time Record.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
                            <input
                                type="month"
                                value={dtrMonth}
                                onChange={(e) => setDtrMonth(e.target.value)}
                                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                            />
                            <button
                                type="button"
                                onClick={() => setDtrPreviewOpen(true)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-600"
                            >
                                <Eye className="h-4 w-4" />
                                View DTR
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="app-data-table w-full text-sm">
                            <thead>
                                <tr className="bg-slate-950 text-white">
                                    <th className="px-5 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-widest">
                                        Date
                                    </th>
                                    <th className="px-4 py-3.5 text-center text-[11px] font-extrabold uppercase tracking-widest">
                                        Time In
                                    </th>
                                    <th className="px-4 py-3.5 text-center text-[11px] font-extrabold uppercase tracking-widest">
                                        Time Out
                                    </th>
                                    <th className="px-4 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-widest">
                                        Duty
                                    </th>
                                    <th className="px-4 py-3.5 text-center text-[11px] font-extrabold uppercase tracking-widest">
                                        Status
                                    </th>
                                    <th className="px-5 py-3.5 text-right text-[11px] font-extrabold uppercase tracking-widest">
                                        Hours
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {dtrHistory.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-14 text-center text-sm font-medium text-slate-400">
                                            No DTR records found for this period.
                                        </td>
                                    </tr>
                                ) : (
                                    dtrHistory.map((log) => {
                                        const statusLower = String(log.status).toLowerCase();
                                        const isAccepted = ['approved', 'accepted'].includes(statusLower);
                                        const isRejected = statusLower === 'rejected';
                                        return (
                                            <tr key={log.id} className="transition-colors hover:bg-slate-50/80">
                                                <td className="whitespace-nowrap px-5 py-3.5 font-bold text-slate-900">
                                                    {log.time_in
                                                        ? new Date(log.time_in).toLocaleDateString('en-US', {
                                                              weekday: 'short',
                                                              month: 'short',
                                                              day: 'numeric',
                                                              year: 'numeric',
                                                          })
                                                        : '—'}
                                                </td>
                                                <td className="px-4 py-3.5 text-center font-mono text-xs font-semibold text-slate-700">
                                                    {log.time_in
                                                        ? new Date(log.time_in).toLocaleTimeString('en-US', {
                                                              hour: 'numeric',
                                                              minute: '2-digit',
                                                              hour12: true,
                                                          })
                                                        : '--:--'}
                                                </td>
                                                <td className="px-4 py-3.5 text-center font-mono text-xs font-semibold text-slate-700">
                                                    {log.time_out
                                                        ? new Date(log.time_out).toLocaleTimeString('en-US', {
                                                              hour: 'numeric',
                                                              minute: '2-digit',
                                                              hour12: true,
                                                          })
                                                        : '--:--'}
                                                </td>
                                                <td className="px-4 py-3.5 text-slate-700">
                                                    <div className="text-xs font-bold text-slate-800">
                                                        {log.work_type || log.attendance_type || 'Regular Duty'}
                                                    </div>
                                                    {log.check_in_method && (
                                                        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                            {log.check_in_method === 'qr' ? 'QR' : 'Passcode'}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <span
                                                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                                            isAccepted
                                                                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                : isRejected
                                                                  ? 'border border-red-200 bg-red-50 text-red-700'
                                                                  : 'border border-amber-200 bg-amber-50 text-amber-700'
                                                        }`}
                                                    >
                                                        {isAccepted
                                                            ? 'Accepted'
                                                            : isRejected
                                                              ? 'Rejected'
                                                              : log.time_out
                                                                ? 'Pending'
                                                                : 'Timed in'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900">
                                                    {hoursFor(log).toFixed(2)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-slate-200 bg-slate-50">
                                    <td
                                        colSpan={5}
                                        className="px-5 py-3.5 text-right text-xs font-extrabold uppercase tracking-widest text-slate-500"
                                    >
                                        Total Hours
                                    </td>
                                    <td className="px-5 py-3.5 text-right font-mono text-base font-black text-slate-900">
                                        {dtrTotalHours.toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </section>
            </div>

            {typeof document !== 'undefined' &&
                createPortal(
                    <AnimatePresence>
                        {dtrPreviewOpen && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-80 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                                onClick={() => setDtrPreviewOpen(false)}
                            >
                                <motion.div
                                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                                    className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-950 px-6 py-4 text-white">
                                        <div className="flex items-center gap-2.5">
                                            <Sparkles className="h-4 w-4 text-blue-400" />
                                            <div>
                                                <p className="text-sm font-black tracking-tight">Official WSPO DTR</p>
                                                <p className="text-xs font-medium text-slate-400">
                                                    {fullName} · {studentProfile.student_id_number}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setDtrPreviewOpen(false)}
                                            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                                            aria-label="Close DTR preview"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div className="overflow-y-auto bg-slate-100 p-5">
                                        <div className="dtr-paper mx-auto w-fit max-w-full bg-white shadow-md">
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